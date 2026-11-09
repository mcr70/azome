import { HighlightStyle, StreamLanguage, syntaxHighlighting } from '@codemirror/language';
import type { StringStream } from '@codemirror/language';
import type { Extension } from '@codemirror/state';
import { tags } from '@lezer/highlight';

const COSMOS_KEYWORDS = new Set([
  'select', 'from', 'where', 'order', 'by', 'asc', 'desc',
  'offset', 'limit', 'top', 'distinct', 'value', 'in', 'between',
  'and', 'or', 'not', 'true', 'false', 'null', 'is', 'exists'
]);

const COSMOS_FUNCTIONS = new Set([
  'count', 'sum', 'min', 'max', 'avg', 'contains', 'endswith',
  'startswith', 'indexof', 'substring', 'tolower', 'toupper',
  'abs', 'round', 'is_defined', 'is_null', 'is_string',
  'is_number', 'is_array', 'array_contains', 'array_length'
]);

function readString(stream: StringStream, quote: string): void {
  while (!stream.eol()) {
    const char = stream.next();
    if (char === '\\') {
      stream.next();
    } else if (char === quote) {
      return;
    }
  }
}

export function cosmosSql(): Extension {
  const language = StreamLanguage.define<null>({
    name: 'cosmossql',
    token(stream) {
      if (stream.eatSpace()) return null;
      if (stream.match('--')) {
        stream.skipToEnd();
        return 'comment';
      }
      const stringStart = stream.match(/['"]/) as RegExpMatchArray | null;
      if (stringStart) {
        readString(stream, stringStart[0]);
        return 'string';
      }
      if (stream.match(/\d+(?:\.\d+)?/)) return 'number';

      if (stream.match(/[A-Za-z_][A-Za-z0-9_]*/)) {
        const word = stream.current().toLowerCase();
        const isCall = stream.match(/\s*\(/, false) !== null;
        if (COSMOS_KEYWORDS.has(word)) return 'keyword';
        if (COSMOS_FUNCTIONS.has(word) || isCall) return 'function';
        return 'variable';
      }

      stream.next();
      return null;
    },
    tokenTable: {
      comment: tags.lineComment,
      string: tags.string,
      number: tags.number,
      keyword: tags.keyword,
      function: tags.function(tags.variableName),
      variable: tags.propertyName
    }
  });

  const style = HighlightStyle.define([
    { tag: tags.keyword, color: '#0284c7', fontWeight: '600' },
    { tag: tags.function(tags.variableName), color: '#d97706' },
    { tag: tags.propertyName, color: '#0f766e' },
    { tag: tags.string, color: '#16a34a' },
    { tag: tags.number, color: '#ea580c' },
    { tag: tags.lineComment, color: '#64748b', fontStyle: 'italic' }
  ]);

  return [language, syntaxHighlighting(style)];
}