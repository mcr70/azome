import { ResourceSelectionService, SelectedAzureResource } from './resource-selection.service';

describe('ResourceSelectionService', () => {
  let selection: ResourceSelectionService;
  const first: SelectedAzureResource = {
    id: '/resources/first',
    name: 'first',
    type: 'test/resource',
    resourceGroup: 'group'
  };
  const second = { ...first, id: '/resources/second', name: 'second' };
  const outside = { ...first, id: '/resources/outside', name: 'outside' };

  beforeEach(() => {
    selection = new ResourceSelectionService();
  });

  it('selects a partially selected grid and deselects a fully selected grid without affecting others', () => {
    selection.select(outside);
    selection.select(first);
    selection.toggleResources([first, second]);
    expect(selection.selectedResources).toEqual([outside, first, second]);

    selection.toggleResources([first, second]);
    expect(selection.selectedResources).toEqual([outside]);
  });

  it('normalizes and deduplicates IDs and emits only once for each bulk action', () => {
    const emissions: SelectedAzureResource[][] = [];
    selection.selectedResources$.subscribe((resources) => emissions.push(resources));
    selection.toggleResources([first, { ...first, id: '/RESOURCES/FIRST/' }, second]);
    expect(emissions.length).toBe(2);
    expect(selection.selectedResources.length).toBe(2);
    expect(selection.isSelected(first.id)).toBeTrue();

    selection.toggleResources([first, second]);
    expect(emissions.length).toBe(3);
    expect(selection.selectedResources).toEqual([]);
  });

  it('does not emit or change selection for an empty grid', () => {
    selection.select(outside);
    const next = jasmine.createSpy('next');
    selection.selectedResources$.subscribe(next);
    selection.toggleResources([]);
    expect(next).toHaveBeenCalledTimes(1);
    expect(selection.selectedResources).toEqual([outside]);
  });
});
