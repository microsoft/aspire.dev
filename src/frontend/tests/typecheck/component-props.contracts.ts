import type { ComponentProps } from 'astro/types';

import heroImage from '@assets/aspire-hero.png';
import AsciinemaPlayer from '@components/AsciinemaPlayer.astro';
import Breadcrumb from '@components/Breadcrumb.astro';
import CTABanner from '@components/CTABanner.astro';
import CapabilityGrid from '@components/CapabilityGrid.astro';
import CodespacesButton from '@components/CodespacesButton.astro';
import Expand from '@components/Expand.astro';
import FeatureShowcase from '@components/FeatureShowcase.astro';
import FluidGrid from '@components/FluidGrid.astro';
import GitHubRepoStats from '@components/GitHubRepoStats.astro';
import HeroSection from '@components/HeroSection.astro';
import IconAside from '@components/IconAside.astro';
import IconLinkCard from '@components/IconLinkCard.astro';
import ImageShowcase from '@components/ImageShowcase.astro';
import Include from '@components/Include.astro';
import InstallCliModal from '@components/InstallCliModal.astro';
import InstallDotNetPackage from '@components/InstallDotNetPackage.astro';
import InstallPackage from '@components/InstallPackage.astro';
import IntegrationCard from '@components/IntegrationCard.astro';
import Integrations from '@components/Integrations.astro';
import IntegrationTotals from '@components/IntegrationTotals.astro';
import LicenseBadge from '@components/LicenseBadge.astro';
import LoopingImage from '@components/LoopingImage.astro';
import LoopingVideo from '@components/LoopingVideo.astro';
import MediaCard from '@components/MediaCard.astro';
import OsAwareTabs from '@components/OsAwareTabs.astro';
import Pivot from '@components/Pivot.astro';
import PivotSelector from '@components/PivotSelector.astro';
import Placeholder from '@components/Placeholder.astro';
import QuickStartJourney from '@components/QuickStartJourney.astro';
import SampleCard from '@components/SampleCard.astro';
import SampleGrid from '@components/SampleGrid.astro';
import SessionCard from '@components/SessionCard.astro';
import SessionGrid from '@components/SessionGrid.astro';
import SimpleAppHostCode from '@components/SimpleAppHostCode.astro';
import SimpleCard from '@components/SimpleCard.astro';
import StreamCard from '@components/StreamCard.astro';
import TerminalShowcase from '@components/TerminalShowcase.astro';
import ThemeImage from '@components/ThemeImage.astro';
import TopicHero from '@components/TopicHero.astro';
import TwitchEmbed from '@components/TwitchEmbed.astro';
import VimeoCard from '@components/VimeoCard.astro';
import VimeoGrid from '@components/VimeoGrid.astro';
import YouTubeCard from '@components/YouTubeCard.astro';
import YouTubeEmbed from '@components/YouTubeEmbed.astro';
import YouTubeGrid from '@components/YouTubeGrid.astro';

type PropsOf<T extends (...args: never[]) => unknown> = ComponentProps<T>;

const capabilityItems = [
  {
    icon: 'laptop',
    title: 'Model distributed apps',
    description: 'Define services and references in one place.',
    href: '/get-started/app-host/',
  },
  {
    icon: 'rocket',
    title: 'Deploy consistently',
    description: 'Move from local orchestration to deployment artifacts.',
  },
];

const featureItems = [
  {
    icon: 'rocket',
    title: 'Deploy anywhere',
    description: 'Ship the same app model to more than one environment.',
    href: '/deployment/',
    label: 'See deployments',
    accent: 'blue',
  },
  {
    icon: 'puzzle',
    title: 'Integrate quickly',
    description: 'Add services without rebuilding your app architecture.',
    href: '/integrations/',
    accent: 'green',
  },
];

const journeySteps = [
  {
    icon: 'download',
    title: 'Install the CLI',
    description: 'Get the Aspire tools onto your machine.',
    href: '/get-started/install-cli/',
  },
  {
    icon: 'open-book',
    title: 'Read the docs',
    description: 'Learn how the AppHost models your stack.',
    href: '/docs/',
    label: 'Browse docs',
  },
];

