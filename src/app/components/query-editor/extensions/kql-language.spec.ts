import { EditorState } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import { kql } from './kql-language';
import { RESOURCE_GRAPH_TABLES } from './kql';

/**
 * Returns the text of every token of the given type in the query.
 * @param query KQL query text
 * @param type Token type name
 * @param tables Known table names
 */
function tokens(query: string, type: string, tables: string[] = []): string[] {
  const state = EditorState.create({
    doc: query,
    extensions: [kql(tables)]
  });
  const result: string[] = [];
  syntaxTree(state).iterate({
    enter: (node) => {
      if (node.name === type) {
        result.push(state.doc.sliceString(node.from, node.to));
      }
    }
  });
  return result;
}

describe('KQL syntax highlighting', () => {
  const query = 'FunctionAppLogs\n| summarize Count = count() by Category\n| order by Count desc';

  it('separates keywords, functions, tables and columns', () => {
    expect(tokens(query, 'keyword', ['FunctionAppLogs'])).toEqual(['summarize', 'by', 'order', 'by', 'desc']);
    expect(tokens(query, 'function', ['FunctionAppLogs'])).toEqual(['count']);
    expect(tokens(query, 'table', ['FunctionAppLogs'])).toEqual(['FunctionAppLogs']);
    expect(tokens(query, 'column', ['FunctionAppLogs'])).toEqual(['Count', 'Category', 'Count']);
  });

  it('treats unknown tables as columns', () => {
    expect(tokens(query, 'table')).toEqual([]);
    expect(tokens(query, 'column')).toContain('FunctionAppLogs');
  });

  it('matches table names case-insensitively only when requested', () => {
    const text = 'resources | join (ResourceContainers) on subscriptionId';
    const tables = (ignoreTableCase: boolean): string[] => {
      const state = EditorState.create({
        doc: text,
        extensions: [kql(RESOURCE_GRAPH_TABLES, { ignoreTableCase })]
      });
      const result: string[] = [];
      syntaxTree(state).iterate({
        enter: (node) => {
          if (node.name === 'table') {
            result.push(state.doc.sliceString(node.from, node.to));
          }
        }
      });
      return result;
    };

    expect(tables(true)).toEqual(['resources', 'ResourceContainers']);
    expect(tables(false)).toEqual(['ResourceContainers']);
  });

  it('recognizes strings, comments, numbers and hyphenated operators', () => {
    const text = 'T | where Category startswith "Function" and Message == \'take\' // project\n'
      + '| where TimeGenerated > ago(1d) | project-away Id | take 10';

    expect(tokens(text, 'string')).toEqual(['"Function"', "'take'"]);
    expect(tokens(text, 'comment')).toEqual(['// project']);
    expect(tokens(text, 'number')).toEqual(['1d', '10']);
    expect(tokens(text, 'keyword')).toEqual(['where', 'startswith', 'and', 'where', 'project-away', 'take']);
    expect(tokens(text, 'function')).toEqual(['ago']);
  });

  it('keeps operator keywords before parentheses as keywords', () => {
    expect(tokens('T | where Level in ("Error", "Warning")', 'keyword')).toEqual(['where', 'in']);
  });

  it('tokenizes punctuation without failing', () => {
    const state = EditorState.create({
      doc: 'T | extend X = (A + B) * 2, Y = A[0] =~ "x"',
      extensions: [kql()]
    });

    expect(syntaxTree(state).length).toBe(state.doc.length);
  });
});
