import {
  type AppHostLanguageId,
  getGeneratedApiLanguages,
} from './apphost-languages';
import {
  type AppHostModuleDocument,
  appHostModuleSlug,
  getCapabilitiesForHandle,
  getGeneratedProjectionLanguages,
  getSupportedProjection,
} from './apphost-modules';
import {
  getAppHostItemSlug,
  getAppHostMemberSlug,
  getAppHostTopLevelItems,
} from './apphost-api-routes';

export interface AppHostApiSearchEntry {
  n: string;
  f: string;
  k: string;
  p: string;
  s: string;
  h: string;
  l: string;
  t?: string;
  v?: string;
  m?: boolean;
}

export function buildAppHostApiSearchIndex(
  documents: AppHostModuleDocument[],
  base = '',
  languages: readonly AppHostLanguageId[] = getGeneratedApiLanguages().map((language) => language.id)
): AppHostApiSearchEntry[] {
  const normalizedBase = base.replace(/\/$/, '');
  const entries: AppHostApiSearchEntry[] = [];

  for (const document of documents) {
    const moduleSlug = appHostModuleSlug(document.package.name);
    const topLevelItems = getAppHostTopLevelItems(document);
    const seen = new Set<string>();

    for (const item of topLevelItems) {
      const itemSlug = getAppHostItemSlug(item, topLevelItems);
      if (!itemSlug) continue;

      for (const language of getGeneratedProjectionLanguages(item, languages)) {
        const projection = getSupportedProjection(item, language);
        if (!projection?.identifier) continue;
        seen.add(`${language}:${item.id}`);
        entries.push({
          n: projection.identifier,
          f: projection.signature ?? projection.declaration ?? projection.identifier,
          k: item.kind === 'capability'
            ? normalizeCapabilityKind(item.capabilityKind)
            : item.kind === 'exportedValue'
              ? 'value'
              : item.kind,
          p: document.package.name,
          s: item.description ?? '',
          h: `${normalizedBase}/reference/api/apphost/${moduleSlug}/${itemSlug}/?aspire-lang=${language}`,
          l: language,
          ...(document.package.version ? { v: document.package.version } : {}),
        });
      }
    }

    for (const handle of document.items.filter((item) => item.kind === 'handle')) {
      const handleSlug = getAppHostItemSlug(handle, topLevelItems);
      const members = getCapabilitiesForHandle(document, handle);
      for (const member of members) {
        const memberSlug = getAppHostMemberSlug(member, members, handle.name);
        for (const language of getGeneratedProjectionLanguages(member, languages)) {
          if (seen.has(`${language}:${member.id}`)) continue;
          const projection = getSupportedProjection(member, language);
          if (!projection?.identifier) continue;
          entries.push({
            n: projection.identifier,
            f: projection.signature ?? projection.declaration ?? projection.identifier,
            k: normalizeCapabilityKind(member.capabilityKind),
            p: document.package.name,
            s: member.description ?? '',
            h: `${normalizedBase}/reference/api/apphost/${moduleSlug}/${handleSlug}/${memberSlug}/?aspire-lang=${language}`,
            l: language,
            t: getSupportedProjection(handle, language)?.identifier ?? handle.name,
            m: true,
            ...(document.package.version ? { v: document.package.version } : {}),
          });
        }
      }
    }
  }

  return entries;
}

function normalizeCapabilityKind(kind?: string): string {
  if (kind === 'PropertyGetter' || kind === 'PropertySetter') return 'property';
  if (kind === 'Method' || kind === 'InstanceMethod') return 'method';
  return kind?.toLowerCase() || 'function';
}
