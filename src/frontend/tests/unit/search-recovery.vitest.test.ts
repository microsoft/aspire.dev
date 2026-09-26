import { describe, expect, it } from 'vitest';
import { searchRecoveryAction } from '../../src/components/search/search-empty-state';
import { emptyResultsMessage } from '../../src/components/dev-center/empty-results';

describe('intent-preserving empty recovery', () => {
  it.each([
    [true, true, 3, 5, 'Clear filters'],
    [true, true, 0, 5, 'Clear filters'],
    [true, true, 3, 0, 'Clear search'],
    [true, true, 0, 0, 'Reset all'],
    [true, false, 3, 0, 'Clear search'],
    [false, true, 0, 3, 'Clear filters'],
  ] as const)('selects useful recovery for query=%s filters=%s counts=%s/%s', (query, filters, withoutQuery, withoutFilters, action) => {
    expect(searchRecoveryAction(query, filters, { withoutQuery, withoutFilters })).toBe(action);
  });

  it('explains that an unmatched query can be cleared without discarding the selected topic', () => {
    expect(emptyResultsMessage('resources', ' asd ', ['Topic: Foundations'], { withoutQuery: 12, withoutFilters: 0 })).toEqual({
      action: 'Clear search',
      title: 'No matching resources',
      query: 'Search: "asd"',
      hint: 'Try another term, or clear your search while keeping your filters.',
    });
  });

  it('identifies filter restrictions only when the query has matches elsewhere', () => {
    const message = emptyResultsMessage('terms', 'redis', ['Topic: Foundations', 'Letter: A'], { withoutQuery: 2, withoutFilters: 1 });
    expect(message.action).toBe('Clear filters');
    expect(message.title).toBe('No matching terms');
    expect(message.query).toBe('Search: "redis"');
    expect(message.hint).toContain('Keep your search');
    expect(message.hint).not.toContain('Active filters:');
  });

  it('omits query copy when only filters are active', () => {
    expect(emptyResultsMessage('terms', '   ', ['Letter: A'], { withoutQuery: 0, withoutFilters: 5 }).query).toBe('');
  });
});
