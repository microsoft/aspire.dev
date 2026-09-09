import { createProcessor } from '@mdx-js/mdx';

const markdownParser = createProcessor();
const appHostLanguageSourcePattern = /<AppHost(?:Tabs|LanguagePivot)\b/i;

function getStringAttribute(node, name) {
  const attribute = node.attributes?.find(
    (candidate) => candidate?.type === 'mdxJsxAttribute' && candidate.name === name
  );
  return typeof attribute?.value === 'string' ? attribute.value : undefined;
}

function getLimitations(node) {
  const attribute = node.attributes?.find(
    (candidate) => candidate?.type === 'mdxJsxAttribute' && candidate.name === 'limitations'
  );
  const expression = attribute?.value?.data?.estree?.body?.[0]?.expression;
  if (expression?.type !== 'ObjectExpression') {
    return new Map();
  }

  const limitations = new Map();
  for (const property of expression.properties ?? []) {
    if (property.type !== 'Property') continue;

    const key =
      property.key.type === 'Identifier'
        ? property.key.name
        : property.key.type === 'Literal'
          ? property.key.value
          : undefined;
    const value =
      property.value.type === 'Literal' && typeof property.value.value === 'string'
        ? property.value.value
        : property.value.type === 'TemplateLiteral' &&
            property.value.expressions.length === 0 &&
            property.value.quasis.length === 1
          ? property.value.quasis[0].value.cooked
          : undefined;

    if (typeof key === 'string' && typeof value === 'string') {
      limitations.set(key, value);
    }
  }

  return limitations;
}

function getInnerSource(node, markdown) {
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;
  if (typeof start !== 'number' || typeof end !== 'number' || !node.name) {
    throw new Error('Unable to locate AppHost language content in the Markdown source.');
  }

  const openingEnd = markdown.indexOf('>', start);
  const closingStart = markdown.lastIndexOf(`</${node.name}>`, end);
  if (openingEnd < 0 || closingStart <= openingEnd) {
    throw new Error('Unable to extract AppHost language content from the Markdown source.');
  }

  return markdown.slice(openingEnd + 1, closingStart).replace(/^\r?\n/, '').replace(/\r?\n$/, '');
}

function collectAppHostTabEdits(node, markdown, enabledLanguages, edits) {
  if (!node || typeof node !== 'object') {
    return;
  }

  if (
    node.type === 'mdxJsxFlowElement' &&
    node.name === 'AppHostTabs' &&
    Array.isArray(node.children)
  ) {
    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    if (typeof start !== 'number' || typeof end !== 'number') {
      throw new Error('Unable to locate AppHostTabs in the Markdown source.');
    }
    const lineStart = markdown.lastIndexOf('\n', start - 1) + 1;
    const indent = markdown.slice(lineStart, start);

    const fragments = new Map(
      node.children
        .filter(
          (child) =>
            child?.type === 'mdxJsxFlowElement' &&
            child.name === 'Fragment' &&
            typeof getStringAttribute(child, 'slot') === 'string'
        )
        .map((child) => [getStringAttribute(child, 'slot'), child])
    );
    const limitations = getLimitations(node);
    const sections = [];

    for (const language of enabledLanguages) {
      const fragment = fragments.get(language.id);
      if (fragment) {
        const status = language.experimental ? ' (Experimental)' : '';
        sections.push(
          `### ${language.label}${status}\n\n${getInnerSource(fragment, markdown).trim()}`
        );
        continue;
      }

      const limitation = limitations.get(language.id);
      if (limitation) {
        sections.push(
          `### ${language.label}${language.experimental ? ' (Experimental)' : ''}\n\n` +
            `${indent}> [!NOTE]\n` +
            `${indent}> **${language.label} AppHost limitation:** ${limitation}`
        );
      }
    }

    edits.push({ start, end, replacement: sections.join(`\n\n${indent}`) });
    return;
  }

  if (node.type === 'mdxJsxFlowElement' && node.name === 'AppHostLanguagePivot') {
    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    const languageId = getStringAttribute(node, 'id');
    if (typeof start !== 'number' || typeof end !== 'number' || !languageId) {
      throw new Error('Unable to locate AppHostLanguagePivot in the Markdown source.');
    }

    const language = enabledLanguages.find((candidate) => candidate.id === languageId);
    edits.push({
      start,
      end,
      replacement: language ? getInnerSource(node, markdown).trim() : '',
    });
    return;
  }

  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      collectAppHostTabEdits(child, markdown, enabledLanguages, edits);
    }
  }
}

export function renderAppHostTabsInMarkdown(markdown, languages) {
  if (!appHostLanguageSourcePattern.test(markdown)) {
    return markdown;
  }

  const normalizedMarkdown = markdown.replace(/\r\n?/g, '\n');
  const enabledLanguages = languages.filter((language) => language.enabled);
  const tree = markdownParser.parse(normalizedMarkdown);
  const edits = [];
  collectAppHostTabEdits(tree, normalizedMarkdown, enabledLanguages, edits);

  let updated = normalizedMarkdown;
  for (const edit of edits.sort((left, right) => right.start - left.start)) {
    updated =
      updated.slice(0, edit.start) + edit.replacement + updated.slice(edit.end);
  }
  return updated;
}
