import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { EditorState } from '@codemirror/state';
import type { Extension } from '@codemirror/state';

export interface SqlTableSchema {
  name: string;
  columns: readonly string[];
}

export interface SqlCompletionSchema {
  tables: readonly SqlTableSchema[];
  ignoreCase?: boolean;
}

const SQL_KEYWORDS = [
  'SELECT',
  'FROM',
  'WHERE',
  'AND',
  'OR',
  'NOT',
  'IN',
  'LIKE',
  'BETWEEN',
  'JOIN',
  'INNER JOIN',
  'LEFT JOIN',
  'RIGHT JOIN',
  'OUTER JOIN',
  'ON',
  'GROUP BY',
  'ORDER BY',
  'HAVING',
  'LIMIT',
  'OFFSET',
  'AS',
  'DISTINCT',
  'INSERT INTO',
  'VALUES',
  'UPDATE',
  'SET',
  'DELETE FROM',
  'UNION',
  'CASE',
  'WHEN',
  'THEN',
  'ELSE',
  'END'
];

const SQL_FUNCTIONS = [
  'COUNT',
  'SUM',
  'AVG',
  'MIN',
  'MAX',
  'COALESCE',
  'ISNULL',
  'LOWER',
  'UPPER',
  'SUBSTRING',
  'LENGTH',
  'TRIM',
  'NOW',
  'DATE_ADD',
  'DATE_SUB'
];

/**
 * Poistaa merkkijonot ja kommentit tarkistuksen tieltä, jotta sisällä olevat sanat eivät sotke kontekstia.
 */
function sanitize(text: string): { text: string; endsInLiteral: boolean } {
  let endsInLiteral = false;
  const pattern = /--(?:[^\n]*)|\/\*[\s\S]*?\*\/|"(?:[^"\\\n]|\\.)*("?)|'(?:[^'\\\n]|\\.)*('?)/g;
  const sanitized = text.replace(pattern, (match, doubleEnd, singleEnd, offset: number) => {
    if (offset + match.length === text.length) {
      const closed = match.startsWith('"') ? doubleEnd === '"' : match.startsWith("'") && singleEnd === "'";
      endsInLiteral = !closed || match.length === 1;
    }
    return ' '.repeat(match.length);
  });
  return { text: sanitized, endsInLiteral };
}

function findSourceTables(text: string, schema: SqlCompletionSchema): SqlTableSchema[] {
  const normalize = (name: string): string => schema.ignoreCase ? name.toLowerCase() : name;
  const words = new Set(Array.from(text.matchAll(/[A-Za-z_]\w*/g), (match) => normalize(match[0])));
  return schema.tables.filter((table) => words.has(normalize(table.name)));
}

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

export function rdsSqlCompletionSource(getSchema: () => SqlCompletionSchema) {
  return (context: CompletionContext): CompletionResult | null => {
    const schema = getSchema();
    const before = sanitize(context.state.sliceDoc(0, context.pos));
    if (before.endsInLiteral) {
      return null;
    }

    const word = context.matchBefore(/[A-Za-z_][\w-]*/);
    const from = word ? word.from : context.pos;
    const head = before.text.slice(0, from);
    const trimmed = head.trimEnd();

    if (!word && !context.explicit) {
      return null;
    }

    const tableOptions: Completion[] = schema.tables.map((table) => ({
      label: table.name,
      type: 'class',
      boost: 2
    }));

    // Ehdotetaan tauluja tiettyjen avainsanojen jälkeen (FROM, JOIN, INTO, UPDATE)
    const expectsTable = /\b(?:FROM|JOIN|INTO|UPDATE)\s*$/i.test(trimmed);
    if (expectsTable) {
      return { from, options: tableOptions, validFor: /^\w*$/ };
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

    return {
      from,
      options: uniqueOptions([
        columnOptions,
        SQL_KEYWORDS.map((label) => ({ label, type: 'keyword', boost: 2 })),
        SQL_FUNCTIONS.map((label) => ({ label, type: 'function', boost: 1 }))
      ]),
      validFor: /^\w*$/
    };
  };
}

export function rdsSqlCompletion(getSchema: () => SqlCompletionSchema): Extension {
  const source = rdsSqlCompletionSource(getSchema);
  return EditorState.languageData.of(() => [{ autocomplete: source }]);
}