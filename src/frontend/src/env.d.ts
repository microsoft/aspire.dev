declare const __ASPIRE_REDIRECT_PATHS__: readonly string[];
/** Localized route paths backed by real translations, e.g. `/ja/get-started/`. */
declare const __ASPIRE_TRANSLATED_PATHS__: readonly string[];

interface ImportMetaEnv {
  readonly PUBLIC_GIT_COMMIT_ID?: string;
  readonly GIT_COMMIT_ID?: string;
  readonly PUBLIC_REPO_URL?: string;
  readonly REPO_URL?: string;
}
