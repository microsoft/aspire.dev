// Keep the upstream icon snapshot pinned. Re-export wordmarks with
// scripts/generate-brand-wordmarks.mjs and update their hashes together.
export const brandSource = {
  repository: 'https://github.com/microsoft/aspire-brand',
  revision: 'f9eb464dec47870de23d55dd7b3c00d39122813d',
  wordmarkGenerator: 'scripts/generate-brand-wordmarks.mjs',
} as const;

export const brandLicenseUrl =
  'https://raw.githubusercontent.com/microsoft/aspire-brand/main/LICENSE';

export const brandDeckUrl =
  'https://microsoft.github.io/aspire-brand/slides/intro/Aspire-Spring26-IntroDeck.pptx';

export interface BrandAsset {
  name: string;
  file: string;
  description: string;
  kind: 'logo' | 'icon' | 'developer';
  surface: 'light' | 'dark';
  width: number;
  height: number;
  gitBlob: string;
  sourceGitBlob?: string;
}

export const brandAssets = [
  {
    name: 'Horizontal logo, dark',
    file: 'aspire-logo-dark-horizontal.svg',
    description: 'Dark lettering for light backgrounds.',
    kind: 'logo',
    surface: 'light',
    width: 512,
    height: 160,
    gitBlob: '46e6b9f8febd77929eb8ec1f1d91a76be3b2d430',
    sourceGitBlob: '064d526c4e9d47b43bc1c0aa128805300bd9365c',
  },
  {
    name: 'Horizontal logo, light',
    file: 'aspire-logo-light-horizontal.svg',
    description: 'Light lettering for dark backgrounds.',
    kind: 'logo',
    surface: 'dark',
    width: 512,
    height: 160,
    gitBlob: '5bc37b391bdc66c9663e7c7eff6abc35c8ccd7ff',
    sourceGitBlob: 'ef83cb55ef2629451578bd475a43415727312ac0',
  },
  {
    name: 'Vertical logo, dark',
    file: 'aspire-logo-dark-vertical.svg',
    description: 'Stacked dark lettering for light backgrounds.',
    kind: 'logo',
    surface: 'light',
    width: 400,
    height: 320,
    gitBlob: '4413fe025ba480fbadf18af73afc42c0a1667e4d',
    sourceGitBlob: '157478cce769be1115aab4bc34539b768591c933',
  },
  {
    name: 'Vertical logo, light',
    file: 'aspire-logo-light-vertical.svg',
    description: 'Stacked light lettering for dark backgrounds.',
    kind: 'logo',
    surface: 'dark',
    width: 400,
    height: 320,
    gitBlob: 'f1e144b72ff79ed7e6902b425bf56ce461b57129',
    sourceGitBlob: 'acf74b490883d2842e426952e25ec2cc731d7e41',
  },
  {
    name: 'Aspire icon, 256',
    file: 'aspire-icon-256.svg',
    description: 'Use when the surrounding context already identifies Aspire.',
    kind: 'icon',
    surface: 'light',
    width: 256,
    height: 256,
    gitBlob: '8119728471f0a020276d628797441fdecda087fe',
  },
  {
    name: 'Aspire icon, 32',
    file: 'aspire-icon-32.svg',
    description: 'Small-format artwork for compact placements.',
    kind: 'icon',
    surface: 'light',
    width: 32,
    height: 32,
    gitBlob: '89fe2a3fc8e82a802e9ab198291662631bc41c10',
  },
  {
    name: 'Original developer icon',
    file: 'developer-tools/aspire-original.svg',
    description: 'Full-color derivative for developer tools and icon libraries.',
    kind: 'developer',
    surface: 'light',
    width: 128,
    height: 128,
    gitBlob: '483809d1bd5d8960f788e9fc3c4ee8669dfd8c5e',
  },
  {
    name: 'Line developer icon',
    file: 'developer-tools/aspire-line.svg',
    description: 'Outline-style artwork expressed as a filled path.',
    kind: 'developer',
    surface: 'light',
    width: 128,
    height: 128,
    gitBlob: '5ad70ad6cd7f8a5e00ebd3c06064ffdbe55cac08',
  },
  {
    name: 'Plain developer icon',
    file: 'developer-tools/aspire-plain.svg',
    description: 'Monochrome artwork with a rounded enclosing edge.',
    kind: 'developer',
    surface: 'light',
    width: 128,
    height: 128,
    gitBlob: '2ebd4ac88b1f0d9f72e01baf14ecf6bcc237595c',
  },
] as const satisfies readonly BrandAsset[];

