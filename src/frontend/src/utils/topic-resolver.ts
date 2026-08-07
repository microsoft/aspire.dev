import { sidebarTopics } from '../../config/sidebar/sidebar.topics.ts';

/**
 * Maps a docs entry id (with optional locale prefix) to the sidebar topic it
 * belongs to, so the Open Graph image renderer can show a topic badge with
 * the same icon used in the topics sidebar.
 *
 * The mapping walks the sidebar topic configuration the same way
 * `content-breadcrumbs.ts` does, then falls back to a plain prefix match on
 * the topic's `link` field. The icon SVG paths are inlined below (rather
 * than imported from Starlight's internal `components-internals/Icons.ts`)
 * so we do not depend on Starlight's private surface area.
 */

export interface TopicMetadata {
  /** Topic id (also used to look up the inlined icon path). */
  id: string;
  /** Display label, in the requested locale or English as fallback. */
  label: string;
  /** Topic icon name (matches the Starlight icon registry). */
  iconName: string;
  /** Raw SVG path data (`<path d="..."/>`) for the topic icon, 24×24. */
  iconSvg: string;
}

type TopicConfig = {
  label: string | Record<string, string>;
  link: string;
  icon?: string;
  items?: TopicSidebarItem[];
};

type TopicSidebarItem = {
  slug?: string;
  link?: string;
  items?: TopicSidebarItem[];
};

