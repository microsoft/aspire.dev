import { aspireVersionPlaceholders } from './aspire-versions.mjs';

const placeholderEntries = Object.entries(aspireVersionPlaceholders);

export function replaceAspireVersionPlaceholders(value) {
  return placeholderEntries.reduce(
    (current, [placeholder, version]) => current.replaceAll(placeholder, version),
    value
  );
}

export function remarkAspireVersionPlaceholders() {
  return (tree) => {
    replaceNodeValues(tree);
  };
}

function replaceNodeValues(node) {
  if (!node || typeof node !== 'object') {
    return;
  }

  if (typeof node.value === 'string') {
    node.value = replaceAspireVersionPlaceholders(node.value);
  }

  if (Array.isArray(node.attributes)) {
    for (const attribute of node.attributes) {
      if (attribute && typeof attribute.value === 'string') {
        attribute.value = replaceAspireVersionPlaceholders(attribute.value);
      }
    }
  }

  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      replaceNodeValues(child);
    }
  }
}
