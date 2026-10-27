import { createProcessor } from '@mdx-js/mdx';
import type { Root, RootContent } from 'mdast';

const parser = createProcessor();
const languageAliases: Record<string, string> = {
  csharp: 'csharp', cs: 'csharp', 'c#': 'csharp',
  typescript: 'typescript', ts: 'typescript', tsx: 'typescript',
  javascript: 'javascript', js: 'javascript', jsx: 'javascript',
  python: 'python', py: 'python', go: 'go', golang: 'go',
  java: 'java', rust: 'rust', rs: 'rust',
  fsharp: 'fsharp', fs: 'fsharp', 'f#': 'fsharp',
  ruby: 'ruby', rb: 'ruby', php: 'php', perl: 'perl',
  kotlin: 'kotlin', swift: 'swift', cpp: 'cpp', 'c++': 'cpp', c: 'c',
};

/** Read code syntax, not prose, tab labels, shell commands, or configuration formats. */
export function createDocLanguageResolver(docs: readonly { id: string; body?: string }[]) {
  const sources = new Map(docs.map((doc) => [doc.id, doc.body ?? '']));
  const cache = new Map<string, string[]>();
  const visiting = new Set<string>();

  function resolve(id: string): string[] {
    const cached = cache.get(id);
    if (cached) return cached;
    const body = sources.get(id);
    if (body === undefined) throw new Error(`Missing resource language include: ${id}`);
    if (visiting.has(id)) throw new Error(`Circular resource language include: ${id}`);
    visiting.add(id);
    const languages = new Set<string>();
    const add = (syntax: string | undefined) => {
      const language = syntax && languageAliases[syntax.toLowerCase()];
      if (language) languages.add(language);
    };
    function visit(node: Root | RootContent) {
      if (node.type === 'code') add(node.lang ?? undefined);
      if (node.type === 'mdxJsxFlowElement' || node.type === 'mdxJsxTextElement') {
        const attribute = (name: string) => {
          const attr = node.attributes.find((attr) => attr.type === 'mdxJsxAttribute' && attr.name === name);
          return attr && 'value' in attr && typeof attr.value === 'string' ? attr.value : undefined;
        };
        if (node.name === 'Code') add(attribute('lang'));
        if (node.name === 'Include') {
          const path = attribute('relativePath');
          if (path) {
            for (const language of resolve(path.replace(/^\/+/, '').replace(/\.mdx?$/i, ''))) languages.add(language);
          }
        }
      }
      if ('children' in node) node.children.forEach(visit);
    }
    visit(parser.parse(body));
    const result = [...languages].sort();
    cache.set(id, result);
    visiting.delete(id);
    return result;
  }
  return resolve;
}
