// Tests of the MDX converter (src/site/scripts/convert-mdx, docs/douze-migration-plan.md 7.1 to 7.3).
//
// Run from the repository root:
//   pnpm --dir src/frontend exec tsx --test ../site/tests/unit/convert-mdx.test.ts
//
// The converter is an ES module that loads the remark stack with top-level await; this file is loaded as CommonJS
// (src/site has no package.json yet), so the module is imported dynamically.

import { before, describe, test } from 'node:test';
import assert from 'node:assert/strict';

type Convert = typeof import('../../scripts/convert-mdx/convert-file.ts').convertSource;
let convertSource: Convert;

before(async () => {
  ({ convertSource } = await import('../../scripts/convert-mdx/convert-file.ts'));
});

const mdx = (source: string, modules?: Record<string, Record<string, unknown>>) => convertSource(source, { mode: 'mdx', modules });
const body = (source: string) => {
  const r = mdx(source);
  assert.deepEqual(r.problems, [], JSON.stringify(r.problems));
  return r.output;
};
const kinds = (source: string) => mdx(source).problems.map((p) => p.kind);

/** Every converted output is a fixed point: converting it again (as Markdown) changes nothing. */
function assertIdempotent(output: string) {
  assert.equal(convertSource(output, { mode: 'md' }).output, output);
}

describe('front matter and imports', () => {
  test('imports are removed, template splash becomes layout, lastUpdated is dropped, hero assets are rewritten', () => {
    const out = body(`---
title: Hello
template: splash
lastUpdated: true
hero:
  image:
    file: ../../../assets/aspire-hero.png
---

import { Aside } from '@astrojs/starlight/components';
import LearnMore from '@components/LearnMore.astro';

# Title

Text with %ASPIRE_VERSION%.
`);
    assert.equal(
      out,
      `---
title: Hello
layout: splash
hero:
  image:
    file: /assets/images/aspire-hero.png
---

# Title

Text with %ASPIRE_VERSION%.
`,
    );
    assertIdempotent(out);
  });

  test('a page without imports or JSX is unchanged apart from the front matter normalization', () => {
    const src = `---\ntitle: Plain\n---\n\n# Plain\n\nSome *text*.\n\n\`\`\`csharp\nvar x = 1;\n\`\`\`\n`;
    assert.equal(body(src), src);
  });

  test('a byte order mark is dropped and does not shift positions', () => {
    const out = body('\uFEFF---\ntitle: Bom\n---\n\nimport LearnMore from "@components/LearnMore.astro";\n\n<LearnMore>\n  See [x](/x/).\n</LearnMore>\n\n```bash\nls\n```\n');
    assert.equal(out, '---\ntitle: Bom\n---\n\n{% learnmore %}\nSee [x](/x/).\n{% endlearnmore %}\n\n```bash\nls\n```\n');
  });

  test('md mode keeps the file byte for byte (CLI partials, glossary terms)', () => {
    const src = `---\ntitle: Option\n---\n\n**\`--wait\`**\n\n    indented code\n\nText <b>html</b> {braces}\n`;
    const r = convertSource(src, { mode: 'md' });
    assert.equal(r.output, src);
    assert.equal(r.changed, false);
  });
});

