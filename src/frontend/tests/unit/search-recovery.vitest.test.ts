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
      title: 'No resources match "asd"',
      hint: 'Try another term, or clear your search while keeping your filters.',
    });
  });

  it('identifies filter restrictions only when the query has matches elsewhere', () => {
    const message = emptyResultsMessage('terms', 'redis', ['Topic: Foundations', 'Letter: A'], { withoutQuery: 2, withoutFilters: 1 });
    expect(message.action).toBe('Clear filters');
    expect(message.title).toBe('No terms match "redis" with these filters');
    expect(message.hint).toContain('Keep your search');
    expect(message.hint).not.toContain('Active filters:');
  });
});
