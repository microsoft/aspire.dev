#!/usr/bin/env bash
set -euo pipefail

export GIT_CONFIG_NOSYSTEM=1
export GIT_CONFIG_GLOBAL=/dev/null
unset GITHUB_STEP_SUMMARY

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
HELPER="$SCRIPT_DIR/merge-main-into-release.sh"
REPAIR_HELPER="$SCRIPT_DIR/repair-release-sync-ancestry.sh"
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

run_repair_helper() {
  if bash "$REPAIR_HELPER" main release/test "$repair_head" > "$TEST_ROOT/output" 2>&1; then
    return 0
  else
    cat "$TEST_ROOT/output" >&2
    return 1
  fi
}

expect_failure() {
  helper_status=0
  bash "$HELPER" main release/test > "$TEST_ROOT/output" 2>&1 || helper_status=$?
  [[ "$helper_status" -ne 0 ]] || fail "Expected merge failure."
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
[[ "$helper_status" == 3 ]] || fail "Conflicts must exit 3, got $helper_status."
grep -q 'shared.txt' "$GITHUB_STEP_SUMMARY" || fail "Summary omitted conflict path."
grep -q 'never squash or rebase' "$GITHUB_STEP_SUMMARY" || fail "Summary omitted ancestry guidance."
unset GITHUB_STEP_SUMMARY
echo "PASS: unknown conflict aborts with recovery instructions"

# Same fixture: --commit-conflicts keeps both parents and leaves markers for a repair PR.
generated=src/frontend/src/data/samples.json
write_file "$generated" release
commit_all release-generated
git switch -q main
write_file "$generated" main
commit_all main-generated
git switch -q release/test
release_sha="$(git rev-parse HEAD)"
export RELEASE_SYNC_CONFLICTS_FILE="$TEST_ROOT/conflicts"
bash "$HELPER" main release/test --commit-conflicts > "$TEST_ROOT/output" 2>&1 \
  || { cat "$TEST_ROOT/output"; fail "--commit-conflicts failed."; }
unset RELEASE_SYNC_CONFLICTS_FILE
assert_parents
[[ "$(cat "$TEST_ROOT/conflicts")" == $'text\tshared.txt' ]] || fail "Conflict list is wrong."
grep -q '^<<<<<<<' shared.txt || fail "Repair commit lost conflict markers."
[[ -z "$(git status --porcelain)" ]] || fail "Repair commit left a dirty checkout."
git diff --exit-code main HEAD -- "$generated" || fail "Generated data was not mirrored from main."
echo "PASS: --commit-conflicts commits markers with both parents"

new_repo commit-conflicts-clean
write_file release.txt release
commit_all release
release_sha="$(git rev-parse HEAD)"
git switch -q main
write_file main.txt main
commit_all main
git switch -q release/test
rm -f -- "$TEST_ROOT/conflicts"
RELEASE_SYNC_CONFLICTS_FILE="$TEST_ROOT/conflicts" bash "$HELPER" main release/test --commit-conflicts > "$TEST_ROOT/output" 2>&1 \
  || { cat "$TEST_ROOT/output"; fail "--commit-conflicts failed on a clean merge."; }
assert_parents
[[ ! -e "$TEST_ROOT/conflicts" ]] || fail "Clean merge wrote a conflict list."
echo "PASS: --commit-conflicts is a plain merge when nothing conflicts"

new_repo non-text-conflicts
write_file gone-on-main.txt base
write_file gone-on-release.txt base
printf 'base\0bin' > blob.bin
commit_all non-text-base
git switch -q main
git merge -q --ff-only release/test
git rm -q gone-on-main.txt
write_file gone-on-release.txt main-edit
printf 'main\0bin' > blob.bin
commit_all main-non-text
git switch -q release/test
write_file gone-on-main.txt release-edit
git rm -q gone-on-release.txt
printf 'release\0bin' > blob.bin
commit_all release-non-text
release_sha="$(git rev-parse HEAD)"
rm -f -- "$TEST_ROOT/conflicts"
expect_failure "conflicts require human review"
[[ "$helper_status" == 3 ]] || fail "Non-text conflicts must exit 3."
RELEASE_SYNC_CONFLICTS_FILE="$TEST_ROOT/conflicts" bash "$HELPER" main release/test --commit-conflicts > "$TEST_ROOT/output" 2>&1 \
  || { cat "$TEST_ROOT/output"; fail "--commit-conflicts failed on non-text conflicts."; }
assert_parents
sort "$TEST_ROOT/conflicts" > "$TEST_ROOT/conflicts.sorted"
printf 'binary\tblob.bin\ndeleted-on-main\tgone-on-main.txt\ndeleted-on-release\tgone-on-release.txt\n' > "$TEST_ROOT/conflicts.expected"
cmp -s "$TEST_ROOT/conflicts.sorted" "$TEST_ROOT/conflicts.expected" \
  || { cat "$TEST_ROOT/conflicts"; fail "Non-text conflicts were not classified."; }
echo "PASS: --commit-conflicts flags binary and modify/delete conflicts"

# A marker-like line in a non-conflicted file must still be rejected in repair mode.
new_repo marker-in-clean-file
write_file shared.txt release
commit_all release
release_sha="$(git rev-parse HEAD)"
git switch -q main
write_file shared.txt main
write_file stray.txt '<<<<<<< stray'
commit_all main-conflict-and-marker
git switch -q release/test
if bash "$HELPER" main release/test --commit-conflicts > "$TEST_ROOT/output" 2>&1; then
  fail "Stray marker in a non-conflicted file was accepted."
fi
grep -q "Conflict markers detected" "$TEST_ROOT/output" || { cat "$TEST_ROOT/output"; fail "Missing marker diagnostic."; }
[[ "$(git rev-parse HEAD)" == "$release_sha" && -z "$(git status --porcelain)" ]] || fail "Rejected repair left changes."
echo "PASS: repair mode still rejects markers outside the conflicted paths"

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

# A repair PR conflicted on shared.txt, a human resolved it, and it landed on
# release by <squash|merge>. Main then edits region.txt again. A squash leaves
# the first main commit unmerged, so the next sync uses a stale merge base and
# re-conflicts on content the repair already resolved.
new_landed_repair_repo() {
  new_repo "$1"
  git switch -q main
  write_file region.txt $'top\nbottom'
  commit_all region-base
  git switch -q release/test
  git merge -q --ff-only main
  write_file shared.txt release
  commit_all release-edit
  git switch -q main
  write_file shared.txt main
  write_file region.txt $'top\nfirst\nbottom'
  commit_all first-main
  first_main="$(git rev-parse HEAD)"
  git switch -q release/test
  git switch -qc release-sync/test
  bash "$HELPER" main release/test --commit-conflicts > "$TEST_ROOT/output" 2>&1 \
    || { cat "$TEST_ROOT/output"; fail "Repair fixture could not commit its conflicts."; }
  write_file shared.txt reconciled
  commit_all human-resolution
  repair_head="$(git rev-parse HEAD)"
  git switch -q release/test
  case "$2" in
    squash)
      git merge -q --squash release-sync/test > /dev/null
      git commit -qm squash-repair
      ;;
    merge)
      git merge -q --no-ff release-sync/test -m merge-repair
      ;;
  esac
  write_file later.txt later
  commit_all release-later
  git switch -q main
  write_file region.txt $'top\nsecond\nbottom'
  commit_all second-main
  git switch -q release/test
  release_sha="$(git rev-parse HEAD)"
}

