/**
 * Aspire core team roster.
 *
 * This is the running list of core team members rendered in the "Community"
 * section of every "What's new" release page (see `Community.astro`). Unlike
 * the per-release contributor list — which is generated from GitHub release
 * notes by `scripts/update-release-contributors.ts` — this roster is
 * maintained by hand.
 *
 * ⚠️ PLACEHOLDER ROSTER — REVIEW BEFORE MERGE ⚠️
 * The handles below were seeded from well-known Aspire maintainers so the
 * feature can be demonstrated end-to-end. Confirm the exact roster (add or
 * remove members, fix display names, and set preferred social links) before
 * shipping. Members listed here are intentionally excluded from the generated
 * per-release "Special thanks" list so they are credited once, in the roster.
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
  { handle: 'davidfowl', name: 'David Fowler' },
  { handle: 'DamianEdwards', name: 'Damian Edwards' },
  { handle: 'mitchdenny', name: 'Mitch Denny' },
  { handle: 'eerhardt', name: 'Eric Erhardt' },
  { handle: 'joperezr', name: 'José Pérez' },
  { handle: 'JamesNK', name: 'James Newton-King' },
  { handle: 'sebastienros', name: 'Sébastien Ros' },
  { handle: 'karolz-ms', name: 'Karol Zadora-Przylecki' },
  { handle: 'radical', name: 'Ankit Jain' },
  { handle: 'adamint', name: 'Adam Ratzman' },
  { handle: 'danegsta', name: 'Dane Gstautas' },
  { handle: 'IEvangelist', name: 'David Pine' },
];

/** Lower-cased core team handles, for case-insensitive de-duplication. */
export const coreTeamHandles: ReadonlySet<string> = new Set(
  coreTeam.map((member) => member.handle.toLowerCase())
);
