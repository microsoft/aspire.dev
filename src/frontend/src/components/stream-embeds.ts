export const ASPIRE_YOUTUBE_CHANNEL_ID = 'UCW_UJkc7RhM_NPcDXnOCfrQ';
export const ASPIRE_YOUTUBE_UPLOADS_PLAYLIST_ID = 'UUW_UJkc7RhM_NPcDXnOCfrQ';

export interface YouTubeEmbedSource {
  videoId?: string;
  channelId?: string;
  playlistId?: string;
  autoplay?: boolean;
}

export function youtubeEmbedUrl({
  videoId,
  channelId,
  playlistId,
  autoplay = false,
}: YouTubeEmbedSource): string {
  if (!videoId && !channelId && !playlistId) {
    throw new Error('YouTubeEmbed requires a `videoId`, `channelId`, or `playlistId` prop.');
  }

  const params = new URLSearchParams({
    rel: '0',
    modestbranding: '1',
    playsinline: '1',
    autoplay: autoplay ? '1' : '0',
    mute: autoplay ? '1' : '0',
  });
  if (playlistId) params.set('list', playlistId);
  else if (channelId) params.set('channel', channelId);
  const embedPath = playlistId
    ? 'videoseries'
    : channelId
      ? 'live_stream'
      : encodeURIComponent(videoId!);
  return `https://www.youtube-nocookie.com/embed/${embedPath}?${params}`;
}

export function initializeTwitchEmbed(iframe: HTMLIFrameElement): void {
  const deferredSource = iframe.dataset.twitchSrc;
  if (!deferredSource || iframe.hasAttribute('src')) return;
  const url = new URL(deferredSource);
  url.searchParams.set('parent', window.location.hostname);
  iframe.src = url.toString();
}
