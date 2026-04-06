import { sidebarTopics } from '../../config/sidebar/sidebar.topics.ts';
import type { StarlightIcon } from '@astrojs/starlight/types';

interface RouteDataLike {
  slug?: string;
  locale?: string;
}

interface BreadcrumbItem {
  label: string;
  href?: string;
  icon?: StarlightIcon;
}

interface TopicConfig {
  label: string | Record<string, string>;
  link: string;
  icon?: StarlightIcon;
  items?: SidebarItemConfig[];
}

interface SidebarItemConfig {
  label: string;
  translations?: Record<string, string>;
  slug?: string;
  link?: string;
  items?: SidebarItemConfig[];
}

interface TopicMatch {
  topic: TopicConfig;
  path: SidebarItemConfig[];
}

export function getContentBreadcrumbs(routeData?: RouteDataLike): BreadcrumbItem[] | undefined {
  const slug = normalizePath(routeData?.slug);
  if (!slug || slug.startsWith('reference/api/')) {
    return undefined;
  }

  const locale = routeData?.locale;

  for (const topic of sidebarTopics) {
    if (normalizePath(topic.link) === slug) {
      return undefined;
    }

    const match = findTopicMatch(topic, slug);
    if (!match) {
      continue;
    }

    const path = collapseOverviewPath(match.path);

    const crumbs: BreadcrumbItem[] = [
      {
        label: resolveTopicLabel(match.topic, locale),
        href: buildHref(match.topic.link, locale),
        icon: match.topic.icon,
      },
    ];

    for (let index = 0; index < path.length; index++) {
      const item = path[index];
      if (!item) {
        continue;
      }

      const isCurrent = index === path.length - 1;

      crumbs.push({
        label: resolveItemLabel(item, locale),
        href: isCurrent ? undefined : resolveAncestorHref(item, locale),
      });
    }

    return crumbs;
  }

  return undefined;
}

function findTopicMatch(topic: TopicConfig, slug: string): TopicMatch | undefined {
  const path = findPath(topic.items ?? [], slug);
  return path ? { topic, path } : undefined;
}

function collapseOverviewPath(path: SidebarItemConfig[]): SidebarItemConfig[] {
  if (path.length < 2) {
    return path;
  }

  const currentItem = path[path.length - 1];
  const parentItem = path[path.length - 2];
  if (!currentItem || !parentItem) {
    return path;
  }

  if (
    isOverviewItem(currentItem) &&
    !parentItem.slug &&
    !parentItem.link &&
    Array.isArray(parentItem.items) &&
    parentItem.items.length > 0
  ) {
    return path.slice(0, -1);
  }

  return path;
}

function findPath(items: SidebarItemConfig[], slug: string): SidebarItemConfig[] | undefined {
  for (const item of items) {
    if (matchesItem(item, slug)) {
      return [item];
    }

    if (!item.items?.length) {
      continue;
    }

    const nestedPath = findPath(item.items, slug);
    if (nestedPath) {
      return [item, ...nestedPath];
    }
  }

  return undefined;
}

function matchesItem(item: SidebarItemConfig, slug: string): boolean {
  if (item.slug && normalizePath(item.slug) === slug) {
    return true;
  }

  return !!item.link && normalizePath(item.link) === slug;
}

function resolveAncestorHref(item: SidebarItemConfig, locale?: string): string | undefined {
  const directTarget = item.slug ?? item.link;
  if (directTarget) {
    return buildHref(directTarget, locale);
  }

  const overviewItem = item.items?.find((child) => isOverviewItem(child));
  if (!overviewItem) {
    return undefined;
  }

  const overviewTarget = overviewItem.slug ?? overviewItem.link;
  return overviewTarget ? buildHref(overviewTarget, locale) : undefined;
}

function isOverviewItem(item: SidebarItemConfig): boolean {
  const target = normalizePath(item.slug ?? item.link);
  if (target.endsWith('/overview')) {
    return true;
  }

  return item.label === 'Overview';
}

function resolveTopicLabel(topic: TopicConfig, locale?: string): string {
  if (typeof topic.label === 'string') {
    return topic.label;
  }

  return topic.label[locale ?? ''] ?? topic.label.en ?? Object.values(topic.label)[0] ?? '';
}

function resolveItemLabel(item: SidebarItemConfig, locale?: string): string {
  return item.translations?.[locale ?? ''] ?? item.label;
}

function buildHref(path: string, locale?: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const prefixed = locale ? `/${locale}${normalized}` : normalized;
  return prefixed.endsWith('/') ? prefixed : `${prefixed}/`;
}

function normalizePath(path?: string): string {
  if (!path) {
    return '';
  }

  return path.replace(/^\//, '').replace(/\/$/, '');
}
