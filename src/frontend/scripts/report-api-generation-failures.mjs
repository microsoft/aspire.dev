import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const title = 'Integration Data Updater: API generation failures';

export function reportApiGenerationFailures(failures, runUrl, gh = runGh) {
  const issues = JSON.parse(
    gh([
      'issue',
      'list',
      '--state',
      'all',
      '--search',
      `"${title}" in:title`,
      '--json',
      'number,title,state,body',
      '--limit',
      '100',
    ])
  ).filter((issue) => issue.title === title);
  const existing = issues.find((issue) => issue.state === 'OPEN') ?? issues[0];

  if (!failures.trim()) {
    if (existing?.state === 'OPEN') {
      gh([
        'issue',
        'close',
        String(existing.number),
        '--comment',
        `All packages passed API generation in ${runUrl}.`,
      ]);
    }
    return;
  }

  const normalized = failures.trim().split(/\r?\n/).sort().join('\n');
  const marker = `<!-- failures:${createHash('sha256').update(normalized).digest('hex')} -->`;
  const body = [
    marker,
    `API generation failures observed in [this updater run](${runUrl}).`,
    'Successful packages can still update. Failed packages retain their last-good API data when available. A later validation or infrastructure failure can still block publication.',
    `\`\`\`text\n${normalized}\n\`\`\``,
    'This issue is reused when failures recur and closes only after a complete generation pass succeeds.',
  ].join('\n\n');

  if (!existing) {
    gh(['issue', 'create', '--title', title, '--body', body]);
    return;
  }
  if (existing.state !== 'OPEN') {
    gh(['issue', 'reopen', String(existing.number)]);
  } else if (existing.body.includes(marker)) {
    return;
  }
  gh(['issue', 'edit', String(existing.number), '--body', body]);
  // Keep the actual diagnostics in the history, not just a link to expiring logs.
  gh(['issue', 'comment', String(existing.number), '--body', body]);
}

function runGh(args) {
  return execFileSync('gh', args, { encoding: 'utf8' });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  reportApiGenerationFailures(process.env.FAILURES ?? '', process.env.RUN_URL);
}
