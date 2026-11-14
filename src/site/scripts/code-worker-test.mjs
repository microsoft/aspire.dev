#!/usr/bin/env node
// Drives scripts/code-worker.mjs over a pipe as Douze does (protocol 1) with a hand-written page in the markup of
// Douze's `markdown` step, prints the rendered HTML, the worker's logs and the timings, and checks the result.
//
//   node scripts/code-worker-test.mjs [--cache <folder>] [--quiet]
//
// Requests: the page (cold: twoslash compiles its first program), the same page again (served by the per-fence
// cache), and a page with another twoslash fence (warm TypeScript). Without --cache, the cache is a new temporary
// folder, removed at the end. --quiet prints the timings and checks only.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const siteRoot = resolve(here, '..');
const args = process.argv.slice(2);
const quiet = args.includes('--quiet');
const cacheArg = args.includes('--cache') ? args[args.indexOf('--cache') + 1] : undefined;
const cacheDir = cacheArg ? resolve(cacheArg) : mkdtempSync(join(tmpdir(), 'code-worker-cache-'));

// The markup of Douze's markdown step (Douze/Markdown/CodeFenceRenderer.cs): escaped code, every line ending with a
// newline, `data-meta` only when the fence has a meta, `<pre><code>` without a language, `<pre class="mermaid">`.
const page = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Code worker test</title></head>
<body><main>
<h1>Code worker test</h1>
<p>A C# fence with a title and marked lines:</p>
<pre data-lang="csharp" data-meta="title=&quot;Program.cs&quot; {1-2}"><code class="language-csharp">var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();

app.MapGet(&quot;/&quot;, () =&gt; &quot;Hello &lt;World&gt; &amp; friends&quot;);
app.Run();
</code></pre>
<p>A twoslash fence using the Aspire SDK types:</p>
<pre data-lang="typescript" data-meta="title=&quot;apphost.mts&quot; twoslash"><code class="language-typescript">import { createBuilder } from './.aspire/modules/aspire.mjs';

const builder = await createBuilder();

const redis = await builder.addRedis('cache');
await redis.withContainerNetworkAlias('redis-primary');
</code></pre>
<p>A terminal:</p>
<pre data-lang="bash" data-meta="frame=&quot;terminal&quot;"><code class="language-bash">aspire new aspire-starter --name MyApp
cd MyApp &amp;&amp; aspire run
</code></pre>
<pre class="mermaid">graph TD
    A[AppHost] --&gt; B[Redis]
</pre>
<p>A fence without a language:</p>
<pre><code>Plain text, &lt;not&gt; highlighted.
</code></pre>
<p>An unknown language:</p>
<pre data-lang="notalanguage"><code class="language-notalanguage">left as it is
</code></pre>
</main></body></html>
`;

const page2 = `<main><pre data-lang="ts" data-meta="twoslash"><code class="language-ts">import { createBuilder } from './.aspire/modules/aspire.mjs';

