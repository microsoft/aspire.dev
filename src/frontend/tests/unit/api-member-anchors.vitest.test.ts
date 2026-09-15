import { expect, test } from 'vitest';

import {
  memberAnchorAliases,
  memberNameSlug,
  memberSlug,
  resolveMemberAnchors,
} from '../../src/utils/api-member-anchors';

test('C# member anchors support stable name links and precise overload links', () => {
  const member = {
    name: 'WithHostPort',
    kind: 'method',
    parameters: [{ type: 'System.Int32?' }],
  };

  expect(memberNameSlug(member)).toBe('withhostport');
  expect(memberSlug(member)).toBe('withhostport-int32');
});

test('name aliases never collide with parameterless overload anchors', () => {
  const members = [
    {
      name: '.ctor',
      kind: 'constructor',
      parameters: [{ type: 'System.String' }],
    },
    {
      name: '.ctor',
      kind: 'constructor',
      parameters: [],
    },
  ];

  expect(memberAnchorAliases(members)).toEqual([undefined, undefined]);
  expect(members.map(memberSlug)).toEqual(['constructor-string', 'constructor']);
});

test('the first overload receives the stable name alias when no exact name anchor exists', () => {
  const members = [
    {
      name: 'WithHostPort',
      kind: 'method',
      parameters: [{ type: 'System.Int32?' }],
    },
    {
      name: 'WithHostPort',
      kind: 'method',
      parameters: [{ type: 'System.Int32?' }, { type: 'System.String' }],
    },
  ];

  expect(memberAnchorAliases(members)).toEqual(['withhostport', undefined]);
});

test('colliding overload slugs receive distinct signature discriminators', () => {
  const members = [
    {
      name: 'WithHiddenOnCompletion',
      kind: 'method',
      parameters: [{ type: 'System.Int32' }],
    },
    {
      name: 'WithHiddenOnCompletion',
      kind: 'method',
      parameters: [{ type: 'System.Int32[]', modifier: 'params' }],
    },
  ];

  expect(members.map(memberSlug)).toEqual([
    'withhiddenoncompletion-int32',
    'withhiddenoncompletion-int32',
  ]);
  const anchors = resolveMemberAnchors(members);
  expect(anchors[0].exact).not.toBe(anchors[1].exact);
  expect(anchors[0].aliases).toEqual([
    'withhiddenoncompletion',
    'withhiddenoncompletion-int32',
  ]);
  expect(anchors[1].aliases).toEqual([]);
});