const sampleCardFixture = {
  name: 'redis-sample',
  title: 'Redis sample',
  description: 'This sample shows how to connect an API and dashboard to Redis.',
  href: 'https://github.com/dotnet/aspire-samples/tree/main/samples/redis-sample',
  tags: ['csharp', 'redis'],
  thumbnail: '~/assets/samples/placeholder.png',
  resolvedThumbnail: heroImage,
};

const sampleGridSamples = [
  {
    name: 'orders',
    title: 'Orders sample',
    description: 'Order processing with Redis and PostgreSQL.',
    href: 'https://github.com/dotnet/aspire-samples/tree/main/samples/orders',
    readme: 'README.md',
    tags: ['csharp', 'redis'],
    thumbnail: null,
  },
  {
    name: 'catalog',
    title: 'Catalog sample',
    description: 'Catalog service with observability.',
    href: 'https://github.com/dotnet/aspire-samples/tree/main/samples/catalog',
    readme: 'README.md',
    tags: ['metrics', 'postgresql'],
    thumbnail: null,
  },
];

const sessions = [
  {
    title: 'Shipping distributed apps',
    speakers: [{ name: 'Ada Lovelace', jobTitle: 'Engineer', company: 'Contoso' }],
    abstract: 'A practical session on shipping distributed systems with Aspire.',
    timeslot: '09:00 AM',
    duration: '45 min',
  },
  {
    title: 'Observability by default',
    speakers: [{ name: 'Grace Hopper' }],
    abstract: 'Metrics, logs, and traces out of the box.',
    timeslot: '09:00 AM',
    keynote: true,
  },
];

const integrationsFixture = [
  {
    title: 'Higher Priority Package',
    href: '/integrations/higher/',
    icon: 'seti:db',
    description: 'A package with many downloads.',
    downloads: 250,
    tags: ['official', 'hosting'],
  },
  {
    title: 'Lower Priority Package',
    href: '/integrations/lower/',
    icon: 'seti:db',
    description: 'A package with fewer downloads.',
    downloads: 10,
    tags: ['official'],
  },
];

const availableDocs = [{ match: 'Higher Priority Package', href: '/integrations/higher/docs/' }];

const validAsciinemaPlayerProps = {
  src: '/casts/aspire-help.cast',
  rows: 18,
  autoPlay: true,
  controls: 'auto',
  markers: [4, [8, 'Installation']],
} satisfies PropsOf<typeof AsciinemaPlayer>;
// @ts-expect-error AsciinemaPlayer rows must be numeric.
const invalidAsciinemaPlayerProps: PropsOf<typeof AsciinemaPlayer> = {
  src: '/casts/aspire-help.cast',
  rows: '18',
};

const validBreadcrumbProps = {
  crumbs: [
    { label: 'Docs', href: '/docs/', icon: 'docs' },
    { label: 'Reference', href: '/reference/overview/' },
    { label: 'Aspire.Hosting' },
  ],
} satisfies PropsOf<typeof Breadcrumb>;
// @ts-expect-error Breadcrumb should reject unknown props.
const invalidBreadcrumbProps: PropsOf<typeof Breadcrumb> = {
  crumbs: [],
  unexpected: true,
};

const validCtaBannerProps = {
  title: 'Get started with Aspire',
  description: 'Install the CLI and build an AppHost.',
  primaryCta: { label: 'Install now', href: '/get-started/install-cli/' },
  secondaryCta: { label: 'Read docs', href: '/docs/' },
} satisfies PropsOf<typeof CTABanner>;
// @ts-expect-error CTABanner should reject unknown props.
const invalidCtaBannerProps: PropsOf<typeof CTABanner> = {
  title: 'Get started with Aspire',
  description: 'Install the CLI and build an AppHost.',
  unexpected: true,
};

const validCapabilityGridProps = {
  capabilities: capabilityItems,
  columns: 2,
} satisfies PropsOf<typeof CapabilityGrid>;
// @ts-expect-error CapabilityGrid should reject unknown props.
const invalidCapabilityGridProps: PropsOf<typeof CapabilityGrid> = {
  capabilities: capabilityItems,
  unexpected: true,
};

