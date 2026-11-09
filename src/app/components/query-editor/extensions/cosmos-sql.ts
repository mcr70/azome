import type { QueryEditorExtensions } from '../query-editor.component';
import type { CosmosCompletionSchema } from './cosmos-sql-completion';

export function cosmosSqlEditorExtensions(getSchema: () => CosmosCompletionSchema): QueryEditorExtensions {
  return async () => {
    const [{ cosmosSql }, { cosmosSqlCompletion }] = await Promise.all([
      import('./cosmos-sql-language'),
      import('./cosmos-sql-completion')
    ]);
    return [
      cosmosSql(),
      cosmosSqlCompletion(getSchema)
    ];
  };
}