export interface BrandColor {
  name: string;
  token: string;
  value: string;
  description?: string;
}

export const brandColors = [
  {
    name: 'Aspire primary',
    token: '--aspire-color-primary',
    value: '#7455DD',
    description: 'Primary brand accent.',
  },
  {
    name: 'Aspire purple',
    token: '--aspire-color-purple',
    value: '#512BD4',
    description: 'Darker purple for emphasis.',
  },
  {
    name: 'Aspire secondary',
    token: '--aspire-color-secondary',
    value: '#B9AAEE',
    description: 'Light purple for accents and surfaces.',
  },
  {
    name: 'Aspire muted',
    token: '--aspire-color-muted',
    value: '#DCD5F6',
    description: 'Light lavender for fills and backgrounds.',
  },
  {
    name: 'Aspire grey',
    token: '--aspire-color-grey',
    value: '#DCE0E8',
    description: 'Neutral gray for surfaces and separators.',
  },
  {
    name: 'Aspire black',
    token: '--aspire-color-black',
    value: '#1F1E33',
    description: 'Dark background color.',
  },
  {
    name: 'Aspire white',
    token: '--aspire-color-white',
    value: '#FFFFFF',
    description: 'White for backgrounds and clear space.',
  },
] as const satisfies readonly BrandColor[];

export const brandAccents = [
  {
    name: 'Magenta',
    token: '--aspire-accent-magenta',
    value: '#B30F87',
  },
  {
    name: 'Flamingo',
    token: '--aspire-accent-flamingo',
    value: '#F65163',
  },
  {
    name: 'Blue',
    token: '--aspire-accent-blue',
    value: '#0078D7',
  },
  {
    name: 'Cyan',
    token: '--aspire-accent-cyan',
    value: '#0B7E84',
  },
  {
    name: 'Yellow',
    token: '--aspire-accent-yellow',
    value: '#9B8308',
  },
] as const satisfies readonly BrandColor[];

export const brandGradients = [
  {
    name: 'Purple to magenta',
    token: '--aspire-gradient-purple-magenta',
    value: 'linear-gradient(90deg, #7455DD 0%, #B30F87 100%)',
    description: 'Use for hero accents and highlights.',
  },
  {
    name: 'Blue to purple',
    token: '--aspire-gradient-blue-purple',
    value: 'linear-gradient(90deg, #0078D7 0%, #7455DD 100%)',
    description: 'Use for product visuals and diagrams.',
  },
  {
    name: 'Flamingo to purple',
    token: '--aspire-gradient-flamingo-purple',
    value: 'linear-gradient(90deg, #F65163 0%, #7455DD 100%)',
    description: 'Use for campaign visuals and callouts.',
  },
  {
    name: 'Purple to cyan',
    token: '--aspire-gradient-purple-cyan',
    value: 'linear-gradient(90deg, #7455DD 0%, #0B7E84 100%)',
    description: 'Use sparingly for highlights.',
  },
] as const satisfies readonly BrandColor[];

export const brandCssVariables = [
  ':root {',
  ...[...brandColors, ...brandAccents, ...brandGradients].map(
    ({ token, value }) => `  ${token}: ${value.toLowerCase()};`
  ),
  '}',
].join('\n');

export const brandFontWeights = [
  { name: 'Regular', weight: 400 },
  { name: 'Medium', weight: 500 },
  { name: 'Semibold', weight: 600 },
  { name: 'Bold', weight: 700 },
] as const;