const validCodespacesButtonProps = {
  owner: 'dotnet',
  repo: 'aspire',
} satisfies PropsOf<typeof CodespacesButton>;
// @ts-expect-error CodespacesButton owner must be a string.
const invalidCodespacesButtonProps: PropsOf<typeof CodespacesButton> = {
  owner: 42,
  repo: 'aspire',
};

const validExpandProps = {
  summary: 'Expandable summary',
  backgroundColor: '--sl-color-blue',
} satisfies PropsOf<typeof Expand>;
// @ts-expect-error Expand backgroundColor must be a CSS variable name string.
const invalidExpandProps: PropsOf<typeof Expand> = {
  summary: 'Expandable summary',
  backgroundColor: 42,
};

const validFeatureShowcaseProps = { features: featureItems } satisfies PropsOf<
  typeof FeatureShowcase
>;
// @ts-expect-error FeatureShowcase should reject unknown props.
const invalidFeatureShowcaseProps: PropsOf<typeof FeatureShowcase> = {
  features: featureItems,
  unexpected: true,
};

const validFluidGridProps = {
  minColumnWidth: '18rem',
  gap: '1rem',
} satisfies PropsOf<typeof FluidGrid>;
// @ts-expect-error FluidGrid should reject unknown props.
const invalidFluidGridProps: PropsOf<typeof FluidGrid> = {
  minColumnWidth: '18rem',
  unexpected: true,
};

const validGitHubRepoStatsProps = {
  stats: {
    name: 'frontend',
    repo: 'https://github.com/microsoft/aspire.dev/tree/main/src/frontend',
    stars: 42,
    license: 'https://opensource.org/licenses/MIT',
    licenseName: 'MIT',
  },
} satisfies PropsOf<typeof GitHubRepoStats>;
// @ts-expect-error GitHubRepoStats should reject unknown props.
const invalidGitHubRepoStatsProps: PropsOf<typeof GitHubRepoStats> = {
  stats: {
    name: 'frontend',
    repo: 'https://github.com/microsoft/aspire.dev/tree/main/src/frontend',
    stars: 42,
    license: 'https://opensource.org/licenses/MIT',
    licenseName: 'MIT',
  },
  unexpected: true,
};

const validHeroSectionProps = {
  title: 'Build',
  highlight: 'faster',
  subtitle: 'Model your stack in one place.',
  logo: heroImage,
  primaryCta: { label: 'Get started', href: '/get-started/' },
  secondaryCta: { label: 'Docs', href: '/docs/' },
} satisfies PropsOf<typeof HeroSection>;
// @ts-expect-error HeroSection should reject unknown props.
const invalidHeroSectionProps: PropsOf<typeof HeroSection> = {
  title: 'Build',
  subtitle: 'Model your stack in one place.',
  unexpected: true,
};

const validIconAsideProps = {
  type: 'note',
  title: 'Helpful note',
} satisfies PropsOf<typeof IconAside>;
// @ts-expect-error IconAside should reject unknown props.
const invalidIconAsideProps: PropsOf<typeof IconAside> = {
  type: 'note',
  unexpected: true,
};

const validIconLinkCardProps = {
  title: 'Explore guides',
  description: 'Helpful description',
  href: '/guides/',
  icon: 'rocket',
  placement: 'end',
} satisfies PropsOf<typeof IconLinkCard>;
// @ts-expect-error IconLinkCard href must be a string.
const invalidIconLinkCardProps: PropsOf<typeof IconLinkCard> = {
  title: 'Explore guides',
  href: 42,
};

const validImageShowcaseProps = {
  title: 'Visualize your app',
  description: 'See resources, traces and endpoints together.',
  image: heroImage,
  imageAlt: 'Zoomed diagram',
  cta: { label: 'Read the guide', href: '/docs/' },
} satisfies PropsOf<typeof ImageShowcase>;
// @ts-expect-error ImageShowcase should reject unknown props.
const invalidImageShowcaseProps: PropsOf<typeof ImageShowcase> = {
  title: 'Visualize your app',
  description: 'See resources, traces and endpoints together.',
  image: heroImage,
  imageAlt: 'Zoomed diagram',
  unexpected: true,
};

