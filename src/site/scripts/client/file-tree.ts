// starlight-plugin-icons' <FileTree> transform (lib/rehype-file-tree.ts), run in the browser.
//
// The `file_tree` shortcode (templates/shortcodes/file_tree.liquid) renders its Markdown list as is inside
// <starlight-file-tree data-directory-label="...">: Liquid cannot rewrite HTML. This module applies the plugin's
// build-time transform on load, with the same final markup and classes (`.directory`/`.file`/`.empty`,
// `.tree-entry`, `.highlight`, `.comment`, `.tree-icon`, `.icon-open`/`.icon-closed`, the sr-only directory
// label). Icons are the plugin's class-based icons (`<span class="tree-icon i-material-icon-theme:x">`), whose
// rules scripts/icons-sprite.mjs writes into assets/css/icons.css for the plugin's safelist (every icon the
// content's file trees use); an icon without a rule there falls back to a sprite
// <svg class="tree-icon ..."><use href="/assets/icons.svg#..."></svg>. The file and folder name tables are
// starlight-plugin-icons' (.starlight-icons) pruned to the sprite's icons by scripts/icons-sprite.mjs.
import tables from './generated/file-icons.json';
import { onReady } from './lib/ready';

const SPRITE = '/assets/icons.svg';
const SVG_NS = 'http://www.w3.org/2000/svg';

type Tables = Record<'fileNames' | 'fileExtensions' | 'languageExtensions' | 'folderNames' | 'folderNamesExpanded', Record<string, string>>;
const t = tables as Tables;

function svgIcon(name: string, classes: string[]): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', ['tree-icon', ...classes].join(' '));
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('fill', 'currentColor');
  svg.dataset.icon = name;
  const use = document.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', `${SPRITE}#${name}`);
  svg.append(use);
  return svg;
}

/** The plugin's markup: `<span class="tree-icon i-<icon>" data-icon="i-<icon>">` (icons.css draws it). */
function classIcon(name: string, classes: string[]): HTMLSpanElement {
  const span = document.createElement('span');
  span.className = ['tree-icon', ...classes, `i-${name}`].join(' ');
  span.dataset.icon = `i-${name}`;
  return span;
}

const hasIconRule = new Map<string, boolean>();

/** Replaces the class icons that icons.css does not draw (no background nor mask) with sprite icons. */
function fallBackToSprite(tree: HTMLElement): void {
  for (const span of tree.querySelectorAll<HTMLSpanElement>('span.tree-icon[data-icon]')) {
    const name = span.dataset.icon!.slice(2);
    let drawn = hasIconRule.get(name);
    if (drawn === undefined) {
      const style = getComputedStyle(span);
      drawn = style.backgroundImage !== 'none' || (style.maskImage || style.webkitMaskImage) !== 'none';
      hasIconRule.set(name, drawn);
    }
    if (!drawn) {
      const classes = [...span.classList].filter((c) => c !== 'tree-icon' && c !== span.dataset.icon);
      span.replaceWith(svgIcon(name, classes));
    }
  }
}

function fileIcon(fileName: string): string {
  if (fileName.endsWith('.svelte.js')) return 'starlight-plugin-icons:svelte-js';
  if (fileName.endsWith('.svelte.ts')) return 'starlight-plugin-icons:svelte-ts';
  const name = (fileName.split('/').pop() ?? fileName).toLowerCase();
  const longExtension = name.split('.').slice(1).join('.');
  const shortExtension = name.split('.').pop() ?? '';
  const icon =
    t.fileNames[name] ??
    t.fileExtensions[longExtension] ??
    t.fileExtensions[shortExtension] ??
    t.languageExtensions[shortExtension] ??
    (!name.startsWith('.') ? t.fileNames[`.${name}`] : undefined);
  return `material-icon-theme:${icon ?? 'document'}`;
}

function folderIcon(folderName: string, open: boolean): string {
  const name = folderName.trim().replace(/[\\/]+$/, '').toLowerCase();
  const icon = open ? t.folderNamesExpanded[name] : t.folderNames[name];
  if (icon) return `material-icon-theme:${icon}`;
  return open ? 'starlight-plugin-icons:folder-open' : 'starlight-plugin-icons:folder';
}

