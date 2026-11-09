import { CompletionContext } from '@codemirror/autocomplete';
import { EditorState } from '@codemirror/state';
import { kqlCompletionSource } from './kql-completion';
import { collectDynamicPaths } from './kql';
import type { KqlCompletionSchema } from './kql';

describe('kqlCompletionSource', () => {
  const schema: KqlCompletionSchema = {
    tables: [
      { name: 'Heartbeat', columns: ['Computer', 'TimeGenerated'] },
      { name: 'AppRequests', columns: ['Name', 'DurationMs', 'TimeGenerated'] }
    ]
  };

  /**
   * Runs completion at the "‸" cursor marker (removed from the text) and returns option labels.
   * @param textWithCursor Query text containing the cursor marker
   * @param explicit Whether completion was explicitly requested (Ctrl+Space)
   * @param currentSchema Schema to use
   */
  function complete(
    textWithCursor: string,
    explicit = false,
    currentSchema: KqlCompletionSchema = schema
  ): { from: number; labels: string[] } | null {
    const pos = textWithCursor.indexOf('‸');
    const state = EditorState.create({ doc: textWithCursor.replace('‸', '') });
    const result = kqlCompletionSource(() => currentSchema)(new CompletionContext(state, pos, explicit));
    if (!result) {
      return null;
    }
    return { from: result.from, labels: result.options.map((option) => option.label) };
  }

  it('suggests tables at the start of the query', () => {
    expect(complete('He‸')?.labels).toEqual(['Heartbeat', 'AppRequests']);
  });

  it('suggests tables after union and join', () => {
    expect(complete('Heartbeat | union App‸')?.labels).toContain('AppRequests');
    expect(complete('Heartbeat | join kind=inner (‸', true)?.labels).toContain('AppRequests');
  });

  it('suggests operators after a pipe', () => {
    const result = complete('Heartbeat | ‸');
    expect(result?.labels).toContain('where');
    expect(result?.labels).toContain('summarize');
    expect(result?.labels).not.toContain('Computer');
  });

  it('suggests columns of the referenced tables only', () => {
    const labels = complete('Heartbeat | where Co‸')?.labels ?? [];
    expect(labels).toContain('Computer');
    expect(labels).not.toContain('DurationMs');
    expect(labels).toContain('ago');
  });

  it('falls back to all columns when no table is recognized', () => {
    const labels = complete('Unknown | where D‸')?.labels ?? [];
    expect(labels).toContain('Computer');
    expect(labels).toContain('DurationMs');
  });

  it('suggests columns defined by extend or summarize', () => {
    const labels = complete('Heartbeat | summarize Total = count() by Computer | where T‸')?.labels ?? [];
    expect(labels).toContain('Total');
  });

  it('ignores pipes and words inside strings and stays silent within them', () => {
    expect(complete("Heartbeat | where Computer == 'a|‸")).toBeNull();
    expect(complete("Heartbeat | where Computer == 'x|y' and T‸")?.labels).toContain('TimeGenerated');
  });

  it('matches tables case-insensitively when requested', () => {
    const labels = complete('resources | where n‸', false, {
      tables: [{ name: 'Resources', columns: ['name'] }, { name: 'Other', columns: ['extra'] }],
      ignoreCase: true
    })?.labels ?? [];
    expect(labels).toContain('name');
    expect(labels).not.toContain('extra');
  });

  it('suggests the next segment of a learned dynamic path', () => {
    const dynamicPaths = new Set<string>();
    collectDynamicPaths([{
      name: 'vm',
      properties: { storageProfile: { osDisk: { osType: 'Linux' } }, provisioningState: 'Succeeded' },
      tags: { 'cost-center': 'x', env: 'dev' }
    }], dynamicPaths);

    const text = 'Resources | where properties.‸';
    const root = complete(text, false, { ...schema, dynamicPaths });
    expect(root?.labels).toEqual(['storageProfile', 'provisioningState']);
    expect(root?.from).toBe(text.indexOf('‸'));
    expect(complete('Resources | project Properties.storageProfile.o‸', false, { ...schema, dynamicPaths })?.labels)
      .toEqual(['osDisk']);
    expect(complete('Resources | where tags.‸', false, { ...schema, dynamicPaths })?.labels).toEqual(['env']);
  });
});
