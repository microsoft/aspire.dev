// Ported from src/frontend/src/components/TwitchEmbed.astro (<script>), M3 of docs/douze-migration-plan.md.
// Astro view transition events removed: every page load is a full document load.
import { initializeTwitchEmbed } from '@components/stream-embeds';

function init(): void {
  document
    .querySelectorAll<HTMLIFrameElement>('iframe[data-twitch-src]')
    .forEach(initializeTwitchEmbed);
}

init();
