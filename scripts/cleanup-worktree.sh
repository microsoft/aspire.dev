#!/usr/bin/env bash
# Tear down a sibling worktree once its PR has merged.
# Usage: scripts/cleanup-worktree.sh <name>
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: $(basename "$0") <worktree-name>" >&2
  exit 2
fi

NAME="$1"
ROOT="$(git rev-parse --show-toplevel)"
PARENT="$(dirname "$ROOT")"
WORKTREE_PATH="$PARENT/aspire.dev-worktrees/$NAME"
BRANCH="dapine/$NAME"

if [[ -d "$WORKTREE_PATH" ]]; then
  echo "Removing worktree at $WORKTREE_PATH"
  git worktree remove "$WORKTREE_PATH"
else
  echo "Worktree path '$WORKTREE_PATH' does not exist; continuing."
fi

if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
  echo "Deleting local branch $BRANCH"
  git branch -D "$BRANCH"
fi

echo "Pruning upstream refs and worktree state"
git fetch --prune upstream
git worktree prune
echo "Done."
