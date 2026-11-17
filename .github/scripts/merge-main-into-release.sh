#!/usr/bin/env bash
# Usage: merge-main-into-release.sh <main-ref> <release-branch> [--commit-conflicts]
# Run from a clean release checkout. The caller owns fetching and pushing.
#
# Exit codes:
#   0  main is merged (or was already an ancestor); HEAD is the result.
#   1  unexpected failure; nothing should be pushed.
#   3  conflicts need human review; the merge was aborted and HEAD is unchanged.
#
# With --commit-conflicts the conflicts are not an error: the merge is committed
# with conflict markers left in the unresolved text files, so the result can be
# pushed to a repair branch. Non-text conflicts (binary, modify/delete) have no
# markers; Git's worktree side is staged and the path is flagged for a human.
# Unresolved paths are written to $RELEASE_SYNC_CONFLICTS_FILE as
# "<kind>\t<path>" (text, binary, deleted-on-main, deleted-on-release) when it
# is set. Never push that commit to release.
set -euo pipefail

MAIN_SHA="$(git rev-parse --verify "${1:?main ref required}^{commit}")"
BRANCH="${2:?release branch required}"
RELEASE_SHA="$(git rev-parse HEAD)"
MERGE_BASE="$(git merge-base HEAD "$MAIN_SHA")"

fail() {
  echo "::error::$*" >&2
  exit 1
}

COMMIT_CONFLICTS=0
case "${3:-}" in
  "") ;;
  --commit-conflicts) COMMIT_CONFLICTS=1 ;;
  *) fail "Unknown option: $3" ;;
esac

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

report "## Release sync: $BRANCH" \
  "- Release SHA: \`$RELEASE_SHA\`" \
  "- Main SHA: \`$MAIN_SHA\`" \
  "- Merge base: \`$MERGE_BASE\`"

ancestor_status=0
git merge-base --is-ancestor "$MAIN_SHA" HEAD || ancestor_status=$?
case "$ancestor_status" in
  0)
    report "Main is already an ancestor of release; nothing to merge."
    exit 0
    ;;
  1) ;;
  *) fail "Could not check main ancestry (exit $ancestor_status)." ;;
esac

generated_files=(
  src/frontend/src/data/aspire-integrations.json
  src/frontend/src/data/github-stats.json
  src/frontend/src/data/samples.json
  src/frontend/src/data/twoslash/aspire.d.ts
)
generated_dirs=(
  src/frontend/src/data/pkgs
  src/frontend/src/data/ts-modules
  src/frontend/src/assets/samples
)

