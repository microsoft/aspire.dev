import { describe, expect, it } from 'vitest';
import { createDocLanguageResolver } from '../../src/utils/dev-center/resource-languages';

describe('resource language extraction', () => {
  it('reads nested AppHost and client code blocks with canonical aliases', () => {
    const body = [
      '<Tabs><TabItem label="AppHost">',
      '', '```ts title="apphost.mts" twoslash', 'await builder.build();', '```',
      '', '```cs title="AppHost.cs"', 'builder.Build();', '```',
      '', '</TabItem></Tabs>',
      '', '```python title="client.py"', 'client.connect()', '```',
      '', '```go title="main.go"', 'client.Connect()', '```',
      '', '<Code lang="jsx" code="const client = connect();" />',
    ].join('\n');
    expect(createDocLanguageResolver([{ id: 'app', body }])('app')).toEqual(['csharp', 'go', 'javascript', 'python', 'typescript']);
  });

  it('ignores prose, comments, configuration, shell setup, and fences quoted inside examples', () => {
    const body = [
      'C# and Python are mentioned, not demonstrated.',
      '{/* ```go */}',
      '```bash', 'npm install typescript', '```',
      '```json', '{"language":"csharp"}', '```',
      '````md', '```python', 'example()', '```', '````',
      '<TabItem label="JavaScript">No example.</TabItem>',
    ].join('\n');
    expect(createDocLanguageResolver([{ id: 'guide', body }])('guide')).toEqual([]);
  });

  it('inherits languages from nested includes without exposing fragments as resources', () => {
    const resolve = createDocLanguageResolver([
      { id: 'article', body: '<Include relativePath="/includes/first.md" />' },
      { id: 'includes/first', body: '<Include relativePath="includes/second.mdx" />' },
      { id: 'includes/second', body: '```csharp\nbuilder.Build();\n```' },
    ]);
    expect(resolve('article')).toEqual(['csharp']);
    expect(resolve('article')).toEqual(['csharp']);
  });

  it('surfaces missing or cyclic includes rather than silently dropping their languages', () => {
    expect(() => createDocLanguageResolver([{ id: 'article', body: '<Include relativePath="missing.md" />' }])('article')).toThrow('Missing resource language include');
    expect(() => createDocLanguageResolver([{ id: 'article', body: '<Include relativePath="article.md" />' }])('article')).toThrow('Circular resource language include');
  });
});
