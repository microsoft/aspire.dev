import { describe, expect, it } from 'vitest';
import { freezeApiData } from '../../src/utils/api-data';
import {
  prepareMemberAnchors,
  resolveMemberAnchorMap,
  resolveMemberAnchors,
} from '../../src/utils/api-member-anchors';
import { findCSharpType, prepareCSharpApiTypes } from '../../src/utils/csharp-api-catalog';

describe('immutable C# catalogs', () => {
  it('preserves source-order precedence for duplicate and normalized names', () => {
    const types = [
      { fullName: 'Sample.Raw' },
      { fullName: 'Sample.Clean' },
      { fullName: 'Sample.Raw' },
      {},
    ];
    prepareCSharpApiTypes(types);
    expect(findCSharpType(types, 'Sample.Raw')).toBe(types[0]);
    expect(findCSharpType(types, 'Sample.Clean', 'Sample.Raw')).toBe(types[0]);
    expect(findCSharpType(types, 'Sample.Raw', 'Sample.Clean')).toBe(types[0]);
    expect(findCSharpType(types, undefined)).toBe(types[3]);
    expect(findCSharpType(types, 'Missing')).toBeUndefined();
    expect(findCSharpType(types)).toBeUndefined();
  });

  it('matches the original scan for every combination of known and missing names', () => {
    const makeTypes = () => [
      { fullName: 'A' },
      { fullName: 'B' },
      { fullName: 'A' },
      {},
      { fullName: '' },
    ];
    for (const types of [makeTypes(), makeTypes().reverse()]) {
      prepareCSharpApiTypes(types);
      for (const left of ['A', 'B', '', 'Missing', undefined]) {
        for (const right of ['A', 'B', '', 'Missing', undefined]) {
          expect(findCSharpType(types, left, right)).toBe(
            types.find((type) => type.fullName === left || type.fullName === right)
          );
        }
      }
    }
  });

  it('does not rescan names after building the lookup index', () => {
    let reads = 0;
    const types = Array.from({ length: 1_000 }, (_, position) => ({
      get fullName() {
        reads++;
        return `Sample.Type${position}`;
      },
    }));
    prepareCSharpApiTypes(types);
    expect(findCSharpType(types, 'Sample.Type999')).toBe(types[999]);
    const preparedReads = reads;
    for (let query = 0; query < 1_000; query++) {
      expect(findCSharpType(types, `Sample.Type${query}`)).toBe(types[query]);
      expect(findCSharpType(types, 'Missing')).toBeUndefined();
    }
    expect(reads).toBe(preparedReads);
  });

  it('leaves mutable caller-owned documents fresh after edits', () => {
    const types = [{ fullName: 'Before' }];
    expect(findCSharpType(types, 'Before')).toBe(types[0]);
    types[0].fullName = 'After';
    types.push({ fullName: 'Added' });
    expect(findCSharpType(types, 'Before')).toBeUndefined();
    expect(findCSharpType(types, 'After')).toBe(types[0]);
    expect(findCSharpType(types, 'Added')).toBe(types[1]);
    expect(Object.isFrozen(types)).toBe(false);
  });

  it('freezes nested data even when the parent was already shallow-frozen', () => {
    const child = { value: 1 };
    const parent = Object.freeze({ child });
    freezeApiData(parent);
    expect(Object.isFrozen(child)).toBe(true);
    const cycle: { self?: object } = {};
    cycle.self = cycle;
    freezeApiData(cycle);
    expect(Object.isFrozen(cycle)).toBe(true);
  });

  it('reuses identical resolved anchors and maps only for prepared members', () => {
    const members = [
      { name: 'Run', kind: 'method', parameters: [{ type: 'Sample.One.Item' }] },
      { name: 'Run', kind: 'method', parameters: [{ type: 'Sample.Two.Item' }] },
      { name: '.ctor', kind: 'constructor', parameters: [] },
    ];
    const expected = resolveMemberAnchors(members);
    prepareCSharpApiTypes([{ fullName: 'Sample.Widget', members }]);
    const resolved = resolveMemberAnchors(members);
    const map = resolveMemberAnchorMap(members);
    expect(resolved).toEqual(expected);
    expect(resolveMemberAnchors(members)).toBe(resolved);
    expect(resolveMemberAnchorMap(members)).toBe(map);
    for (let position = 0; position < members.length; position++) {
      expect(map.get(members[position])).toBe(resolved[position]);
    }
    expect(Object.isFrozen(members[0].parameters[0])).toBe(true);
    expect(Object.isFrozen(resolved[0].aliases)).toBe(true);
    expect(() => {
      members[0].name = 'Changed';
    }).toThrow(TypeError);
  });

  it('does not cache mutable anchors or maps across member edits', () => {
    const members = [{ name: 'Before', kind: 'method' }];
    expect(resolveMemberAnchors(members)[0].exact).toBe('before');
    expect(resolveMemberAnchorMap(members).get(members[0])?.exact).toBe('before');
    members[0].name = 'After';
    expect(resolveMemberAnchors(members)[0].exact).toBe('after');
    expect(resolveMemberAnchorMap(members).get(members[0])?.exact).toBe('after');
  });

  it('preserves repeated-member identity and idempotent preparation', () => {
    const member = { name: 'Run', kind: 'method' };
    const members = [member, member];
    const expected = resolveMemberAnchorMap(members).get(member);
    prepareMemberAnchors(members);
    const map = resolveMemberAnchorMap(members);
    prepareMemberAnchors(members);
    expect(resolveMemberAnchorMap(members)).toBe(map);
    expect(map.get(member)).toEqual(expected);
  });
});
