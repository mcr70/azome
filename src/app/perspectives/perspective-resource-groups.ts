/**
 * Shared category/type grouping helpers used by the perspective overview grids.
 *
 * Several perspectives (Applications, Data, Monitoring) render their resources as
 * "category section -> resource type section -> resource cards". This module holds
 * the single grouping implementation so each perspective only provides the
 * perspective-specific label lookup.
 */

/** One resource type inside a category, for example "Storage accounts". */
export interface PerspectiveResourceTypeGroup<TResource> {
  type: string;
  label: string;
  resources: TResource[];
}

/** One category section with its resource types sorted alphabetically. */
export interface PerspectiveResourceCategoryGroup<TCategory extends string, TResource> {
  category: TCategory;
  types: PerspectiveResourceTypeGroup<TResource>[];
}

/**
 * Groups resources first by category and then by lower-cased resource type.
 * Categories and types are sorted alphabetically; the resource order inside a
 * type group follows the input order.
 *
 * @param resources Resources to group.
 * @param getCategory Returns the category of a resource.
 * @param getType Returns the raw resource type (case is normalized here).
 * @param getLabel Returns the human-readable label for a type group.
 * @returns Sorted category groups containing sorted type groups.
 */
export function groupResourcesByCategory<TCategory extends string, TResource>(
  resources: TResource[],
  getCategory: (resource: TResource) => TCategory,
  getType: (resource: TResource) => string,
  getLabel: (type: string, resources: TResource[]) => string
): PerspectiveResourceCategoryGroup<TCategory, TResource>[] {
  const categories = new Map<TCategory, Map<string, TResource[]>>();

  for (const resource of resources) {
    const category = getCategory(resource);
    const categoryTypes = categories.get(category) ?? new Map<string, TResource[]>();
    const resourceType = (getType(resource) ?? '').toLowerCase();
    const typeResources = categoryTypes.get(resourceType) ?? [];

    typeResources.push(resource);
    categoryTypes.set(resourceType, typeResources);
    categories.set(category, categoryTypes);
  }

  return Array.from(categories.entries())
    .sort(([categoryA], [categoryB]) => categoryA.localeCompare(categoryB))
    .map(([category, types]) => ({
      category,
      types: Array.from(types.entries())
        .sort(([typeA], [typeB]) => typeA.localeCompare(typeB))
        .map(([type, typeResources]) => ({
          type,
          label: getLabel(type, typeResources),
          resources: typeResources
        }))
    }));
}
