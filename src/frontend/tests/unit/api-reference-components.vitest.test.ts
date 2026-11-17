import { expect, test } from 'vitest';

import MemberCard from '@components/api-reference/MemberCard.astro';
import MemberOverviewList from '@components/api-reference/MemberOverviewList.astro';
import TsMemberCard from '@components/api-reference/TsMemberCard.astro';
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

test('TypeScript member cards render parameter descriptions', async () => {
  const card = await renderComponent(TsMemberCard, {
    props: {
      member: {
        name: 'withIconName',
        signature: 'withIconName(iconName: string, iconVariant?: IconVariant): IResource',
        returnType: 'IResource',
        parameters: [
          {
            name: 'iconName',
            type: 'string',
            description: 'The name of the FluentUI icon to use.',
          },
          { name: 'iconVariant', type: 'IconVariant', isOptional: true },
        ],
      },
    },
  });
  expect(card).toContain('class="mc-param-desc');
  expect(card).toContain('The name of the FluentUI icon to use.');
  expect(card.match(/class="mc-param-desc/g)).toHaveLength(1);
});