describe('components', () => {
  test('Tabs and TabItem, children dedented', () => {
    const out = body(`import { Tabs, TabItem } from '@astrojs/starlight/components';

<Tabs syncKey="terminal">
    <TabItem label="Bash" icon="seti:shell">
        Run this:

        \`\`\`bash title="Install"
        curl -sSL https://aspire.dev/install.sh | bash
            indented line
        \`\`\`
    </TabItem>
    <TabItem label="PowerShell" id="pwsh">
        Text.
    </TabItem>
</Tabs>
`);
    assert.equal(
      out,
      `{% tabs sync: "terminal" %}
{% tab "Bash", icon: "seti:shell" %}
Run this:

\`\`\`bash title="Install"
curl -sSL https://aspire.dev/install.sh | bash
    indented line
\`\`\`
{% endtab %}
{% tab "PowerShell", id: "pwsh" %}
Text.
{% endtab %}
{% endtabs %}
`,
    );
    assertIdempotent(out);
  });

  test('the TypeScript tab moves first in aspire-lang tab sets only', () => {
    const out = body(`import { Tabs, TabItem } from '@astrojs/starlight/components';

<Tabs syncKey="aspire-lang">
<TabItem label="C#" id="csharp">
C#
</TabItem>
<TabItem label="TypeScript" id="typescript">
TS
</TabItem>
</Tabs>

<Tabs syncKey="other">
<TabItem label="C#">
C#
</TabItem>
<TabItem label="TypeScript">
TS
</TabItem>
</Tabs>
`);
    assert.equal(
      out,
      `{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
TS
{% endtab %}
{% tab "C#", id: "csharp" %}
C#
{% endtab %}
{% endtabs %}

{% tabs sync: "other" %}
{% tab "C#" %}
C#
{% endtab %}
{% tab "TypeScript" %}
TS
{% endtab %}
{% endtabs %}
`,
    );
  });

  test('Aside with a plain body becomes a directive container', () => {
    assert.equal(
      body(`import { Aside } from '@astrojs/starlight/components';

<Aside type="caution" title="Be careful">
  Some **bold** text.
</Aside>

<Aside>
Default note.
</Aside>
`),
      `:::caution[Be careful]
Some **bold** text.
:::

:::note
Default note.
:::
`,
    );
  });

  test('Aside with a nested container, an icon or a bracket in its title stays a shortcode', () => {
    assert.equal(
      body(`import { Aside } from '@astrojs/starlight/components';

<Aside type="tip">
Outer.

<Aside type="note">
Inner.
</Aside>
</Aside>

<Aside type="note" icon="star">
Icon.
</Aside>

<Aside type="note" title="Use [x]">
Brackets.
</Aside>
`),
      `{% aside "tip" %}
Outer.

:::note
Inner.
:::
{% endaside %}

{% aside "note", icon: "star" %}
Icon.
{% endaside %}

{% aside "note", title: "Use [x]" %}
Brackets.
{% endaside %}
`,
    );
  });

  test('Aside in a list item keeps the list indentation', () => {
    assert.equal(
      body(`import { Aside } from '@astrojs/starlight/components';

1. Step one.

   <Aside type="tip">
   A tip
   over two lines.
   </Aside>

2. Step two.
`),
      `1. Step one.

   :::tip
   A tip
   over two lines.
   :::

2. Step two.
`,
    );
  });

  test('ApiReference, with package and parameter types written to props', () => {
    const out = body(`---
title: Api
---

import ApiReference from '@components/ApiReference.astro';

Call <ApiReference name="Aspire.Hosting.RedisBuilderExtensions.AddRedis" /> or <ApiReference name="X.Y" package="Aspire.Hosting" parameterTypes={['string', 'int?']} />.
`);
    assert.equal(
      out,
      `---
title: Api
props:
  api_parameter_types:
    - string
    - int?
---

Call {% api "Aspire.Hosting.RedisBuilderExtensions.AddRedis" %} or {% api "X.Y", package: "Aspire.Hosting", parameter_types: props.api_parameter_types %}.
`,
    );
    assertIdempotent(out);
  });

  test('LearnMore, Steps, Include', () => {
    assert.equal(
      body(`import LearnMore from '@components/LearnMore.astro';
import Include from '@components/Include.astro';
import { Steps } from '@astrojs/starlight/components';

<LearnMore>
  See [the docs](/x/).
</LearnMore>

<Steps>

1. One
2. Two

</Steps>

- <Include relativePath="reference/cli/includes/option-help.md" />
`),
      `{% learnmore %}
See [the docs](/x/).
{% endlearnmore %}

{% steps %}
1. One
2. Two
{% endsteps %}

- {% include_markdown "reference/cli/includes/option-help.md" %}
`,
    );
  });

  test('Image and ThemeImage from asset imports', () => {
    assert.equal(
      body(`import { Image } from 'astro:assets';
import ThemeImage from '@components/ThemeImage.astro';
import dashboard from '@assets/dashboard/main.png';
import light from '@assets/arch-light.svg';
import dark from '@assets/arch-dark.svg';

<Image src={dashboard} alt="The dashboard" width={800} height={600} class:list={'icon md'} data-zoom-off />

<ThemeImage light={light} dark={dark} alt="Architecture" zoomable={false} classOverride="wide" href="/x/" />
`),
      `{% image "/assets/images/dashboard/main.png", alt: "The dashboard", width: 800, height: 600, class: "icon md", zoomable: false %}

{% image light: "/assets/images/arch-light.svg", dark: "/assets/images/arch-dark.svg", alt: "Architecture", zoomable: false, class: "wide", href: "/x/" %}
`,
    );
  });

  test('Badge, LinkButton, Pivot, PivotSelector, Kbd, Icon, InstallPackage, InstallDotNetPackage', () => {
    const out = body(`import { Badge, LinkButton, Icon } from '@astrojs/starlight/components';
import { Kbd } from 'starlight-kbd/components';
import Pivot from '@components/Pivot.astro';
import PivotSelector from '@components/PivotSelector.astro';
import InstallPackage from '@components/InstallPackage.astro';
import InstallDotNetPackage from '@components/InstallDotNetPackage.astro';

<Badge text="New" variant="tip" size="small" />

<LinkButton href="/get-started/" variant="secondary" icon="right-arrow">Get started</LinkButton>

<PivotSelector
  title="Select your language"
  key="aspire-lang"
  marginTop={1}
  options={[
    { id: 'csharp', title: 'C#' },
    { id: 'typescript', title: 'TypeScript' },
  ]}
/>

<Pivot id="csharp">
Press <Kbd windows="Ctrl+C" mac="⌃+C" /> and see <Icon name="github" class="d-inline" />.
</Pivot>

<InstallPackage packageName="Aspire.Hosting.Redis" shortName="redis" cliOnly />

<InstallDotNetPackage packageName="Aspire.StackExchange.Redis" />
`);
    assert.equal(
      out,
      `---
props:
  pivot_selector_options:
    - id: csharp
      title: C#
    - id: typescript
      title: TypeScript
---

{% badge "New", variant: "tip", size: "small" %}

{% linkbutton "/get-started/", variant: "secondary", icon: "right-arrow" %}Get started{% endlinkbutton %}

{% pivot_selector title: "Select your language", key: "aspire-lang", margin_top: 1, options: props.pivot_selector_options %}

{% pivot "csharp" %}
Press {% kbd windows: "Ctrl+C", mac: "⌃+C" %} and see {% icon "github", class: "d-inline" %}.
{% endpivot %}

{% install_package "Aspire.Hosting.Redis", short_name: "redis", cli_only: true %}

{% install_dotnet_package "Aspire.StackExchange.Redis" %}
`,
    );
    assertIdempotent(out);
  });

  test('OsAwareTabs: the unix and windows slots become the Bash and PowerShell tabs, Code becomes a fence', () => {
    assert.equal(
      body(`import OsAwareTabs from '@components/OsAwareTabs.astro';
import { Code } from '@astrojs/starlight/components';

<OsAwareTabs syncKey="terminal">
  <Code slot="windows" lang="powershell" code="$HOME\\.aspire\\logs\\" />
  <div slot="unix">

  \`\`\`bash
  ls ~/.aspire
  \`\`\`

  </div>
</OsAwareTabs>
`),
      `{% os_tabs sync: "terminal" %}
{% tab "Bash", icon: "seti:shell" %}
\`\`\`bash
ls ~/.aspire
\`\`\`
{% endtab %}
{% tab "PowerShell", icon: "seti:powershell" %}
\`\`\`powershell
$HOME\\.aspire\\logs\\
\`\`\`
{% endtab %}
{% endos_tabs %}
`,
    );
  });

  test('Code with a template literal, title and marks', () => {
    assert.equal(
      body(`import { Code } from '@astrojs/starlight/components';

<Code lang="json" title="config.json" mark={[2, '4-5']} code={\`{
  "a": 1
}\`} />
`),
      `\`\`\`json title="config.json" {2,4-5}
{
  "a": 1
}
\`\`\`
`,
    );
  });

  test('generic components: CardGrid, Card, LinkCard, FileTree, Expand, ContainerImages', () => {
    assert.equal(
      body(`import { CardGrid, Card, LinkCard } from '@astrojs/starlight/components';
import FileTree from 'starlight-plugin-icons/components/FileTree.astro';
import Expand from '@components/Expand.astro';
import ContainerImages from '@components/ContainerImages.astro';

<CardGrid>
  <Card title="One">
    Body *one*.
  </Card>
  <LinkCard title="Two" href="/two/" description="Second" />
</CardGrid>

<FileTree>
- src/
  - **index.ts**
</FileTree>

<Expand summary="Output" backgroundColor="--sl-color-bg">
Text.
</Expand>

<ContainerImages package="Aspire.Hosting.Redis" only="redis" />
`),
      `{% card_grid %}
{% card title: "One" %}
Body *one*.
{% endcard %}

{% link_card title: "Two", href: "/two/", description: "Second" %}
{% endcard_grid %}

{% file_tree %}
- src/
  - **index.ts**
{% endfile_tree %}

{% expand summary: "Output", background_color: "--sl-color-bg" %}
Text.
{% endexpand %}

{% container_images package: "Aspire.Hosting.Redis", only: "redis" %}
`,
    );
  });

  test('named slots of a component become slot shortcodes', () => {
    assert.equal(
      body(`import SimpleAppHostCode from '@components/SimpleAppHostCode.astro';

<SimpleAppHostCode lang="csharp" collapse={[1, 3]}>
  <div slot="csharp-content">
    <p>Uses <code>AddProject</code>.</p>
  </div>
</SimpleAppHostCode>
`).replace(/^---[\s\S]*?---\n\n/, ''),
      `{% simple_app_host_code lang: "csharp", collapse: props.simple_app_host_code_collapse %}
{% slot "csharp-content" %}
<p>Uses <code>AddProject</code>.</p>
{% endslot %}
{% endsimple_app_host_code %}
`,
    );
  });

  test('Fragment is unwrapped; comments are dropped; string expressions are inlined; {0} is kept literally', () => {
    assert.equal(
      body(`import { Fragment } from 'astro/jsx-runtime';

{/* a comment */}

<Fragment>
Inside.
</Fragment>

<a href="/x/">Link</a>{' '}after and \`code\`.

> Parameter '{0}' is invalid.
`),
      `Inside.

<a href="/x/">Link</a> after and \`code\`.

> Parameter '{0}' is invalid.
`,
    );
  });
});

