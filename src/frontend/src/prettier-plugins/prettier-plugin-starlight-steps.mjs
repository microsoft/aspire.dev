// This plugin tells Prettier not to format the children of <Steps> in MDX/MD files.
import markdownParser from 'prettier/parser-markdown';

export const languages = [
  {
    name: 'mdx',
    parsers: ['mdx'],
  },
];

export const parsers = {
  mdx: {
    ...markdownParser.parsers.mdx,

    // Wrap the existing parse function
    parse(text, parsers, options) {
      const ast = markdownParser.parsers.mdx.parse(text, parsers, options);

      // Mark <Steps> nodes so the printer can skip them
      function walk(node) {
        if (!node || typeof node !== 'object') return;

        // MDX JSX nodes appear as "mdxJsxFlowElement"
        if (node.type === 'mdxJsxFlowElement' && node.name === 'Steps') {
          node.__dontFormatChildren = true;
        }

        for (const key in node) {
          const val = node[key];
          if (Array.isArray(val)) val.forEach(walk);
          else walk(val);
        }
      }

      walk(ast);
      return ast;
    },
  },
};

export const printers = {
  mdx: {
    ...markdownParser.printers.mdx,

    print(path, options, print) {
      const node = path.getValue();

      // If it's <Steps> and we marked it, return raw inner content
      if (
        node?.type === 'mdxJsxFlowElement' &&
        node?.name === 'Steps' &&
        node.__dontFormatChildren
      ) {
        // Preserve original text exactly
        const raw = options.originalText.slice(
          node.position.start.offset,
          node.position.end.offset
        );

        return raw;
      }

      return markdownParser.printers.mdx.print(path, options, print);
    },
  },
};
