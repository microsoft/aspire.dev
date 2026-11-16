#!/usr/bin/env bash
# Usage: repair-release-sync-ancestry.sh <main-ref> <release-branch> <repair-pr-head-ref>
# Run from a clean release checkout. The caller owns fetching and pushing.
#
# A repair PR holds a merge of main into release. Landing it with a squash or
# rebase copies its content but not its history, so main's commits stay
# unmerged and the next sync re-conflicts on content that was already resolved.
# This records the newest main commit the repair PR head carries with a
# tree-preserving merge (-s ours), as a merge commit would have. HEAD's tree is
# never changed, and nothing happens when that main commit is already merged.
#
# Exit codes:
#   0  nothing to record, or the ancestry was recorded and HEAD is the new merge.
#   1  unexpected failure; nothing should be pushed.
set -euo pipefail

MAIN_SHA="$(git rev-parse --verify "${1:?main ref required}^{commit}")"
BRANCH="${2:?release branch required}"
REPAIR_HEAD="$(git rev-parse --verify "${3:?repair PR head ref required}^{commit}")"
RELEASE_SHA="$(git rev-parse HEAD)"

fail() {
  echo "::error::$*" >&2
  exit 1
}

[[ -z "$(git status --porcelain)" ]] || fail "Release checkout must be clean."
if git rev-parse -q --verify MERGE_HEAD >/dev/null; then
  fail "A merge is already in progress."
fi

report() {
  printf '%s\n' "$@"
  if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
    printf '%s\n' "$@" >> "$GITHUB_STEP_SUMMARY"
  fi
}

carried_status=0
CARRIED="$(git merge-base "$MAIN_SHA" "$REPAIR_HEAD")" || carried_status=$?
case "$carried_status" in
  0) ;;
  1)
    echo "::warning::Repair PR head $REPAIR_HEAD shares no history with main; nothing to record."
    exit 0
    ;;
  *) fail "Could not find the main history carried by $REPAIR_HEAD (exit $carried_status)." ;;
esac

ancestor_status=0
git merge-base --is-ancestor "$CARRIED" HEAD || ancestor_status=$?
case "$ancestor_status" in
  0)
    echo "Main commit $CARRIED from the repair PR is already an ancestor of $BRANCH; nothing to record."
    exit 0
    ;;
  1) ;;
  *) fail "Could not check main ancestry (exit $ancestor_status)." ;;
esac

cleanup() {
  local status=$?
  if [[ "$status" -ne 0 ]] && git rev-parse -q --verify MERGE_HEAD >/dev/null; then
    if ! git merge --abort; then
      echo "::error::Could not abort the failed ancestry merge." >&2
      status=1
    fi
  fi
  exit "$status"
}
trap cleanup EXIT

git merge --no-commit --no-ff -s ours "$CARRIED"
git commit \
  -m "Merge commit '$CARRIED' into $BRANCH" \
  -m "Records the main history carried by repair PR head $REPAIR_HEAD. The PR was squashed or rebased instead of merged, so release never received it. The tree is unchanged because the PR already copied the content." \
  --trailer "Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"

read -r commit first_parent second_parent extra <<< "$(git rev-list --parents -n 1 HEAD)"
if [[ "$first_parent" != "$RELEASE_SHA" || "$second_parent" != "$CARRIED" || -n "$extra" ]]; then
  fail "Expected a two-parent release/main merge commit; do not push."
fi
[[ "$(git rev-parse 'HEAD^{tree}')" == "$(git rev-parse "$RELEASE_SHA^{tree}")" ]] \
  || fail "Ancestry repair changed the release tree; do not push."
git merge-base --is-ancestor "$CARRIED" HEAD || fail "Ancestry repair did not record main; do not push."

report "## Release sync: recorded repair PR history for $BRANCH" \
  "- Repair PR head: \`$REPAIR_HEAD\`" \
  "- Main commit recorded as merged: \`$CARRIED\`" \
  "- Merge commit (tree unchanged): \`$commit\`" \
  "" \
  "The repair PR was squashed or rebased, which copies content but not history. Recording main as merged keeps the next sync from re-conflicting on content that was already resolved."
