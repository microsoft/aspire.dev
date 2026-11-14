// The component mapping table (docs/douze-migration-plan.md, section 7.2).
//
// Components with a custom conversion (Aside, Include, Image, ThemeImage, Code, OsAwareTabs, Fragment) are handled
// in convert-file.ts; every other mapped component is described here by a spec: its tag, whether it is a paired
// (block) shortcode, the props passed positionally (in order), renamed props and dropped props. Every other prop is
// a named argument in snake_case.

export interface Spec {
  tag: string;
  /** Paired shortcode ({% tag %}...{% endtag %}). A Douze shortcode is either paired or not, for every use. */
  block: boolean;
  positional?: string[];
  rename?: Record<string, string>;
  drop?: string[];
}

const spec = (tag: string, block: boolean, positional: string[] = [], rename: Record<string, string> = {}, drop: string[] = []): Spec => ({
  tag,
  block,
  positional,
  rename,
  drop,
});

export const SPECS: Record<string, Spec> = {
  Tabs: spec('tabs', true, [], { syncKey: 'sync' }),
  TabItem: spec('tab', true, ['label']),
  ApiReference: spec('api', false, ['name'], { parameterTypes: 'parameter_types' }),
  LearnMore: spec('learnmore', true),
  Steps: spec('steps', true),
  Badge: spec('badge', false, ['text'], { 'class:list': 'class' }),
  LinkButton: spec('linkbutton', true, ['href']),
  Pivot: spec('pivot', true, ['id']),
  PivotSelector: spec('pivot_selector', false),
  Kbd: spec('kbd', false),
  InstallDotNetPackage: spec('install_dotnet_package', false, ['packageName']),
  InstallPackage: spec('install_package', false, ['packageName']),
  Icon: spec('icon', false, ['name'], { 'class:list': 'class' }),
  LicenseBadge: spec('license_badge', false),
  LinkCard: spec('link_card', false),
  CardGrid: spec('card_grid', true),
  Card: spec('card', true),
  IconLinkCard: spec('icon_link_card', false),
  CapabilityGrid: spec('capability_grid', false),
  CTABanner: spec('cta_banner', false),
  FeatureShowcase: spec('feature_showcase', false),
  TopicHero: spec('topic_hero', false),
  ReleaseCommunity: spec('release_community', false),
  ContainerImages: spec('container_images', false),
  SimpleAppHostCode: spec('simple_app_host_code', true),
  FileTree: spec('file_tree', true),
  Expand: spec('expand', true),
  AsciinemaPlayer: spec('asciinema_player', false),
  YouTubeEmbed: spec('youtube_embed', false),
  GitHubRepoStats: spec('github_repo_stats', false),
  ContributorList: spec('contributor_list', false),
  ImageShowcase: spec('image_showcase', false),
};

/** Components converted by a dedicated function in convert-file.ts. */
export const CUSTOM = new Set(['Aside', 'Include', 'Image', 'ThemeImage', 'Code', 'OsAwareTabs', 'Fragment']);

/** Shortcodes the converter can emit, with whether they are paired, for the report and the shortcode authors. */
export const EMITTED_TAGS: Record<string, boolean> = {
  ...Object.fromEntries(Object.values(SPECS).map((s) => [s.tag, s.block])),
  aside: true,
  os_tabs: true,
  slot: true,
  image: false,
  include_markdown: false,
};

/** The labels and icons of OsAwareTabs' two slots, in the component's order (src/components/OsAwareTabs.astro). */
export const OS_TABS_SLOTS = [
  { slot: 'unix', label: 'Bash', icon: 'seti:shell' },
  { slot: 'windows', label: 'PowerShell', icon: 'seti:powershell' },
];

export const ASIDE_TYPES = new Set(['note', 'tip', 'caution', 'danger']);
