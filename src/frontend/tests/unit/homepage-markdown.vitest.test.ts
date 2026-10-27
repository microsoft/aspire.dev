import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, test } from 'vitest';
import { aspireVersionPlaceholdersIntegration } from '../../config/aspire-version-placeholders-integration.mjs';
import { currentAspireVersion } from '../../config/aspire-versions.mjs';
import { renderHomepageMarkdown } from '../../config/homepage-markdown.mjs';
import { locales } from '../../config/locales';

function homepage(title = 'Compose distributed apps in code.', prefix = '') {
  return `<html><body>
    <nav>Site navigation</nav>
    <main>
      <section class="home-hero-story">
        <div class="home-hero-copy">
          <p class="home-hero-eyebrow">Free and open source</p>
          <h1>${title}</h1>
          <p>Model, run, observe, and deploy your application.</p>
          <a href="${prefix}/get-started/first-app/">Build your first app</a>
        </div>
        <div data-apphost-builder>
          <div class="code-lang-group" data-code-lang="csharp"><div class="code-variant" data-variant="frontend">Inactive builder variants</div></div>
          <div class="code-lang-group" data-code-lang="typescript"><div class="code-variant" data-variant="frontend">Default builder variant</div><div class="code-variant" data-variant="database">Inactive builder variants</div></div>
        </div>
      </section>
      <div class="aspire-home not-content">
        <h2>Local OpenTelemetry observability</h2>
        <p>Read application logs, distributed traces, and resource health.</p>
        <a href="${prefix}/dashboard/standalone/">Standalone dashboard</a>
        <h2>Application context for coding agents</h2>
        <a href="${prefix}/get-started/ai-coding-agents/">Set up your agent</a>
        <div class="model-terminal">Simulated terminal output</div>
        <div class="model-story-viewport" aria-hidden="true">
          <div class="model-code">
            <div class="expressive-code"><pre data-language="typescript"><code><div class="ec-line"><div class="code">const builder = await createBuilder();</div></div><div class="ec-line"><div class="code">await builder.build().run();</div></div></code></pre><button>Copy</button></div>
            <div class="expressive-code"><pre data-language="csharp"><code><div class="ec-line"><div class="code">var builder = DistributedApplication.CreateBuilder(args);</div></div><div class="ec-line"><div class="code">builder.Build().Run();</div></div></code></pre></div>
          </div>
          <div class="model-graph">Animated topology labels</div>
        </div>
        <article hidden>
          <h3>Deploy the model</h3>
          <p>Choose a deployment target.</p>
          <a href="${prefix}/deployment/">Deployment options</a>
        </article>
        <div class="environment-command"><code>aspire run</code><span><i aria-hidden="true"></i>4 resources healthy</span></div>
        <figure class="testimonial"><blockquote><p>Useful quote.</p></blockquote><figcaption><span><strong><a href="https://example.com">Steven Price</a></strong><small>Software Engineering Manager</small></span></figcaption></figure>
        <aside><p>Keep application telemetry private.</p></aside>
        <script>throw new Error('not content')</script>
        <style>.not-content { color: red; }</style>
      </div>
      <footer>Footer navigation</footer>
    </main>
  </body></html>`;
}

describe('homepage Markdown', () => {
  test('keeps the real hero, explanations, links, and warnings without decorative UI', async () => {
    const markdown = await renderHomepageMarkdown(homepage());

    expect(markdown).toContain('# Compose distributed apps in code.');
    expect(markdown).toMatch(/^# Compose distributed apps in code\./);
    expect(markdown).toContain('## Local OpenTelemetry observability');
    expect(markdown).toContain('Read application logs, distributed traces, and resource health.');
    expect(markdown).toContain('[Build your first app](/get-started/first-app/)');
    expect(markdown).toContain('[Standalone dashboard](/dashboard/standalone/)');
    expect(markdown).toContain('[Set up your agent](/get-started/ai-coding-agents/)');
    expect(markdown).toContain('### Deploy the model');
    expect(markdown).toContain('* `aspire run`\n* 4 resources healthy');
    expect(markdown).toContain(
      '**[Steven Price](https://example.com)** — Software Engineering Manager'
    );
    expect(markdown).toContain('Keep application telemetry private.');
    expect(markdown).not.toMatch(
      /Free and open source|Site navigation|Footer navigation|Inactive builder|Simulated terminal|Animated topology|not content|<HomePage/
    );
  });

  test('preserves both language examples and their original line breaks', async () => {
    const markdown = await renderHomepageMarkdown(homepage());

    expect(markdown).toContain(
      '```typescript\nconst builder = await createBuilder();\nawait builder.build().run();\n```'
    );
    expect(markdown).toContain(
      '```csharp\nvar builder = DistributedApplication.CreateBuilder(args);\nbuilder.Build().Run();\n```'
    );
    expect(markdown).not.toContain('Copy');
  });

  test('uses the rendered locale content and links without inventing English copy', async () => {
    const markdown = await renderHomepageMarkdown(homepage('Lokale apps', '/da'));
    expect(markdown).toContain('# Lokale apps');
    expect(markdown).toContain('(/da/dashboard/standalone/)');
    expect(markdown).not.toContain('Compose distributed apps in code.');
  });

  test('fails explicitly if a redesign removes the required content landmarks', async () => {
    await expect(renderHomepageMarkdown('<main><h1>Aspire</h1></main>')).rejects.toThrow(
      'missing homepage content landmarks'
    );
  });

  test('finalizes every existing homepage companion and retains ordinary Markdown normalization', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'aspire-homepage-markdown-'));
    try {
      await mkdir(path.join(directory, '_astro'));
      for (const locale of Object.keys(locales)) {
        const prefix = locale === 'root' ? '' : `/${locale}`;
        const htmlDirectory = path.join(directory, locale === 'root' ? '' : locale);
        await mkdir(htmlDirectory, { recursive: true });
        await writeFile(path.join(htmlDirectory, 'index.html'), homepage(locale, prefix));
        await writeFile(
          path.join(directory, `${locale === 'root' ? 'index' : locale}.md`),
          '# Aspire\n\n<HomePage />'
        );
      }
      await writeFile(path.join(directory, 'guide.md'), 'Use Aspire %ASPIRE_VERSION%.');

      await aspireVersionPlaceholdersIntegration().hooks['astro:build:done']({
        dir: pathToFileURL(`${directory}${path.sep}`),
      });

      for (const locale of Object.keys(locales)) {
        const markdown = await readFile(
          path.join(directory, `${locale === 'root' ? 'index' : locale}.md`),
          'utf8'
        );
        expect(markdown).toContain(`# ${locale}`);
        expect(markdown).toContain('Read application logs');
        expect(markdown).not.toContain('<HomePage');
        const html = await readFile(
          path.join(directory, locale === 'root' ? '' : locale, 'index.html'),
          'utf8'
        );
        expect(html).toContain('data-apphost-examples="/_astro/apphost-examples.');
        expect(html).not.toContain('Inactive builder variants');
        const examplesPath = html.match(/data-apphost-examples="([^"]+)"/)?.[1];
        expect(examplesPath).toBeTruthy();
        expect(await readFile(path.join(directory, examplesPath!), 'utf8')).toContain(
          'Inactive builder variants'
        );
      }
      expect(await readFile(path.join(directory, 'guide.md'), 'utf8')).toBe(
        `Use Aspire ${currentAspireVersion}.`
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
