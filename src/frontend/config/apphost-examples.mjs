import { createHash } from 'node:crypto';
import { select, selectAll } from 'hast-util-select';
import rehypeParse from 'rehype-parse';
import { unified } from 'unified';

/**
 * Move the builder's highlighted examples to one lazy-loaded static file.
 * @param {string} html
 * @returns {{ html: string; examples: string; filename: string }}
 */
export function deferAppHostExamples(html) {
  const tree = unified().use(rehypeParse).parse(html);
  const builder = select('[data-apphost-builder]', tree);
  const groups = selectAll('[data-apphost-builder] .code-lang-group', tree);
  const initial = select(
    '[data-apphost-builder] [data-code-lang="typescript"] [data-variant="frontend"]',
    tree
  );
  if (!builder || groups.length !== 2 || !initial) {
    throw new Error('Cannot defer AppHost examples: missing builder or default example.');
  }

  const source = (node) => html.slice(node.position.start.offset, node.position.end.offset);
  const sourceWithoutCopyControls = (node) => {
    let markup = source(node);
    for (const copy of selectAll('.copy', node).toReversed()) {
      const start = copy.position.start.offset - node.position.start.offset;
      const end = copy.position.end.offset - node.position.start.offset;
      markup = markup.slice(0, start) + markup.slice(end);
    }
    return markup;
  };
  const examples = groups.map(sourceWithoutCopyControls).join('\n');
  const hash = createHash('sha256').update(examples).digest('hex').slice(0, 16);
  const filename = `apphost-examples.${hash}.html`;

  // Edit the original source ranges so unrelated homepage markup stays byte-identical.
  for (const group of groups.toReversed()) {
    const start = group.position.start.offset;
    const openingTag = html.slice(start, html.indexOf('>', start) + 1);
    const body =
      group.properties.dataCodeLang === 'typescript' ? sourceWithoutCopyControls(initial) : '';
    html =
      html.slice(0, start) + openingTag + body + '</div>' + html.slice(group.position.end.offset);
  }
  const attributeOffset = builder.position.start.offset + builder.tagName.length + 1;
  html =
    html.slice(0, attributeOffset) +
    ` data-apphost-examples="/_astro/${filename}"` +
    html.slice(attributeOffset);

  return { html, examples, filename };
}
