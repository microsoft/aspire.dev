import aliasManifest from '../data/apphost-typescript-route-aliases.json';

export interface AppHostTypeScriptRouteAlias {
  source: string;
  target: string;
  semanticItemId: string;
}

export function getAppHostTypeScriptRouteAliases(
  segmentCount: number
): AppHostTypeScriptRouteAlias[] {
  return aliasManifest.aliases.filter(
    (alias) => alias.source.split('/').length === segmentCount
  );
}

export function getAppHostTypeScriptHtmlTarget(target: string): string {
  const separator = target.includes('?') ? '&' : '?';
  return `${target}${separator}aspire-lang=typescript`;
}

export function getAppHostTypeScriptMarkdownTarget(target: string): string {
  return `${target.replace(/\/$/, '')}.md`;
}