describe('attribute values', () => {
  test('JSON imports become data references, export const and data modules become constants', () => {
    const r = mdx(
      `import GitHubRepoStats from '@components/GitHubRepoStats.astro';
import ContributorList from '@components/ContributorList.astro';
import LicenseBadge from '@components/LicenseBadge.astro';
import stats from '@data/github-stats.json';
import { licenseTitles } from '@data/thanks-license-titles';

export const ignore = ['bot1', 'bot2'];

<GitHubRepoStats stats={stats} repoName="microsoft/aspire" />

<ContributorList githubRepo="microsoft/aspire" ignore={ignore} />

<LicenseBadge title={licenseTitles.redis} />
`,
      { '@data/thanks-license-titles': { licenseTitles: { redis: 'BSD: https://x/' } } },
    );
    assert.deepEqual(r.problems, []);
    assert.equal(
      r.output,
      `---
props:
  contributor_list_ignore:
    - bot1
    - bot2
---

{% github_repo_stats stats: github-stats, repo_name: "microsoft/aspire" %}

{% contributor_list github_repo: "microsoft/aspire", ignore: props.contributor_list_ignore %}

{% license_badge title: "BSD: https://x/" %}
`,
    );
  });

  test('a string with a double quote uses single quotes', () => {
    assert.equal(
      body(`import { Badge } from '@astrojs/starlight/components';\n\n<Badge text='Say "hi"' />\n`),
      `{% badge 'Say "hi"' %}\n`,
    );
  });
});

