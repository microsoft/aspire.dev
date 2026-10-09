import { freezeApiData } from './api-data';
import { prepareMemberAnchors, type ApiMemberAnchor } from './api-member-anchors';

interface CatalogType {
  fullName?: string;
  members?: ApiMemberAnchor[];
}

const stableTypes = new WeakSet<CatalogType[]>();
const typeIndexes = new WeakMap<CatalogType[], Map<string | undefined, number>>();

/** Only immutable production catalogs opt into identity-based lookup reuse. */
export function prepareCSharpApiTypes(types: CatalogType[]): void {
  if (stableTypes.has(types)) return;
  freezeApiData(types);
  stableTypes.add(types);
  for (const type of types) {
    if (type.members) prepareMemberAnchors(type.members);
  }
}

/** Preserve Array.find's first match, including competing normalized names. */
export function findCSharpType<T extends CatalogType>(
  types: T[],
  ...fullNames: (string | undefined)[]
): T | undefined {
  if (!stableTypes.has(types)) {
    return types.find((type) => fullNames.includes(type.fullName));
  }

  let index = typeIndexes.get(types);
  if (!index) {
    index = new Map();
    for (let position = 0; position < types.length; position++) {
      const name = types[position].fullName;
      if (!index.has(name)) index.set(name, position);
    }
    typeIndexes.set(types, index);
  }

  let first = Infinity;
  for (const name of fullNames) {
    const position = index.get(name);
    if (position !== undefined && position < first) first = position;
  }
  return first === Infinity ? undefined : types[first];
}
