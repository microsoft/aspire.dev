import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import satori from 'satori';

const require = createRequire(import.meta.url);
const brandDirectory = new URL('../public/brand/', import.meta.url);
const icon = svgBody(readFileSync(new URL('aspire-icon-256.svg', brandDirectory), 'utf8'));
const font = readFileSync(
  require.resolve('@fontsource/poppins/files/poppins-latin-600-normal.woff')
);

function svgBody(svg) {
  const match = svg.match(/<svg\b[^>]*>([\s\S]*)<\/svg>\s*$/);
  if (!match) throw new Error('Expected a complete SVG document.');
  return match[1];
}

for (const [tone, color] of [
  ['dark', '#1f1e31'],
  ['light', '#f9f8ff'],
]) {
  for (const layout of ['horizontal', 'vertical']) {
    const lettering = svgBody(
      await satori(
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              width: '100%',
              height: '100%',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'Poppins',
              fontWeight: 600,
              fontSize: layout === 'vertical' ? 72 : 96,
              lineHeight: 1,
              color,
            },
            children: 'Aspire',
          },
        },
        {
          width: 328,
          height: 128,
          embedFont: true,
          fonts: [{ name: 'Poppins', data: font, weight: 600, style: 'normal' }],
        }
      )
    );

    const width = layout === 'horizontal' ? 512 : 400;
    const height = layout === 'horizontal' ? 160 : 320;
    const iconX = layout === 'horizontal' ? 16 : 136;
    const textX = layout === 'horizontal' ? 168 : 36;
    const textY = layout === 'horizontal' ? 16 : 160;
    const file = `aspire-logo-${tone}-${layout}.svg`;
    const svg = [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
      `<title>Aspire ${layout} logo (${tone} lettering)</title>`,
      `<svg x="${iconX}" y="16" width="128" height="128" viewBox="0 0 256 256">${icon}</svg>`,
      `<svg x="${textX}" y="${textY}" width="328" height="128" viewBox="0 0 328 128">${lettering}</svg>`,
      '</svg>\n',
    ].join('');
    if (/<text\b|<image\b|font-family=/.test(svg)) {
      throw new Error(`The ${file} export is not font-independent vector artwork.`);
    }
    writeFileSync(new URL(file, brandDirectory), svg, 'utf8');
    const gitBlob = createHash('sha1')
      .update(`blob ${Buffer.byteLength(svg)}\0`)
      .update(svg)
      .digest('hex');
    console.log(JSON.stringify({ file, width, height, gitBlob }));
  }
}
