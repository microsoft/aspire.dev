import { describe, expect, it } from 'vitest';

import heroImage from '@assets/aspire-hero.png';
import AccessibleCodeButtons from '@components/AccessibleCodeButtons.astro';
import AppHostBuilder from '@components/AppHostBuilder.astro';
import AspireMap from '@components/AspireMap.astro';
import AsciinemaPlayer from '@components/AsciinemaPlayer.astro';
import Breadcrumb from '@components/Breadcrumb.astro';
import CTABanner from '@components/CTABanner.astro';
import CapabilityGrid from '@components/CapabilityGrid.astro';
import CodespacesButton from '@components/CodespacesButton.astro';
import ContainerRuntimeChoices from '@components/ContainerRuntimeChoices.astro';
import Expand from '@components/Expand.astro';
import FooterLinks from '@components/FooterLinks.astro';
import FeatureShowcase from '@components/FeatureShowcase.astro';
import FluidGrid from '@components/FluidGrid.astro';
import FooterPreferences from '@components/FooterPreferences.astro';
import FreeAndOpenSourceAside from '@components/FreeAndOpenSourceAside.astro';
import GitHubRepoStats from '@components/GitHubRepoStats.astro';
import HeroSection from '@components/HeroSection.astro';
import IconAside from '@components/IconAside.astro';
import IconLinkCard from '@components/IconLinkCard.astro';
import ImageShowcase from '@components/ImageShowcase.astro';
import InstallAspireCLI from '@components/InstallAspireCLI.astro';
import InstallCliModal from '@components/InstallCliModal.astro';
import InstallDotNetPackage from '@components/InstallDotNetPackage.astro';
import InstallPackage from '@components/InstallPackage.astro';
import Integrations from '@components/Integrations.astro';
import IntegrationTotals from '@components/IntegrationTotals.astro';
import LanguagesSupported from '@components/LanguagesSupported.astro';
import LearnMore from '@components/LearnMore.astro';
import LicenseBadge from '@components/LicenseBadge.astro';
import LocalVsProdEnvironments from '@components/LocalVsProdEnvironments.astro';
import LoopingVideo from '@components/LoopingVideo.astro';
import MediaCard from '@components/MediaCard.astro';
import OsAwareTabs from '@components/OsAwareTabs.astro';
import Pivot from '@components/Pivot.astro';
import PivotSelector from '@components/PivotSelector.astro';
import Placeholder from '@components/Placeholder.astro';
import QuickStartJourney from '@components/QuickStartJourney.astro';
import SampleCard from '@components/SampleCard.astro';
import SampleDetail from '@components/SampleDetail.astro';
import SampleGrid from '@components/SampleGrid.astro';
import SessionCard from '@components/SessionCard.astro';
import SessionGrid from '@components/SessionGrid.astro';
import SimpleAppHostCode from '@components/SimpleAppHostCode.astro';
import SimpleCard from '@components/SimpleCard.astro';
import SiteTour from '@components/SiteTour.astro';
import StarlightHero from '@components/starlight/Hero.astro';
import TestimonialCarousel from '@components/TestimonialCarousel.astro';
import ThemeImage from '@components/ThemeImage.astro';
import ThreeTierAspire from '@components/ThreeTierAspire.astro';
import TopicHero from '@components/TopicHero.astro';
import TwitchEmbed from '@components/TwitchEmbed.astro';
import VimeoCard from '@components/VimeoCard.astro';
import VimeoGrid from '@components/VimeoGrid.astro';
import YouTubeCard from '@components/YouTubeCard.astro';
import YouTubeEmbed from '@components/YouTubeEmbed.astro';
import YouTubeGrid from '@components/YouTubeGrid.astro';
import samplesData from '@data/samples.json';
import { normalizeHtml, renderComponent, type StarlightRoute } from './astro-test-utils';

type BasicRenderCase = {
  name: string;
  Component: Parameters<typeof renderComponent>[0];
  props?: Record<string, unknown>;
  slots?: Record<string, string>;
  includes: string[];
  requestUrl?: string;
};

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

