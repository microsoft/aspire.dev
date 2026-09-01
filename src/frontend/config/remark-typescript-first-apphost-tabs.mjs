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

export function remarkTypeScriptFirstAppHostTabs() {
  return (tree) => {
    orderAppHostTabs(tree);
  };
}
