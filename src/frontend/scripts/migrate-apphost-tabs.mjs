import { createProcessor } from '@mdx-js/mdx';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const docsRoot = path.join(frontendRoot, 'src', 'content', 'docs');
const excludedTopLevel = new Set([
  'da',
  'de',
  'diagnostics',
  'es',
  'fr',
  'hi',
  'id',
  'it',
  'ja',
  'ko',
  'pt-br',
  'ru',
  'tr',
  'uk',
  'whats-new',
  'zh-cn',
]);
const parser = createProcessor();

function getStringAttribute(node, name) {
  const attribute = node.attributes?.find(
    (candidate) => candidate?.type === 'mdxJsxAttribute' && candidate.name === name
  );
  return typeof attribute?.value === 'string' ? attribute.value : undefined;
}

function normalizeLanguageId(node) {
  const id = getStringAttribute(node, 'id')?.toLowerCase();
  if (id) return id;

  const label = getStringAttribute(node, 'label')?.toLowerCase();
  if (label?.includes('typescript')) return 'typescript';
  if (label === 'c#' || label?.includes('c# apphost')) return 'csharp';
  if (label?.includes('python')) return 'python';
  if (label === 'go' || label?.includes('go apphost')) return 'go';
  if (label?.includes('java')) return 'java';
  if (label?.includes('rust')) return 'rust';
  return undefined;
}

function getInnerSource(node, source) {
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;
  if (typeof start !== 'number' || typeof end !== 'number' || !node.name) {
    throw new Error('Unable to locate a TabItem in the MDX source.');
  }
  const openingEnd = source.indexOf('>', start);
  const closingStart = source.lastIndexOf(`</${node.name}>`, end);
  if (openingEnd < 0 || closingStart <= openingEnd) {
    throw new Error('Unable to extract a TabItem body from the MDX source.');
  }
  return source.slice(openingEnd + 1, closingStart);
}

function normalizeAppHostTabsIndentation(source) {
  const lines = source.split('\n');
  const indents = [];

  return lines
    .map((line) => {
      const trimmed = line.trimStart();
      if (trimmed.startsWith('<AppHostTabs')) {
        indents.push(line.slice(0, line.length - trimmed.length));
        return line;
      }
      if (indents.length === 0) {
        return line;
      }

      const indent = indents[indents.length - 1];
      if (
        trimmed.startsWith('<Fragment slot=') ||
        trimmed === '</Fragment>' ||
        trimmed === '</AppHostTabs>'
      ) {
        const normalized = `${indent}${trimmed}`;
        if (trimmed === '</AppHostTabs>') {
          indents.pop();
        }
        return normalized;
      }

      return line;
    })
    .join('\n');
}

function collectEdits(node, source, edits) {
  if (!node || typeof node !== 'object') return;

  if (
    node.type === 'mdxJsxFlowElement' &&
    node.name === 'Tabs' &&
    getStringAttribute(node, 'syncKey') === 'aspire-lang'
  ) {
    const start = node.position?.start.offset;
    const nodeEnd = node.position?.end.offset;
    if (typeof start !== 'number' || typeof nodeEnd !== 'number') {
      throw new Error('Unable to locate an aspire-lang Tabs block in the MDX source.');
    }
    const closingStart = source.lastIndexOf('</Tabs>', Math.min(source.length, nodeEnd + 1));
    if (closingStart < start) {
      throw new Error('Unable to locate the closing tag for an aspire-lang Tabs block.');
    }

    const tabItems = node.children.filter(
      (child) => child?.type === 'mdxJsxFlowElement' && child.name === 'TabItem'
    );
    const lineStart = source.lastIndexOf('\n', start - 1) + 1;
    const indent = source.slice(lineStart, start);
    const fragments = tabItems.map((tab) => {
      const language = normalizeLanguageId(tab);
      if (!language) {
        throw new Error('Unable to identify an AppHost language TabItem.');
      }
      return `${indent}<Fragment slot="${language}">${getInnerSource(tab, source)}</Fragment>`;
    });

    edits.push({
      start,
      end: closingStart + '</Tabs>'.length,
      replacement: `<AppHostTabs>\n${fragments.join('\n')}\n${indent}</AppHostTabs>`,
    });
    return;
  }

  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      collectEdits(child, source, edits);
    }
  }
}

function updateStarlightImports(source) {
  if (source.includes('<Tabs') || source.includes('<TabItem')) {
    return source;
  }

  return source.replace(
    /import\s*\{([\s\S]*?)\}\s*from\s*(['"])@astrojs\/starlight\/components\2;?/g,
    (full, members, quote) => {
      const kept = members
        .split(',')
        .map((member) => member.trim())
        .filter(Boolean)
        .filter((member) => member !== 'Tabs' && member !== 'TabItem');
      return kept.length > 0
        ? `import { ${kept.join(', ')} } from ${quote}@astrojs/starlight/components${quote};`
        : '';
    }
  );
}

function addAppHostTabsImport(source) {
  if (source.includes("from '@components/AppHostTabs.astro'")) {
    return source;
  }

  const frontmatterEnd = source.indexOf('\n---', 4);
  if (frontmatterEnd < 0) {
    throw new Error('Expected MDX frontmatter before AppHost tabs.');
  }
  const insertAt = frontmatterEnd + 4;
  return (
    source.slice(0, insertAt) +
    "\n\nimport AppHostTabs from '@components/AppHostTabs.astro';" +
    source.slice(insertAt)
  );
}

async function collectMdxFiles(directory, files = []) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const resolved = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (directory === docsRoot && excludedTopLevel.has(entry.name.toLowerCase())) {
        continue;
      }
      await collectMdxFiles(resolved, files);
    } else if (entry.isFile() && entry.name.endsWith('.mdx')) {
      files.push(resolved);
    }
  }
  return files;
}

let changedFiles = 0;
let changedGroups = 0;
for (const file of await collectMdxFiles(docsRoot)) {
  const original = (await readFile(file, 'utf8')).replace(/\r\n?/g, '\n');
  const source = normalizeAppHostTabsIndentation(original);
  if (!/<Tabs\b[^>]*\bsyncKey\s*=\s*(['"])aspire-lang\1/i.test(source)) {
    if (source !== original) {
      await writeFile(file, source);
      changedFiles++;
    }
    continue;
  }

  const tree = parser.parse(source);
  const edits = [];
  collectEdits(tree, source, edits);
  if (edits.length === 0) continue;

  let updated = source;
  for (const edit of edits.sort((left, right) => right.start - left.start)) {
    updated =
      updated.slice(0, edit.start) + edit.replacement + updated.slice(edit.end);
  }
  updated = addAppHostTabsImport(updateStarlightImports(updated));

  await writeFile(file, updated);
  changedFiles++;
  changedGroups += edits.length;
}

console.log(`Migrated ${changedGroups} AppHost tab groups across ${changedFiles} files.`);
