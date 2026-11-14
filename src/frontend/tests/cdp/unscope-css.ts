// Prototype only: the `scope-polyfill` workaround of playwright-test-shim.ts. Flattens CSS `@scope` blocks for
// engines that drop them: `@scope (X) to (Y) { S { … } }` becomes `:where(X) S { … }`, and a selector that names
// `:scope` gets X in its place. `:where()` keeps the specificity unchanged, as @scope does. The lower bound Y and
// scope proximity are ignored, so this is an approximation of @scope, good enough to measure its effect.
import postcss, { type AtRule, type Rule } from 'postcss';

const scopeRoot = (params: string) => {
  // params: "(X) to (Y)" or "(X)"; X may hold nested parentheses.
  if (!params.startsWith('(')) return undefined;
  let depth = 0;
  for (let i = 0; i < params.length; i++) {
    if (params[i] === '(') depth++;
    else if (params[i] === ')' && --depth === 0) return params.slice(1, i).trim();
  }
  return undefined;
};

export function unscopeCss(css: string): string {
  if (!css.includes('@scope')) return css;
  const root = postcss.parse(css);
  root.walkAtRules('scope', (atRule: AtRule) => {
    const scope = scopeRoot(atRule.params);
    if (!scope) return;
    const where = `:where(${scope})`;
    atRule.walkRules((rule: Rule) => {
      if (rule.parent?.type === 'atrule' && /keyframes$/i.test((rule.parent as AtRule).name)) return;
      rule.selectors = rule.selectors.map((selector) =>
        selector.includes(':scope') ? selector.replaceAll(':scope', where) : `${where} ${selector}`);
    });
    atRule.replaceWith(atRule.nodes ?? []);
  });
  return root.toString();
}