const basicRenderCases: BasicRenderCase[] = [
  {
    name: 'AsciinemaPlayer renders player options as data attributes',
    Component: AsciinemaPlayer,
    props: {
      src: '/casts/aspire-help.cast',
      rows: 18,
      autoPlay: true,
      controls: 'auto',
    },
    includes: [
      'asciinema-player-container',
      'data-src="/casts/aspire-help.cast"',
      'data-rows="18"',
      'data-autoplay="true"',
      'data-controls="auto"',
    ],
  },
  {
    name: 'Expand renders summary and slot content',
    Component: Expand,
    props: { summary: 'Expandable summary' },
    slots: { default: 'Expanded body' },
    includes: ['<details', 'Expandable summary', 'Expanded body'],
  },
  {
    name: 'CTABanner renders calls to action',
    Component: CTABanner,
    props: {
      title: 'Get started with Aspire',
      description: 'Install the CLI and build an AppHost.',
      primaryCta: { label: 'Install now', href: '/get-started/install-cli/' },
      secondaryCta: { label: 'Read docs', href: '/docs/' },
    },
    includes: ['Get started with Aspire', 'Install now', '/get-started/install-cli/', 'Read docs'],
  },
  {
    name: 'CodespacesButton renders repository launch URL',
    Component: CodespacesButton,
    props: { owner: 'dotnet', repo: 'aspire' },
    includes: ['https://codespaces.new/dotnet/aspire', 'github.com/codespaces/badge.svg'],
  },
  {
    name: 'ContainerRuntimeChoices renders localized runtime options and Podman setup',
    Component: ContainerRuntimeChoices,
    props: {
      ariaLabel: 'コンテナーランタイムの選択肢',
      intro: 'ランタイムを 1 つ選択してください。',
      choices: [
        {
          id: 'docker',
          title: 'Docker Desktop',
          href: 'https://www.docker.com/products/docker-desktop',
          linkLabel: 'Docker Desktop をインストール',
          statusLabel: '推奨',
          description: 'Supported container runtime.',
        },
        {
          id: 'podman',
          title: 'Podman',
          href: 'https://podman.io/',
          linkLabel: 'Podman をインストール',
          statusLabel: '代替手段',
          description: 'Daemonless OCI runtime.',
        },
      ],
      podmanSetup: {
        heading: 'Aspire で Podman を使用する',
        body: 'ASPIRE_CONTAINER_RUNTIME を podman に設定します。',
        bashTitle: 'Bash で設定',
        powershellTitle: 'PowerShell で設定',
      },
    },
    includes: [
      'コンテナーランタイムの選択肢',
      'ランタイムを 1 つ選択してください。',
      'Docker Desktop',
      'Docker Desktop をインストール',
      'Podman',
      'ASPIRE_CONTAINER_RUNTIME=podman',
      'PowerShell で設定',
    ],
  },
  {
    name: 'FluidGrid renders slot content',
    Component: FluidGrid,
    props: { minColumnWidth: '18rem', gap: '1rem' },
    slots: { default: '<div>Alpha</div><div>Beta</div>' },
    includes: ['Alpha', 'Beta', '--minColumnWidth: 18rem'],
  },
  {
    name: 'CapabilityGrid renders linked and static cards',
    Component: CapabilityGrid,
    props: { capabilities: capabilityItems, columns: 2 },
    includes: ['Model distributed apps', 'Learn more', '/get-started/app-host/', '--cap-cols: 2'],
  },
  {
    name: 'Breadcrumb renders current location and links',
    Component: Breadcrumb,
    props: {
      crumbs: [
        { label: 'Docs', href: '/docs/', icon: 'docs' },
        { label: 'Reference', href: '/reference/overview/' },
        { label: 'Aspire.Hosting' },
      ],
    },
    includes: ['aria-label="Breadcrumb"', '/docs/', 'Reference', 'Aspire.Hosting'],
  },
  {
    name: 'FeatureShowcase renders feature cards',
    Component: FeatureShowcase,
    props: { features: featureItems },
    includes: ['Deploy anywhere', 'See deployments', '/integrations/'],
  },
  {
    name: 'QuickStartJourney renders step links',
    Component: QuickStartJourney,
    props: { steps: journeySteps },
    includes: ['Install the CLI', 'Browse docs', '/docs/'],
  },
  {
    name: 'LearnMore renders slot content',
    Component: LearnMore,
    slots: { default: '<a href="/docs/">Read more in the docs</a>' },
    includes: ['Read more in the docs', '/docs/'],
  },
  {
    name: 'MediaCard renders named and default slots',
    Component: MediaCard,
    props: { href: '/media/demo/' },
    slots: {
      media: '<img src="/example.png" alt="Example media">',
      default: '<p class="title">Media card body</p>',
    },
    includes: ['/media/demo/', 'Example media', 'Media card body'],
  },
  {
    name: 'YouTubeEmbed renders no-cookie iframe URL',
    Component: YouTubeEmbed,
    props: { videoId: 'dQw4w9WgXcQ', autoplay: true, title: 'Video player' },
    includes: ['youtube-nocookie.com/embed/dQw4w9WgXcQ', 'autoplay=1', 'mute=1', 'Video player'],
  },
  {
    name: 'TwitchEmbed uses the request host for the parent parameter',
    Component: TwitchEmbed,
    props: { channel: 'aspiredotdev', title: 'Twitch stream' },
    includes: ['player.twitch.tv/?channel=aspiredotdev', 'parent=aspire.dev', 'Twitch stream'],
  },
  {
    name: 'SimpleCard renders title, icon and slot content',
    Component: SimpleCard,
    props: { icon: 'open-book', title: 'Docs card', link: '/docs/' },
    slots: { default: 'Short card description.' },
    includes: ['Docs card', '/docs/', 'Short card description.'],
  },
  {
    name: 'IconLinkCard renders title, description and href',
    Component: IconLinkCard,
    props: {
      title: 'Explore guides',
      description: 'Helpful description',
      href: '/guides/',
      icon: 'rocket',
    },
    includes: ['Explore guides', 'Helpful description', '/guides/'],
  },
  {
    name: 'LicenseBadge links to extracted external license URL',
    Component: LicenseBadge,
    props: { title: 'MIT License: https://opensource.org/licenses/MIT' },
    includes: [
      'https://opensource.org/licenses/MIT',
      'aria-label="License: MIT License: https://opensource.org/licenses/MIT"',
    ],
  },
  {
    name: 'InstallDotNetPackage renders CLI and project snippets',
    Component: InstallDotNetPackage,
    props: { packageName: 'Aspire.Hosting.Redis' },
    includes: ['dotnet add package Aspire.Hosting.Redis', '#:package Aspire.Hosting.Redis@*'],
  },
  {
    name: 'InstallPackage renders CLI and package reference snippets',
    Component: InstallPackage,
    props: { packageName: 'Aspire.Hosting.Redis' },
    includes: ['aspire add', 'Aspire.Hosting.Redis', 'PackageReference (*.csproj)'],
  },
  {
    name: 'InstallAspireCLI renders both shell variants',
    Component: InstallAspireCLI,
    includes: ['https://aspire.dev/install.sh', 'https://aspire.dev/install.ps1', 'aspire --help'],
  },
  {
    name: 'IconAside renders a translated fallback title',
    Component: IconAside,
    props: { type: 'note' },
    slots: { default: 'Aside content' },
    includes: ['aria-label="aside.note"', 'Aside content'],
  },
  {
    name: 'Placeholder appends the Learn tracking query parameter',
    Component: Placeholder,
    props: {
      name: 'Redis',
      link: 'https://learn.microsoft.com/dotnet/aspire/database/redis',
      icon: 'seti:db',
    },
    includes: [
      'Redis integration docs coming soon',
      'WT.mc_id=aspire.dev',
      'Microsoft Learn: Redis docs',
    ],
  },
  {
    name: 'HeroSection renders the main heading and actions',
    Component: HeroSection,
    props: {
      title: 'Build',
      highlight: 'faster',
      subtitle: 'Model your stack in one place.',
      logo: heroImage,
      primaryCta: { label: 'Get started', href: '/get-started/' },
      secondaryCta: { label: 'Docs', href: '/docs/' },
    },
    includes: ['Build', 'faster', 'Get started', '/get-started/', 'Docs'],
  },
  {
    name: 'TopicHero renders optional CTAs, floating icons, and inline code in subtitles',
    Component: TopicHero,
    props: {
      title: 'Platform',
      highlight: 'overview',
      subtitle: 'Use `aspire publish` for handoff.',
      primaryCta: { label: 'Explore', href: '/docs/' },
      secondaryCta: { label: 'Deploy', href: '/deployment/' },
      icon: 'rocket',
      floatingIcons: ['open-book', 'puzzle'],
    },
    includes: [
      'Platform',
      'overview',
      'Explore',
      '/deployment/',
      'floating-icon',
      '>aspire publish</code>',
    ],
  },
  {
    name: 'ThemeImage renders light and dark sources',
    Component: ThemeImage,
    props: {
      light: heroImage,
      dark: heroImage,
      alt: 'Themed diagram',
      zoomable: false,
    },
    includes: ['theme-image', 'data-light=', 'data-dark=', 'Themed diagram'],
  },
  {
    name: 'ImageShowcase renders image text and CTA',
    Component: ImageShowcase,
    props: {
      title: 'Visualize your app',
      description: 'See resources, traces and endpoints together.',
      image: heroImage,
      imageAlt: 'Zoomed diagram',
      cta: { label: 'Read the guide', href: '/docs/' },
    },
    includes: ['Visualize your app', 'Zoomed diagram', 'Read the guide'],
  },
  {
    name: 'ImageShowcase renders theme-aware images',
    Component: ImageShowcase,
    props: {
      title: 'Debug with agents',
      description: 'Give agents dashboard context.',
      lightImage: heroImage,
      darkImage: heroImage,
      imageAlt: 'Themed dashboard dialog',
    },
    includes: [
      'Debug with agents',
      'theme-image',
      'data-light=',
      'data-dark=',
      'Themed dashboard dialog',
    ],
  },
  {
    name: 'LoopingVideo renders sources and toggle button state',
    Component: LoopingVideo,
    props: {
      title: 'Demo reel',
      sources: [
        { src: '/dashboard-graph.mp4', type: 'video/mp4', title: 'Demo' },
        { src: '/dashboard-graph.mp4', type: 'video/mp4', title: 'Dark demo', theme: 'dark' },
      ],
    },
    includes: ['data-sources=', 'looping-video-toggle', 'Pause video'],
  },
  {
    name: 'LanguagesSupported renders all language cards',
    Component: LanguagesSupported,
    includes: ['data-lang-name="TypeScript"', 'data-lang-name="C#"', 'And more...'],
  },
  {
    name: 'FreeAndOpenSourceAside renders translated copy',
    Component: FreeAndOpenSourceAside,
    includes: ['landing.freeAndOSS', 'landing.aspirePromise'],
  },
  {
    name: 'OsAwareTabs renders shell tabs and sync key script',
    Component: OsAwareTabs,
    props: { syncKey: 'terminal' },
    slots: { unix: 'echo unix', windows: 'Write-Host windows' },
    includes: ['Bash', 'PowerShell', 'data-sync-key="terminal"'],
  },
  {
    name: 'Pivot renders a pivot block wrapper',
    Component: Pivot,
    props: { id: 'lang-nodejs' },
    slots: { default: 'Node.js content' },
    includes: ['data-pivot-block="lang-nodejs"', 'Node.js content'],
  },
  {
    name: 'PivotSelector renders buttons and ids for each option',
    Component: PivotSelector,
    props: {
      key: 'lang',
      title: 'Choose a language',
      marginTop: 1,
      options: [
        { id: 'csharp', title: 'C#' },
        { id: 'typescript', title: 'TypeScript' },
        { id: 'java', title: 'Java', disabled: true },
      ],
    },
    includes: [
      'pivot-selector-lang',
      'data-pivot-option="csharp"',
      'Choose a language',
      'pivot-collapse-lang',
    ],
  },
  {
    name: 'SimpleAppHostCode renders both AppHost tabs',
    Component: SimpleAppHostCode,
    props: { lang: 'nodejs', mark: '3-5', collapse: '7-8' },
    includes: ['C# AppHost', 'TypeScript AppHost', 'builder.Build().Run'],
  },
  {
    name: 'InstallCliModal renders the modal controls and variants',
    Component: InstallCliModal,
    includes: [
      'id="install-cli-modal"',
      'id="version-select"',
      'data-version="staging"',
      'More installation options',
    ],
  },
  {
    name: 'FooterPreferences renders theme toggle, selectors, and storage keys',
    Component: FooterPreferences,
    includes: [
      'id="footer-theme-toggle"',
      'role="radiogroup"',
      'id="footer-language-select"',
      'id="footer-kbd-select"',
      'Select theme',
      'Select keyboard shortcuts style',
    ],
  },
  {
    name: 'AccessibleCodeButtons renders accessibility enhancement script',
    Component: AccessibleCodeButtons,
    includes: ['AccessibleCodeButtons.astro?astro&type=script'],
  },
  {
    name: 'AppHostBuilder renders both language groups and code display container',
    Component: AppHostBuilder,
    includes: [
      'data-code-lang="csharp"',
      'data-code-lang="typescript"',
      'data-disable-copy',
      'data-toggle="database"',
    ],
  },
  {
    name: 'LocalVsProdEnvironments renders environment commands and disabled-copy regions',
    Component: LocalVsProdEnvironments,
    includes: ['aspire run', 'aspire deploy -e test', 'aspire deploy', 'data-disable-copy'],
  },
  {
    name: 'YouTubeCard renders metadata and embed shell',
    Component: YouTubeCard,
    props: {
      href: 'dQw4w9WgXcQ',
      title: 'Guided demo',
      description: 'Walk through the workflow',
      tags: ['demo', 'video'],
    },
    includes: ['Guided demo', 'Walk through the workflow', 'videoid="dQw4w9WgXcQ"'],
  },
  {
    name: 'YouTubeGrid renders each supplied video card',
    Component: YouTubeGrid,
    props: {
      videos: [
        { href: 'dQw4w9WgXcQ', title: 'First video', tags: ['intro'] },
        { href: '9bZkp7q19f0', title: 'Second video', tags: ['advanced'] },
      ],
    },
    includes: ['First video', 'Second video'],
  },
  {
    name: 'VimeoCard renders metadata and embed shell',
    Component: VimeoCard,
    props: {
      href: '76979871',
      title: 'Conference talk',
      description: 'Recorded presentation',
      tags: ['talk'],
    },
    includes: ['Conference talk', 'Recorded presentation', '76979871'],
  },
  {
    name: 'VimeoGrid renders each supplied video card',
    Component: VimeoGrid,
    props: {
      videos: [
        { href: '76979871', title: 'Opening keynote', tags: ['keynote'] },
        { href: '22439234', title: 'Closing session', tags: ['wrap-up'] },
      ],
    },
    includes: ['Opening keynote', 'Closing session'],
  },
  {
    name: 'AspireMap renders the themed community map image',
    Component: AspireMap,
    includes: ['Map showing Aspire community locations around the world', 'theme-image'],
  },
  {
    name: 'ThreeTierAspire renders the comparison slider and code labels',
    Component: ThreeTierAspire,
    includes: [
      'Docker Compose',
      'AppHost',
      'docker-compose.yml',
      'aria-label="Slide to compare Docker Compose and C# AppHost"',
    ],
  },
  {
    name: 'TestimonialCarousel renders navigation controls',
    Component: TestimonialCarousel,
    includes: ['testimonial-carousel', 'prev-btn', 'next-btn'],
  },
];

