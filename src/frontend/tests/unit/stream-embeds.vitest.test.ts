import { describe, expect, it } from 'vitest';
import {
  ASPIRE_YOUTUBE_CHANNEL_ID,
  ASPIRE_YOUTUBE_UPLOADS_PLAYLIST_ID,
  youtubeEmbedUrl,
} from '@components/stream-embeds';

describe('YouTube embed sources', () => {
  it('uses the verified Aspire channel and uploads playlist', () => {
    expect(ASPIRE_YOUTUBE_CHANNEL_ID).toBe('UCW_UJkc7RhM_NPcDXnOCfrQ');
    expect(ASPIRE_YOUTUBE_UPLOADS_PLAYLIST_ID).toBe('UUW_UJkc7RhM_NPcDXnOCfrQ');
    const url = new URL(youtubeEmbedUrl({ playlistId: ASPIRE_YOUTUBE_UPLOADS_PLAYLIST_ID }));
    expect(url.origin).toBe('https://www.youtube-nocookie.com');
    expect(url.pathname).toBe('/embed/videoseries');
    expect(url.searchParams.get('list')).toBe(ASPIRE_YOUTUBE_UPLOADS_PLAYLIST_ID);
    expect(url.searchParams.get('autoplay')).toBe('0');
    expect(url.searchParams.get('channel')).toBeNull();
  });

  it.each([false, true])('loads a specific video with autoplay=%s', (autoplay) => {
    const url = new URL(youtubeEmbedUrl({ videoId: 'live-video', autoplay }));
    expect(url.pathname).toBe('/embed/live-video');
    expect(url.searchParams.get('autoplay')).toBe(autoplay ? '1' : '0');
    expect(url.searchParams.get('mute')).toBe(autoplay ? '1' : '0');
    expect(url.searchParams.get('list')).toBeNull();
    expect(url.searchParams.get('channel')).toBeNull();
  });

  it('retains a channel fallback when a live video ID is not yet known', () => {
    const url = new URL(youtubeEmbedUrl({ channelId: ASPIRE_YOUTUBE_CHANNEL_ID }));
    expect(url.pathname).toBe('/embed/live_stream');
    expect(url.searchParams.get('channel')).toBe(ASPIRE_YOUTUBE_CHANNEL_ID);
  });

  it('encodes IDs rather than treating them as URL paths or query parameters', () => {
    const url = new URL(youtubeEmbedUrl({ videoId: 'video/with?query&value' }));
    expect(url.pathname).toBe('/embed/video%2Fwith%3Fquery%26value');
    expect(url.searchParams.has('value')).toBe(false);
  });

  it('rejects missing sources', () => {
    expect(() => youtubeEmbedUrl({})).toThrow('requires a `videoId`, `channelId`, or `playlistId`');
  });
});