const validIncludeProps = {
  relativePath: 'content/docs/get-started/install-cli.mdx',
} satisfies PropsOf<typeof Include>;
// @ts-expect-error Include should reject unknown props.
const invalidIncludeProps: PropsOf<typeof Include> = {
  relativePath: 'content/docs/get-started/install-cli.mdx',
  unexpected: true,
};

const validInstallCliModalProps = {} satisfies PropsOf<typeof InstallCliModal>;
// @ts-expect-error InstallCliModal should reject unknown props.
const invalidInstallCliModalProps: PropsOf<typeof InstallCliModal> = {
  unexpected: true,
};

const validInstallDotNetPackageProps = {
  packageName: 'Aspire.Hosting.Redis',
} satisfies PropsOf<typeof InstallDotNetPackage>;
// @ts-expect-error InstallDotNetPackage should reject unknown props.
const invalidInstallDotNetPackageProps: PropsOf<typeof InstallDotNetPackage> = {
  packageName: 'Aspire.Hosting.Redis',
  unexpected: true,
};

const validInstallPackageProps = {
  packageName: 'Aspire.Hosting.Redis',
  shortName: 'redis',
} satisfies PropsOf<typeof InstallPackage>;
// @ts-expect-error InstallPackage should reject unknown props.
const invalidInstallPackageProps: PropsOf<typeof InstallPackage> = {
  packageName: 'Aspire.Hosting.Redis',
  unexpected: true,
};

const validIntegrationCardProps = {
  pkg: {
    title: 'Aspire.Hosting.Redis',
    href: '/integrations/redis/',
    icon: 'seti:db',
    description: 'A package with many downloads.',
    downloads: 250,
    tags: ['official', 'hosting'],
  },
} satisfies PropsOf<typeof IntegrationCard>;
// @ts-expect-error IntegrationCard should reject unknown props.
const invalidIntegrationCardProps: PropsOf<typeof IntegrationCard> = {
  pkg: {
    title: 'Aspire.Hosting.Redis',
    href: '/integrations/redis/',
    icon: 'seti:db',
    description: 'A package with many downloads.',
  },
  unexpected: true,
};

const validIntegrationsProps = {
  integrations: integrationsFixture,
  availableDocs,
} satisfies PropsOf<typeof Integrations>;
// @ts-expect-error Integrations should reject unknown props.
const invalidIntegrationsProps: PropsOf<typeof Integrations> = {
  integrations: integrationsFixture,
  availableDocs,
  unexpected: true,
};

const validIntegrationTotalsProps = {
  integrations: integrationsFixture,
} satisfies PropsOf<typeof IntegrationTotals>;
// @ts-expect-error IntegrationTotals should reject unknown props.
const invalidIntegrationTotalsProps: PropsOf<typeof IntegrationTotals> = {
  integrations: integrationsFixture,
  unexpected: true,
};

const validLicenseBadgeProps = {
  title: 'MIT License: https://opensource.org/licenses/MIT',
} satisfies PropsOf<typeof LicenseBadge>;
// @ts-expect-error LicenseBadge should reject unknown props.
const invalidLicenseBadgeProps: PropsOf<typeof LicenseBadge> = {
  title: 'MIT License: https://opensource.org/licenses/MIT',
  unexpected: true,
};

const validLoopingImageProps = {
  src: heroImage,
  alt: 'Animated diagram',
} satisfies PropsOf<typeof LoopingImage>;
// @ts-expect-error LoopingImage src must be imported image metadata.
const invalidLoopingImageProps: PropsOf<typeof LoopingImage> = {
  src: '/diagram.png',
  alt: 'Animated diagram',
};

const validLoopingVideoProps = {
  title: 'Demo reel',
  sources: [
    { src: '/dashboard-graph.mp4', type: 'video/mp4', title: 'Demo' },
    { src: '/dashboard-graph.webm', type: 'video/webm', title: 'Dark demo', theme: 'dark' },
  ],
} satisfies PropsOf<typeof LoopingVideo>;
// @ts-expect-error LoopingVideo sources must be an array of source objects.
const invalidLoopingVideoProps: PropsOf<typeof LoopingVideo> = {
  sources: '/dashboard-graph.mp4',
};

const validMediaCardProps = {
  href: '/media/demo/',
} satisfies PropsOf<typeof MediaCard>;
// @ts-expect-error MediaCard should reject unknown props.
const invalidMediaCardProps: PropsOf<typeof MediaCard> = {
  href: '/media/demo/',
  unexpected: true,
};