describe('Markdown that CommonMark reads differently from MDX', () => {
  test('className becomes class and Markdown blocks inside HTML get blank lines', () => {
    assert.equal(
      body(`<div className="box">
- one
- two
</div>
`),
      `<div class="box">

- one
- two

</div>
`,
    );
  });

  test('a blank line separates a JSX block from the Markdown that follows it', () => {
    assert.equal(
      body(`import { Image } from 'astro:assets';
import { Tabs, TabItem } from '@astrojs/starlight/components';
import logo from '@assets/logo.svg';

<Tabs>
<TabItem label="A">
<Image src={logo} alt="Logo" />
- item
</TabItem>
</Tabs>
`),
      `{% tabs %}
{% tab "A" %}
{% image "/assets/images/logo.svg", alt: "Logo" %}

- item
{% endtab %}
{% endtabs %}
`,
    );
  });

  test('inline code holding Liquid syntax is wrapped in raw, once', () => {
    const out = body('Use `${{ github.repository }}` here.\n');
    assert.equal(out, 'Use {% raw %}`${{ github.repository }}`{% endraw %} here.\n');
    assertIdempotent(out);
  });

  test('a block indented by four spaces at the root is dedented (MDX has no indented code)', () => {
    assert.equal(body('Text.\n\n    Indented paragraph.\n'), 'Text.\n\nIndented paragraph.\n');
  });
});