const sampleCardFixture = {
  name: 'redis-sample',
  title: 'Redis sample',
  description: [
    '**This sample** shows how to connect an API and dashboard to Redis for local development.',
    'It also demonstrates configuration, diagnostics, and a longer description so the card renders its read-more behavior when a thumbnail is present.',
  ].join('\n\n'),
  href: 'https://github.com/dotnet/aspire-samples/tree/main/samples/redis-sample',
  readme: '# Redis sample\n\nThis sample shows how to connect an API and dashboard to Redis.',
  tags: ['csharp', 'redis', 'docker', 'metrics', 'postgresql', 'kafka'],
  thumbnail: '~/assets/samples/placeholder.png',
  appHost: 'csproj' as const,
  detailHref: '/reference/samples/redis-sample/',
  resolvedThumbnail: heroImage,
};

const sampleDetailFixture = {
  ...sampleCardFixture,
  appHost: 'typescript' as const,
  appHostPath: 'apphost.ts',
  appHostCode: [
    'import { createBuilder } from "./.modules/aspire.js";',
    '',
    'const builder = await createBuilder();',
    '',
    'await builder.addRedis("cache");',
    '',
    'await builder.build().run();',
  ].join('\n'),
  description: '**This sample** shows how to connect an API and dashboard to Redis.',
  readme: [
    '# Redis sample',
    '',
    'This sample shows how to connect an API and dashboard to Redis.',
    '',
    '![Screenshot of the sample](~/assets/samples/aspire-shop/aspireshop-frontend-complete.png)',
    '',
    '**Theme-aware view**',
    '',
    '![Theme-aware app in light mode](~/assets/samples/aspire-shop/aspireshop-frontend-light.png#gh-light-mode-only)',
    '![Theme-aware app in dark mode](~/assets/samples/aspire-shop/aspireshop-frontend-dark.png#gh-dark-mode-only)',
    '',
    '![Partial theme fallback in light mode](~/assets/samples/aspire-shop/aspireshop-frontend-light.png#gh-light-mode-only)',
    '![Partial theme fallback in dark mode](~/assets/samples/aspire-shop/missing-dark.png#gh-dark-mode-only)',
    '',
    'See the [application project](./src/RedisSample.AppHost) for implementation details.',
    '',
    'A [broken empty link]() must be dropped, not rewritten.',
    '',
    '1. Open the app.',
    '',
    '   ![Screenshot of the sample step](~/assets/samples/volume-mount/volume-mount-frontend-login.png)',
    '',
    '1. Check the Docker volume.',
    '',
    '   ```shell',
    '   > docker volume ls -f name=sqlserver',
    '   DRIVER    VOLUME NAME',
    '   local     volume-data',
    '   ```',
    '',
    '1. Play around inside the dashboard:',
    '',
    '   1. Change the time range.',
    '   1. Enable auto-refresh.',
    '',
    '## Architecture',
    '',
    '```mermaid',
    'flowchart LR',
    '    Browser --> Api',
    '```',
    '',
    '## Running The App',
    '',
    'Run `aspire run` from the sample directory.',
    '',
    '**Angular**',
    '',
    '![Angular app](~/assets/samples/aspire-with-javascript/angular-app.png)',
    '',
    '**React**',
    '',
    '![React app](~/assets/samples/aspire-with-javascript/react-app.png)',
    '',
    '> [!NOTE]',
    '> Run with `--watch` for hot reload during development.',
    '',
    '> [!WARNING]',
    '> Stop the app before deleting the docker volume.',
    '',
    '```csharp title="AppHost.cs"',
    'var builder = DistributedApplication.CreateBuilder(args);',
    'builder.Build().Run();',
    '```',
  ].join('\n'),
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
  {
    name: 'aspire-shop',
    title: 'Aspire Shop',
    description: 'Catalog and cart sample.',
    href: 'https://github.com/dotnet/aspire-samples/tree/main/samples/aspire-shop',
    readme: 'README.md',
    tags: ['blazor'],
    thumbnail: {
      light: '~/assets/samples/aspire-shop/aspireshop-frontend-light.png#gh-light-mode-only',
      dark: '~/assets/samples/aspire-shop/aspireshop-frontend-dark.png#gh-dark-mode-only',
    },
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
    title: 'Lower Priority Package',
    href: '/integrations/lower/',
    icon: 'seti:db',
    description: 'A package with fewer downloads.',
    downloads: 10,
    tags: ['official'],
  },
  {
    title: 'Higher Priority Package',
    href: '/integrations/higher/',
    icon: 'seti:db',
    description: 'A package with many downloads.',
    downloads: 250,
    tags: ['official', 'hosting'],
  },
];

