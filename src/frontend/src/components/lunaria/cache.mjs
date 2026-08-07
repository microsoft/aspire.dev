import { info } from '@lunariajs/core/console';
import { getGitHostingLinks, git } from '@lunariajs/core/git';
import { getLocalizationStatus } from '@lunariajs/core/status';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

let lastExecutionDate;
let shallowRepoPrepared = false;

const cacheDir = resolve('./node_modules/.cache/lunaria/');
const cachedStatusPath = join(cacheDir, 'status.json');

export async function getStatusFromCache(userConfig, isShallowRepo) {
  await prepareShallowRepo(userConfig, isShallowRepo);

  const latestCommitDate = (await git.log({ maxCount: 1 })).latest?.date;

  if (latestCommitDate === lastExecutionDate) {
    return JSON.parse(readFileSync(cachedStatusPath, 'utf-8'));
  }

  const status = await getLocalizationStatus(userConfig, isShallowRepo);

  if (!existsSync(cacheDir)) {
    mkdirSync(cacheDir, { recursive: true });
  }

  writeFileSync(cachedStatusPath, JSON.stringify(status));
  lastExecutionDate = latestCommitDate;

  return status;
}

async function prepareShallowRepo({ cloneDir, repository }, isShallowRepo) {
  if (!isShallowRepo || shallowRepoPrepared) {
    return;
  }

  console.log(
    info("Shallow repository detected. A clone of your repository's history will be downloaded and used. ")
  );

  const target = resolve(cloneDir);

  if (existsSync(target)) {
    rmSync(target, { recursive: true, force: true });
  }

  const checkoutGitDir = await git.revparse(['--absolute-git-dir']);
  const checkoutHistoryRef = await getCheckoutHistoryRef();
  const historyBranchRef = `refs/heads/${repository.branch}`;

  await git.clone(getGitHostingLinks(repository).clone(), target, ['--bare']);
  await git.cwd({ path: target, root: true });

  if (checkoutHistoryRef) {
    await git.raw(['fetch', 'origin', `+${checkoutHistoryRef}:${historyBranchRef}`]);
  } else {
    await git.raw(['fetch', checkoutGitDir, `+HEAD:${historyBranchRef}`]);
  }

  await git.raw(['symbolic-ref', 'HEAD', historyBranchRef]);
  shallowRepoPrepared = true;
}

async function getCheckoutHistoryRef() {
  const pointsAtHead = await listOriginRefs(['--points-at', 'HEAD']);
  const directRef = pointsAtHead.find(isPullHeadRef) ?? pointsAtHead.find(isNonMainRef);

  if (directRef) {
    return toRemoteRef(directRef);
  }

  const mergedRefs = await listOriginRefs(['--merged', 'HEAD']);
  const mergedRef = mergedRefs.find(isPullHeadRef) ?? mergedRefs.find(isNonMainRef);

  return mergedRef ? toRemoteRef(mergedRef) : null;
}

async function listOriginRefs(extraArgs) {
  const output = await git.raw([
    'for-each-ref',
    '--format=%(refname)',
    ...extraArgs,
    'refs/remotes/origin',
  ]);

  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function isPullHeadRef(ref) {
  return ref.startsWith('refs/remotes/origin/pull/') && ref.endsWith('/head');
}

function isNonMainRef(ref) {
  return ref !== 'refs/remotes/origin/HEAD' && ref !== 'refs/remotes/origin/main';
}

function toRemoteRef(ref) {
  const prefix = 'refs/remotes/origin/';

  if (!ref.startsWith(prefix)) {
    return null;
  }

  const suffix = ref.slice(prefix.length);
  return suffix.startsWith('pull/') ? `refs/${suffix}` : `refs/heads/${suffix}`;
}