const validOsAwareTabsProps = {
  syncKey: 'terminal',
} satisfies PropsOf<typeof OsAwareTabs>;
// @ts-expect-error OsAwareTabs should reject unknown props.
const invalidOsAwareTabsProps: PropsOf<typeof OsAwareTabs> = {
  syncKey: 'terminal',
  unexpected: true,
};

const validPivotProps = {
  id: 'lang-nodejs',
} satisfies PropsOf<typeof Pivot>;
// @ts-expect-error Pivot id must be a string.
const invalidPivotProps: PropsOf<typeof Pivot> = {
  id: 42,
};

const validPivotSelectorProps = {
  key: 'lang',
  title: 'Choose a language',
  marginTop: 1,
  options: [
    { id: 'csharp', title: 'C#' },
    { id: 'typescript', title: 'TypeScript' },
  ],
} satisfies PropsOf<typeof PivotSelector>;
// @ts-expect-error PivotSelector marginTop must be numeric.
const invalidPivotSelectorProps: PropsOf<typeof PivotSelector> = {
  key: 'lang',
  options: [{ id: 'csharp', title: 'C#' }],
  marginTop: '1',
};

const validPlaceholderProps = {
  name: 'Redis',
  link: 'https://learn.microsoft.com/dotnet/aspire/database/redis',
  icon: 'seti:db',
} satisfies PropsOf<typeof Placeholder>;
// @ts-expect-error Placeholder should reject unknown props.
const invalidPlaceholderProps: PropsOf<typeof Placeholder> = {
  name: 'Redis',
  link: 'https://learn.microsoft.com/dotnet/aspire/database/redis',
  unexpected: true,
};

const validQuickStartJourneyProps = {
  steps: journeySteps,
} satisfies PropsOf<typeof QuickStartJourney>;
// @ts-expect-error QuickStartJourney should reject unknown props.
const invalidQuickStartJourneyProps: PropsOf<typeof QuickStartJourney> = {
  steps: journeySteps,
  unexpected: true,
};

const validSampleCardProps = {
  sample: sampleCardFixture,
} satisfies PropsOf<typeof SampleCard>;
// @ts-expect-error SampleCard should reject unknown props.
const invalidSampleCardProps: PropsOf<typeof SampleCard> = {
  sample: sampleCardFixture,
  unexpected: true,
};

const validSampleGridProps = {
  samples: sampleGridSamples,
} satisfies PropsOf<typeof SampleGrid>;
// @ts-expect-error SampleGrid should reject unknown props.
const invalidSampleGridProps: PropsOf<typeof SampleGrid> = {
  samples: sampleGridSamples,
  unexpected: true,
};

const validSessionCardProps = {
  ...sessions[0],
  index: 1,
} satisfies PropsOf<typeof SessionCard>;
// @ts-expect-error SessionCard should reject unknown props.
const invalidSessionCardProps: PropsOf<typeof SessionCard> = {
  ...sessions[0],
  unexpected: true,
};

const validSessionGridProps = {
  sessions,
} satisfies PropsOf<typeof SessionGrid>;
// @ts-expect-error SessionGrid should reject unknown props.
const invalidSessionGridProps: PropsOf<typeof SessionGrid> = {
  sessions,
  unexpected: true,
};

const validSimpleAppHostCodeProps = {
  lang: 'nodejs',
  mark: '3-5',
  collapse: '7-8',
} satisfies PropsOf<typeof SimpleAppHostCode>;
// @ts-expect-error SimpleAppHostCode only supports the documented language union.
const invalidSimpleAppHostCodeProps: PropsOf<typeof SimpleAppHostCode> = {
  lang: 'ruby',
};

const validSimpleCardProps = {
  icon: 'open-book',
  title: 'Docs card',
  link: '/docs/',
} satisfies PropsOf<typeof SimpleCard>;
// @ts-expect-error SimpleCard should reject unknown props.
const invalidSimpleCardProps: PropsOf<typeof SimpleCard> = {
  icon: 'open-book',
  title: 'Docs card',
  unexpected: true,
};