is_generated() {
  local path
  for path in "${generated_files[@]}"; do
    [[ "$1" != "$path" ]] || return 0
  done
  for path in "${generated_dirs[@]}"; do
    case "$1" in "$path"|"$path"/*) return 0 ;; esac
  done
  return 1
}

is_curated() {
  case "$1" in
    src/frontend/src/assets/samples/*) return 1 ;;
    src/frontend/src/content/*|src/frontend/src/assets/*) return 0 ;;
    *) return 1 ;;
  esac
}

keep_release() {
  if git cat-file -e "$RELEASE_SHA:$1" 2>/dev/null; then
    git checkout "$RELEASE_SHA" -- "$1"
  else
    git rm -q --force --ignore-unmatch -- "$1"
  fi
}

conflicts_file="$(mktemp)"
cleanup() {
  local status=$?
  if [[ "$status" -ne 0 ]] && git rev-parse -q --verify MERGE_HEAD >/dev/null; then
    if ! git merge --abort; then
      echo "::error::Could not abort the failed release merge." >&2
      status=1
    fi
  fi
  rm -f -- "$conflicts_file"
  exit "$status"
}
trap cleanup EXIT

merge_status=0
git merge --no-commit --no-ff "$MAIN_SHA" || merge_status=$?
if [[ "$merge_status" -gt 1 ]] || ! git rev-parse -q --verify MERGE_HEAD >/dev/null; then
  fail "Git merge failed (exit $merge_status); main is not already integrated."
fi

git diff --name-only --diff-filter=U -z > "$conflicts_file"
mapfile -d '' -t conflicts < "$conflicts_file"
if [[ "$merge_status" -ne 0 && "${#conflicts[@]}" -eq 0 ]]; then
  fail "Git merge failed without resolvable conflict entries (exit $merge_status)."
fi

unresolved=()
for path in "${conflicts[@]}"; do
  if is_generated "$path"; then
    continue
  elif is_curated "$path"; then
    keep_release "$path"
  else
    unresolved+=("$path")
  fi
done

# Only text conflicts leave markers. For the other kinds Git leaves one side in
# the worktree, so staging it would silently pick that side.
conflict_kind() {
  local stages
  stages="$(git ls-files -u -- ":(literal)$1" | awk '{print $3}' | sort -u | tr -d '\n')"
  if [[ "$stages" != *2* ]]; then echo deleted-on-release; return; fi
  if [[ "$stages" != *3* ]]; then echo deleted-on-main; return; fi
  if grep -Iq '^<<<<<<< ' -- "$1" 2>/dev/null; then echo text; else echo binary; fi
}

if [[ "${#unresolved[@]}" -ne 0 ]]; then
  unresolved_kinds=()
  report "" "### Conflicts requiring human review"
  for path in "${unresolved[@]}"; do
    kind="$(conflict_kind "$path")"
    unresolved_kinds+=("$kind")
    report "- \`$path\` ($kind)"
  done
  if [[ "$COMMIT_CONFLICTS" -eq 0 ]]; then
    report "" \
      "Create a repair branch from \`$BRANCH\`, merge main into it, and resolve these conflicts without discarding release-only work." \
      "Land the repair PR with **Create a merge commit**, never squash or rebase. Copying content alone does not repair ancestry." \
      "After landing, verify \`git merge-base --is-ancestor $MAIN_SHA origin/$BRANCH\`, then dispatch a fresh workflow run from main."
    echo "::warning::Automated merge aborted: ${#unresolved[@]} conflicts require human review." >&2
    exit 3
  fi
  if [[ -n "${RELEASE_SYNC_CONFLICTS_FILE:-}" ]]; then
    : > "$RELEASE_SYNC_CONFLICTS_FILE"
    for i in "${!unresolved[@]}"; do
      printf '%s\t%s\n' "${unresolved_kinds[$i]}" "${unresolved[$i]}" >> "$RELEASE_SYNC_CONFLICTS_FILE"
    done
  fi
fi

# Only these producer-owned paths are mirrored. Other data is hand-authored.
for path in "${generated_files[@]}" "${generated_dirs[@]}"; do
  diff_status=0
  git diff --quiet "$MAIN_SHA" -- "$path" || diff_status=$?
  [[ "$diff_status" -le 1 ]] || fail "Could not compare generated path $path."
  if [[ "$diff_status" -eq 0 && -z "$(git ls-files -u -- "$path")" ]]; then
    continue
  fi
  git rm -r -q --force --ignore-unmatch -- "$path"
  if git cat-file -e "$MAIN_SHA:$path" 2>/dev/null; then
    git checkout "$MAIN_SHA" -- "$path"
  fi
done

if [[ "${#unresolved[@]}" -ne 0 ]]; then
  # Stage the conflicted files as-is for the repair branch. Text conflicts keep
  # their markers; the workflow tells reviewers to decide the other kinds.
  git --literal-pathspecs add -A -- "${unresolved[@]}"
fi

[[ -z "$(git ls-files -u)" ]] || fail "Unexpected unmerged entries remain."
# Check everything except the paths intentionally left unresolved.
check_pathspecs=(.)
for path in ${unresolved[@]+"${unresolved[@]}"}; do
  check_pathspecs+=(":(exclude,literal)$path")
done
if ! markers="$(git diff --cached --check -- "${check_pathspecs[@]}")"; then
  [[ -n "$markers" ]] || fail "Could not check the merged diff."
  if grep -q 'conflict marker' <<< "$markers"; then
    fail "Conflict markers detected after auto-resolution."
  fi
  echo "::warning::Merged diff has whitespace warnings:"
  printf '%s\n' "$markers"
fi

git commit --no-edit --trailer "Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
git merge-base --is-ancestor "$MAIN_SHA" HEAD || fail "Merge did not preserve main ancestry; do not push."
read -r commit first_parent second_parent extra <<< "$(git rev-list --parents -n 1 HEAD)"
if [[ "$first_parent" != "$RELEASE_SHA" || "$second_parent" != "$MAIN_SHA" || -n "$extra" ]]; then
  fail "Expected a two-parent release/main merge commit; do not push."
fi
if [[ "${#unresolved[@]}" -ne 0 ]]; then
  report "" "Committed main merge with ${#unresolved[@]} unresolved conflict(s) for a repair PR: \`$commit\`."
else
  report "" "Merged main into release with both parents preserved: \`$commit\`."
fi
