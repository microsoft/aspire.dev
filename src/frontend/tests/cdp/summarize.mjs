// Prototype: summarizes a Playwright JSON report (PLAYWRIGHT_JSON_OUTPUT_NAME) as one row per spec file, so the
// runs against each browser can be compared. Usage: node tests/cdp/summarize.mjs <report.json> <label>
// Prints Markdown and writes <report>.summary.json next to the report.
import { readFileSync, writeFileSync } from 'node:fs';

const [reportPath, label = 'run'] = process.argv.slice(2);
const report = JSON.parse(readFileSync(reportPath, 'utf8'));

const files = new Map();
const visit = (suite, file) => {
  const name = suite.file ?? file;
  for (const spec of suite.specs ?? []) {
    for (const test of spec.tests ?? []) {
      const row = files.get(name) ?? { passed: 0, failed: 0, skipped: 0, flaky: 0, ms: 0, errors: new Map() };
      const status = test.status === 'expected' ? 'passed' : test.status === 'unexpected' ? 'failed' : test.status;
      row[status] = (row[status] ?? 0) + 1;
      for (const result of test.results ?? []) {
        row.ms += result.duration ?? 0;
        const message = result.error?.message?.split('\n').find((line) => line.trim())?.replace(/\u001b\[[0-9;]*m/g, '').slice(0, 140);
        if (message && status === 'failed') row.errors.set(message, (row.errors.get(message) ?? 0) + 1);
      }
      files.set(name, row);
    }
  }
  for (const child of suite.suites ?? []) visit(child, name);
};
for (const suite of report.suites ?? []) visit(suite);

const total = { passed: 0, failed: 0, skipped: 0, flaky: 0, ms: 0 };
const lines = [`### ${label}`, '', '| Spec | Passed | Failed | Skipped | Test time (s) |', '| --- | ---: | ---: | ---: | ---: |'];
for (const [name, row] of [...files].sort()) {
  for (const key of Object.keys(total)) total[key] += row[key] ?? 0;
  lines.push(`| ${name} | ${row.passed + row.flaky} | ${row.failed} | ${row.skipped} | ${(row.ms / 1000).toFixed(1)} |`);
}
lines.push(`| **Total** | **${total.passed + total.flaky}** | **${total.failed}** | **${total.skipped}** | **${(total.ms / 1000).toFixed(1)}** |`);
lines.push('', `Wall time of the run: ${(report.stats.duration / 1000).toFixed(1)} s.`, '');

const errors = new Map();
for (const row of files.values()) for (const [message, count] of row.errors) errors.set(message, (errors.get(message) ?? 0) + count);
if (errors.size) {
  lines.push('<details><summary>Most frequent first error lines</summary>', '');
  for (const [message, count] of [...errors].sort((a, b) => b[1] - a[1]).slice(0, 12)) lines.push(`- ${count} × \`${message.replace(/`/g, "'")}\``);
  lines.push('', '</details>', '');
}

console.log(lines.join('\n'));
writeFileSync(`${reportPath}.summary.json`, JSON.stringify({ label, wallMs: report.stats.duration, total, files: Object.fromEntries([...files].map(([k, v]) => [k, { ...v, errors: Object.fromEntries(v.errors) }])) }, null, 2));
