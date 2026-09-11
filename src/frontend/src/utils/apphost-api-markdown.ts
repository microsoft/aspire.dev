import {
  bulletList,
  codeBlock,
  finalizeMarkdown,
  inlineCode,
  link,
  normalizeBase,
  section,
} from './api-markdown-shared';
import {
  type AppHostLanguage,
  getGeneratedApiLanguages,
} from './apphost-languages';
import type {
  AppHostApiItem,
  AppHostModuleDocument,
} from './apphost-modules';
import {
  appHostModuleSlug,
  getCapabilitiesForHandle,
} from './apphost-modules';
import {
  getAppHostItemSlug,
  getAppHostMemberSlug,
  getAppHostTopLevelItems,
} from './apphost-api-routes';

export function appHostIndexMdHref(base: string): string {
  return `${normalizeBase(base)}/reference/api/apphost.md`;
}

export function appHostModuleMdHref(base: string, packageName: string): string {
  return `${normalizeBase(base)}/reference/api/apphost/${appHostModuleSlug(packageName)}.md`;
}

export function appHostItemMdHref(
  base: string,
  packageName: string,
  itemSlug: string
): string {
  return `${normalizeBase(base)}/reference/api/apphost/${appHostModuleSlug(packageName)}/${itemSlug}.md`;
}

export function appHostMemberMdHref(
  base: string,
  packageName: string,
  itemSlug: string,
  memberSlug: string
): string {
  return `${normalizeBase(base)}/reference/api/apphost/${appHostModuleSlug(packageName)}/${itemSlug}/${memberSlug}.md`;
}

export function renderAppHostIndexMarkdown(
  documents: AppHostModuleDocument[],
  base: string
): string {
  return finalizeMarkdown([
    '# AppHost API Reference',
    'Browse generated Aspire AppHost APIs by package. Each page includes every enabled language projection.',
    section(
      'Packages',
      bulletList(
        [...documents]
          .sort((left, right) => left.package.name.localeCompare(right.package.name))
          .map((document) =>
            `- ${link(document.package.name, appHostModuleMdHref(base, document.package.name))}${
              document.package.version ? ` — ${inlineCode(document.package.version)}` : ''
            }`
          )
      )
    ),
  ]);
}

export function renderAppHostModuleMarkdown(
  document: AppHostModuleDocument,
  base: string
): string {
  const items = getAppHostTopLevelItems(document);
  return finalizeMarkdown([
    `# ${document.package.name}`,
    document.package.version ? `Version: ${inlineCode(document.package.version)}` : '',
    section(
      'API items',
      bulletList(
        items.map((item) =>
          `- ${link(
            item.name,
            appHostItemMdHref(base, document.package.name, getAppHostItemSlug(item, items))
          )} — ${inlineCode(item.kind)}${item.description ? ` — ${item.description}` : ''}`
        )
      )
    ),
  ]);
}

export function renderAppHostItemMarkdown(
  document: AppHostModuleDocument,
  item: AppHostApiItem,
  base: string,
  languages: readonly AppHostLanguage[] = getGeneratedApiLanguages()
): string {
  const items = getAppHostTopLevelItems(document);
  const itemSlug = getAppHostItemSlug(item, items);
  const members = item.kind === 'handle' ? getCapabilitiesForHandle(document, item) : [];

  return finalizeMarkdown([
    `# ${item.name}`,
    item.description ?? '',
    ...renderLanguageProjections(item, languages),
    members.length > 0
      ? section(
          'Members',
          bulletList(
            members.map((member) =>
              `- ${link(
                member.name,
                appHostMemberMdHref(
                  base,
                  document.package.name,
                  itemSlug,
                  getAppHostMemberSlug(member, members, item.name)
                )
              )}`
            )
          )
        )
      : '',
  ]);
}

export function renderAppHostMemberMarkdown(
  document: AppHostModuleDocument,
  handle: AppHostApiItem,
  member: AppHostApiItem,
  base: string,
  languages: readonly AppHostLanguage[] = getGeneratedApiLanguages()
): string {
  const items = getAppHostTopLevelItems(document);
  return finalizeMarkdown([
    `# ${handle.name}.${member.name}`,
    `Defined on ${link(
      handle.name,
      appHostItemMdHref(base, document.package.name, getAppHostItemSlug(handle, items))
    )}.`,
    member.description ?? '',
    ...renderLanguageProjections(member, languages),
  ]);
}

function renderLanguageProjections(
  item: AppHostApiItem,
  languages: readonly AppHostLanguage[]
): string[] {
  return languages.map((language) => {
    const projection = item.projections[language.id];
    if (!projection) {
      return section(language.label, 'Unsupported: no projection was generated.');
    }
    if (projection.status === 'unsupported') {
      return section(language.label, `Unsupported: ${projection.reason ?? 'No reason provided.'}`);
    }

    const declaration = projection.declaration ?? projection.signature ?? projection.identifier ?? '';
    const parameters = projection.parameters?.length
      ? section(
          'Parameters',
          bulletList(
            projection.parameters.map((parameter) =>
              `- ${inlineCode(parameter.name)}: ${inlineCode(
                parameter.isCallback ? parameter.callbackSignature ?? parameter.type : parameter.type
              )}${parameter.isOptional ? ` ${inlineCode('optional')}` : ''}${
                parameter.defaultValue ? ` ${inlineCode(`default: ${parameter.defaultValue}`)}` : ''
              }`
            )
          )
        )
      : '';
    const returns = projection.return
      ? section(
          'Returns',
          `${inlineCode(projection.return.type)}${
            projection.return.errorModel && projection.return.errorModel !== 'none'
              ? ` — errors: ${inlineCode(projection.return.errorModel)}`
              : ''
          }`
        )
      : '';

    return section(
      language.label,
      [
        projection.sourceFile ? `Source: ${inlineCode(projection.sourceFile)}` : '',
        projection.reason ? `Limitation: ${projection.reason}` : '',
        declaration ? codeBlock(declaration, language.codeFence) : '',
        parameters,
        returns,
      ].filter(Boolean).join('\n\n')
    );
  });
}
