import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { presetStarlightIcons } from 'starlight-plugin-icons/uno';
import { createGenerator } from 'unocss';
import { expect, it, vi } from 'vitest';

it('reads icon safelists after integration setup, including on a cold checkout', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'aspire-icons-'));
  const path = join(directory, 'safelist.json');
  vi.stubEnv('SPI_SAFELIST_PATH', path);
  try {
    await writeFile(path, JSON.stringify(['i-starlight-plugin-icons:folder']));
    const coldPreset = presetStarlightIcons();
    await writeFile(path, JSON.stringify(['i-starlight-plugin-icons:folder-open']));
    const cold = await createGenerator({ presets: [coldPreset] });
    const warm = await createGenerator({ presets: [presetStarlightIcons()] });
    const coldOutput = await cold.generate('');
    const warmOutput = await warm.generate('');
    expect(coldOutput.matched.has('i-starlight-plugin-icons:folder-open')).toBe(true);
    expect(coldOutput.matched.has('i-starlight-plugin-icons:folder')).toBe(false);
    expect(coldOutput.css).toBe(warmOutput.css);
  } finally {
    vi.unstubAllEnvs();
    await rm(directory, { recursive: true, force: true });
  }
});
