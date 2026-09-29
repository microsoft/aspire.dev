import { select, selectAll } from 'hast-util-select';
import rehypeParse from 'rehype-parse';
import rehypeRemark from 'rehype-remark';
import remarkGfm from 'remark-gfm';
import remarkStringify from 'remark-stringify';
import { unified } from 'unified';
import { remove } from 'unist-util-remove';

const decorativeContent = [
  'script',
  'style',
  'svg',
  'button',
  'input',
  'label',
  'img[alt=""]',
  'i[aria-hidden="true"]',
  'span[aria-hidden="true"]',
  '.home-hero-eyebrow',
  '.section-index > span',
  '.principle-number',
  '.quote-mark',
  '.model-terminal',
  '.model-graph',
  '[data-model-dashboard]',
  '.dashboard-stage',
  '.agent-visual',
  '.environment-topology',
  '.environment-stage-bar',
  '[data-home-integration-rail]',
  '.agent-badge-popover > strong',
].join(', ');

/**
 * Convert the homepage's authored content, not its animated demonstrations.
 * @param {string} html
 * @returns {Promise<string>}
 */
export async function renderHomepageMarkdown(html) {
  const tree = unified().use(rehypeParse).parse(html);
  const hero = select('main .home-hero-copy', tree);
  const content = select('main .aspire-home', tree);
  if (!hero || !content || !select('h1', hero)) {
    throw new Error('Cannot export homepage Markdown: missing homepage content landmarks.');
  }

  tree.children = [hero, content];
  const decorativeNodes = new Set(selectAll(decorativeContent, tree));
  remove(tree, (node) => node.type === 'comment' || decorativeNodes.has(node));

  for (const actions of selectAll(
    '.home-hero-actions, .observability-links, .closing-actions',
    tree
  )) {
    const links = selectAll('a', actions);
    actions.tagName = 'ul';
    actions.children = links.map((link) => ({
      type: 'element',
      tagName: 'li',
      properties: {},
      children: [link],
    }));
  }
  for (const command of selectAll('.environment-command', tree)) {
    command.tagName = 'ul';
    command.children = command.children
      .filter((child) => child.type === 'element')
      .map((child) => ({
        type: 'element',
        tagName: 'li',
        properties: {},
        children: [child],
      }));
  }
  for (const caption of selectAll('.testimonial figcaption', tree)) {
    const name = select('strong', caption);
    const attribution = select('small', caption);
    if (name && attribution) {
      caption.children = [name, { type: 'text', value: ' — ' }, ...attribution.children];
    }
  }

  // These are meaningful examples and environment descriptions, even when
  // the interactive homepage initially hides their tab or animation stage.
  for (const element of selectAll('[hidden], [aria-hidden]', tree)) {
    delete element.properties.hidden;
    delete element.properties.ariaHidden;
  }
  for (const pre of selectAll('pre[data-language]', tree)) {
    const code = select('code', pre);
    if (code) {
      code.properties.className = [`language-${pre.properties.dataLanguage}`];
      const lines = selectAll('.ec-line .code', code);
      if (lines.length > 0) {
        code.children = [
          {
            type: 'text',
            value: lines.map((line) => textContent(line).replace(/\n/g, '')).join('\n'),
          },
        ];
      }
    }
  }

  const processor = unified().use(rehypeRemark).use(remarkGfm).use(remarkStringify);
  return processor.stringify(await processor.run(tree));
}

function textContent(node) {
  return node.type === 'text' ? node.value : (node.children ?? []).map(textContent).join('');
}