const TOPIC_ICON_SVG: Record<string, string> = {
  // Mirrors `node_modules/@astrojs/starlight/components-internals/Icons.ts`
  // and `user-components/file-tree-icons.ts`. These are the icons referenced
  // by `config/sidebar/*.topics.ts`.
  'open-book':
    '<path d="M21.17 2.06A13.1 13.1 0 0 0 19 1.87a12.94 12.94 0 0 0-7 2.05 12.94 12.94 0 0 0-7-2 13.1 13.1 0 0 0-2.17.19 1 1 0 0 0-.83 1v12a1 1 0 0 0 1.17 1 10.9 10.9 0 0 1 8.25 1.91l.12.07h.11a.91.91 0 0 0 .7 0h.11l.12-.07A10.899 10.899 0 0 1 20.83 16 1 1 0 0 0 22 15V3a1 1 0 0 0-.83-.94ZM11 15.35a12.87 12.87 0 0 0-6-1.48H4v-10c.333-.02.667-.02 1 0a10.86 10.86 0 0 1 6 1.8v9.68Zm9-1.44h-1a12.87 12.87 0 0 0-6 1.48V5.67a10.86 10.86 0 0 1 6-1.8c.333-.02.667-.02 1 0v10.04Zm1.17 4.15a13.098 13.098 0 0 0-2.17-.19 12.94 12.94 0 0 0-7 2.05 12.94 12.94 0 0 0-7-2.05c-.727.003-1.453.066-2.17.19A1 1 0 0 0 2 19.21a1 1 0 0 0 1.17.79 10.9 10.9 0 0 1 8.25 1.91 1 1 0 0 0 1.16 0A10.9 10.9 0 0 1 20.83 20a1 1 0 0 0 1.17-.79 1 1 0 0 0-.83-1.15Z"/>',
  puzzle:
    '<path d="M17 22H5a3 3 0 0 1-3-3V9a3 3 0 0 1 3-3h1a4 4 0 0 1 7.3-2.18c.448.64.692 1.4.7 2.18h3a1 1 0 0 1 1 1v3a4 4 0 0 1 2.18 7.3A3.86 3.86 0 0 1 18 18v3a1 1 0 0 1-1 1ZM5 8a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h11v-3.18a1 1 0 0 1 1.33-.95 1.77 1.77 0 0 0 1.74-.23 2 2 0 0 0 .93-1.37 2 2 0 0 0-.48-1.59 1.89 1.89 0 0 0-2.17-.55 1 1 0 0 1-1.33-.95V8h-3.2a1 1 0 0 1-1-1.33 1.77 1.77 0 0 0-.23-1.74 1.939 1.939 0 0 0-3-.43A2 2 0 0 0 8 6c.002.23.046.456.13.67A1 1 0 0 1 7.18 8H5Z"/>',
  rocket:
    '<path fill-rule="evenodd" d="M1.44 8.855v-.001l3.527-3.516c.34-.344.802-.541 1.285-.548h6.649l.947-.947c3.07-3.07 6.207-3.072 7.62-2.868a1.821 1.821 0 0 1 1.557 1.557c.204 1.413.203 4.55-2.868 7.62l-.946.946v6.649a1.845 1.845 0 0 1-.549 1.286l-3.516 3.528a1.844 1.844 0 0 1-3.11-.944l-.858-4.275-4.52-4.52-2.31-.463-1.964-.394A1.847 1.847 0 0 1 .98 10.693a1.843 1.843 0 0 1 .46-1.838Zm5.379 2.017-3.873-.776L6.32 6.733h4.638l-4.14 4.14Zm8.403-5.655c2.459-2.46 4.856-2.463 5.89-2.33.134 1.035.13 3.432-2.329 5.891l-6.71 6.71-3.561-3.56 6.71-6.711Zm-1.318 15.837-.776-3.873 4.14-4.14v4.639l-3.364 3.374Z" clip-rule="evenodd"/><path d="M9.318 18.345a.972.972 0 0 0-1.86-.561c-.482 1.435-1.687 2.204-2.934 2.619a8.22 8.22 0 0 1-1.23.302c.062-.365.157-.79.303-1.229.415-1.247 1.184-2.452 2.62-2.935a.971.971 0 1 0-.62-1.842c-.12.04-.236.084-.35.13-2.02.828-3.012 2.588-3.493 4.033a10.383 10.383 0 0 0-.51 2.845l-.001.016v.063c0 .536.434.972.97.972H2.24a7.21 7.21 0 0 0 .878-.065c.527-.063 1.248-.19 2.02-.447 1.445-.48 3.205-1.472 4.033-3.494a5.828 5.828 0 0 0 .147-.407Z"/>',
  heart:
    '<path d="M20.16 5A6.29 6.29 0 0 0 12 4.36a6.27 6.27 0 0 0-8.16 9.48l6.21 6.22a2.78 2.78 0 0 0 3.9 0l6.21-6.22a6.27 6.27 0 0 0 0-8.84m-1.41 7.46-6.21 6.21a.76.76 0 0 1-1.08 0l-6.21-6.24a4.29 4.29 0 0 1 0-6 4.27 4.27 0 0 1 6 0 1 1 0 0 0 1.42 0 4.27 4.27 0 0 1 6 0 4.29 4.29 0 0 1 .08 6Z"/>',
  // Seti icons use a 24×24 viewBox in Starlight. Inline as-is.
  'seti:happenings':
    '<path d="M7.635 6.765L7.635 0.735L23.925 0.735L23.925 6.765L7.635 6.765ZM0.015 3.735L0.015 3.735Q0.015 4.845 0.735 5.610Q1.455 6.375 2.475 6.375Q3.495 6.375 4.230 5.610Q4.965 4.845 4.965 3.750Q4.965 2.655 4.230 1.890Q3.495 1.125 2.475 1.125Q1.455 1.125 0.735 1.890Q0.015 2.655 0.015 3.735ZM7.695 15.015L7.695 8.985L23.985 8.985L23.985 15.015L7.695 15.015ZM0.075 11.985L0.075 11.985Q0.075 13.065 0.795 13.830Q1.515 14.595 2.550 14.595Q3.585 14.595 4.305 13.830Q5.025 13.065 5.025 11.985Q5.025 10.905 4.305 10.140Q3.585 9.375 2.550 9.375Q1.515 9.375 0.795 10.140Q0.075 10.905 0.075 11.985ZM7.695 23.265L7.695 17.205L23.985 17.205L23.985 23.265L7.695 23.265ZM0.075 20.235L0.075 20.235Q0.075 21.315 0.795 22.080Q1.515 22.845 2.550 22.845Q3.585 22.845 4.305 22.080Q5.025 21.315 5.025 20.235Q5.025 19.155 4.305 18.390Q3.585 17.625 2.550 17.625Q1.515 17.625 0.795 18.390Q0.075 19.155 0.075 20.235Z"/>',
  'seti:json':
    '<path d="M0.734 13.269L0.562 10.732Q1.938 10.732 2.497 10.087L2.497 10.087Q2.884 9.614 2.884 8.711L2.884 8.711Q2.884 8.324 2.798 7.571Q2.712 6.819 2.712 6.410Q2.712 6.002 2.669 5.185L2.669 5.185Q2.583 4.454 2.583 4.153L2.583 4.153Q2.583 2.089 3.787 1.099Q4.991 0.111 7.184 0.111L7.184 0.111L8.259 0.111L8.259 2.648L7.700 2.648Q6.754 2.648 6.345 3.185Q5.937 3.723 5.937 4.798L5.937 4.798Q5.937 5.056 6.023 5.572L6.023 5.572Q6.109 6.217 6.109 6.561L6.109 6.561Q6.109 6.819 6.152 7.378L6.152 7.378Q6.238 8.152 6.238 8.582L6.238 8.582Q6.238 10.216 5.550 11.033L5.550 11.033Q4.948 11.764 3.658 12.065L3.658 12.065Q4.948 12.409 5.550 13.097L5.550 13.097Q6.238 13.957 6.238 15.548L6.238 15.548Q6.238 16.021 6.152 16.795L6.152 16.795Q6.066 17.354 6.088 17.612Q6.109 17.870 6.023 18.515L6.023 18.515Q5.937 18.988 5.937 19.203L5.937 19.203Q5.937 20.278 6.345 20.815Q6.754 21.353 7.700 21.353L7.700 21.353L8.259 21.353L8.259 23.890L7.184 23.890Q2.712 23.890 2.712 19.848L2.712 19.848Q2.712 18.386 2.862 17.590Q3.013 16.795 3.013 15.290L3.013 15.290Q3.013 13.269 0.734 13.269L0.734 13.269ZM23.438 10.732L23.438 13.011Q21.159 13.011 21.159 15.032L21.159 15.032Q21.159 15.419 21.224 16.171Q21.288 16.924 21.288 17.311L21.288 17.311Q21.417 18.128 21.417 19.590L21.417 19.590Q21.417 23.632 16.859 23.632L16.859 23.632L15.784 23.632L15.784 21.353L16.300 21.353Q17.246 21.353 17.654 20.815Q18.063 20.278 18.063 19.203Q18.063 18.128 17.934 17.569L17.934 17.569Q17.934 17.225 17.848 16.558Q17.762 15.892 17.762 15.548L17.762 15.548Q17.762 13.957 18.450 13.097L18.450 13.097Q19.052 12.409 20.342 12.065L20.342 12.065Q19.052 11.764 18.450 11.033L18.450 11.033Q17.762 10.216 17.762 8.582L17.762 8.582Q17.762 8.152 17.848 7.378L17.848 7.378Q17.934 6.819 17.934 6.561L17.934 6.561Q18.063 5.873 18.063 4.841Q18.063 3.809 17.633 3.293Q17.203 2.777 16.300 2.648L16.300 2.648L15.784 2.648L15.784 0.111L16.859 0.111Q19.009 0.111 20.213 1.099Q21.417 2.089 21.417 4.153L21.417 4.153Q21.417 4.540 21.352 5.292Q21.288 6.045 21.288 6.432L21.288 6.432Q21.159 7.249 21.116 8.711L21.116 8.711Q21.159 9.614 21.503 10.087L21.503 10.087Q22.062 10.732 23.438 10.732L23.438 10.732Z"/>',
};

