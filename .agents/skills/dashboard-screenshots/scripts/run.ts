// One-shot orchestrator: bun scripts/run.ts [--branch release/17.0] [--only <substr>] [--inventory] [--verify] [--keep]
import { existsSync, mkdirSync, cpSync, readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import sharp from "sharp";

const args = process.argv.slice(2);
const opt = (n: string, d?: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? (args[i + 1]?.startsWith("--") || i + 1 >= args.length ? "true" : args[i + 1]) : d; };
const branch = opt("branch", "main")!;
const only = opt("only");
const skillDir = resolve(import.meta.dir, "..");
const repoRoot = resolve(skillDir, "..", "..", "..");
const assets = join(repoRoot, "src/frontend/src/assets/dashboard");
const work = join(tmpdir(), "aspire-dashboard-shots");
const clone = join(work, "aspire");
const scratch = join(work, "w");
const port = 17170;
const manifest = JSON.parse(readFileSync(join(skillDir, "shots.json"), "utf8"));
const log = (m: string) => console.log(`[dashboard-shots] ${m}`);
const sh = (cmd: string[], o: { cwd?: string; env?: Record<string, string>; quiet?: boolean } = {}) => {
  const r = Bun.spawnSync(cmd, { cwd: o.cwd, env: { ...process.env, ...o.env }, stdout: "pipe", stderr: "pipe" });
  return { ok: r.exitCode === 0, out: r.stdout.toString() + r.stderr.toString() };
};
// playwright-cli is a .cmd shim on Windows, which rejects code strings containing cmd special characters; run its node entry directly.
const pwEntry = (() => {
  const root = sh(["npm", "root", "-g"]).out.trim();
  const js = join(root, "@playwright", "cli", "playwright-cli.js");
  return existsSync(js) ? js : undefined;
})();
const pw = (session: string, ...a: string[]) => pwEntry ? sh(["node", pwEntry, `-s=${session}`, ...a]) : sh(["playwright-cli", `-s=${session}`, ...a]);

async function inventory() {
  const rows: string[] = ["file,width,height"];
  const walk = (d: string) => readdirSync(d).forEach((f) => {
    const p = join(d, f);
    if (statSync(p).isDirectory()) return walk(p);
    return rows.push(`${p.slice(assets.length + 1)}`);
  });
  walk(assets);
  const out: string[] = [];
  for (const r of rows.slice(1)) {
    if (!/\.(png|jpg|webp)$/i.test(r)) { out.push(`${r},,`); continue; }
    const m = await sharp(join(assets, r)).metadata();
    out.push(`${r},${m.width},${m.height}`);
  }
  mkdirSync(scratch, { recursive: true });
  writeFileSync(join(scratch, "inventory.csv"), ["file,width,height", ...out].join("\n"));
  log(`inventory: ${out.length} files -> ${join(scratch, "inventory.csv")}`);
}

function preflight() {
  for (const t of ["git", "playwright-cli"]) if (!sh([process.platform === "win32" ? "where" : "which", t]).ok) throw new Error(`missing tool: ${t}`);
}

function dotnetEnv() {
  const dn = join(clone, ".dotnet");
  return { PATH: `${dn}${process.platform === "win32" ? ";" : ":"}${process.env.PATH}`, DOTNET_ROOT: dn, DOTNET_MULTILEVEL_LOOKUP: "0", DOTNET_NOLOGO: "1" };
}

function setup() {
  mkdirSync(work, { recursive: true });
  if (!existsSync(clone)) {
    log(`cloning microsoft/aspire@${branch}`);
    if (!sh(["git", "clone", "--depth", "1", "--branch", branch, "https://github.com/microsoft/aspire.git", clone]).ok) throw new Error("clone failed");
  } else {
    // The clone is cached between runs; always move it to the tip of the requested branch.
    log(`refreshing cached clone to origin/${branch}`);
    if (!sh(["git", "fetch", "--depth", "1", "origin", branch], { cwd: clone }).ok) throw new Error(`fetch of ${branch} failed`);
    if (!sh(["git", "checkout", "--force", "FETCH_HEAD"], { cwd: clone }).ok) throw new Error(`checkout of ${branch} failed`);
  }
  const restore = process.platform === "win32" ? ["cmd", "/c", "restore.cmd"] : ["bash", "./restore.sh"];
  if (!existsSync(join(clone, ".dotnet"))) { log("restoring SDK (slow)"); if (!sh(restore, { cwd: clone }).ok) throw new Error("restore failed"); }
  const dest = join(clone, "playground", "DashboardShots");
  cpSync(join(skillDir, "demo"), dest, { recursive: true });
  const dotnet = join(clone, ".dotnet", process.platform === "win32" ? "dotnet.exe" : "dotnet");
  log("building demo AppHost");
  const b = sh([dotnet, "build", join(dest, "AspireApp.AppHost")], { cwd: dest, env: dotnetEnv() });
  if (!b.ok) throw new Error("demo build failed:\n" + b.out.slice(-2000));
  return { dotnet, dest };
}

function startApp(dotnet: string, dest: string) {
  const win = process.platform === "win32";
  const dllPath = win
    ? sh(["powershell", "-NoProfile", "-Command", `(Get-ChildItem -Recurse '${clone}\\artifacts\\bin\\AspireApp.AppHost' -Filter AspireApp.AppHost.dll | select -First 1).FullName`]).out.trim()
    : sh(["bash", "-c", `find ${clone}/artifacts/bin/AspireApp.AppHost -name AspireApp.AppHost.dll | head -1`]).out.trim();
  if (!dllPath) throw new Error("AspireApp.AppHost.dll not found after build");
  log(`starting AppHost on :${port}`);
  return Bun.spawn([dotnet, dllPath], {
    cwd: join(dest, "AspireApp.AppHost"), stdout: "ignore", stderr: "ignore",
    env: { ...process.env, ...dotnetEnv(), ASPNETCORE_ENVIRONMENT: "Development", DOTNET_ENVIRONMENT: "Development", ASPNETCORE_URLS: `http://localhost:${port}`, ASPIRE_ALLOW_UNSECURED_TRANSPORT: "true", ASPIRE_DASHBOARD_OTLP_ENDPOINT_URL: "http://localhost:17171", ASPIRE_RESOURCE_SERVICE_ENDPOINT_URL: "http://localhost:17172", ASPIRE_DASHBOARD_UNSECURED_ALLOW_ANONYMOUS: "true" },
  });
}

async function waitReady() {
  const until = Date.now() + 180_000;
  let up = false;
  while (Date.now() < until && !up) {
    try { up = (await fetch(`http://localhost:${port}/`)).ok; } catch {}
    if (!up) await Bun.sleep(2000);
  }
  if (!up) throw new Error(`dashboard did not respond on :${port} within 180s`);
  log("dashboard up; letting telemetry accumulate (60s)");
  await Bun.sleep(60_000);
}

const q = (s: string) => JSON.stringify(s);

// Clears everything that is not the subject of a shot: top message bars (update, unsecured endpoint,
// feedback), toasts, and open popups. Runs after navigation and after every step unless a shot sets keepAlerts.
const DISMISS_JS = `const dismiss=async(move=true)=>{
  for(let i=0;i<10;i++){
    const bar=page.locator('.dashboard-message-bar-dismiss, .dashboard-message-bar [aria-label*="Dismiss" i]').first();
    const toast=page.locator('fluent-toast [aria-label*="Dismiss" i], fluent-toast [aria-label*="Close" i], .fluent-toast-provider button[aria-label*="Close" i]').first();
    let hit=false;
    for(const t of [bar,toast]){ if(await t.count()){ await t.click({timeout:1500}).catch(()=>{}); hit=true; await page.waitForTimeout(250);} }
    if(!hit)break;
  }
  if(move) await page.mouse.move(0,0);
};`;
function shotCode(shot: any, theme: "dark" | "light", file: string) {
  const pad = manifest.padding;
  const clear = shot.keepAlerts ? "" : "await dismiss();";
  const keepMouse = shot.keepAlerts ? "" : "await dismiss(false);";
  const steps = (shot.steps ?? []).map((s: any) =>
    (s.click ? `await page.getByText(${q(s.click)}).first().click();` :
    s.closeDialog ? `await page.getByRole("button",{name:"Close",exact:true}).last().click();` :
    s.clickSel ? `await page.locator(${q(s.clickSel)}).first().click();` :
    s.hover ? `await page.getByText(${q(s.hover)}).first().hover();` :
    s.hoverSel ? `await page.locator(${q(s.hoverSel)}).first().hover();` :
    s.fill ? `await page.locator(${q(s.fill[0])}).first().fill(${q(s.fill[1])});` :
    s.press ? `await page.keyboard.press(${q(s.press)});` :
    s.js ? `${s.js};` :
    s.wait ? `await page.waitForTimeout(${s.wait});` : "") + (s.wait ? "" : keepMouse)).join("").replaceAll("{{Theme}}", theme === "dark" ? "Dark" : "Light");
  const callouts = (shot.callouts ?? []).map((c: string) => `{const e=page.locator(${q(c)}).first(); const b=await e.boundingBox(); if(b) await page.evaluate(b=>{const d=document.createElement('div');d.style.cssText='position:fixed;z-index:99999;pointer-events:none;border:3px solid #e8212e;left:'+(b.x-3)+'px;top:'+(b.y-3)+'px;width:'+(b.width+6)+'px;height:'+(b.height+6)+'px';document.body.appendChild(d);},b);}`).join("");
  const shoot = shot.clip
    ? `const e=page.locator(${q(shot.clip)}).first(); const b=await e.boundingBox(); await page.screenshot({path:${q(file)},clip:{x:Math.max(0,b.x-${pad}),y:Math.max(0,b.y-${pad}),width:Math.min(${manifest.viewport.width},b.width+${pad * 2}),height:Math.min(${manifest.viewport.height},b.height+${pad * 2})}});`
    : `await page.screenshot({path:${q(file)}});`;
  return `async page => { ${DISMISS_JS} await page.setViewportSize({width:${manifest.viewport.width},height:${shot.height ?? manifest.viewport.height}}); await page.emulateMedia({colorScheme:${q(theme)}}); await page.evaluate(()=>localStorage.clear()); await page.goto('http://localhost:${port}/${shot.route}'); await page.waitForTimeout(3500); ${clear} await page.waitForTimeout(500); ${steps} ${callouts} ${shoot} return 'ok'; }`.replace(/\r?\n/g, " ");
}

// Crops trailing blank page area (keeping padding) so sparse pages like Resources do not ship as half-empty images.
async function autoCrop(file: string): Promise<Buffer> {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const s = manifest.viewport.deviceScaleFactor;
  const footer = 100 * s / 2; // fixed status bar at the bottom of every page
  const limit = info.height - footer;
  const at = (x: number, y: number) => (y * info.width + x) * 3;
  const bg = at(8, limit - 8);
  let last = 0;
  for (let y = limit - 1; y > 0 && !last; y--)
    for (let x = 0; x < info.width; x += 2) {
      const i = at(x, y);
      if (Math.abs(data[i] - data[bg]) + Math.abs(data[i + 1] - data[bg + 1]) + Math.abs(data[i + 2] - data[bg + 2]) > 24) { last = y; break; }
    }
  const height = Math.min(info.height, Math.max(Math.round(info.height * 0.5), last + manifest.padding * s * 2));
  return sharp(file).extract({ left: 0, top: 0, width: info.width, height }).png({ compressionLevel: 9 }).toBuffer();
}

async function capture() {
  mkdirSync(scratch, { recursive: true });
  const cfg = join(scratch, "cfg.json");
  writeFileSync(cfg, JSON.stringify({ browser: { contextOptions: { viewport: { width: manifest.viewport.width, height: manifest.viewport.height }, deviceScaleFactor: manifest.viewport.deviceScaleFactor } } }));
  pw("shots", "close"); pw("shots", "open", `http://localhost:${port}`, "--browser=msedge", `--config=${cfg}`);
  if (!o.ok) o = pw("shots", "open", `http://localhost:${port}`, `--config=${cfg}`);
  const failed: string[] = [];
  const done: string[] = [];
  for (const shot of manifest.shots.filter((s: any) => !only || only.split(",").some((o: string) => s.id.includes(o)))) {
    for (const theme of ["dark", "light"] as const) {
      const base = join(scratch, `${shot.id}-${theme}`);
      let tmp = "";
      let ok = false;
      for (let attempt = 0; attempt < 2 && !ok; attempt++) {
        tmp = `${base}-${Date.now()}-${attempt}.png`;
        const r = pw("shots", "run-code", shotCode(shot, theme, tmp.replace(/\\/g, "/")));
        ok = r.ok && existsSync(tmp) && !/### Error/.test(r.out);
      }
      if (!ok) { failed.push(`${shot.id}/${theme}`); continue; }
      const dest = join(assets, shot.out[theme]);
      mkdirSync(dirname(dest), { recursive: true });
      const buf = shot.clip || shot.autoCrop !== true ? await sharp(tmp).png({ compressionLevel: 9 }).toBuffer() : await autoCrop(tmp);
      await sharp(buf).toFile(dest);
      done.push(shot.out[theme]);
      // Extra file names that docs reference for the same capture (e.g. legacy "-dark" duplicates).
      for (const extra of shot.also?.[theme] ?? []) { await sharp(buf).toFile(join(assets, extra)); done.push(extra); }
      // Reduced-size copy for thumbnails.
      if (shot.thumb?.[theme]) { await sharp(buf).resize({ width: shot.thumb.width }).png({ compressionLevel: 9 }).toFile(join(assets, shot.thumb[theme])); done.push(shot.thumb[theme]); }
    }
  }
  if (!opt("keep")) pw("shots", "close");
  return { done, failed };
}

// Theme contract: every shot is captured once per theme (dark = base name or "-dark", light = "-light"),
// and docs must reference both through <ThemeImage dark light alt /> so the right one shows per site theme.
function checkThemePairs(): string[] {
  const issues: string[] = [];
  const docs = join(repoRoot, "src/frontend/src");
  const text: { file: string; body: string }[] = [];
  const walk = (d: string) => readdirSync(d).forEach((f) => {
    const p = join(d, f);
    if (statSync(p).isDirectory()) return f === "node_modules" || f === "assets" ? undefined : walk(p);
    if (/\.(mdx|astro)$/.test(f)) text.push({ file: p, body: readFileSync(p, "utf8") });
  });
  walk(docs);
  for (const s of manifest.shots) {
    const { dark, light } = s.out;
    const expected = dark.replace(/-dark(\.png)$/, "$1").replace(/\.png$/, "-light.png");
    if (light !== expected && !s.legacyLight) issues.push(`${s.id}: light "${light}" should be "${expected}"`);
    for (const f of [dark, light]) if (!existsSync(join(assets, f))) issues.push(`${s.id}: missing ${f}`);
    const darks = [dark, ...(s.also?.dark ?? [])];
    const refs = text.filter((t) => darks.some((d) => t.body.includes(`/${d}`)) || t.body.includes(`/${light}`));
    for (const r of refs) {
      const both = darks.some((d) => r.body.includes(`/${d}`)) && r.body.includes(`/${light}`);
      const themed = r.body.includes("ThemeImage") || r.body.includes("theme-image") || r.body.includes("darkImage");
      if (!both) issues.push(`${s.id}: ${r.file.slice(repoRoot.length + 1)} references only one theme`);
      else if (!themed) issues.push(`${s.id}: ${r.file.slice(repoRoot.length + 1)} should use <ThemeImage dark light alt>`);
    }
  }
  return issues;
}

async function verify(done: string[]) {
  const issues: string[] = checkThemePairs();
  for (const f of done) {
    const { data, info } = await sharp(join(assets, f)).raw().toBuffer({ resolveWithObject: true });
    if (info.width < 1000) issues.push(`${f}: narrow ${info.width}px`);
    // fraction of pixels equal to the dominant background colour in the bottom third
    let same = 0, total = 0;
    const ref = data.subarray(((info.height - 1) * info.width + Math.floor(info.width / 2)) * info.channels, ((info.height - 1) * info.width + Math.floor(info.width / 2)) * info.channels + 3);
    for (let y = Math.floor(info.height * 0.6); y < info.height; y += 4)
      for (let x = 0; x < info.width; x += 4) { const i = (y * info.width + x) * info.channels; total++; if (Math.abs(data[i] - ref[0]) + Math.abs(data[i + 1] - ref[1]) + Math.abs(data[i + 2] - ref[2]) < 6) same++; }
    if (same / total > 0.9) issues.push(`${f}: bottom 40% is ${(100 * same / total).toFixed(0)}% blank - consider clip`);
  }
  return issues;
}

async function main() {
  if (opt("inventory")) return inventory();
  preflight();
  await inventory();
  if (opt("attach")) {
    const { done, failed } = await capture();
    const issues = await verify(done);
    return log(`attached: captured ${done.length}, failed ${failed.length} ${failed.join(" ")}\n${issues.join("\n")}`);
  }
  const { dotnet, dest } = setup();
  const app = startApp(dotnet, dest);
  try {
    await waitReady();
    const { done, failed } = await capture();
    const issues = await verify(done);
    const report = [`captured: ${done.length}`, `failed: ${failed.length}`, ...failed.map((f) => `  FAIL ${f}`), `issues: ${issues.length}`, ...issues.map((i) => `  WARN ${i}`)].join("\n");
    writeFileSync(join(scratch, "report.md"), report);
    log("\n" + report);
  } finally {
    if (!opt("keep")) {
      sh(process.platform === "win32" ? ["taskkill", "/PID", String(app.pid), "/T", "/F"] : ["kill", String(app.pid)]);
      // Child resources can outlive the AppHost; stop anything still running from the clone's build output.
      if (process.platform === "win32") sh(["powershell", "-NoProfile", "-Command", `Get-Process | ? { $_.Path -like '${clone}\\artifacts\\*' } | Stop-Process -Force`]);
    }
  }
}
main();
