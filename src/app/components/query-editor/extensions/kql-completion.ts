import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { EditorState } from '@codemirror/state';
import type { Extension } from '@codemirror/state';
import type { KqlCompletionSchema, KqlTableSchema } from './kql';

/** Tabular operators suggested right after a pipe. */
const TABULAR_OPERATORS = [
  'where',
  'project',
  'project-away',
  'project-keep',
  'project-rename',
  'project-reorder',
  'extend',
  'summarize',
  'sort by',
  'order by',
  'top',
  'take',
  'limit',
  'count',
  'distinct',
  'join',
  'union',
  'lookup',
  'mv-expand',
  'mv-apply',
  'make-series',
  'parse',
  'evaluate',
  'render',
  'as',
  'getschema',
  'sample',
  'serialize'
];

/** Word operators and clause keywords suggested inside expressions. */
const EXPRESSION_KEYWORDS = [
  'and',
  'or',
  'not',
  'by',
  'on',
  'asc',
  'desc',
  'in',
  'in~',
  '!in',
  'has',
  'has_any',
  'has_all',
  '!has',
  'contains',
  '!contains',
  'startswith',
  'endswith',
  'matches regex',
  'between',
  'kind=inner',
  'kind=leftouter',
  'kind=leftanti'
];

/** Commonly used scalar and aggregation functions. */
const FUNCTIONS = [
  'ago',
  'now',
  'bin',
  'count',
  'countif',
  'dcount',
  'dcountif',
  'sum',
  'sumif',
  'avg',
  'min',
  'max',
  'percentile',
  'percentiles',
  'arg_max',
  'arg_min',
  'make_list',
  'make_set',
  'make_bag',
  'any',
  'take_any',
  'tostring',
  'toint',
  'tolong',
  'todouble',
  'tobool',
  'todatetime',
  'totimespan',
  'todynamic',
  'parse_json',
  'tolower',
  'toupper',
  'trim',
  'strlen',
  'strcat',
  'split',
  'substring',
  'indexof',
  'replace_string',
  'extract',
  'iff',
  'case',
  'coalesce',
  'isempty',
  'isnotempty',
  'isnull',
  'isnotnull',
  'array_length',
  'bag_keys',
  'pack',
  'bag_pack',
  'format_datetime',
  'startofday',
  'startofweek',
  'startofmonth',
  'datetime_diff',
  'round'
];

/** Assignment-like parameters that must not be treated as user-defined columns. */
const NON_COLUMN_ASSIGNMENTS = new Set(['kind', 'withsource', 'isfuzzy', 'with_itemindex']);

/**
 * Replaces comments and string contents with spaces, so that pipes or keywords inside them
 * do not affect context detection. Offsets are preserved.
 * @param text Query text
 * @returns Sanitized text and whether the text ends inside a string or comment
 */
function sanitize(text: string): { text: string; endsInLiteral: boolean } {
  let endsInLiteral = false;
  const pattern = /\/\/[^\n]*|"(?:[^"\\\n]|\\.)*("?)|'(?:[^'\\\n]|\\.)*('?)/g;
  const sanitized = text.replace(pattern, (match, doubleEnd, singleEnd, offset: number) => {
    if (offset + match.length === text.length) {
      const closed = match.startsWith('"') ? doubleEnd === '"' : match.startsWith("'") && singleEnd === "'";
      endsInLiteral = !closed || match.length === 1;
    }
    return ' '.repeat(match.length);
  });
  return { text: sanitized, endsInLiteral };
}

/**
 * Finds tables used by the query. Any identifier matching a known table name counts,
 * which covers the first table, union, join and lookup without parsing.
 * @param text Sanitized query text
 * @param schema Completion schema
 */
function findSourceTables(text: string, schema: KqlCompletionSchema): KqlTableSchema[] {
  const normalize = (name: string): string => schema.ignoreCase ? name.toLowerCase() : name;
  const words = new Set(Array.from(text.matchAll(/[A-Za-z_]\w*/g), (match) => normalize(match[0])));
  return schema.tables.filter((table) => words.has(normalize(table.name)));
}

/**
 * Finds columns introduced by the query itself, e.g. "extend Duration = ..." or
 * "summarize Total = count()".
 * @param text Sanitized query text
 */
function findDefinedColumns(text: string): string[] {
  const names = Array.from(text.matchAll(/(?<![\w.])([A-Za-z_]\w*)\s*=(?![=~])/g), (match) => match[1]);
  return names.filter((name) => !NON_COLUMN_ASSIGNMENTS.has(name));
}