describe('problems', () => {
  test('unknown components are kept as JSX with their import', () => {
    const r = mdx(`import HomePage from '@components/home/HomePage.astro';\nimport { Badge } from '@astrojs/starlight/components';\n\n<HomePage />\n\n<Badge text="x" />\n`);
    assert.deepEqual(
      r.problems.map((p) => [p.kind, p.line]),
      [['unknown-component', 4]],
    );
    assert.equal(r.output, `import HomePage from '@components/home/HomePage.astro';\n\n{% raw %}<HomePage />{% endraw %}\n\n{% badge "x" %}\n`);
  });

  test('leftover JSX is wrapped in raw so its braces are not Liquid', () => {
    const r = mdx(`import Hero from '@components/Hero.astro';\n\n<Hero cta={{ label: 'Go', href: '/x/' }} />\n`);
    assert.deepEqual(r.problems.map((p) => p.kind), ['unknown-component']);
    assert.equal(r.output, `import Hero from '@components/Hero.astro';\n\n{% raw %}<Hero cta={{ label: 'Go', href: '/x/' }} />{% endraw %}\n`);
    assertIdempotent(r.output);
  });

  test('every problem kind is reported', () => {
    assert.deepEqual(kinds('import { Image } from "astro:assets";\n\n<Image src={notImported} alt="x" />\n'), ['expression-attribute']);
    assert.deepEqual(kinds('<span>{items.map((x) => x)}</span>\n'), ['expression-child']);
    assert.deepEqual(kinds('export const x = compute();\n\nText.\n'), ['export']);
    assert.deepEqual(kinds('import { Code } from "@astrojs/starlight/components";\nimport cfg from "../tsconfig.json?raw";\n\n<Code code={cfg} lang="json" />\n'), ['import-unsupported', 'expression-attribute']);
    assert.deepEqual(kinds('<div>\n<p>Some **bold**</p>\n</div>\n'), ['markdown-in-html']);
    assert.deepEqual(kinds('import { Badge } from "@astrojs/starlight/components";\n\n<Badge text="x">child</Badge>\n'), ['unexpected-children']);
    assert.deepEqual(kinds('import OsAwareTabs from "@components/OsAwareTabs.astro";\n\n<OsAwareTabs>\nloose\n</OsAwareTabs>\n'), ['unslotted-content']);
    assert.deepEqual(kinds('import { Aside } from "@astrojs/starlight/components";\n\nText <Aside>inline</Aside> more.\n'), ['block-in-paragraph']);
    assert.deepEqual(kinds(`import { Badge } from "@astrojs/starlight/components";\n\n<Badge text={\`It's "x"\`} />\n`), ['string-quotes']);
    assert.deepEqual(kinds('---\nprops: 1\n---\n\nimport { PivotSelector } from "@components/PivotSelector.astro";\n\n<PivotSelector options={[1]} />\n'), ['props-conflict']);
    assert.deepEqual(kinds('import { Tabs, TabItem } from "@astrojs/starlight/components";\n\n<Tabs>\n<TabItem label="A">\nA\n</TabItem>\n\nLoose.\n</Tabs>\n'), ['content-outside-tab']);
    assert.deepEqual(kinds('<div>\nunclosed\n'), ['parse-error']);
  });

  test('problem lines count the front matter', () => {
    const r = mdx('---\ntitle: x\n---\n\nimport X from "@components/X.astro";\n\n<X />\n');
    assert.equal(r.problems[0].line, 7);
  });
});
