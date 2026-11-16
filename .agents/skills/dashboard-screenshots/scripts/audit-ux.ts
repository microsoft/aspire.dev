// Walks a running dashboard (default http://localhost:17170) and records its UX surface: main tabs, header dialogs
// (Help, Settings, ...), every tab inside each dialog, and visible headings/controls. The output (ux-audit.json and
// ux-audit.md in the work dir) is diffed against the docs so new UX gets screenshots and stale prose gets fixed.
// Usage: bun scripts/audit-ux.ts [--url http://localhost:17170] [--out <dir>]
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const arg = (n: string, d: string) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const url = arg("url", "http://localhost:17170");
const out = arg("out", join(tmpdir(), "aspire-dashboard-shots", "w"));
mkdirSync(out, { recursive: true });

const sh = (cmd: string[]) => { const r = Bun.spawnSync(cmd, { stdout: "pipe", stderr: "pipe" }); return r.stdout.toString() + r.stderr.toString(); };
const root = sh(["npm", "root", "-g"]).trim();
const entry = join(root, "@playwright", "cli", "playwright-cli.js");
const pw = (...a: string[]) => existsSync(entry) ? sh(["node", entry, "-s=audit", ...a]) : sh(["playwright-cli", "-s=audit", ...a]);

// Reads visible text of the current dialog/page region: tabs, headings, buttons, switches, selects, labels.
const READ = `const read=async()=>page.evaluate(()=>{
  const vis=e=>!!(e.offsetWidth||e.offsetHeight);
  const t=s=>[...document.querySelectorAll(s)].filter(vis).map(e=>(e.getAttribute('aria-label')||e.textContent||'').trim().replace(/\\s+/g,' ')).filter(Boolean);
  const scope=[...document.querySelectorAll('fluent-drawer-body, [role=dialog], fluent-dialog[open]')].filter(vis).pop()||document.body;
  const q=s=>[...scope.querySelectorAll(s)].filter(vis).map(e=>(e.getAttribute('aria-label')||e.textContent||'').trim().replace(/\\s+/g,' ')).filter(Boolean);
  return {tabs:q('[role=tab],fluent-tab'),headings:q('h1,h2,h3,h4,[role=heading]'),buttons:q('button,fluent-button'),switches:q('[role=switch],fluent-switch,fluent-checkbox'),selects:q('select,fluent-select,fluent-combobox'),links:q('a[href]'),lines:(scope.innerText||'').split(/\\n/).map(s=>s.trim()).filter(Boolean)};
});`;

const MAIN = `async page => { ${READ}
const res={mainTabs:[],headerButtons:[],dialogs:{}};
await page.goto(${JSON.stringify(url)},{waitUntil:'networkidle'}).catch(()=>{});
const base=await read(); const sub=(r)=>Object.fromEntries(Object.entries(r).map(([k,v])=>[k,v.filter(x=>!base[k].includes(x))])); res.mainTabs=await page.locator('[role=tab]').allInnerTexts();
res.headerButtons=await page.locator('header button[aria-label], fluent-button[aria-label]').evaluateAll(e=>e.map(x=>x.getAttribute('aria-label')));
for(const name of ['Help','Settings','Recordings']){
  const b=page.getByRole('button',{name:new RegExp('^'+name,'i')}).first();
  if(!await b.count())continue;
  await b.click({timeout:3000}).catch(()=>{});
  await page.waitForTimeout(800);
  const d={base:sub(await read()),tabs:{}};
  const tabs=await page.locator('fluent-drawer-body [role=tab], fluent-drawer-body fluent-tab, [role=dialog] [role=tab], fluent-dialog [role=tab], fluent-dialog fluent-tab').all();
  for(const t of tabs){const n=(await t.innerText()).trim();await t.click().catch(()=>{});await page.waitForTimeout(500);d.tabs[n]=sub(await read());}
  res.dialogs[name]=d;
  await page.keyboard.press('Escape');await page.waitForTimeout(400);
  await page.goto(${JSON.stringify(url)},{waitUntil:'networkidle'}).catch(()=>{});
}
return JSON.stringify(res); }`.replace(/\r?\n/g, " ");

pw("open", url, "--browser=msedge");
const raw = pw("run-code", MAIN);
pw("close");
const line = raw.split(/\r?\n/).find((l) => l.startsWith('"{'));
if (!line) { console.error("audit failed:\n" + raw.slice(-1500)); process.exit(1); }
const data = JSON.parse(JSON.parse(line));
writeFileSync(join(out, "ux-audit.json"), JSON.stringify(data, null, 2));

const md: string[] = ["# Dashboard UX audit", "", `Main tabs: ${data.mainTabs.join(", ")}`, `Header buttons: ${data.headerButtons.join(", ")}`, ""];
for (const [name, d] of Object.entries<any>(data.dialogs)) {
  md.push(`## ${name} dialog`, "", `New text: ${(d.base.lines || []).slice(0, 80).join(" / ") || "(none)"}`, "", `Tabs (${Object.keys(d.tabs).length}): ${Object.keys(d.tabs).join(" | ") || "(none)"}`, "");
  for (const [tab, c] of Object.entries<any>(d.tabs)) md.push(`- **${tab}** text: ${(c.lines || []).slice(0, 60).join(" / ")}`);
  for (const [tab, c] of Object.entries<any>(d.tabs)) md.push(`- **${tab}**: headings [${c.headings.join("; ")}], switches [${c.switches.join("; ")}], selects [${c.selects.join("; ")}], buttons [${c.buttons.join("; ")}]`);
  md.push("");
}
writeFileSync(join(out, "ux-audit.md"), md.join("\n"));
console.log(md.join("\n"));
console.log(`\nWrote ${join(out, "ux-audit.json")} and ux-audit.md`);
