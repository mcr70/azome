import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { EditorState } from '@codemirror/state';
import type { Extension } from '@codemirror/state';

export interface CosmosCompletionSchema {
  properties: readonly string[]; // Dokumenttikentät esim. id, name, category
}

const COSMOS_KEYWORDS = ['SELECT', 'FROM', 'WHERE', 'ORDER BY', 'ASC', 'DESC', 'OFFSET', 'LIMIT', 'TOP', 'DISTINCT', 'VALUE', 'IN', 'BETWEEN', 'AND', 'OR', 'NOT', 'EXISTS'];
const COSMOS_FUNCTIONS = ['CONTAINS', 'STARTSWITH', 'ENDSWITH', 'LOWER', 'UPPER', 'LENGTH', 'ABS', 'ROUND', 'IS_DEFINED', 'IS_NULL', 'IS_STRING', 'IS_NUMBER', 'IS_ARRAY', 'ARRAY_CONTAINS', 'ARRAY_LENGTH'];

function sanitize(text: string): { text: string; endsInLiteral: boolean } {
  let endsInLiteral = false;
  const pattern = /--(?:[^\n]*)|\/\*[\s\S]*?\*\/|"(?:[^"\\\n]|\\.)*("?)|'(?:[^'\\\n]|\\.)*('?)/g;
  text.replace(pattern, (match, doubleEnd, singleEnd, offset: number) => {
    if (offset + match.length === text.length) {
      const closed = match.startsWith('"') ? doubleEnd === '"' : match.startsWith("'") && singleEnd === "'";
      endsInLiteral = !closed || match.length === 1;
    }
    return ' '.repeat(match.length);
  });
  return { text, endsInLiteral };
}

export function cosmosSqlCompletionSource(getSchema: () => CosmosCompletionSchema) {
  return (context: CompletionContext): CompletionResult | null => {
    const schema = getSchema();
    const before = sanitize(context.state.sliceDoc(0, context.pos));
    if (before.endsInLiteral) return null;

    const word = context.matchBefore(/[A-Za-z_][\w-]*/);
    const from = word ? word.from : context.pos;
    if (!word && !context.explicit) return null;

    const propertyOptions: Completion[] = schema.properties.map((prop) => ({
      label: prop,
      type: 'property',
      boost: 2
    }));

    return {
      from,
      options: [
        ...propertyOptions,
        ...COSMOS_KEYWORDS.map((label) => ({ label, type: 'keyword' as const, boost: 1 })),
        ...COSMOS_FUNCTIONS.map((label) => ({ label, type: 'function' as const, boost: 1 }))
      ],
      validFor: /^\w*$/
    };
  };
}

export function cosmosSqlCompletion(getSchema: () => CosmosCompletionSchema): Extension {
  const source = cosmosSqlCompletionSource(getSchema);
  return EditorState.languageData.of(() => [{ autocomplete: source }]);
}