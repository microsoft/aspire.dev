import type { APIRoute } from 'astro';
import { devTitle, devDescription, topicLinks, resources, languages, cloudLinks, featuredSamples, referenceLinks, dashboardLinks, videos, blogHighlights } from '../data/dev-hub';
import { tagLabel } from '@utils/sample-tags';

export const GET: APIRoute = () => new Response([
  `# ${devTitle}`,
  devDescription,
  '[Browse all resources](https://aspire.dev/hub/browse/): Search and filter by resource type, topic, and language.',
  '## New to Aspire?',
  ...resources.map((resource) => `- [${resource.title}](https://aspire.dev${resource.href}) (${resource.format}): ${resource.description}`),
  '## Browse by topic',
  ...topicLinks.map((topic) => `- [${topic.title}](https://aspire.dev${topic.href}): ${topic.description}`),
  '## Start with your language',
  ...languages.map((language) => `- [${language.title}](https://aspire.dev${language.href}): ${language.description}`),
  '## Browse by cloud and deployment target',
  ...cloudLinks.map((cloud) => `- [${cloud.title}](${cloud.href.startsWith('/') ? 'https://aspire.dev' : ''}${cloud.href}): ${cloud.description}`),
  '## Samples to build on',
  '[All samples](https://aspire.dev/hub/browse/?type=sample): Filter by language, including the sample services and AppHost.',
  ...featuredSamples.map((sample) => `- [${sample.title}](https://aspire.dev${sample.href}) (${sample.languages.map(tagLabel).join(', ')}): ${sample.description}`),
  '## Reference',
  '[All reference docs](https://aspire.dev/reference/overview/)',
  ...referenceLinks.map((link) => `- [${link.title}](https://aspire.dev${link.href}): ${link.description}`),
  '## Dashboard',
  '[Explore the dashboard](https://aspire.dev/dashboard/)',
  ...dashboardLinks.map((link) => `- [${link.title}](https://aspire.dev${link.href})`),
  '## Latest from Aspire on YouTube',
  '[All videos](https://aspire.dev/community/videos/)',
  ...videos.map((video) => `- [${video.title}](https://www.youtube.com/watch?v=${video.id})`),
  '## From the blog',
  '[All blog posts](https://devblogs.microsoft.com/aspire/)',
  ...blogHighlights.map((post) => `- [${post.title}](${post.href}) (${post.date}): ${post.description}`),
].join('\n\n'), { headers: { 'Content-Type': 'text/markdown; charset=utf-8' } });