const validStreamCardProps = {
  platform: 'YouTube',
  icon: 'play',
  description: 'Watch Aspire on YouTube.',
  href: 'https://www.youtube.com/@dotnet',
  label: 'Watch now',
  color: '#f00',
} satisfies PropsOf<typeof StreamCard>;
// @ts-expect-error StreamCard should reject unknown props.
const invalidStreamCardProps: PropsOf<typeof StreamCard> = {
  platform: 'YouTube',
  icon: 'play',
  description: 'Watch Aspire on YouTube.',
  href: 'https://www.youtube.com/@dotnet',
  label: 'Watch now',
  color: '#f00',
  unexpected: true,
};

const validTerminalShowcaseProps = {
  title: 'Build',
  highlight: 'faster',
  description: 'Watch the Aspire CLI in action.',
  cast: '/casts/aspire-help.cast',
  rows: 12,
  cta: { label: 'Get started', href: '/get-started/' },
} satisfies PropsOf<typeof TerminalShowcase>;
// @ts-expect-error TerminalShowcase should reject unknown props.
const invalidTerminalShowcaseProps: PropsOf<typeof TerminalShowcase> = {
  title: 'Build',
  cast: '/casts/aspire-help.cast',
  unexpected: true,
};

const validThemeImageProps = {
  light: heroImage,
  dark: heroImage,
  alt: 'Themed diagram',
  zoomable: false,
} satisfies PropsOf<typeof ThemeImage>;
// @ts-expect-error ThemeImage should reject unknown props.
const invalidThemeImageProps: PropsOf<typeof ThemeImage> = {
  light: heroImage,
  dark: heroImage,
  alt: 'Themed diagram',
  unexpected: true,
};

const validTopicHeroProps = {
  title: 'Platform',
  highlight: 'overview',
  subtitle: 'Understand the building blocks.',
  primaryCta: { label: 'Explore', href: '/docs/' },
  secondaryCta: { label: 'Deploy', href: '/deployment/' },
  icon: 'rocket',
  floatingIcons: ['open-book', 'puzzle'],
} satisfies PropsOf<typeof TopicHero>;
// @ts-expect-error TopicHero should reject unknown props.
const invalidTopicHeroProps: PropsOf<typeof TopicHero> = {
  title: 'Platform',
  subtitle: 'Understand the building blocks.',
  unexpected: true,
};

const validTwitchEmbedProps = {
  channel: 'aspiredotdev',
  title: 'Twitch stream',
} satisfies PropsOf<typeof TwitchEmbed>;
// @ts-expect-error TwitchEmbed should reject unknown props.
const invalidTwitchEmbedProps: PropsOf<typeof TwitchEmbed> = {
  channel: 'aspiredotdev',
  unexpected: true,
};

const validVimeoCardProps = {
  href: '76979871',
  title: 'Conference talk',
  description: 'Recorded presentation',
  tags: ['talk'],
} satisfies PropsOf<typeof VimeoCard>;
// @ts-expect-error VimeoCard should reject unknown props.
const invalidVimeoCardProps: PropsOf<typeof VimeoCard> = {
  href: '76979871',
  title: 'Conference talk',
  tags: ['talk'],
  unexpected: true,
};

const validVimeoGridProps = {
  videos: [
    { href: '76979871', title: 'Opening keynote', tags: ['keynote'] },
    { href: '22439234', title: 'Closing session', tags: ['wrap-up'] },
  ],
} satisfies PropsOf<typeof VimeoGrid>;
// @ts-expect-error VimeoGrid should reject unknown props.
const invalidVimeoGridProps: PropsOf<typeof VimeoGrid> = {
  videos: [{ href: '76979871', title: 'Opening keynote', tags: ['keynote'] }],
  unexpected: true,
};

const validYouTubeCardProps = {
  href: 'dQw4w9WgXcQ',
  title: 'Guided demo',
  description: 'Walk through the workflow',
  tags: ['demo', 'video'],
} satisfies PropsOf<typeof YouTubeCard>;
// @ts-expect-error YouTubeCard should reject unknown props.
const invalidYouTubeCardProps: PropsOf<typeof YouTubeCard> = {
  href: 'dQw4w9WgXcQ',
  title: 'Guided demo',
  tags: ['demo', 'video'],
  unexpected: true,
};

