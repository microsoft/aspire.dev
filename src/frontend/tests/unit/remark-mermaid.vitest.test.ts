import { createMarkdownProcessor } from '@astrojs/markdown-remark';
import { compile } from '@mdx-js/mdx';
import { selectAll } from 'hast-util-select';
import rehypeParse from 'rehype-parse';
import { unified } from 'unified';
import { runInNewContext } from 'node:vm';
import { expect, test } from 'vitest';
import { remarkMermaid } from '../../config/remark-mermaid.mjs';

const definition = 'flowchart TD\nA{"Ready?"} --> B["<b>Yes & no</b>"]';
const fence = '```mermaid\n' + definition + '\n```';

test('renders Mermaid as build-time SVG, without a code-highlight wrapper', async () => {
  const processor = await createMarkdownProcessor({ remarkPlugins: [remarkMermaid] });
  const result = await processor.render(fence + '\n\n```typescript\nconst answer = 42;\n```');
  const tree = unified().use(rehypeParse, { fragment: true }).parse(result.code);
  const diagrams = selectAll('pre.mermaid', tree);
  expect(diagrams).toHaveLength(1);
  expect(diagrams[0].properties.dataProcessed).toBe('true');
  expect(selectAll('pre.mermaid svg.pele-flowchart', tree)).toHaveLength(1);
  expect(selectAll('pre.mermaid script, pre.mermaid foreignObject', tree)).toHaveLength(0);
  expect(selectAll('pre.mermaid code', tree)).toHaveLength(0);
  expect(selectAll('pre code', tree)).toHaveLength(1);
});

test('renders SVG inside nested MDX content', async () => {
  const compiled = await compile('<section>\n\n' + fence + '\n\n</section>', {
    remarkPlugins: [remarkMermaid],
    outputFormat: 'function-body',
  });
  type Node = { tag: string; props: { children?: Node | string; className?: string; 'data-processed'?: string } };
  const jsx = (tag: string, props: Node['props']): Node => ({ tag, props });
  const module: { default: () => Node } = runInNewContext(
    `(function () { ${String(compiled)} })({ jsx, jsxs: jsx });`,
    { jsx }
  );
  const section = module.default();
  expect(section.tag).toBe('section');
  expect(section.props.children).toMatchObject({
    tag: 'pre',
    props: {
      className: 'mermaid',
      'data-processed': 'true',
      children: { tag: 'svg', props: { className: expect.stringContaining('pele-flowchart') } },
    },
  });
});

test('fails compilation for invalid diagrams instead of shipping an empty placeholder', async () => {
  const processor = await createMarkdownProcessor({ remarkPlugins: [remarkMermaid] });
  await expect(processor.render('```mermaid\nnot a diagram\n```')).rejects.toThrow();
});
