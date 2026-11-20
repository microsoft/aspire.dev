import { getGoItemSlug, getGoStandaloneFunctions, getGoTopLevelRouteItems } from './go-api-routes';
import type { GoApiDocumentRouteLike, GoTopLevelRouteItemLike } from './go-api-routes';
import type { GoDocRefKind } from './go-doc-text';

export interface GoDocRefTarget {
  /** The Go spelling to show, e.g. `Resource` for the C# `IResource`. */
  label: string;
  /** Page of the item inside its module, with a trailing slash. */
  path: string;
}

/** `Aspire.Hosting.ApplicationModel.IResource` and `IResourceBuilder`1` both reduce to the simple C# name. */
function getClrSimpleName(fullName: string): string {
  return (fullName.split(/[.+]/).pop() ?? fullName).replace(/`\d+$/, '');
}

/**
 * Resolve an `{@ats-ref}` marker to a page of the same module. Types of other modules
 * have no page here, like every other Go type reference, so they stay plain code.
 */
export function resolveGoDocRef(
  doc: GoApiDocumentRouteLike,
  refKind: GoDocRefKind,
  target: string
): GoDocRefTarget | undefined {
  const items = getGoTopLevelRouteItems(doc);

  if (refKind === 'type') {
    const clrName = target.replace(/`\d+$/, '');
    const type = [
      ...(doc.handleTypes ?? []),
      ...(doc.dtoTypes ?? []),
      ...(doc.enumTypes ?? []),
    ].find((candidate) => getClrSimpleName(candidate.fullName ?? candidate.name) === clrName);
    return type && toRefTarget(type, items);
  }

  if (refKind === 'method') {
    // Extension methods are exported as package functions, so `KubernetesEnvironmentExtensions.withNodePool`
    // is the `WithNodePool` function. Instance members of other classes have no page of their own.
    const dot = target.lastIndexOf('.');
    const owner = getClrSimpleName(target.slice(0, Math.max(dot, 0)));
    if (!owner.endsWith('Extensions')) {
      return undefined;
    }

    const memberName = target.slice(dot + 1).toLowerCase();
    const matches = getGoStandaloneFunctions(doc).filter(
      (candidate) => candidate.name.toLowerCase() === memberName
    );
    // Overloads on several receivers share a name; linking one of them would be a guess.
    return matches.length === 1 ? toRefTarget(matches[0], items) : undefined;
  }

  return undefined;
}

function toRefTarget(
  item: GoTopLevelRouteItemLike,
  items: GoTopLevelRouteItemLike[]
): GoDocRefTarget {
  return { label: item.name, path: `${getGoItemSlug(item, items)}/` };
}
