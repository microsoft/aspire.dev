import { expect, test } from 'vitest';
import { docsTopics } from '../../config/sidebar/docs.topics';

interface SidebarItem {
  label: string;
  collapsed?: boolean;
  items?: SidebarItem[];
}

function findGroup(items: SidebarItem[], label: string) {
  const group = items.find(
    (item): item is SidebarItem & { items: SidebarItem[] } =>
      item.label === label && item.items !== undefined
  );
  if (!group) {
    throw new Error(`Missing sidebar group: ${label}`);
  }
  return group;
}

test('keeps Aspire 17.0 first and groups previous releases by major version', () => {
  const whatsNew = findGroup(docsTopics.items, "What's new");
  expect(whatsNew.items).toHaveLength(3);
  expect(whatsNew.items[0]).toEqual({
    label: 'Aspire 17.0',
    slug: 'whats-new/aspire-17',
  });
  expect(whatsNew.items[2]).toMatchObject({
    label: 'Upgrade Aspire',
    slug: 'whats-new/upgrade-aspire',
  });

  const previous = findGroup(whatsNew.items, 'Previous versions');
  expect(previous.collapsed).toBe(true);
  expect(previous.items).toHaveLength(2);
  expect(previous.items[0]).toMatchObject({ label: 'Aspire 13.x', collapsed: true });
  expect(previous.items[1]).toMatchObject({ label: 'Aspire 9.x', collapsed: true });

  for (const [major, latestMinor] of [
    [13, 6],
    [9, 5],
  ]) {
    const group = findGroup(previous.items, `Aspire ${major}.x`);
    expect(group.items).toEqual(
      Array.from({ length: latestMinor + 1 }, (_, index) => {
        const minor = latestMinor - index;
        return {
          label: `Aspire ${major}.${minor}`,
          slug: `whats-new/aspire-${major}${minor === 0 ? '' : `-${minor}`}`,
        };
      })
    );
  }
});
