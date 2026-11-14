// Starts the web server of a Playwright config detached, with the config's command, working directory and
// environment, so it boots while the E2E shard still downloads the site. Playwright then reuses it
// (`reuseExistingServer: true`).
//
//   node start-web-server.mjs CONFIG LOG
import { spawn } from 'node:child_process';
import { openSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [configPath, logPath] = process.argv.slice(2);
const configFile = path.resolve(configPath);
const { default: config } = await import(pathToFileURL(configFile).href);
const server = config.webServer;
const log = openSync(logPath, 'a');
const child = spawn(server.command, {
  shell: true,
  cwd: server.cwd ?? path.dirname(configFile),
  env: server.env ?? process.env,
  detached: true,
  stdio: ['ignore', log, log],
});
child.unref();
console.log(`Started \`${server.command}\` (pid ${child.pid}); it answers at ${server.url}.`);
