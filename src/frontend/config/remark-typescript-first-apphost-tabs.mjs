import { createProcessor } from '@mdx-js/mdx';

const appHostTabsSourcePattern = /<Tabs\b[^>]*\bsyncKey\s*=\s*(["'])aspire-lang\1[^>]*>/i;
const markdownParser = createProcessor();

function getStringAttribute(node, name) {
  const attribute = node.attributes?.find(
    (candidate) => candidate?.type === 'mdxJsxAttribute' && candidate.name === name
  );
  return typeof attribute?.value === 'string' ? attribute.value : undefined;
}

function isTabItem(node) {
  return node?.type === 'mdxJsxFlowElement' && node.name === 'TabItem';
}

function isTypeScriptTab(node) {
  if (!isTabItem(node)) {
    return false;
  }

  const id = getStringAttribute(node, 'id')?.toLowerCase();
  const label = getStringAttribute(node, 'label')?.toLowerCase();
  return id === 'typescript' || label === 'typescript' || label === 'typescript apphost';
}

function orderAppHostTabs(node) {
  if (!node || typeof node !== 'object') {
    return;
  }

  if (
    node.type === 'mdxJsxFlowElement' &&
    node.name === 'Tabs' &&
    getStringAttribute(node, 'syncKey') === 'aspire-lang' &&
    Array.isArray(node.children)
  ) {
    const firstTabIndex = node.children.findIndex(isTabItem);
    const typeScriptIndex = node.children.findIndex(isTypeScriptTab);

    if (firstTabIndex >= 0 && typeScriptIndex > firstTabIndex) {
      const [typeScriptTab] = node.children.splice(typeScriptIndex, 1);
      node.children.splice(firstTabIndex, 0, typeScriptTab);
    }
  }

  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      orderAppHostTabs(child);
    }
  }
}

function collectSourceEdits(node, markdown, edits) {
  if (!node || typeof node !== 'object') {
    return;
  }

  if (
    node.type === 'mdxJsxFlowElement' &&
    node.name === 'Tabs' &&
    getStringAttribute(node, 'syncKey') === 'aspire-lang' &&
    Array.isArray(node.children)
  ) {
    const tabItems = node.children.filter(isTabItem);
    const typeScriptIndex = tabItems.findIndex(isTypeScriptTab);

    if (typeScriptIndex > 0) {
      const firstTab = tabItems[0];
      const typeScriptTab = tabItems[typeScriptIndex];
      const nextTab = tabItems[typeScriptIndex + 1];
      const insertAt = firstTab.position?.start.offset;
      const moveStart = typeScriptTab.position?.start.offset;
      const tabsEnd = node.position?.end.offset;
      const moveEnd =
        nextTab?.position?.start.offset ??
        (typeof tabsEnd === 'number' ? markdown.lastIndexOf('</Tabs>', tabsEnd) : -1);

      if (typeof insertAt !== 'number' || typeof moveStart !== 'number' || moveEnd <= moveStart) {
        throw new Error('Unable to locate an aspire-lang tab group in the Markdown source.');
      }

      edits.push({ insertAt, moveStart, moveEnd });
    }
  }

  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      collectSourceEdits(child, markdown, edits);
    }
  }
}

export function orderTypeScriptFirstAppHostTabsInMarkdown(markdown) {
  if (!appHostTabsSourcePattern.test(markdown)) {
    return markdown;
  }

  const tree = markdownParser.parse(markdown);
  const edits = [];
  collectSourceEdits(tree, markdown, edits);

  let updated = markdown;
  for (const { insertAt, moveStart, moveEnd } of edits.sort(
    (left, right) => right.moveStart - left.moveStart
  )) {
    updated =
      updated.slice(0, insertAt) +
      updated.slice(moveStart, moveEnd) +
      updated.slice(insertAt, moveStart) +
      updated.slice(moveEnd);
  }

  return updated;
}

export function remarkTypeScriptFirstAppHostTabs() {
  return (tree) => {
    orderAppHostTabs(tree);
  };
}
