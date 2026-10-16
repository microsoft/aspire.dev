import { getPackages } from './packages';
import { getTsModules } from './ts-modules';
import { getCSharpRouteEntries, getTypeScriptRouteEntries } from './api-route-catalog';
import type { CSharpRouteProps, TypeScriptRouteProps } from './api-route-catalog';

function index<T>(entries: { html: string | null; markdown: string; props: T }[]): Map<string, T> {
  const result = new Map<string, T>();
  for (const route of entries) {
    if (route.html) result.set(route.html, route.props);
    result.set(route.markdown, route.props);
  }
  return result;
}

let csharp: Promise<Map<string, CSharpRouteProps>> | undefined;
let typescript: Promise<Map<string, TypeScriptRouteProps>> | undefined;

export async function resolveCSharpApiRoute(pathname: string) {
  const load = () => getPackages().then((packages) => index(packages.flatMap(({ data }) => getCSharpRouteEntries(data))));
  const routes = await (import.meta.env.PROD ? (csharp ??= load()) : load());
  return routes.get(pathname);
}

export async function resolveTypeScriptApiRoute(pathname: string) {
  const load = () => getTsModules().then((packages) => index(packages.flatMap(({ data }) => getTypeScriptRouteEntries(data))));
  const routes = await (import.meta.env.PROD ? (typescript ??= load()) : load());
  return routes.get(pathname);
}
