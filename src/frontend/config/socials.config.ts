export type SocialLink = {
  icon: 'github' | 'discord' | 'x.com' | 'blueSky' | 'youtube' | 'twitch' | 'document';
  label: string;
  href: string;
};

export const socialConfig: SocialLink[] = [
  {
    icon: 'github',
    label: 'GitHub',
    href: 'https://github.com/dotnet/aspire',
  },
  {
    icon: 'discord',
    label: 'Discord',
    href: 'https://discord.com/invite/raNPcaaSj8',
  },
  {
    icon: 'x.com',
    label: 'X',
    href: 'https://x.com/aspiredotdev',
  },
  {
    icon: 'blueSky',
    label: 'BlueSky',
    href: 'https://bsky.app/profile/aspire.dev',
  },
  {
    icon: 'youtube',
    label: 'YouTube',
    href: 'https://www.youtube.com/@aspiredotdev',
  },
  {
    icon: 'twitch',
    label: 'Twitch',
    href: 'https://www.twitch.tv/aspiredotdev',
  },
  {
    icon: 'document',
    label: 'Blog',
    href: 'https://devblogs.microsoft.com/aspire',
  },
];
