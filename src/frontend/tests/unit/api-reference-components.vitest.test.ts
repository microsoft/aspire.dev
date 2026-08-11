import { expect, test } from 'vitest';

import MemberCard from '@components/api-reference/MemberCard.astro';
import MemberOverviewList from '@components/api-reference/MemberOverviewList.astro';
import { resolveMemberAnchors } from '@utils/packages';
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
