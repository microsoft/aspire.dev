import { createLunaria } from '@lunariajs/core';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const git = promisify(execFile);
let lastCommit;
let cachedStatus;

export async function getStatusFromCache() {
  const { stdout: shallow } = await git('git', ['rev-parse', '--is-shallow-repository']);
  if (shallow.trim() === 'true') {
    console.info('[lunaria] Fetching checkout history for translation status.');
    // Keep HEAD unchanged: the dashboard must reflect this checkout, including PR commits.
    await git('git', ['fetch', '--unshallow', 'origin']);
  }

  const { stdout } = await git('git', ['rev-parse', 'HEAD']);
  const commit = stdout.trim();
  if (commit === lastCommit) return cachedStatus;

  const lunaria = await createLunaria();
  const status = await lunaria.getFullStatus();
  cachedStatus = { config: lunaria.config, status };
  lastCommit = commit;
  return cachedStatus;
}
