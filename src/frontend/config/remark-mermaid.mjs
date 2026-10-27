/** Turn opted-in fences into plain pre elements before code highlighting. */
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
              hProperties: { className: ['mermaid'] },
              hChildren: [{ type: 'text', value: node.value }],
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
