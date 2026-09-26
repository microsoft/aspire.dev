#!/usr/bin/env bash
set -euo pipefail

export GIT_CONFIG_NOSYSTEM=1
export GIT_CONFIG_GLOBAL=/dev/null
unset GITHUB_STEP_SUMMARY

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
HELPER="$SCRIPT_DIR/merge-main-into-release.sh"
TEST_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/release-sync-tests.XXXXXX")"
trap 'cd "$SCRIPT_DIR"; rm -rf -- "$TEST_ROOT"' EXIT

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

write_file() {
  mkdir -p -- "$(dirname -- "$1")"
  printf '%s\n' "$2" > "$1"
}

commit_all() {
  git add -A
  git commit -qm "$1"
}

new_repo() {
  mkdir "$TEST_ROOT/$1"
  cd "$TEST_ROOT/$1"
  git init -q --initial-branch=main
  git config user.name "Release sync test"
  git config user.email "release-sync@example.invalid"
  git config commit.gpgsign false
  git config core.autocrlf false
  write_file shared.txt base
  commit_all base
  git switch -qc release/test
}

run_helper() {
  if bash "$HELPER" main release/test > "$TEST_ROOT/output" 2>&1; then
    return 0
  else
    cat "$TEST_ROOT/output" >&2
    return 1
  fi
}

expect_failure() {
  if bash "$HELPER" main release/test > "$TEST_ROOT/output" 2>&1; then
    fail "Expected merge failure."
  fi
  grep -q "$1" "$TEST_ROOT/output" || { cat "$TEST_ROOT/output"; fail "Missing expected diagnostic: $1"; }
  [[ "$(git rev-parse HEAD)" == "$release_sha" ]] || fail "Failed merge changed release HEAD."
  [[ -z "$(git status --porcelain)" ]] || fail "Failed merge left a dirty checkout."
  if git rev-parse -q --verify MERGE_HEAD >/dev/null; then
    fail "Failed merge was not aborted."
  fi
}

assert_parents() {
  [[ "$(git show -s --format=%P HEAD)" == "$release_sha $(git rev-parse main)" ]] || fail "Merge parents differ."
  git merge-base --is-ancestor main HEAD || fail "Main ancestry was lost."
}

new_repo no-op
release_sha="$(git rev-parse HEAD)"
run_helper
[[ "$(git rev-parse HEAD)" == "$release_sha" ]] || fail "No-op created a commit."
grep -q "already an ancestor" "$TEST_ROOT/output" || fail "Missing no-op diagnostic."
echo "PASS: ancestor no-op"

new_repo clean-merge
write_file release.txt release
commit_all release
release_sha="$(git rev-parse HEAD)"
git switch -q main
write_file main.txt main
commit_all main
git switch -q release/test
run_helper
assert_parents
[[ -f main.txt && -f release.txt ]] || fail "Clean merge lost files."
echo "PASS: clean merge preserves both parents"

new_repo path-policies
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
curated=src/frontend/src/content/docs/curated.mdx
deleted=src/frontend/src/content/docs/deleted.mdx
asset=src/frontend/src/assets/dashboard.txt
for path in "${generated_files[@]}" "$curated" "$deleted" "$asset"; do
  write_file "$path" base
done
for path in "${generated_dirs[@]}"; do
  write_file "$path/base-version.txt" base
done
commit_all shared-paths
git switch -q main
git merge -q --ff-only release/test
for path in "${generated_files[@]}" "$curated" "$deleted" "$asset"; do
  write_file "$path" main
done
git rm -q -f -- src/frontend/src/data/samples.json
for path in "${generated_dirs[@]}"; do
  git mv "$path/base-version.txt" "$path/main-version.txt"
done
write_file src/frontend/src/content/docs/new.mdx "nonconflicting main content"
commit_all main-paths
git switch -q release/test
for path in "${generated_files[@]}" "$curated" "$asset"; do
  write_file "$path" release
done
git rm -q -- "$deleted"
for path in "${generated_dirs[@]}"; do
  git mv "$path/base-version.txt" "$path/release-version.txt"
done
write_file src/frontend/src/data/hand-authored.json release
commit_all release-paths
release_sha="$(git rev-parse HEAD)"
run_helper
assert_parents
git diff --exit-code main HEAD -- "${generated_files[@]}" "${generated_dirs[@]}"
[[ "$(cat "$curated")" == release && "$(cat "$asset")" == release ]] || fail "Curated content was overwritten."
[[ ! -e "$deleted" ]] || fail "Release-side deletion was lost."
[[ -f src/frontend/src/content/docs/new.mdx ]] || fail "Nonconflicting content did not merge."
[[ "$(cat src/frontend/src/data/hand-authored.json)" == release ]] || fail "Hand-authored data was overwritten."
echo "PASS: generated mirroring, curated conflicts/deletions, nonconflicting content"

new_repo unknown-conflict
write_file shared.txt release
commit_all release
release_sha="$(git rev-parse HEAD)"
git switch -q main
write_file shared.txt main
commit_all main
git switch -q release/test
export GITHUB_STEP_SUMMARY="$TEST_ROOT/summary"
expect_failure "conflicts require human review"
grep -q 'shared.txt' "$GITHUB_STEP_SUMMARY" || fail "Summary omitted conflict path."
grep -q 'never squash or rebase' "$GITHUB_STEP_SUMMARY" || fail "Summary omitted ancestry guidance."
unset GITHUB_STEP_SUMMARY
echo "PASS: unknown conflict aborts with recovery instructions"

new_repo fatal-merge
release_sha="$(git rev-parse HEAD)"
git switch -q main
write_file main.txt main
commit_all main
git switch -q release/test
# Refuse Git's index lock without introducing tracked or untracked changes.
write_file .git/index.lock locked
expect_failure "Git merge failed"
[[ ! "$(cat "$TEST_ROOT/output")" == *"nothing to merge"* ]] || fail "Fatal error was reported as a no-op."
rm -- .git/index.lock
echo "PASS: fatal merge without MERGE_HEAD is not a no-op"

new_repo conflict-markers
release_sha="$(git rev-parse HEAD)"
git switch -q main
write_file marker.txt '<<<<<<< HEAD'
commit_all markers
git switch -q release/test
expect_failure "Conflict markers detected"
echo "PASS: conflict marker rejection"

new_repo squash-ancestry
git switch -q main
write_file shared.txt first-main
commit_all first-main
git switch -q release/test
git merge -q --squash main
git commit -qm squash-repair
if git merge-base --is-ancestor main HEAD; then
  fail "Squash fixture unexpectedly preserved ancestry."
fi
write_file shared.txt release-after-squash
commit_all release-after-squash
release_sha="$(git rev-parse HEAD)"
git switch -q main
write_file shared.txt second-main
commit_all second-main
git switch -q release/test
expect_failure "conflicts require human review"
# Reconcile deliberately as a human would, retaining both parent histories.
merge_status=0
git merge --no-commit --no-ff main > "$TEST_ROOT/manual-merge" 2>&1 || merge_status=$?
[[ "$merge_status" == 1 ]] || fail "Expected a manual repair conflict."
write_file shared.txt reconciled
commit_all real-repair
git merge-base --is-ancestor main HEAD || fail "Real repair did not establish ancestry."
git switch -q main
write_file next.txt next
commit_all next-main
git switch -q release/test
release_sha="$(git rev-parse HEAD)"
run_helper
assert_parents
[[ "$(cat shared.txt)" == reconciled && -f next.txt ]] || fail "Next sync revisited repaired content."
echo "PASS: real repair avoids repeating squash-era conflicts"
