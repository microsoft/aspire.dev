// @ts-check
/**
 * Build phase-timing integration.
 *
 * Hooks every Astro lifecycle event the build pipeline goes through and prints
 * a per-phase wall-time + memory + CPU table at the end. The intent is purely
 * diagnostic — drop the integration into `astro.config.mjs` and read the
 * "[build-timing] summary" block from stdout (or `--logLevel debug`).
 *
 * Phases captured:
 *
 *   astro:config:setup → astro:config:done     // user config + integrations
 *   astro:config:done  → astro:build:setup     // Vite config preparation
 *   astro:build:setup  → astro:build:start     // Rollup/Vite bundle preflight
 *   astro:build:start  → astro:build:generated // page generation (render)
 *   astro:build:generated → astro:build:done   // post-render (link validator,
 *                                                 llms-txt, asset finalize, etc.)
 *
 * The integration also samples process.cpuUsage() and process.memoryUsage() at
 * each event so we can detect main-thread idleness (low user-CPU vs long
 * wall-time on a phase ⇒ that phase is I/O- or wait-bound).
 *
 * Output is emitted to stdout and, when BUILD_TIMING_OUT is set, appended to
 * the named file as a single JSON line (one per build), making it easy to
 * collect multi-run medians for benchmarking.
 */

import { appendFileSync } from 'node:fs';
import os from 'node:os';
import { resolve } from 'node:path';

/**
 * @typedef {Object} PhaseSample
 * @property {string} name
 * @property {number} t
 * @property {{ user: number; system: number }} cpu
 * @property {{ rss: number; heapUsed: number; heapTotal: number; external: number }} mem
 */

const TAG = '[build-timing]';

function nowMs() {
  return performance.now();
}

function snapshotCpu() {
  const c = process.cpuUsage();
  return { user: c.user / 1000, system: c.system / 1000 };
}

function snapshotMem() {
  const m = process.memoryUsage();
  return {
    rss: m.rss,
    heapUsed: m.heapUsed,
    heapTotal: m.heapTotal,
    external: m.external,
  };
}

function fmtMs(ms) {
  if (ms < 1000) return `${ms.toFixed(0)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function fmtMB(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(0)} MB`;
}

/**
 * @returns {import('astro').AstroIntegration}
 */
export default function buildTiming() {
  /** @type {PhaseSample[]} */
  const samples = [];
  /** @type {Record<string, unknown>} */
  const meta = {
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    cpuCount: undefined,
    uvThreadpoolSize: process.env.UV_THREADPOOL_SIZE || '4 (default)',
    nodeOptions: process.env.NODE_OPTIONS || '',
    label: process.env.BUILD_TIMING_LABEL || '',
    pagesGenerated: 0,
    routesTotal: 0,
  };

  function mark(name) {
    samples.push({
      name,
      t: nowMs(),
      cpu: snapshotCpu(),
      mem: snapshotMem(),
    });
  }

  return {
    name: 'build-timing',
    hooks: {
      'astro:config:setup'({ command }) {
        meta.command = command;
        meta.cpuCount = os.availableParallelism?.() ?? os.cpus().length;
        mark('astro:config:setup');
      },
      'astro:config:done'() {
        mark('astro:config:done');
      },
      'astro:build:setup'() {
        mark('astro:build:setup');
      },
      'astro:build:start'() {
        mark('astro:build:start');
      },
      'astro:build:generated'({ dir }) {
        mark('astro:build:generated');
        meta.outDir = dir.pathname;
        // Emit a "partial" report right after page generation so that, even
        // if the post-build asset rearrange step crashes (EBUSY on Windows
        // is common), we still get the headline phase-timing numbers for
        // this run.
        emitReport(samples, meta, 'partial');
      },
      'astro:build:ssr'() {
        mark('astro:build:ssr');
      },
      'astro:build:done'({ pages, routes }) {
        mark('astro:build:done');
        meta.pagesGenerated = pages?.length ?? 0;
        meta.routesTotal = routes?.length ?? 0;
        emitReport(samples, meta, 'final');
      },
    },
  };
}

