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
import SampleGrid from '@components/SampleGrid.astro';
import SessionCard from '@components/SessionCard.astro';
import SessionGrid from '@components/SessionGrid.astro';
import SimpleAppHostCode from '@components/SimpleAppHostCode.astro';
import SimpleCard from '@components/SimpleCard.astro';
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
    includes: [
      'https://aspire.dev/install.sh',
      'https://aspire.dev/install.ps1',
      '/casts/aspire-help.cast',
    ],
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
    name: 'TopicHero renders optional CTAs and floating icons',
    Component: TopicHero,
    props: {
      title: 'Platform',
      highlight: 'overview',
      subtitle: 'Understand the building blocks.',
      primaryCta: { label: 'Explore', href: '/docs/' },
      secondaryCta: { label: 'Deploy', href: '/deployment/' },
      icon: 'rocket',
      floatingIcons: ['open-book', 'puzzle'],
    },
    includes: ['Platform', 'overview', 'Explore', '/deployment/', 'floating-icon'],
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
    name: 'FooterPreferences renders selectors and storage keys',
    Component: FooterPreferences,
    includes: [
      'id="footer-theme-select"',
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
    'This sample shows how to connect an API and dashboard to Redis for local development.',
    'It also demonstrates configuration, diagnostics, and a longer description so the card renders its read-more behavior when a thumbnail is present.',
  ].join('\n\n'),
  href: 'https://github.com/dotnet/aspire-samples/tree/main/samples/redis-sample',
  tags: ['csharp', 'redis', 'docker', 'metrics', 'postgresql', 'kafka'],
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
    expect(html).toContain('data-read-more');
    expect(html).toContain('View on GitHub');
    expect(html).toContain('+1');
  });

  it('renders SampleGrid controls and sample cards', async () => {
    const html = normalizeHtml(
      await renderComponent(SampleGrid, { props: { samples: sampleGridSamples } })
    );

    expect(html).toContain('data-samples-browser');
    expect(html).toContain('Search samples');
    expect(html).toContain('Orders sample');
    expect(html).toContain('Catalog sample');
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
});
