import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { glossaryHref, sortGlossary } from '../../utils/dev-center/glossary';

export async function getStaticPaths() {
  const terms = sortGlossary(await getCollection('glossary'));
  return [
    {
      params: { page: 'glossary' },
      props: { markdown: [
        '# Aspire glossary',
        ...terms.map((term) => [
          `## [${term.data.title}](https://aspire.dev${glossaryHref(term.id)})`,
          term.data.termType ? `Term type: ${term.data.termType}` : '',
          term.data.pronunciation ? `Pronounced: ${term.data.pronunciation}` : '',
          term.data.description,
          term.data.context,
        ].filter(Boolean).join('\n\n')),
      ].join('\n\n') },
    },
    ...terms.map((term) => ({
      params: { page: `glossary/${term.id}` },
      props: { markdown: [
        `# ${term.data.title}`,
        term.data.termType ? `Term type: ${term.data.termType}` : '',
        term.data.pronunciation ? `Pronounced: ${term.data.pronunciation}` : '',
        term.data.description,
        term.data.aliases.length ? `Also known as: ${term.data.aliases.join(', ')}` : '',
        term.body ?? '',
        '## Practical example',
        term.data.context,
        term.data.resources.length ? '## Learn more' : '',
        ...term.data.resources.map((link) => `- [${link.title}](https://aspire.dev${link.href})`),
        '## Related terms',
        ...terms.filter((other) => term.data.related.includes(other.id))
          .map((other) => `- [${other.data.title}](https://aspire.dev${glossaryHref(other.id)})`),
      ].filter(Boolean).join('\n\n') },
    })),
  ];
}

export const GET: APIRoute = ({ props }) => new Response(props.markdown, {
  headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
});