describe('custom Astro component render coverage', () => {
  for (const testCase of basicRenderCases) {
    it(testCase.name, async () => {
      const html = normalizeHtml(
        await renderComponent(testCase.Component, {
          props: testCase.props,
          slots: testCase.slots,
          requestUrl: testCase.requestUrl,
        })
      );

      for (const fragment of testCase.includes) {
        expect(html).toContain(fragment);
      }
    });
  }

  it('filters GitHubRepoStats by repository name when multiple stats are provided', async () => {
    const html = normalizeHtml(
      await renderComponent(GitHubRepoStats, {
        props: {
          repoName: 'frontend',
          stats: [
            {
              name: 'site',
              repo: 'https://github.com/microsoft/aspire.dev',
              stars: 100,
              license: 'https://opensource.org/licenses/MIT',
              licenseName: 'MIT',
            },
            {
              name: 'frontend',
              repo: 'https://github.com/microsoft/aspire.dev/tree/main/src/frontend',
              stars: 42,
              license: 'https://opensource.org/licenses/MIT',
              licenseName: 'MIT',
            },
          ],
        },
      })
    );

    expect(html).toContain('frontend');
    expect(html).toContain('42');
    expect(html).not.toContain('>100<');
  });

  it('renders SampleCard with read-more content and tag overflow badge', async () => {
    const html = normalizeHtml(
      await renderComponent(SampleCard, { props: { sample: sampleCardFixture } })
    );

    expect(html).toContain('Redis sample');
    expect(html).toContain('has-thumbnail');
    expect(html).toContain('This sample shows how to connect an API and dashboard to Redis');
    expect(html).not.toContain('**This sample**');
    expect(html).toContain('data-sample-detail-href="/reference/samples/redis-sample/"');
    expect(html).toContain('href="/reference/samples/redis-sample/"');
    expect(html).toContain('data-read-more');
    expect(html).toContain('View on GitHub');
    expect(html).toContain(
      'href="https://github.com/dotnet/aspire-samples/tree/main/samples/redis-sample"'
    );
    expect(html).toContain('+1');
    expect(html).toContain('data-apphost="csproj"');
    expect(html).toContain('C# (csproj) AppHost');

    // The AppHost pill must live in the footer next to the "View on GitHub"
    // link rather than higher up in the card body, so the badge sits on the
    // bottom-left opposite the GitHub link on the bottom-right.
    const footerOpen = html.search(/class="footer\b/);
    const apphostInFooter = html.indexOf('apphost-pill');
    const githubLinkInFooter = html.indexOf('View on GitHub');
    expect(footerOpen).toBeGreaterThan(-1);
    expect(apphostInFooter).toBeGreaterThan(footerOpen);
    expect(githubLinkInFooter).toBeGreaterThan(apphostInFooter);
  });

  it('renders SampleGrid controls and sample cards', async () => {
    const html = normalizeHtml(
      await renderComponent(SampleGrid, { props: { samples: sampleGridSamples } })
    );

    expect(html).toContain('data-samples-browser');
    expect(html).toContain('Search samples');
    expect(html).toContain('aria-label="1 sample"');
    expect(html).toContain('Orders sample');
    expect(html).toContain('Catalog sample');
    expect(html).toContain('Aspire Shop');
    expect(html).toContain('/reference/samples/orders/');
    expect(html).toContain('/reference/samples/catalog/');
    expect(html).toContain('/reference/samples/aspire-shop/');
    expect(html).toContain('theme-image');
    expect(html).toContain('data-light=');
    expect(html).toContain('data-dark=');
    expect(html).toContain('Try removing a filter or adjusting your search.');

    // The redesigned filter UI replaces the boxy "Filtered by" bar with a
    // single subtle "Clear all" text link in the results header, and an
    // embedded `X` icon button inside the search input — the same compact
    // pattern used by the in-page API search component.
    expect(html).not.toContain('data-active-filter-bar');
    expect(html).not.toContain('Clear filters');
    expect(html).toContain('data-clear-all');
    expect(html).toContain('Clear all');
    expect(html).toContain('aria-label="Clear search"');

    // The browse view persists the active search and tag filters in the
    // URL so a link like `/reference/samples/?q=redis&tags=cache` lands on a
    // pre-filtered view. The inline script must wire up both directions of
    // that sync — reading the query string on load and rewriting it via
    // `history.replaceState` whenever the filters change.
    expect(html).toContain('readFiltersFromUrl');
    expect(html).toContain('URLSearchParams');
    expect(html).toContain('history.replaceState');
  });

  it('renders SampleDetail with README content and sample actions', async () => {
    const html = normalizeHtml(
      await renderComponent(SampleDetail, {
        props: {
          sample: sampleDetailFixture,
          samplesHref: '/reference/samples/',
        },
      })
    );

    expect(html).toContain('Aspire sample');
    expect(html).toContain('TypeScript AppHost');
    expect(html).toContain('data-apphost="typescript"');
    expect(html).toContain('This sample shows how to connect an API and dashboard to Redis.');
    expect(html).not.toContain('**This sample**');
    expect(html).toContain('Running the app');
    expect(html).not.toContain('Running The App');
    expect(html).toContain('sl-heading-wrapper level-h2');
    expect(html).toContain('sl-steps');
    // Nested ordered lists must NOT be wrapped in another `<Steps>` —
    // Starlight's `<Steps>` is meant for top-level numbered procedures, and
    // nesting it produces double-numbered chrome and a broken visual rhythm.
    // `<Steps>` adds the `sl-steps` class to the inner `<ol>`, so a nested
    // `<Steps>` would produce a second `class="sl-steps"` (or `sl-steps `)
    // occurrence in the rendered output.
    const stepsWrapperCount = (html.match(/class="[^"]*\bsl-steps\b/g) || []).length;
    expect(stepsWrapperCount).toBe(1);
    expect(html).toContain('Change the time range.');
    expect(html).toContain('Enable auto-refresh.');
    expect(html).toContain('data-language="bash"');
    expect(html).toContain('volume-data');
    expect(html).toContain('id="architecture"');
    expect(html).toContain('class="mermaid');
    expect(html).toContain('Browser --&gt; Api');
    expect(html).toContain('expressive-code');
    expect(html).toContain('AppHost.cs');
    expect(html).toContain('Sample screenshots');
    expect(html).toContain('Screenshot of the sample');
    expect(html).toContain('starlight-image-zoom-zoomable');
    expect(html).toContain('Zoom image: Screenshot of the sample');
    expect(html).toContain('Zoom image: Theme-aware app');
    expect(html).toContain('Zoom image: Partial theme fallback');
    expect(html).toContain('Zoom image: Screenshot of the sample step');
    expect(html).toContain('Select an image to zoom in.');
    expect(html).toContain('theme-image');
    expect(html).toContain('data-light=');
    expect(html).toContain('data-dark=');
    expect(html).toMatch(/<figcaption[^>]*>Theme-aware app<\/figcaption>/);
    expect(html).not.toContain('Theme-aware app in light mode');
    expect(html).not.toContain('Theme-aware app in dark mode');
    expect(html).toMatch(/<figcaption[^>]*>Partial theme fallback<\/figcaption>/);
    expect(html).not.toContain('Partial theme fallback in light mode');
    expect(html).not.toContain('Partial theme fallback in dark mode');
    expect(html).toContain('View on GitHub');
    expect(html).toContain('Browse all samples');
    expect(html).toContain('href="/reference/samples/"');
    expect(html).toContain(
      'href="https://github.com/dotnet/aspire-samples/tree/main/samples/redis-sample/src/RedisSample.AppHost"'
    );

    // A link with an empty destination (`[text]()`) must be dropped entirely —
    // matching the previous marked renderer — rather than being rewritten to a
    // broken sample-relative URL pointing at the sample root (PR #1311 review).
    expect(html).not.toContain('broken empty link');
    expect(html).not.toContain(
      'href="https://github.com/dotnet/aspire-samples/tree/main/samples/redis-sample/"'
    );

    // The AppHost code section renders above the README with the kicker,
    // a short blurb (no <h2>), and a "View on GitHub" link to the raw source.
    expect(html).toContain('id="sample-apphost-kicker"');
    expect(html).toContain('sample-apphost-blurb');
    expect(html).not.toContain('The apphost.ts entry point');
    expect(html).not.toContain('id="sample-apphost-heading"');
    expect(html).toContain('data-language="typescript"');
    expect(html).toContain('createBuilder()');
    expect(html).toContain(
      'href="https://github.com/dotnet/aspire-samples/blob/main/samples/redis-sample/apphost.ts"'
    );

    // GitHub-style alerts (`> [!NOTE]`, `> [!WARNING]`, etc.) in the README
    // must render as Starlight Asides instead of leaking through as plain
    // <blockquote> elements, and the `[!KIND]` marker must be stripped from
    // the rendered body so it never appears as literal text.
    expect(html).toContain('starlight-aside starlight-aside--note');
    expect(html).toContain('starlight-aside starlight-aside--caution');
    expect(html).toContain('Run with');
    expect(html).toContain('hot reload during development');
    expect(html).toContain('Stop the app before deleting the docker volume.');
    expect(html).not.toContain('[!NOTE]');
    expect(html).not.toContain('[!WARNING]');

    // Short label paragraphs like `**Angular**` and `**React**` immediately
    // before a standalone image must be suppressed in the README body so they
    // don't appear as dangling text after the image is extracted into the
    // gallery. The images themselves still surface in the screenshots grid.
    expect(html).toContain('Zoom image: Angular app');
    expect(html).toContain('Zoom image: React app');
    expect(html).not.toMatch(/<p>\s*<strong>\s*Angular\s*<\/strong>\s*<\/p>/);
    expect(html).not.toMatch(/<p>\s*<strong>\s*React\s*<\/strong>\s*<\/p>/);
    expect(html).not.toMatch(/<p>\s*<strong>\s*Theme-aware view\s*<\/strong>\s*<\/p>/);

    // The primary "View on GitHub" CTA in the hero uses the Starlight `github`
    // icon on the left of the label and no longer ships the external-link
    // icon on the right. Match the unique github SVG path fragment.
    const githubIconPath = 'M12 .3a12 12 0 0 0-3.8 23.38';
    expect(html).toContain(githubIconPath);
    const primaryCtaStart = html.search(/class="sample-action primary\b/);
    const primaryCtaEnd = html.indexOf('</a>', primaryCtaStart);
    expect(primaryCtaStart).toBeGreaterThan(-1);
    const primaryCtaHtml = html.slice(primaryCtaStart, primaryCtaEnd);
    expect(primaryCtaHtml).toContain(githubIconPath);
    const ctaIconIndex = primaryCtaHtml.indexOf(githubIconPath);
    const ctaLabelIndex = primaryCtaHtml.indexOf('View on GitHub');
    expect(ctaIconIndex).toBeLessThan(ctaLabelIndex);
  });

  it('strips emphasized first paragraphs and long emphasized labels (paragraphPlainText doubling regression)', async () => {
    // Regression for the marked-token doubling bug in SampleDetail's
    // paragraphPlainText: marked carries both a `text` field and a `tokens`
    // array on `strong`/`em`/`del`. Walking both produced "foofoo" for `**foo**`,
    // which silently broke both consumers of paragraphPlainText:
    //
    //   1. dropLeadingSummaryParagraph compares the first README paragraph's
    //      text against the hero summary via startsWith. Any inline emphasis
    //      in that paragraph doubled its characters, the prefix match failed,
    //      and the duplicated summary sentence leaked into the rendered body.
    //
    //   2. paragraphIsShortLabel bails on paragraphs longer than 60 chars.
    //      Doubling an emphasized 40+ char label pushed it past the cap, so
    //      paragraphIsShortLabel rejected it and the dangling label paragraph
    //      stayed in the body after its image was extracted into the gallery.
    //
    // Both bugs are observable from the rendered HTML, so we exercise the
    // real SampleDetail render rather than reaching for the private helper.
    const distinctiveSummarySentence =
      'Boldy Aspire production monitoring sample with realtime metrics.';
    const longEmphasizedLabel = 'Aspire dashboard production monitoring view label';

    const html = normalizeHtml(
      await renderComponent(SampleDetail, {
        props: {
          sample: {
            ...sampleCardFixture,
            description: '**Boldy** Aspire production monitoring sample with realtime metrics.',
            readme: [
              '# Title',
              '',
              // First README paragraph: same sentence as the summary but
              // with emphasis. dropLeadingSummaryParagraph must still
              // recognize it and remove it from the body.
              '**Boldy** Aspire production monitoring sample with realtime metrics.',
              '',
              // 49-char emphasized label preceding a standalone image.
              // 49 ≤ 60 → paragraphIsShortLabel must classify it as a
              // dangling label and filterDanglingLabels must drop it
              // before the image is extracted into the gallery. With
              // the doubling bug, plain length measures 98 and the
              // label survives as orphan text.
              `**${longEmphasizedLabel}**`,
              '',
              '![Aspire dashboard](~/assets/samples/aspire-shop/aspireshop-frontend-complete.png)',
            ].join('\n'),
          },
          samplesHref: '/reference/samples/',
        },
      })
    );

    // 1. The summary sentence renders exactly once: in the hero block. If
    //    the leading README paragraph isn't dropped, it appears a second
    //    time in the README body and the count rises to 2.
    const escaped = distinctiveSummarySentence.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const summaryMatches = html.match(new RegExp(escaped, 'g')) ?? [];
    expect(summaryMatches.length, 'summary sentence should appear exactly once (hero only)').toBe(
      1
    );

    // 2. The long emphasized label is gone from the body. Its image still
    //    surfaces in the gallery so the screenshot itself is preserved.
    expect(html).not.toContain(longEmphasizedLabel);
    expect(html).toContain('Zoom image: Aspire dashboard');
  });

  it('builds sample markdown payload with absolute image URLs and metadata preamble', async () => {
    const { appHostLabel, buildSampleMarkdown } = await import('@utils/samples');

    const markdown = buildSampleMarkdown(
      {
        name: 'redis-sample',
        title: 'Redis sample',
        description: 'A short description.',
        href: 'https://github.com/dotnet/aspire-samples/tree/main/samples/redis-sample',
        readme: '# Redis sample\n\n![alt](~/assets/samples/redis-sample/foo.png)',
        readmeRaw:
          '# Redis sample\n\nIntro paragraph.\n\n![Screenshot](./images/screenshot.png)\n\n![External](https://example.com/x.png)\n',
        tags: ['csharp', 'redis'],
        thumbnail: null,
        appHost: 'csproj',
      },
      { appHostLabel }
    );

    expect(markdown).toContain('**Source:** [redis-sample]');
    expect(markdown).toContain('**AppHost:** C# AppHost');
    expect(markdown).toContain('**Tags:** csharp, redis');
    expect(markdown).toContain(
      '![Screenshot](https://raw.githubusercontent.com/dotnet/aspire-samples/main/samples/redis-sample/images/screenshot.png)'
    );
    expect(markdown).toContain('![External](https://example.com/x.png)');
    expect(markdown.endsWith('\n')).toBe(true);
  });

  it('renders SessionCard speaker metadata and time badge', async () => {
    const html = normalizeHtml(
      await renderComponent(SessionCard, { props: { ...sessions[0], index: 1 } })
    );

    expect(html).toContain('Shipping distributed apps');
    expect(html).toContain('Ada Lovelace');
    expect(html).toContain('09:00 AM');
    expect(html).toContain('45 min');
  });

  it('renders SessionGrid grouped by timeslot with search controls', async () => {
    const html = normalizeHtml(await renderComponent(SessionGrid, { props: { sessions } }));

    expect(html).toContain('Search sessions');
    expect(html).toContain('Shipping distributed apps');
    expect(html).toContain('Observability by default');
    expect(html).toContain('09:00 AM');
  });

  it('calculates IntegrationTotals targets from package data', async () => {
    const html = normalizeHtml(
      await renderComponent(IntegrationTotals, { props: { integrations: integrationsFixture } })
    );

    expect(html).toContain('data-target="2"');
    expect(html).toContain('data-target="2"');
    expect(html).toContain('data-target="260"');
  });

  it('sorts Integrations by download count before rendering cards', async () => {
    const html = normalizeHtml(
      await renderComponent(Integrations, {
        props: {
          integrations: integrationsFixture.map((integration) => ({ ...integration })),
          availableDocs: [{ match: 'Higher Priority Package', href: '/integrations/higher/docs/' }],
        },
      })
    );

    const higherIndex = html.indexOf('Higher Priority Package');
    const lowerIndex = html.indexOf('Lower Priority Package');

    expect(higherIndex).toBeGreaterThanOrEqual(0);
    expect(lowerIndex).toBeGreaterThanOrEqual(0);
    expect(higherIndex).toBeLessThan(lowerIndex);
    expect(html).toContain('/integrations/higher/docs/');
  });

  it('renders current sample metadata from repository data without throwing', async () => {
    const sampleFromRepo =
      samplesData.find((sample) => Array.isArray(sample.tags) && sample.tags.length > 0) ??
      samplesData[0];

    const html = normalizeHtml(
      await renderComponent(SampleCard, {
        props: {
          sample: {
            ...sampleFromRepo,
            detailHref: `/reference/samples/${sampleFromRepo.name}/`,
            resolvedThumbnail: null,
          },
        },
      })
    );

    expect(html).toContain(sampleFromRepo.title);
    expect(html).toContain('View on GitHub');
  });

  it('preserves the homepage hero image aspect ratio for non-square assets', async () => {
    const starlightRoute: StarlightRoute = {
      editUrl:
        'https://github.com/microsoft/aspire.dev/edit/main/src/frontend/src/content/docs/index.mdx',
      entry: {
        id: 'index',
        slug: '',
        filePath: 'src/content/docs/index.mdx',
        data: {
          title: 'Aspire',
          hero: {
            title: 'Aspire',
            tagline: 'Your stack, streamlined.',
            image: {
              alt: 'Aspire logo',
              file: heroImage,
            },
          },
        },
      },
    };

    const html = normalizeHtml(
      await renderComponent(StarlightHero, {
        locals: {
          starlightRoute,
        },
      })
    );

    const expectedHeight = Math.round((heroImage.height / heroImage.width) * 1000);

    expect(html).toContain('width="1000"');
    expect(html).toContain(`height="${expectedHeight}"`);
    expect(html).toContain(`origWidth%3D${heroImage.width}`);
    expect(html).toContain(`origHeight%3D${heroImage.height}`);
    expect(html).not.toContain('h=1000');
  });

  it('renders footer community links with platform names', async () => {
    const translations: Record<string, string> = {
      'footer.community': 'Community',
      'footer.blog': 'Blog',
      'footer.collab': 'Collaborate',
      'footer.discuss': 'Discuss',
      'footer.watch': 'Watch',
    };
    const t = ((key: string) => translations[key] ?? key) as ((key: string) => string) & {
      dir: () => 'ltr';
    };
    t.dir = () => 'ltr';

    const html = normalizeHtml(
      await renderComponent(FooterLinks, {
        locals: { t },
      })
    );

    for (const label of [
      'X (Twitter)',
      'BlueSky',
      'GitHub',
      'Discord',
      'Reddit',
      'YouTube',
      'Twitch',
      'Blog',
    ]) {
      expect(html).toContain(label);
    }

    expect(html).not.toContain('Follow');
    expect(html).not.toContain('Collaborate');
    expect(html).not.toContain('Discuss');
    expect(html).not.toContain('Watch');
  });

  it('hides footer community links on localized 404 pages', async () => {
    const html = normalizeHtml(
      await renderComponent(FooterLinks, {
        requestUrl: 'https://aspire.dev/ja/404/',
        locals: {
          starlightRoute: {
            editUrl:
              'https://github.com/microsoft/aspire.dev/edit/main/src/frontend/src/content/docs/404.mdx',
            entry: {
              id: '404',
              slug: '404',
              filePath: 'src/content/docs/404.mdx',
              data: {},
            },
          },
        },
      })
    );

    expect(html).not.toContain('footer.community');
    expect(html).not.toContain('https://x.com/aspiredotdev');
  });

  it('hides footer community links when the pathname fallback matches 404 routes', async () => {
    const fallbackRoute: StarlightRoute = {
      editUrl:
        'https://github.com/microsoft/aspire.dev/edit/main/src/frontend/src/content/docs/test.mdx',
      entry: {
        id: 'docs/test',
        slug: '',
        filePath: 'src/content/docs/test.mdx',
        data: {},
      },
    };

    for (const requestUrl of ['https://aspire.dev/404/', 'https://aspire.dev/ja/404/']) {
      const html = normalizeHtml(
        await renderComponent(FooterLinks, {
          requestUrl,
          locals: {
            starlightRoute: fallbackRoute,
          },
        })
      );

      expect(html).not.toContain('footer.community');
      expect(html).not.toContain('https://x.com/aspiredotdev');
    }
  });

  it('renders OsAwareTabs activation logic without anchor-only tab assumptions', async () => {
    const html = normalizeHtml(
      await renderComponent(OsAwareTabs, {
        props: { syncKey: 'terminal' },
        slots: { unix: 'echo unix', windows: 'Write-Host windows' },
      })
    );
    const inlineScript = html.split('<script>').at(-1) ?? '';

    expect(inlineScript).toContain('tab.textContent?.trim() === label');
    expect(inlineScript).not.toContain('HTMLAnchorElement');
  });

  it('renders SiteTour bootstrap data with translated copy', async () => {
    const translator = ((key: string) => {
      if (key === 'siteTour.trigger.start') {
        return 'Localized site tour start';
      }

      if (key === 'siteTour.steps.search.title') {
        return 'Localized search title';
      }

      return key;
    }) as ((key: string) => string) & { dir: () => 'ltr' };
    translator.dir = () => 'ltr';

    const html = normalizeHtml(
      await renderComponent(SiteTour, {
        locals: {
          t: translator,
        },
      })
    );

    expect(html).toContain('__aspireSiteTourStrings');
    expect(html).toContain('Localized site tour start');
    expect(html).toContain('Localized search title');
  });
});
