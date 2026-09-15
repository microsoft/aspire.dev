import { describe, expect, test } from 'vitest';
import {
  orderTypeScriptFirstAppHostTabsInMarkdown,
  remarkTypeScriptFirstAppHostTabs,
} from '../../config/remark-typescript-first-apphost-tabs.mjs';

function tabItem(id: string, label: string) {
  return {
    type: 'mdxJsxFlowElement',
    name: 'TabItem',
    attributes: [
      { type: 'mdxJsxAttribute', name: 'id', value: id },
      { type: 'mdxJsxAttribute', name: 'label', value: label },
    ],
    children: [],
  };
}

function tabs(syncKey: string, children: ReturnType<typeof tabItem>[]) {
  return {
    type: 'mdxJsxFlowElement',
    name: 'Tabs',
    attributes: [{ type: 'mdxJsxAttribute', name: 'syncKey', value: syncKey }],
    children,
  };
}

describe('TypeScript-first AppHost tabs', () => {
  test('moves TypeScript to the first position in AppHost language tabs', () => {
    const csharp = tabItem('csharp', 'C#');
    const typescript = tabItem('typescript', 'TypeScript');
    const appHostTabs = tabs('aspire-lang', [csharp, typescript]);

    remarkTypeScriptFirstAppHostTabs()({
      type: 'root',
      children: [appHostTabs],
    });

    expect(appHostTabs.children).toEqual([typescript, csharp]);
  });

  test('preserves author order for unrelated tab groups', () => {
    const csharp = tabItem('csharp', 'C#');
    const typescript = tabItem('typescript', 'TypeScript');
    const unrelatedTabs = tabs('api-language', [csharp, typescript]);

    remarkTypeScriptFirstAppHostTabs()({
      type: 'root',
      children: [unrelatedTabs],
    });

    expect(unrelatedTabs.children).toEqual([csharp, typescript]);
  });

  test('moves the TypeScript block first without reformatting copied Markdown', () => {
    const csharp = `<TabItem id='csharp' label='C#'>
C# content
</TabItem>
`;
    const typescript = `<TabItem id='typescript' label='TypeScript'>
TypeScript content
</TabItem>
`;
    const markdown = `<Tabs syncKey='aspire-lang'>
${csharp}${typescript}</Tabs>
`;

    expect(orderTypeScriptFirstAppHostTabsInMarkdown(markdown)).toBe(
      `<Tabs syncKey='aspire-lang'>
${typescript}${csharp}</Tabs>
`
    );
  });

  test('preserves copied Markdown for unrelated tab groups', () => {
    const markdown = `<Tabs syncKey='api-language'>
<TabItem id='csharp' label='C#'>C# content</TabItem>
<TabItem id='typescript' label='TypeScript'>TypeScript content</TabItem>
</Tabs>
`;

    expect(orderTypeScriptFirstAppHostTabsInMarkdown(markdown)).toBe(markdown);
  });
});
