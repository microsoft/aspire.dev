// douze-worker.mjs: helper for Douze worker steps (protocol 1). Print it with `douze worker-helper > douze-worker.mjs`.
//
//   import { serve } from './douze-worker.mjs';
//   serve(async (file, ctx) => ({ content: transform(file.content) }), { concurrency: 4, name: 'my-worker' });
//
// The handler receives the file { path, contentType, metadata, content } (content is a string for text, a Buffer
// otherwise) and ctx { step, options, site, source, log(message, level = 'info') }. It returns:
//   - null or undefined: the file is dropped,
//   - a string or a Buffer: the new content,
//   - an object { content?, path?, contentType?, metadata? }: what is omitted keeps the input's value, and metadata is
//     merged over the input's,
//   - an array of those: several files.
// A thrown error fails this file only; an error with `line` and `column` properties gives Douze a position.
import { createInterface } from 'node:readline';

export function serve(handler, { concurrency = 1, name = 'worker' } = {}) {
  const out = (msg) => process.stdout.write(JSON.stringify(msg) + '\n');
  const pending = new Set();
  let ctx = {};

  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });

  rl.on('line', (line) => {
    let msg;
    try { msg = JSON.parse(line); } catch { return; }

    switch (msg.type) {
      case 'hello':
        ctx = {
          step: msg.step, options: msg.options ?? {}, site: msg.site, source: msg.source,
          log: (message, level = 'info') => out({ type: 'log', level, message: String(message) }),
        };
        out({ type: 'ready', protocol: 1, concurrency, name });
        break;

      case 'file': {
        const task = handle(msg).finally(() => pending.delete(task));
        pending.add(task);
        break;
      }

      case 'shutdown':
        rl.close();
        break;
    }
  });

  // After 'shutdown', or when Douze closes stdin: answer what is in flight, flush stdout, and exit.
  rl.on('close', async () => {
    await Promise.allSettled([...pending]);
    process.stdout.write('', () => process.exit(0));
  });

  async function handle(msg) {
    const content = msg.encoding === 'base64' ? Buffer.from(msg.content, 'base64') : msg.content;
    try {
      const r = await handler({ path: msg.path, contentType: msg.contentType, metadata: msg.metadata ?? {}, content }, ctx);
      const files = r == null ? [] : Array.isArray(r) ? r : [r];
      out({ type: 'result', id: msg.id, files: files.map(encode) });
    } catch (e) {
      if (e?.stack) out({ type: 'log', level: 'debug', message: `${msg.path}: ${e.stack}` });
      out({ type: 'error', id: msg.id, message: String(e?.message ?? e), file: e?.file ?? msg.path, line: e?.line, column: e?.column });
    }
  }
}

function encode(r) {
  if (typeof r === 'string' || r instanceof Uint8Array) r = { content: r };
  const f = { path: r.path, contentType: r.contentType, metadata: r.metadata };
  if (typeof r.content === 'string') {
    f.encoding = 'utf8';
    f.content = r.content;
  } else if (r.content instanceof Uint8Array) {
    f.encoding = 'base64';
    f.content = Buffer.from(r.content.buffer, r.content.byteOffset, r.content.byteLength).toString('base64');
  } else if (r.content != null) {
    throw new Error('content must be a string or a Buffer');
  }
  return f;
}
