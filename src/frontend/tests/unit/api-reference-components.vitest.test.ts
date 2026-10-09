import { expect, test } from 'vitest';

import MemberCard from '@components/api-reference/MemberCard.astro';
import MemberOverviewList from '@components/api-reference/MemberOverviewList.astro';
import DocContent from '@components/api-reference/DocContent.astro';
import { resolveMemberAnchors } from '@utils/packages';
import { prepareCSharpApiTypes } from '@utils/csharp-api-catalog';
import { renderComponent } from './astro-test-utils';

const members = [
  {
    name: 'Run',
    kind: 'method',
    signature: 'public void Widget.Run(int value)',
    parameters: [{ name: 'value', type: 'System.Int32' }],
    returnType: 'void',
  },
  {
    name: 'Run',
    kind: 'method',
    signature: 'public void Widget.Run(params int[] values)',
    parameters: [{ name: 'values', type: 'System.Int32[]', modifier: 'params' }],
    returnType: 'void',
  },
];

test('cached catalog renders identical documentation references and overload cards', async () => {
  const allTypes = [{ name: 'Widget', kind: 'class', fullName: 'Sample.Widget', members: structuredClone(members) }];
  const docProps = {
    content: [
      { kind: 'cref', value: 'T:Sample.Widget' },
      { kind: 'cref', value: 'M:Sample.Widget.Run(System.Int32)' },
      { kind: 'cref', value: 'T:External.Missing' },
    ],
    allTypes,
    packageName: 'Sample.Package',
  };
  const memberProps = {
    members: allTypes[0].members,
    typeName: 'Widget',
    packageName: 'Sample.Package',
  };
  const doc = await renderComponent(DocContent, { props: docProps });
  const overview = await renderComponent(MemberOverviewList, { props: memberProps });
  prepareCSharpApiTypes(allTypes);
  expect(await renderComponent(DocContent, { props: docProps })).toBe(doc);
  expect(await renderComponent(MemberOverviewList, { props: memberProps })).toBe(overview);
});

test('member components render resolved links and legacy collision aliases', async () => {
  const anchors = resolveMemberAnchors(members);
  const first = anchors[0];

  const card = await renderComponent(MemberCard, {
    props: {
      member: members[0],
      exactAnchor: first.exact,
      anchorAliases: first.aliases,
    },
  });
  expect(card).toContain(`id="${first.aliases[0]}"`);
  expect(card).toContain(`id="${first.exact}"`);
  expect(card).toContain('id="run-int32"');

  const overview = await renderComponent(MemberOverviewList, {
    props: {
      members,
      typeName: 'Widget',
      packageName: 'Sample.Package',
    },
  });
  expect(overview).toContain(`methods/#${anchors[0].exact}`);
  expect(overview).toContain(`methods/#${anchors[1].exact}`);
});