function emitReport(samples, meta, kind = 'final') {
  if (samples.length < 2) return;

  const t0 = samples[0].t;
  const cpu0 = samples[0].cpu;

  /** @type {Array<{phase: string; wallMs: number; cpuUserMs: number; cpuSysMs: number; cpuPct: number; rssMB: number; heapMB: number}>} */
  const phases = [];

  for (let i = 1; i < samples.length; i++) {
    const prev = samples[i - 1];
    const cur = samples[i];
    const wallMs = cur.t - prev.t;
    const cpuUserMs = cur.cpu.user - prev.cpu.user;
    const cpuSysMs = cur.cpu.system - prev.cpu.system;
    const cpuPct = wallMs > 0 ? ((cpuUserMs + cpuSysMs) / wallMs) * 100 : 0;
    phases.push({
      phase: `${prev.name} → ${cur.name}`,
      wallMs,
      cpuUserMs,
      cpuSysMs,
      cpuPct,
      rssMB: cur.mem.rss / 1024 / 1024,
      heapMB: cur.mem.heapUsed / 1024 / 1024,
    });
  }

  const totalWall = samples[samples.length - 1].t - t0;
  const totalUser = samples[samples.length - 1].cpu.user - cpu0.user;
  const totalSys = samples[samples.length - 1].cpu.system - cpu0.system;
  const totalCpuPct = totalWall > 0 ? ((totalUser + totalSys) / totalWall) * 100 : 0;

  // Pretty stdout block
  console.log(`\n${TAG} ============================================================`);
  console.log(`${TAG} summary  label=${meta.label || '(none)'}  kind=${kind}`);
  console.log(`${TAG}   node=${meta.nodeVersion}  cores=${meta.cpuCount}  UV_THREADPOOL_SIZE=${meta.uvThreadpoolSize}`);
  console.log(`${TAG}   NODE_OPTIONS=${meta.nodeOptions || '(unset)'}`);
  console.log(`${TAG}   pages=${meta.pagesGenerated}  routes=${meta.routesTotal}`);
  console.log(`${TAG}   ${'phase'.padEnd(50)} ${'wall'.padStart(10)} ${'cpu-user'.padStart(10)} ${'cpu-sys'.padStart(9)} ${'cpu%'.padStart(6)} ${'rss'.padStart(8)} ${'heap'.padStart(8)}`);
  for (const p of phases) {
    console.log(
      `${TAG}   ${p.phase.padEnd(50)} ${fmtMs(p.wallMs).padStart(10)} ${fmtMs(p.cpuUserMs).padStart(10)} ${fmtMs(p.cpuSysMs).padStart(9)} ${p.cpuPct.toFixed(0).padStart(5)}% ${fmtMB(p.rssMB * 1024 * 1024).padStart(8)} ${fmtMB(p.heapMB * 1024 * 1024).padStart(8)}`
    );
  }
  console.log(`${TAG}   ${'TOTAL'.padEnd(50)} ${fmtMs(totalWall).padStart(10)} ${fmtMs(totalUser).padStart(10)} ${fmtMs(totalSys).padStart(9)} ${totalCpuPct.toFixed(0).padStart(5)}%`);
  console.log(`${TAG} ============================================================\n`);

  // JSONL output for downstream processing
  const out = process.env.BUILD_TIMING_OUT;
  if (out) {
    try {
      const line = JSON.stringify({
        ts: new Date().toISOString(),
        kind,
        meta,
        phases,
        totalWallMs: totalWall,
        totalCpuUserMs: totalUser,
        totalCpuSysMs: totalSys,
        totalCpuPct,
      });
      appendFileSync(resolve(out), line + '\n');
    } catch (err) {
      console.warn(`${TAG} failed to append JSONL: ${err.message}`);
    }
  }
}
