import { fromHtml } from 'hast-util-from-html';
import { renderMermaid } from '../src/utils/mermaid.mjs';

/** Render opted-in fences before code highlighting, including nested MDX content. */
export function remarkMermaid() {
  return (tree) => {
    function visit(parent) {
      for (const [index, node] of parent.children.entries()) {
        if (node.type === 'code' && node.lang === 'mermaid') {
          parent.children[index] = {
            type: 'paragraph',
            children: [],
            data: {
              hName: 'pre',
              hProperties: { className: ['mermaid'], 'data-processed': 'true' },
              hChildren: fromHtml(renderMermaid(node.value), { fragment: true }).children,
            },
            position: node.position,
          };
        } else if (Array.isArray(node.children)) {
          visit(node);
        }
      }
    }
    visit(tree);
  };
}
