#!/usr/bin/env bash
#
# Scans the lines added by a pull request for forbidden words/phrases.
#
# Only newly added lines (those prefixed with '+' in the diff) are checked, so
# pre-existing text is never flagged. Rules are defined in
# .github/forbidden-words.json.
#
# Usage:
#   check-forbidden-words.sh <base_sha> <head_sha>
#
# Environment overrides:
#   CONFIG_FILE  Path to the rules file (default: .github/forbidden-words.json)
#
# Exits non-zero when at least one forbidden phrase is found.

set -euo pipefail

BASE_SHA="${1:?base SHA required}"
HEAD_SHA="${2:?head SHA required}"
MERGE_BASE="$(git merge-base "$BASE_SHA" "$HEAD_SHA")" || { echo "::error::Unable to compute merge-base of $BASE_SHA and $HEAD_SHA"; exit 2; }
CONFIG_FILE="${CONFIG_FILE:-.github/forbidden-words.json}"

if [[ ! -f "$CONFIG_FILE" ]]; then
  echo "::error::Config file not found: $CONFIG_FILE"
  exit 2
fi

command -v jq >/dev/null 2>&1 || { echo "::error::jq is required"; exit 2; }

# Read global exclude globs (newline separated).
mapfile -t GLOBAL_EXCLUDES < <(jq -r '.excludePaths // [] | .[]' "$CONFIG_FILE")

rule_count=$(jq '(.rules // []) | length' "$CONFIG_FILE")
if [[ "$rule_count" -eq 0 ]]; then
  echo "No rules defined in $CONFIG_FILE; nothing to check."
  exit 0
fi

# Returns 0 if $1 matches any of the shell globs passed as remaining args.
matches_any_glob() {
  local path="$1"; shift
  local glob
  for glob in "$@"; do
    [[ -z "$glob" ]] && continue
    # shellcheck disable=SC2053
    if [[ "$path" == $glob ]]; then
      return 0
    fi
  done
  return 1
}

violations=0

# List the files changed between base and head (added/copied/modified/renamed).
mapfile -t CHANGED_FILES < <(git diff --name-only --diff-filter=ACMR "$MERGE_BASE" "$HEAD_SHA")

for file in "${CHANGED_FILES[@]}"; do
  [[ -z "$file" ]] && continue

  # Skip files excluded for every rule.
  if matches_any_glob "$file" "${GLOBAL_EXCLUDES[@]}"; then
    continue
  fi

  # Collect added lines as "<line_number>:<content>". --unified=0 keeps hunks
  # tight so we can track new-file line numbers from the @@ headers.
  diff_output=$(git diff --unified=0 "$MERGE_BASE" "$HEAD_SHA" -- "$file")
  [[ -z "$diff_output" ]] && continue

  added_lines=$(awk '
    /^@@/ {
      for (i = 1; i <= NF; i++) {
        if (substr($i, 1, 1) == "+") {
          s = substr($i, 2)
          split(s, parts, ",")
          line = parts[1] + 0
          break
        }
      }
      next
    }
    /^\+\+\+/ { next }
    /^\+/ {
      content = substr($0, 2)
      printf "%d:%s\n", line, content
      line++
    }
  ' <<< "$diff_output")

  [[ -z "$added_lines" ]] && continue

  for ((r = 0; r < rule_count; r++)); do
    pattern=$(jq -r ".rules[$r].pattern" "$CONFIG_FILE")
    message=$(jq -r ".rules[$r].message // \"\"" "$CONFIG_FILE")
    case_sensitive=$(jq -r ".rules[$r].caseSensitive // false" "$CONFIG_FILE")

    # Per-rule path excludes.
    mapfile -t RULE_EXCLUDES < <(jq -r ".rules[$r].excludePaths // [] | .[]" "$CONFIG_FILE")
    if ((${#RULE_EXCLUDES[@]} > 0)) && matches_any_glob "$file" "${RULE_EXCLUDES[@]}"; then
      continue
    fi

    grep_opts=(-P)
    if [[ "$case_sensitive" != "true" ]]; then
      grep_opts+=(-i)
    fi

    # Check each added line's content (line number stripped) against the rule.
    while IFS= read -r entry; do
      [[ -z "$entry" ]] && continue
      lineno="${entry%%:*}"
      content="${entry#*:}"
      if printf '%s' "$content" | grep -q "${grep_opts[@]}" -- "$pattern"; then
        printf '::error file=%s,line=%s::Forbidden phrase (/%s/): %s\n' \
          "$file" "$lineno" "$pattern" "$message"
        printf '    %s:%s: %s\n' "$file" "$lineno" "$content"
        violations=$((violations + 1))
      fi
    done <<< "$added_lines"
  done
done

echo
if [[ "$violations" -gt 0 ]]; then
  echo "Found $violations forbidden phrase occurrence(s) in added lines."
  echo "Update the wording, or adjust .github/forbidden-words.json if a rule is wrong."
  exit 1
fi

echo "No forbidden phrases found in added lines."
