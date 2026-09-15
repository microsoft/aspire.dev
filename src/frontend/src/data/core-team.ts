/**
 * Aspire core team roster.
 *
 * This is the running list of core team members rendered in the "Community"
 * section of every "What's new" release page (see `ReleaseCommunity.astro`).
 * Unlike the per-release contributor list — which is generated from GitHub
 * release notes by `scripts/update-release-contributors.ts` — this roster is
 * maintained by hand.
 *
 * Members listed here are intentionally excluded from the generated per-release
 * "Special thanks" list so they are credited once, in the roster. Entries are
 * ordered alphabetically by display name; keep the roster current and sorted as
 * membership changes, and set a member's `social` link to override the default
 * GitHub profile link.
 *
 * For each member:
 *  - `handle` is the GitHub login. The avatar is derived as
 *    `https://github.com/<handle>.png` and, unless `social` is set, the name
 *    links to `https://github.com/<handle>`.
 *  - `name` is the display name shown beneath the avatar.
 *  - `social` optionally overrides the link with a preferred platform.
 */

export type SocialPlatform = 'github' | 'x' | 'bluesky' | 'mastodon' | 'linkedin';

export interface CoreTeamSocial {
  platform: SocialPlatform;
  url: string;
}

export interface CoreTeamMember {
  /** GitHub login — used for the avatar and the default profile link. */
  handle: string;
  /** Display name shown beneath the avatar. */
  name: string;
  /** Optional preferred social link. Defaults to the GitHub profile. */
  social?: CoreTeamSocial;
}

export const coreTeam: CoreTeamMember[] = [
  { handle: 'adamint', name: 'Adam Ratzman' },
  { handle: 'radical', name: 'Ankit Jain' },
  { handle: 'DamianEdwards', name: 'Damian Edwards' },
  { handle: 'davidfowl', name: 'David Fowler' },
  { handle: 'danegsta', name: 'David Negstad' },
  { handle: 'IEvangelist', name: 'David Pine' },
  { handle: 'ellahathaway', name: 'Ella Hathaway' },
  { handle: 'eerhardt', name: 'Eric Erhardt' },
  { handle: 'JamesNK', name: 'James Newton-King' },
  { handle: 'joperezr', name: 'José Pérez' },
  { handle: 'karolz-ms', name: 'Karol Zadora-Przylecki' },
  { handle: 'maddymontaquila', name: 'Maddy Montaquila' },
  { handle: 'mitchdenny', name: 'Mitch Denny' },
  { handle: 'sebastienros', name: 'Sébastien Ros' },
];

/** Lower-cased core team handles, for case-insensitive de-duplication. */
export const coreTeamHandles: ReadonlySet<string> = new Set(
  coreTeam.map((member) => member.handle.toLowerCase())
);
