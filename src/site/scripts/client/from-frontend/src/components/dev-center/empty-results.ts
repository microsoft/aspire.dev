import { searchRecoveryAction } from '../search/search-empty-state';

export function emptyResultsMessage(
  items: 'resources' | 'terms',
  query: string,
  filters: string[],
  counts: { withoutQuery: number; withoutFilters: number },
) {
  const text = query.trim();
  const action = searchRecoveryAction(Boolean(text), filters.length > 0, counts);
  const title = `No matching ${items}`;
  const hint = action === 'Clear filters'
    ? `${text ? 'Keep your search and clear filters to see matching' : 'Clear filters to browse all'} ${items}.`
    : action === 'Clear search'
      ? `Try another term, or clear your search${filters.length ? ' while keeping your filters' : ` to browse all ${items}`}.`
      : 'Try another term or adjust your filters. Reset all clears both your search and filters.';
  return { action, title, query: text ? `Search: "${text}"` : '', hint };
}
