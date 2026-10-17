import { appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadIncrementalBuildSettings } from '../config/incremental-build.mjs';

const settings = await loadIncrementalBuildSettings(new URL('../', import.meta.url), 'production');
const output = `key=${settings.compatibility}\npath=${fileURLToPath(settings.cacheDir)}\n`;
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, output);
process.stdout.write(output);
