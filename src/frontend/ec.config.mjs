import { pluginCollapsibleSections } from '@expressive-code/plugin-collapsible-sections';
import { pluginLineNumbers } from '@expressive-code/plugin-line-numbers';
import { pluginDisableCopy } from './src/expressive-code-plugins/disable-copy.mjs';

/** @type {import('@astrojs/starlight/expressive-code').StarlightExpressiveCodeOptions} */
export default {
  plugins: [pluginCollapsibleSections(), pluginLineNumbers(), pluginDisableCopy()],
  defaultProps: {
    showLineNumbers: false,
  },
};