const validYouTubeEmbedProps = {
  videoId: 'dQw4w9WgXcQ',
  autoplay: true,
  title: 'Video player',
} satisfies PropsOf<typeof YouTubeEmbed>;
// @ts-expect-error YouTubeEmbed should reject unknown props.
const invalidYouTubeEmbedProps: PropsOf<typeof YouTubeEmbed> = {
  videoId: 'dQw4w9WgXcQ',
  unexpected: true,
};

const validYouTubeGridProps = {
  videos: [
    { href: 'dQw4w9WgXcQ', title: 'First video', tags: ['intro'] },
    { href: '9bZkp7q19f0', title: 'Second video', tags: ['advanced'] },
  ],
} satisfies PropsOf<typeof YouTubeGrid>;
// @ts-expect-error YouTubeGrid should reject unknown props.
const invalidYouTubeGridProps: PropsOf<typeof YouTubeGrid> = {
  videos: [{ href: 'dQw4w9WgXcQ', title: 'First video', tags: ['intro'] }],
  unexpected: true,
};

void [
  validAsciinemaPlayerProps,
  invalidAsciinemaPlayerProps,
  validBreadcrumbProps,
  invalidBreadcrumbProps,
  validCtaBannerProps,
  invalidCtaBannerProps,
  validCapabilityGridProps,
  invalidCapabilityGridProps,
  validCodespacesButtonProps,
  invalidCodespacesButtonProps,
  validExpandProps,
  invalidExpandProps,
  validFeatureShowcaseProps,
  invalidFeatureShowcaseProps,
  validFluidGridProps,
  invalidFluidGridProps,
  validGitHubRepoStatsProps,
  invalidGitHubRepoStatsProps,
  validHeroSectionProps,
  invalidHeroSectionProps,
  validIconAsideProps,
  invalidIconAsideProps,
  validIconLinkCardProps,
  invalidIconLinkCardProps,
  validImageShowcaseProps,
  invalidImageShowcaseProps,
  validIncludeProps,
  invalidIncludeProps,
  validInstallCliModalProps,
  invalidInstallCliModalProps,
  validInstallDotNetPackageProps,
  invalidInstallDotNetPackageProps,
  validInstallPackageProps,
  invalidInstallPackageProps,
  validIntegrationCardProps,
  invalidIntegrationCardProps,
  validIntegrationsProps,
  invalidIntegrationsProps,
  validIntegrationTotalsProps,
  invalidIntegrationTotalsProps,
  validLicenseBadgeProps,
  invalidLicenseBadgeProps,
  validLoopingImageProps,
  invalidLoopingImageProps,
  validLoopingVideoProps,
  invalidLoopingVideoProps,
  validMediaCardProps,
  invalidMediaCardProps,
  validOsAwareTabsProps,
  invalidOsAwareTabsProps,
  validPivotProps,
  invalidPivotProps,
  validPivotSelectorProps,
  invalidPivotSelectorProps,
  validPlaceholderProps,
  invalidPlaceholderProps,
  validQuickStartJourneyProps,
  invalidQuickStartJourneyProps,
  validSampleCardProps,
  invalidSampleCardProps,
  validSampleGridProps,
  invalidSampleGridProps,
  validSessionCardProps,
  invalidSessionCardProps,
  validSessionGridProps,
  invalidSessionGridProps,
  validSimpleAppHostCodeProps,
  invalidSimpleAppHostCodeProps,
  validSimpleCardProps,
  invalidSimpleCardProps,
  validStreamCardProps,
  invalidStreamCardProps,
  validTerminalShowcaseProps,
  invalidTerminalShowcaseProps,
  validThemeImageProps,
  invalidThemeImageProps,
  validTopicHeroProps,
  invalidTopicHeroProps,
  validTwitchEmbedProps,
  invalidTwitchEmbedProps,
  validVimeoCardProps,
  invalidVimeoCardProps,
  validVimeoGridProps,
  invalidVimeoGridProps,
  validYouTubeCardProps,
  invalidYouTubeCardProps,
  validYouTubeEmbedProps,
  invalidYouTubeEmbedProps,
  validYouTubeGridProps,
  invalidYouTubeGridProps,
];
