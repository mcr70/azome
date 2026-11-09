import { HighlightStyle, StreamLanguage, syntaxHighlighting } from '@codemirror/language';
import type { Extension } from '@codemirror/state';
import { tags } from '@lezer/highlight';

const SQL_KEYWORDS = new Set([
  'select', 'from', 'where', 'and', 'or', 'not', 'in', 'like', 'between',
  'join', 'inner', 'left', 'right', 'outer', 'on', 'group', 'by', 'order',
  'having', 'limit', 'offset', 'as', 'distinct', 'count', 'sum', 'avg',
  'min', 'max', 'insert', 'into', 'values', 'update', 'set', 'delete', 'create',
  'drop', 'alter', 'table', 'index', 'true', 'false', 'null'
]);

export function rdsSql(tableNames: Iterable<string> = []): Extension {
  const tables = new Set(Array.from(tableNames, (t) => t.toLowerCase()));

  const language = StreamLanguage.define({
    name: 'rdssql',
    token(stream) {
      if (stream.eatSpace()) return null;
      if (stream.match('--') || stream.match(/\/\*[\s\S]*?\*\//)) {
        stream.skipToEnd();
        return 'comment';
      }
      if (stream.match(/^['"][^'"]*['"]/)) return 'string';
      if (stream.match(/^\d+(\.\d+)?/)) return 'number';

      if (stream.match(/^[A-Za-z_][A-Za-z0-9_]*/)) {
        const word = stream.current().toLowerCase();
        const isCall = stream.match(/\s*\(/, false) !== null;
        if (SQL_KEYWORDS.has(word)) return 'keyword';
        if (isCall) return 'function';
        return tables.has(word) ? 'table' : 'column';
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
      table: tags.typeName,
      column: tags.propertyName
    }
  });

  const style = HighlightStyle.define([
    { tag: tags.keyword, color: '#2563eb', fontWeight: '600' }, 
    { tag: tags.function(tags.variableName), color: '#b45309' },
    { tag: tags.typeName, color: '#0f766e', fontWeight: '600' }, 
    { tag: tags.propertyName, color: '#1d4ed8' },
    { tag: tags.string, color: '#15803d' },
    { tag: tags.number, color: '#c2410c' },
    { tag: tags.lineComment, color: '#64748b', fontStyle: 'italic' }
  ]);

  return [language, syntaxHighlighting(style)];
}