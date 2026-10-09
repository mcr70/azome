export function matchesTextFilter(query: string, ...values: Array<string | null | undefined>): boolean {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) {
    return true;
  }

  const searchableText = values.filter(Boolean).join(' ').toLocaleLowerCase();
  return terms.every((term) => {
    if (term.startsWith('!')) {
      const excludedTerm = term.slice(1);
      return excludedTerm.length === 0 || !searchableText.includes(excludedTerm);
    }

    return searchableText.includes(term);
  });
}
