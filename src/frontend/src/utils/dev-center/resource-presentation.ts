import type { StarlightIcon } from '@astrojs/starlight/types';
import { RESOURCE_TYPES, type DevResource } from './resource-types';

interface ResourcePresentation {
  label: string;
  icon: StarlightIcon;
  variant: 'default' | 'command' | 'diagnostic' | 'release';
  identifier?: string;
}

export function resourcePresentation(resource: DevResource): ResourcePresentation {
  const kind = RESOURCE_TYPES.find(({ id }) => id === resource.type)!;
  const path = new URL(resource.href, 'https://aspire.dev').pathname.replace(/\/$/, '');
  if (resource.type === 'reference' && path.startsWith('/reference/cli/commands/')) {
    return {
      label: 'CLI command', icon: 'seti:powershell', variant: 'command',
      identifier: path.split('/').at(-1)!.replace(/-/g, ' '),
    };
  }
  if (resource.type === 'reference' && path.startsWith('/reference/cli/')) {
    return { label: 'CLI reference', icon: 'seti:powershell', variant: 'default' };
  }
  if (resource.type === 'diagnostic') {
    const code = path.match(/\/(aspire[a-z]*\d+)$/i)?.[1];
    return { label: 'Diagnostic', icon: 'warning', variant: 'diagnostic', identifier: code?.toUpperCase() };
  }
  if (resource.type === 'release-notes') {
    return {
      label: kind.label, icon: kind.icon, variant: 'release',
      identifier: path.match(/\/aspire-(\d+(?:-\d+)*)$/)?.[1].replace(/-/g, '.'),
    };
  }
  if (resource.type === 'reference' && path === '/reference/container-images') {
    return { label: 'Container images', icon: 'seti:docker', variant: 'default' };
  }
  return {
    label: resource.platform === 'twitch' ? 'Twitch' : resource.platform === 'youtube' ? 'YouTube' : kind.label,
    icon: resource.platform ?? kind.icon,
    variant: 'default',
  };
}