function el(tag: string, className?: string, children: Node[] = []): HTMLElement {
  const element = document.createElement(tag);
  if (className !== undefined) element.className = className;
  element.append(...children);
  return element;
}

function transformItem(li: HTMLLIElement, directoryLabel: string): void {
  // Strip text nodes that only hold newlines (as the plugin does).
  for (const node of [...li.childNodes]) {
    if (node.nodeType === Node.TEXT_NODE && /^\n+$/.test(node.textContent ?? '')) node.remove();
  }
  // Markdown wraps loose list items in <p>: unwrap it so the first child is the name.
  const first = li.firstChild;
  if (first instanceof HTMLParagraphElement) first.replaceWith(...first.childNodes);

  const [firstChild, ...rest] = [...li.childNodes];
  const comment: Node[] = [];
  if (firstChild && firstChild.nodeType === Node.TEXT_NODE) {
    const [fileName, ...fragments] = (firstChild.textContent ?? '').split(' ');
    firstChild.textContent = fileName ?? '';
    if (fragments.join(' ').trim().length > 0) comment.push(document.createTextNode(fragments.join(' ')));
  }
  const subTreeIndex = rest.findIndex((child) => child instanceof HTMLUListElement);
  const commentNodes = subTreeIndex > -1 ? rest.slice(0, subTreeIndex) : [...rest];
  const otherChildren = subTreeIndex > -1 ? rest.slice(subTreeIndex) : [];
  comment.push(...commentNodes);

  const text = firstChild?.textContent ?? '';
  const isDirectory = /\/\s*$/.test(text) || otherChildren.some((child) => child instanceof HTMLUListElement);
  const isPlaceholder = /^\s*(?:\.{3}|…)\s*$/.test(text);
  const isHighlighted = firstChild instanceof HTMLElement && firstChild.tagName === 'STRONG';
  const name = text.trim().replace(/[\\/]+$/, '');

  let icon: Element;
  if (isDirectory) {
    icon = el('span', undefined, [
      el('span', 'sr-only', [document.createTextNode(directoryLabel)]),
      classIcon(folderIcon(name, false), ['icon-closed']),
      classIcon(folderIcon(name, true), ['icon-open']),
    ]);
  } else {
    icon = classIcon(fileIcon(name), []);
  }

  li.className = isDirectory ? 'directory' : 'file';
  if (isPlaceholder) li.classList.add('empty');

  const nameSpan = el('span', isHighlighted ? 'highlight' : '', [
    ...(isPlaceholder ? [] : [icon]),
    ...(firstChild ? [firstChild] : []),
  ]);
  const entryChildren: Node[] = [nameSpan];
  if (comment.length > 0) entryChildren.push(document.createTextNode(' '), el('span', 'comment', comment));
  const entry = el('span', 'tree-entry', entryChildren);

  li.replaceChildren();
  if (isDirectory) {
    const hasContents = otherChildren.length > 0;
    const details = document.createElement('details');
    details.open = hasContents;
    const summary = el('summary', 'tree-icon-container', [entry]);
    details.append(summary, ...(hasContents ? otherChildren : [el('ul', undefined, [el('li', undefined, [document.createTextNode('…')])])]));
    li.append(details);
  } else {
    li.append(entry, ...otherChildren);
  }
}

function transform(tree: HTMLElement): void {
  if (tree.dataset.processed === 'true') return;
  const label = tree.dataset.directoryLabel ?? 'Directory';
  // Collect first (document order, parents before children), then transform children before parents so a
  // parent's sub-list is final when it moves into its <details>.
  const items = [...tree.querySelectorAll<HTMLLIElement>('li')];
  for (const li of items.reverse()) transformItem(li, label);
  fallBackToSprite(tree);
  tree.dataset.processed = 'true';
}

onReady(() => document.querySelectorAll<HTMLElement>('starlight-file-tree').forEach(transform));
