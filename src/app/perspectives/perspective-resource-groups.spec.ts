import {
  groupResourcesByCategory,
  PerspectiveResourceCategoryGroup
} from './perspective-resource-groups';

interface TestResource {
  name: string;
  category: string;
  type: string;
}

describe('groupResourcesByCategory', () => {
  const label = (type: string): string => `label:${type}`;
  const group = (
    resources: TestResource[]
  ): PerspectiveResourceCategoryGroup<string, TestResource>[] =>
    groupResourcesByCategory(
      resources,
      (resource) => resource.category,
      (resource) => resource.type,
      (type) => label(type)
    );

  it('returns an empty list for no resources', () => {
    expect(group([])).toEqual([]);
  });

  it('groups by category and lower-cased type, sorting both alphabetically', () => {
    const storageA: TestResource = { name: 'a', category: 'Storage', type: 'Microsoft.Storage/storageAccounts' };
    const storageB: TestResource = { name: 'b', category: 'Storage', type: 'microsoft.storage/storageaccounts' };
    const cosmos: TestResource = { name: 'c', category: 'Databases', type: 'Microsoft.DocumentDB/databaseAccounts' };
    const sql: TestResource = { name: 'd', category: 'Databases', type: 'Microsoft.Sql/servers' };

    expect(group([storageA, sql, cosmos, storageB])).toEqual([
      {
        category: 'Databases',
        types: [
          {
            type: 'microsoft.documentdb/databaseaccounts',
            label: 'label:microsoft.documentdb/databaseaccounts',
            resources: [cosmos]
          },
          {
            type: 'microsoft.sql/servers',
            label: 'label:microsoft.sql/servers',
            resources: [sql]
          }
        ]
      },
      {
        category: 'Storage',
        types: [
          {
            type: 'microsoft.storage/storageaccounts',
            label: 'label:microsoft.storage/storageaccounts',
            resources: [storageA, storageB]
          }
        ]
      }
    ]);
  });

  it('passes the resources of a type group to the label callback', () => {
    const resource: TestResource = { name: 'a', category: 'Web', type: 'Microsoft.Web/sites' };
    const labelSpy = jasmine.createSpy('getLabel').and.returnValue('Sites');
    const result = groupResourcesByCategory(
      [resource],
      (item) => item.category,
      (item) => item.type,
      labelSpy
    );

    expect(labelSpy).toHaveBeenCalledOnceWith('microsoft.web/sites', [resource]);
    expect(result[0].types[0].label).toBe('Sites');
  });
});
