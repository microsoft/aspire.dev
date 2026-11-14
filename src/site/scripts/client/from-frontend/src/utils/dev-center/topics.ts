import type { StarlightIcon } from '@astrojs/starlight/types';

export const topicIds = [
  'foundations', 'integrations', 'dashboard', 'deployment', 'reference', 'community',
] as const;
export type TopicId = (typeof topicIds)[number];

export interface DevTopic {
  id: TopicId;
  title: string;
  icon: StarlightIcon;
  color: string;
}

export const topics: DevTopic[] = [
  { id: 'foundations', title: 'Foundations', icon: 'open-book', color: 'var(--sl-color-purple)' },
  { id: 'integrations', title: 'Integrations', icon: 'puzzle', color: 'var(--sl-color-green)' },
  { id: 'dashboard', title: 'Dashboard', icon: 'seti:happenings', color: 'var(--sl-color-blue)' },
  { id: 'deployment', title: 'Deployment', icon: 'rocket', color: 'var(--sl-color-orange)' },
  { id: 'reference', title: 'Reference', icon: 'seti:json', color: 'var(--color-cyan)' },
  { id: 'community', title: 'Community', icon: 'heart', color: 'var(--color-magenta)' },
];

export function getTopic(id: string): DevTopic | undefined {
  return topics.find((topic) => topic.id === id);
}
