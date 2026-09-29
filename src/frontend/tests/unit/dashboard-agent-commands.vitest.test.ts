import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const docsRoot = path.resolve(testsDir, '..', '..', 'src', 'content', 'docs');

describe('standalone dashboard MCP commands', () => {
  for (const file of [
    'dashboard/standalone.mdx',
    'dashboard/ai-coding-agents.mdx',
    'reference/cli/commands/aspire-agent-mcp.mdx',
  ]) {
    test(`${file} uses an explicit API key instead of a browser login token`, () => {
      const source = readFileSync(path.join(docsRoot, file), 'utf8');
      const commands = [...source.matchAll(/^\s*aspire agent mcp .*--dashboard-url.*$/gm)].map(
        (match) => match[0].trim()
      );

      expect(commands).not.toHaveLength(0);
      for (const command of commands) {
        expect(command).toContain('--dashboard-url "http://localhost:18888"');
        expect(command).toContain('--api-key "<api-key>"');
        expect(command).not.toContain('/login?t=');
      }
    });
  }
});
