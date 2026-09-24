import type { StarlightIcon } from '@astrojs/starlight/types';
import type { TopicId } from '@utils/dev-center/topics';

export type ResourceType =
  | 'guide' | 'quickstart' | 'tutorial' | 'how-to' | 'sample' | 'integration'
  | 'diagnostic' | 'glossary' | 'video' | 'blog' | 'reference' | 'release-notes';

export interface DevResource {
  id: string;
  title: string;
  description: string;
  href: string;
  type: ResourceType;
  topics: TopicId[];
  tags: string[];
  languages: string[];
  providers: string[];
  platform?: 'youtube' | 'twitch';
  image?: { light: string; dark: string; kind?: 'logo' };
  date?: string;
}

export const RESOURCE_TYPES: { id: ResourceType; label: string; icon: StarlightIcon }[] = [
  { id: 'guide', label: 'Guide', icon: 'open-book' },
  { id: 'quickstart', label: 'Quickstart', icon: 'rocket' },
  { id: 'tutorial', label: 'Tutorial', icon: 'open-book' },
  { id: 'how-to', label: 'How-to', icon: 'pencil' },
  { id: 'sample', label: 'Sample', icon: 'laptop' },
  { id: 'integration', label: 'Integration', icon: 'puzzle' },
  { id: 'diagnostic', label: 'Diagnostic', icon: 'warning' },
  { id: 'glossary', label: 'Glossary', icon: 'notes' },
  { id: 'video', label: 'Video', icon: 'youtube' },
  { id: 'blog', label: 'Blog', icon: 'document' },
  { id: 'reference', label: 'Reference', icon: 'seti:config' },
  { id: 'release-notes', label: 'Release notes', icon: 'document' },
];
