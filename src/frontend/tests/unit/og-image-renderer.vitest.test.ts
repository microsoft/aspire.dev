import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { renderOgImagePng, type RenderOgImageInput } from '@utils/og-image-renderer';

describe('Open Graph image rendering', () => {
  it('renders per-card facts without leaking them into the cached base layer', async () => {
    const input: RenderOgImageInput = {
      title: 'Aspire integration',
      topic: {
        id: 'integrations',
        label: 'Integrations',
        iconName: 'puzzle',
        iconSvg: '<path d="M0 0h24v24H0z"/>',
      },
    };

    const plain = await renderOgImagePng(input);
    const withDetails = await renderOgImagePng({
      ...input,
      details: [{ label: 'Version', value: '17.0' }],
    });
    const otherDetails = await renderOgImagePng({
      ...input,
      details: [{ label: 'Version', value: '18.0' }],
    });
    const plainAgain = await renderOgImagePng({ ...input, details: [] });

    expect(await sharp(withDetails).metadata()).toMatchObject({
      format: 'png',
      width: 1200,
      height: 630,
      channels: 3,
    });
    expect(withDetails.equals(plain)).toBe(false);
    expect(otherDetails.equals(withDetails)).toBe(false);
    expect(plainAgain.equals(plain)).toBe(true);
  });
});
