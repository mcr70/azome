import { HighlightStyle, StreamLanguage, syntaxHighlighting } from '@codemirror/language';
import type { StringStream } from '@codemirror/language';
import type { Extension } from '@codemirror/state';
import { tags } from '@lezer/highlight';

/** Tabular operators, clauses and word operators. KQL keywords are case-sensitive. */
const KEYWORDS = new Set([
  'and',
  'as',
  'asc',
  'between',
  'by',
  'contains',
  'contains_cs',
  'count',
  'datatable',
  'desc',
  'distinct',
  'endswith',
  'endswith_cs',
  'evaluate',
  'extend',
  'false',
  'find',
  'first',
  'getschema',
  'has',
  'has_all',
  'has_any',
  'has_cs',
  'hasprefix',
  'hassuffix',
  'in',
  'invoke',
  'join',
  'kind',
  'last',
  'let',
  'limit',
  'lookup',
  'make-series',
  'matches',
  'mv-apply',
  'mv-expand',
  'not',
  'null',
  'nulls',
  'on',
  'or',
  'order',
  'parse',
  'print',
  'project',
  'project-away',
  'project-keep',
  'project-rename',
  'project-reorder',
  'range',
  'regex',
  'render',
  'sample',
  'search',
  'serialize',
  'sort',
  'startswith',
  'startswith_cs',
  'step',
  'summarize',
  'take',
  'to',
  'top',
  'true',
  'union',
  'where',
  'with'
]);

/** Keywords that may be followed by "(" without being function calls. */
const KEYWORDS_BEFORE_PAREN = new Set([
  'and',
  'between',
  'by',
  'has_all',
  'has_any',
  'in',
  'join',
  'lookup',
  'on',
  'or',
  'union',
  'where'
]);

type KqlToken = 'comment' | 'string' | 'number' | 'keyword' | 'function' | 'table' | 'column';

/**
 * Consumes a quoted string literal whose opening quote has already been read.
 * @param stream Stream positioned after the opening quote
 * @param quote Quote character that terminates the literal
 * @param verbatim Whether backslash escapes are disabled (@'...' literals)
 */
function readString(stream: StringStream, quote: string, verbatim: boolean): void {
  while (!stream.eol()) {
    const char = stream.next();
    if (!verbatim && char === '\\') {
      stream.next();
    } else if (char === quote) {
      return;
    }
  }
}

export interface KqlOptions {
  /** Whether table names match regardless of case (true for Resource Graph). */
  ignoreTableCase?: boolean;
}

/**
 * Creates lightweight KQL syntax highlighting. This is a tokenizer, not a parser:
 * identifiers are classified by simple rules (keyword list, following "(", known tables).
 * @param tableNames Names of known tables, highlighted separately from columns
 * @param options Dialect-specific options
 */
export function kql(tableNames: Iterable<string> = [], options: KqlOptions = {}): Extension {
  const normalize = (name: string): string => options.ignoreTableCase ? name.toLowerCase() : name;
  const tables = new Set(Array.from(tableNames, normalize));

  const language = StreamLanguage.define<null>({
    name: 'kql',
    token(stream): KqlToken | null {
      if (stream.eatSpace()) {
        return null;
      }

      if (stream.match('//')) {
        stream.skipToEnd();
        return 'comment';
      }

      const stringStart = stream.match(/@?['"]|h['"]/) as RegExpMatchArray | null;
      if (stringStart) {
        const prefix = stringStart[0];
        readString(stream, prefix[prefix.length - 1], prefix.startsWith('@'));
        return 'string';
      }

      if (stream.match(/\d+(?:\.\d+)?(?:[a-z]+)?/)) {
        return 'number';
      }

      const hyphenated = stream.match(/[a-z]+(?:-[a-z]+)+/, false) as RegExpMatchArray | null;
      if (hyphenated && KEYWORDS.has(hyphenated[0])) {
        stream.match(hyphenated[0]);
        return 'keyword';
      }

      if (stream.match(/[A-Za-z_][A-Za-z0-9_]*/)) {
        const word = stream.current();
        const isCall = stream.match(/\s*\(/, false) !== null;
        if (KEYWORDS.has(word) && (!isCall || KEYWORDS_BEFORE_PAREN.has(word))) {
          return 'keyword';
        }
        if (isCall) {
          return 'function';
        }
        return tables.has(normalize(word)) ? 'table' : 'column';
      }

      // The tokenizer must always consume input, otherwise CodeMirror throws.
      stream.next();
      return null;
    },
    tokenTable: {
      comment: tags.lineComment,
      string: tags.string,
      number: tags.number,
      keyword: tags.keyword,
      function: tags.function(tags.variableName),
      table: tags.typeName,
      column: tags.propertyName
    }
  });

  const style = HighlightStyle.define([
    { tag: tags.keyword, color: '#7c3aed', fontWeight: '600' },
    { tag: tags.function(tags.variableName), color: '#b45309' },
    { tag: tags.typeName, color: '#0f766e', fontWeight: '600' },
    { tag: tags.propertyName, color: '#1d4ed8' },
    { tag: tags.string, color: '#15803d' },
    { tag: tags.number, color: '#c2410c' },
    { tag: tags.lineComment, color: '#64748b', fontStyle: 'italic' }
  ]);

  return [language, syntaxHighlighting(style)];
}
