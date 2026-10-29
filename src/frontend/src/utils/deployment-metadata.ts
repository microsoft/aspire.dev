export const deploymentMetadata = {
  commit: import.meta.env.PUBLIC_GIT_COMMIT_ID || import.meta.env.GIT_COMMIT_ID || '',
  repoUrl: (
    import.meta.env.PUBLIC_REPO_URL ||
    import.meta.env.REPO_URL ||
    'https://github.com/microsoft/aspire.dev'
  ).replace(/\/$/, ''),
};
