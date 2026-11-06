import { expect, test } from 'vitest';
import { summarizeComparison } from '../../scripts/summarize-mermaid-build-comparison.mjs';

test('reports comparable deltas and states benchmark limitations', () => {
  const result = (commit: string, factor: number) => ({
    timing: { totalWallMs: 1000 * factor },
    wallSeconds: 2 * factor,
    peakRssKiB: 1024 * factor,
    output: { commit, totalBytes: 1024 ** 2 * factor },
    files: [
      { path: 'index.html', bytes: 1024 ** 2 * factor },
      { path: '_astro/diagram.js', bytes: 1024 ** 2 / factor },
    ],
  });
  const summary = summarizeComparison(result('base', 1), result('head', 2));
  expect(summary).toContain('Baseline: `base`. Candidate: `head`.');
  expect(summary).toContain('| Build phases (seconds) | 1.00 | 2.00 | 1.00 | 100.0% |');
  expect(summary).toContain('| Build command (seconds) | 2.00 | 4.00 | 2.00 | 100.0% |');
  expect(summary).toContain('| JavaScript output (MiB) | 1.00 | 0.50 | -0.50 | -50.0% |');
  expect(summary).toContain('not a statistically significant benchmark');
  expect(summary).toContain('not measured browser transfer sizes');
});

test('does not report an infinite percentage for an empty baseline', () => {
  const result = {
    timing: { totalWallMs: 0 },
    wallSeconds: 0,
    peakRssKiB: 0,
    output: { commit: 'empty', totalBytes: 0 },
    files: [],
  };
  const summary = summarizeComparison(result, result);
  expect(summary).toContain('| HTML files | 0.00 | 0.00 | 0.00 | N/A |');
  expect(summary).not.toContain('Infinity');
});
