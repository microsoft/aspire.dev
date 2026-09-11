import { getCollection } from 'astro:content';
import samples from '@data/samples.json';
import integrations from '@data/aspire-integrations.json';
import integrationDocs from '@data/integration-docs.json';
import blogPosts from '@data/aspire-blog-posts.json';
import { allCommunityVideos } from '@data/community-videos';
import { blogHighlights, videos } from '@data/dev-central';
import { redirects } from '../../../config/redirects.mjs';
import { socialConfig } from '../../../config/socials.config';
import { buildResourceCatalog } from '@utils/dev-center/catalog-normalization';
import type { DevResource } from '@utils/dev-center/resource-types';

/** Build-time only: the returned records intentionally omit document bodies and sample READMEs. */
export async function getResourceCatalog(): Promise<DevResource[]> {
  const [docs, glossary] = await Promise.all([getCollection('docs'), getCollection('glossary')]);
  return buildResourceCatalog({
    docs,
    glossary,
    samples,
    integrations,
    integrationDocs,
    videos: [
      ...allCommunityVideos.filter((video) => video.tags.includes('Official')),
      ...videos.map((video) => ({
        title: video.title,
        description: video.series,
        href: `https://www.youtube.com/watch?v=${video.id}`,
        tags: [video.series],
      })),
    ],
    blogs: [...blogPosts, ...blogHighlights],
    channels: socialConfig.flatMap((social) =>
      social.icon === 'youtube' || social.icon === 'twitch'
        ? [{ platform: social.icon, href: social.href, title: `Aspire on ${social.label}`,
          description: social.icon === 'twitch'
            ? 'Watch the official Aspire Twitch channel for live streams with the team.'
            : 'Explore videos and live streams on the official Aspire YouTube channel.' }]
        : []),
    redirectPaths: Object.keys(redirects),
  });
}
