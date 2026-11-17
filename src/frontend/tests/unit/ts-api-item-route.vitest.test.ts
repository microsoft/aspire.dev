import { expect, test, vi } from 'vitest';
import { GET, getStaticPaths } from '../../src/pages/reference/api/typescript/[module]/[item].md';

const { doc } = vi.hoisted(() => ({
  doc: {
    package: { name: 'Test' },
    handleTypes: [
      { name: 'Thing', capabilities: [{ name: 'first', kind: 'Method', parameters: [] }] },
      { name: 'Thing', capabilities: [{ name: 'second', kind: 'Method', parameters: [] }] },
    ],
  },
}));

vi.mock('astro:content', () => ({
  getCollection: () => Promise.resolve([{ id: 'test', data: doc }]),
}));

test('duplicate handle Markdown links its own methods when route props are cloned', async () => {
  const route = (await getStaticPaths()).find(({ params }) => params.item === 'thing-thing-2');
  expect(route).toBeDefined();

  // Parallel prerender workers receive structured clones of route props, not objects from the loaded document.
  const response = await GET({ props: structuredClone(route!.props) } as never);
  const markdown = await response.text();

  expect(markdown).toContain('/reference/api/typescript/test/thing-thing-2/second.md');
  expect(markdown).not.toContain('/reference/api/typescript/test/thing-thing/');
});