const builder = await createBuilder();
const postgres = await builder.addPostgres('postgres');
const db = await postgres.addDatabase('db');
</code></pre></main>
`;

const worker = spawn(process.execPath, [join(here, 'code-worker.mjs')], { cwd: siteRoot, stdio: ['pipe', 'pipe', 'pipe'] });
let stderr = '';
worker.stderr.on('data', (chunk) => (stderr += chunk));
let shuttingDown = false;
worker.on('exit', (code) => {
  if (!shuttingDown) fail(`the worker exited with code ${code} before shutdown`);
});

const send = (message) => worker.stdin.write(JSON.stringify(message) + '\n');
const logs = [];
const waiters = new Map();
const started = performance.now();
let readyAt;

createInterface({ input: worker.stdout }).on('line', (line) => {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    fail(`not JSON on stdout: ${line}`);
  }
  if (message.type === 'log') logs.push(message);
  else if (message.type === 'ready') waiters.get('ready')?.(message);
  else if (message.type === 'result' || message.type === 'error') waiters.get(message.id)?.(message);
});

function waitFor(id) {
  return new Promise((resolvePromise) => waiters.set(id, resolvePromise));
}

function fail(message) {
  console.error(`FAIL: ${message}`);
  if (stderr) console.error(`worker stderr:\n${stderr}`);
  worker.kill();
  process.exit(1);
}

async function request(id, path, content) {
  const t0 = performance.now();
  const answer = waitFor(id);
  send({ type: 'file', id, path, contentType: 'text/html', encoding: 'utf8', content, metadata: { lang: 'en' } });
  const message = await answer;
  if (message.type === 'error') fail(`${path}: ${message.message}`);
  return { html: message.files[0].content, ms: performance.now() - t0, file: message.files[0] };
}

const ready = waitFor('ready');
send({ type: 'hello', protocol: 1, step: 'code', concurrency: 8, options: { cache: cacheDir }, site: join(siteRoot, '_site'), source: siteRoot });
const readyMessage = await ready;
readyAt = performance.now() - started;

const cold = await request('1', '/docs/test/index.html', page);
const cached = await request('2', '/docs/test/index.html', page);
const warm = await request('3', '/docs/test2/index.html', page2);

const exited = new Promise((resolvePromise) => worker.on('exit', resolvePromise));
shuttingDown = true;
send({ type: 'shutdown' });
worker.stdin.end();
const code = await exited;

if (!quiet) {
  console.log('==== rendered page ====');
  console.log(cold.html);
}
console.log('==== worker logs ====');
for (const entry of logs) console.log(`[${entry.level}] ${entry.message}`);
console.log('==== timings ====');
console.log(`ready (handshake, engine loaded): ${readyAt.toFixed(0)} ms, concurrency ${readyMessage.concurrency}`);
console.log(`page, cold (4 fences rendered, 1 twoslash: the first TypeScript program): ${cold.ms.toFixed(0)} ms`);
console.log(`same page, per-fence cache: ${cached.ms.toFixed(0)} ms`);
console.log(`another twoslash fence, warm TypeScript: ${warm.ms.toFixed(0)} ms`);

// Checks.
const html = cold.html;
const checks = [
  ['the worker exits with 0', code === 0],
  ['nothing on stderr', stderr === ''],
  ['the result keeps the path', cold.file.path === undefined || cold.file.path === '/docs/test/index.html'],
  ['four rendered fences (C#, TS, bash, plain text)', (html.match(/<figure class="frame[^"]*not-content"/g) ?? []).length === 4],
  ['the C# title', html.includes('Program.cs</span>')],
  ['the C# file icon', html.includes('code-block-icon')],
  ['marked lines 1 and 2', (html.match(/class="ec-line highlight mark"/g) ?? []).length === 2],
  ['decoded then re-escaped code', html.includes('Hello') && html.includes('&#x26;') && !html.includes('&amp;amp;')],
  ['the twoslash hover', html.includes('twoslash-hover')],
  ['an Aspire SDK type in a hover', /addRedis/.test(html) && /RedisResource/.test(html)],
  ['the terminal frame', html.includes('is-terminal')],
  ['the mermaid block unchanged', html.includes('<pre class="mermaid">graph TD\n    A[AppHost] --&gt; B[Redis]\n</pre>')],
  ['the plain text fence rendered', html.includes('data-language="plaintext"')],
  ['the unknown language left as it is', html.includes('<pre data-lang="notalanguage"><code class="language-notalanguage">left as it is\n</code></pre>')],
  ['a warning for the unknown language', logs.some((l) => l.level === 'warn' && l.message.includes('notalanguage'))],
  ['the not-content class', html.includes('frame has-title not-content')],
  ['the cached page is identical', cached.html === cold.html],
  ['the second twoslash fence rendered', warm.html.includes('twoslash-hover') && warm.html.includes('addDatabase')],
];
console.log('==== checks ====');
let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`);
  if (!ok) failed++;
}
if (!cacheArg) rmSync(cacheDir, { recursive: true, force: true });
if (stderr) console.log(`worker stderr:\n${stderr}`);
process.exit(failed ? 1 : 0);
