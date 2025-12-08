/**
 * Expressive Code plugin to handle disable-copy meta attribute
 * Adds data-disable-copy attribute to code blocks when 'disable-copy' is in the meta string
 */
export function pluginDisableCopy() {
  return {
    name: 'disable-copy',
    hooks: {
      preprocessMetadata: ({ codeBlock }) => {
        // Check if meta string contains 'disable-copy'
        if (codeBlock.meta && codeBlock.meta.includes('disable-copy')) {
          // Store as a property
          codeBlock.props.disableCopy = true;
        }
      },
      postprocessRenderedBlock: ({ codeBlock, renderData }) => {
        // Add data-disable-copy to the rendered block's properties
        if (codeBlock.props.disableCopy) {
          if (!renderData.blockAst.properties) {
            renderData.blockAst.properties = {};
          }
          // Use camelCase for the property name (will be converted to kebab-case in HTML)
          renderData.blockAst.properties['data-disable-copy'] = '';
        }
      },
    },
  };
}
