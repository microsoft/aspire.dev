import { getGeneratedApiLanguages } from './apphost-languages';
import {
  type AppHostModuleDocument,
  appHostModuleSlug,
  getAppHostModules,
  getSupportedProjection,
} from './apphost-modules';
import { getAppHostItemSlug, getAppHostTopLevelItems } from './apphost-api-routes';

interface SidebarLinkItem {
  label: string;
  link: string;
}

interface SidebarGroupItem {
  label: string;
  collapsed: boolean;
  items: Array<SidebarLinkItem | SidebarGroupItem>;
}

type SidebarItem = SidebarLinkItem | SidebarGroupItem;

function buildModuleEntry(document: AppHostModuleDocument, collapsed = true): SidebarGroupItem {
  const moduleSlug = appHostModuleSlug(document.package.name);
  const topLevelItems = getAppHostTopLevelItems(document);
  const preferredLanguage = getGeneratedApiLanguages()[0]?.id ?? 'typescript';
  const items = topLevelItems
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((item) => ({
      label: getSupportedProjection(item, preferredLanguage)?.identifier ?? item.name,
      link: `/reference/api/apphost/${moduleSlug}/${getAppHostItemSlug(item, topLevelItems)}/`,
    }));

  return {
    label: document.package.name,
    collapsed,
    items: [
      { label: 'Overview', link: `/reference/api/apphost/${moduleSlug}/` },
      ...items,
    ],
  };
}

export async function getAppHostApiSidebar(packageName?: string): Promise<SidebarItem[]> {
  const documents = (await getAppHostModules()).map((entry) => entry.data);
  const root: SidebarLinkItem = {
    label: 'Search AppHost APIs',
    link: '/reference/api/apphost/',
  };

  if (packageName) {
    const current = documents.find((document) => document.package.name === packageName);
    return current ? [root, buildModuleEntry(current, false)] : [root];
  }

  return [
    root,
    ...documents
      .sort((left, right) => left.package.name.localeCompare(right.package.name))
      .map((document) => buildModuleEntry(document)),
  ];
}