const FALLBACK_TOPIC: TopicMetadata = {
  id: 'aspire',
  label: 'Aspire',
  iconName: 'open-book',
  iconSvg: TOPIC_ICON_SVG['open-book'],
};

/**
 * Look up the topic metadata for a content entry. Returns the fallback
 * topic when no topic claims the entry (e.g. splash pages, the home page,
 * or unknown locales).
 */
export function getTopicForEntry(entryId: string, locale?: string): TopicMetadata {
  const slug = normalizeEntryId(entryId);
  for (const topic of sidebarTopics as TopicConfig[]) {
    if (topicMatches(topic, slug)) {
      const label = resolveLabel(topic.label, locale);
      const iconName = topic.icon ?? 'open-book';
      const iconSvg = TOPIC_ICON_SVG[iconName] ?? TOPIC_ICON_SVG['open-book'];
      return {
        id: normalizeTopicLink(topic.link),
        label,
        iconName,
        iconSvg,
      };
    }
  }
  return FALLBACK_TOPIC;
}

/**
 * The list of topic ids that have inlined icons. Exported so tests can
 * assert the map stays in sync with the sidebar configuration.
 */
export function getKnownTopicIcons(): readonly string[] {
  return Object.keys(TOPIC_ICON_SVG);
}

function topicMatches(topic: TopicConfig, slug: string): boolean {
  const topicSlug = normalizeTopicLink(topic.link);
  if (!topicSlug) return false;
  if (slug === topicSlug) return true;
  if (slug.startsWith(`${topicSlug}/`)) return true;
  return walkItems(topic.items, slug);
}

function walkItems(items: TopicSidebarItem[] | undefined, slug: string): boolean {
  if (!items) return false;
  for (const item of items) {
    const targets = [item.slug, item.link].filter((value): value is string => !!value);
    for (const target of targets) {
      const normalized = normalizeTopicLink(target);
      if (slug === normalized || slug.startsWith(`${normalized}/`)) return true;
    }
    if (item.items && walkItems(item.items, slug)) return true;
  }
  return false;
}

function resolveLabel(label: TopicConfig['label'], locale?: string): string {
  if (typeof label === 'string') return label;
  if (locale && label[locale]) return label[locale];
  if (label.en) return label.en;
  const first = Object.values(label)[0];
  return first ?? '';
}

function normalizeEntryId(value: string): string {
  return value
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
    .replace(/\.(md|mdx)$/i, '');
}

function normalizeTopicLink(value: string): string {
  return value
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
    .replace(/\/overview$/i, '');
}
