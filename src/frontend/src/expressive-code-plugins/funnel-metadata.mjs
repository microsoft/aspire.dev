const funnelAttributePattern = /\b(data-funnel(?:-[a-z0-9-]+)?)=(?:"([^"]*)"|'([^']*)'|([^\s]+))/g;

/**
 * Copies authored data-funnel metadata from code fences onto the rendered figure.
 */
export function pluginFunnelMetadata() {
  return {
    name: 'funnel-metadata',
    hooks: {
      preprocessMetadata: ({ codeBlock }) => {
        const attributes = {};

        for (const match of codeBlock.meta?.matchAll(funnelAttributePattern) ?? []) {
          attributes[match[1]] = match[2] ?? match[3] ?? match[4] ?? '';
        }

        codeBlock.props.funnelAttributes = attributes;
      },
      postprocessRenderedBlock: ({ codeBlock, renderData }) => {
        const attributes = codeBlock.props.funnelAttributes;
        if (!attributes || Object.keys(attributes).length === 0) {
          return;
        }

        renderData.blockAst.properties ??= {};
        Object.assign(renderData.blockAst.properties, attributes);
      },
    },
  };
}