new_landed_repair_repo heal-squash squash
if git merge-base --is-ancestor "$first_main" HEAD; then
  fail "Squash fixture unexpectedly preserved ancestry."
fi
# Control: without the repair, the stale merge base conflicts on resolved content.
expect_failure "conflicts require human review"
[[ "$helper_status" == 3 ]] || fail "Stale merge base must conflict with exit 3, got $helper_status."
grep -q 'region.txt' "$TEST_ROOT/output" || { cat "$TEST_ROOT/output"; fail "Stale merge base did not conflict on region.txt."; }
export GITHUB_STEP_SUMMARY="$TEST_ROOT/repair-summary"
: > "$GITHUB_STEP_SUMMARY"
run_repair_helper
grep -q "$first_main" "$GITHUB_STEP_SUMMARY" || fail "Summary omitted the recorded main commit."
unset GITHUB_STEP_SUMMARY
[[ "$(git show -s --format=%P HEAD)" == "$release_sha $first_main" ]] || fail "Ancestry repair parents differ."
[[ "$(git rev-parse 'HEAD^{tree}')" == "$(git rev-parse "$release_sha^{tree}")" ]] || fail "Ancestry repair changed the release tree."
git merge-base --is-ancestor "$first_main" HEAD || fail "Ancestry repair did not record main history."
[[ -z "$(git status --porcelain)" ]] || fail "Ancestry repair left a dirty checkout."
release_sha="$(git rev-parse HEAD)"
run_helper
assert_parents
[[ "$(cat region.txt)" == $'top\nsecond\nbottom' ]] || fail "Main's later change was not merged."
[[ "$(cat shared.txt)" == reconciled ]] || fail "The repaired content was overwritten."
[[ -f later.txt ]] || fail "Release-only work was lost."
release_sha="$(git rev-parse HEAD)"
run_repair_helper
[[ "$(git rev-parse HEAD)" == "$release_sha" ]] || fail "Repeating the ancestry repair created a commit."
grep -q "already an ancestor" "$TEST_ROOT/output" || fail "Missing idempotence diagnostic."
echo "PASS: squashed repair PR history is recorded so the next sync stays clean"