/**
 * Builds completion options without duplicates (first occurrence wins).
 * @param groups Options in priority order
 */
function uniqueOptions(groups: Completion[][]): Completion[] {
  const seen = new Set<string>();
  const result: Completion[] = [];
  for (const option of groups.flat()) {
    if (!seen.has(option.label)) {
      seen.add(option.label);
      result.push(option);
    }
  }
  return result;
}

/**
 * Suggests the next path segment inside a dynamic column, e.g. "properties.storageProfile.".
 * @param context Completion context
 * @param schema Completion schema
 */
function completeDynamicPath(context: CompletionContext, schema: KqlCompletionSchema): CompletionResult | null {
  const match = context.matchBefore(/[A-Za-z_]\w*(?:\.\w*)+$/);
  if (!match) {
    return null;
  }

  const lastDot = match.text.lastIndexOf('.');
  const parent = match.text.slice(0, lastDot).toLowerCase() + '.';
  const children = new Set<string>();
  for (const path of schema.dynamicPaths ?? []) {
    if (path.toLowerCase().startsWith(parent)) {
      children.add(path.slice(parent.length).split('.')[0]);
    }
  }

  return {
    from: match.from + lastDot + 1,
    options: Array.from(children, (label) => ({ label, type: 'property' })),
    validFor: /^\w*$/
  };
}

/**
 * Creates a context-aware completion source for KQL. The context is detected from the text
 * before the cursor: start of query or union/join suggests tables, a pipe suggests operators,
 * otherwise columns of the referenced tables, functions and keywords are suggested.
 * @param getSchema Returns the current schema; called on every completion request
 */
export function kqlCompletionSource(getSchema: () => KqlCompletionSchema) {
  return (context: CompletionContext): CompletionResult | null => {
    const schema = getSchema();
    const before = sanitize(context.state.sliceDoc(0, context.pos));
    if (before.endsInLiteral) {
      return null;
    }

    const pathResult = completeDynamicPath(context, schema);
    if (pathResult) {
      return pathResult;
    }

    const word = context.matchBefore(/[A-Za-z_][\w-]*$/);
    const from = word ? word.from : context.pos;
    const head = before.text.slice(0, from);
    const trimmed = head.trimEnd();
    const segment = trimmed.slice(trimmed.lastIndexOf('|') + 1);
    const afterPipe = trimmed.endsWith('|');

    if (!word && !context.explicit && !afterPipe) {
      return null;
    }

    const tableOptions: Completion[] = schema.tables.map((table) => ({
      label: table.name,
      type: 'class',
      boost: 2
    }));

    const expectsTable = trimmed === ''
      || /^\s*(?:union|join|lookup)\b/.test(segment) && /(?:\bunion|\bjoin|\blookup|\bkind=\w+|[(,])$/.test(trimmed);
    if (expectsTable) {
      return { from, options: tableOptions, validFor: /^\w*$/ };
    }

    if (afterPipe) {
      return {
        from,
        options: TABULAR_OPERATORS.map((label) => ({ label, type: 'keyword' })),
        validFor: /^[\w-]*$/
      };
    }

    const fullText = sanitize(context.state.doc.toString()).text;
    const sourceTables = findSourceTables(fullText, schema);
    const columnTables = sourceTables.length > 0 ? sourceTables : schema.tables;
    const columnOptions = columnTables.flatMap((table) => table.columns.map((label) => ({
      label,
      type: 'property',
      detail: sourceTables.length > 0 ? table.name : undefined,
      boost: 1
    })));
    const definedOptions = findDefinedColumns(head).map((label) => ({ label, type: 'variable', boost: 1 }));

    return {
      from,
      options: uniqueOptions([
        definedOptions,
        columnOptions,
        FUNCTIONS.map((label) => ({ label, type: 'function' })),
        EXPRESSION_KEYWORDS.map((label) => ({ label, type: 'keyword', boost: -1 }))
      ]),
      validFor: /^[\w-]*$/
    };
  };
}

/**
 * Adds KQL completion. Works together with the autocompletion included in basicSetup.
 * @param getSchema Returns the current schema; called on every completion request
 */
export function kqlCompletion(getSchema: () => KqlCompletionSchema): Extension {
  // CodeMirror matches results to sources by identity, so the source must be created only once.
  const source = kqlCompletionSource(getSchema);
  return EditorState.languageData.of(() => [{ autocomplete: source }]);
}