new_landed_repair_repo heal-merge merge
git merge-base --is-ancestor "$first_main" HEAD || fail "Merge fixture did not preserve ancestry."
export GITHUB_STEP_SUMMARY="$TEST_ROOT/repair-summary"
: > "$GITHUB_STEP_SUMMARY"
run_repair_helper
[[ ! -s "$GITHUB_STEP_SUMMARY" ]] || fail "No-op ancestry repair wrote a summary."
unset GITHUB_STEP_SUMMARY
[[ "$(git rev-parse HEAD)" == "$release_sha" ]] || fail "Ancestry repair touched a merge-landed repair PR."
grep -q "already an ancestor" "$TEST_ROOT/output" || fail "Missing no-op diagnostic."
run_helper
assert_parents
[[ "$(cat region.txt)" == $'top\nsecond\nbottom' && "$(cat shared.txt)" == reconciled ]] || fail "Next sync revisited repaired content."
echo "PASS: merge-landed repair PR needs no ancestry repair"

new_landed_repair_repo heal-unrelated squash
unrelated_head="$(git commit-tree "$(git rev-parse 'HEAD^{tree}')" -m unrelated)"
repair_head="$unrelated_head"
run_repair_helper
grep -q "shares no history" "$TEST_ROOT/output" || fail "Missing no-shared-history warning."
[[ "$(git rev-parse HEAD)" == "$release_sha" && -z "$(git status --porcelain)" ]] || fail "Unrelated repair head changed release."
echo "PASS: repair PR head without main history is skipped"

new_landed_repair_repo heal-refusals squash
write_file untracked.txt dirty
repair_status=0
bash "$REPAIR_HELPER" main release/test "$repair_head" > "$TEST_ROOT/output" 2>&1 || repair_status=$?
[[ "$repair_status" == 1 ]] || fail "Dirty checkout must exit 1, got $repair_status."
grep -q "must be clean" "$TEST_ROOT/output" || { cat "$TEST_ROOT/output"; fail "Missing dirty-checkout diagnostic."; }
[[ "$(git rev-parse HEAD)" == "$release_sha" ]] || fail "Refused ancestry repair changed release HEAD."
rm -- untracked.txt
# Refuse Git's index lock without introducing tracked or untracked changes.
write_file .git/index.lock locked
repair_status=0
bash "$REPAIR_HELPER" main release/test "$repair_head" > "$TEST_ROOT/output" 2>&1 || repair_status=$?
[[ "$repair_status" -ne 0 ]] || fail "A failed ancestry merge was reported as success."
[[ "$(git rev-parse HEAD)" == "$release_sha" ]] || fail "A failed ancestry merge changed release HEAD."
rm -- .git/index.lock
if git rev-parse -q --verify MERGE_HEAD >/dev/null; then
  fail "Failed ancestry merge was not aborted."
fi
[[ -z "$(git status --porcelain)" ]] || fail "Failed ancestry merge left a dirty checkout."
echo "PASS: ancestry repair refuses dirty checkouts and fails without side effects"
