#!/usr/bin/env bash
#
# Scans the lines added by a pull request for forbidden words/phrases.
#
# Only newly added lines (those prefixed with '+' in the diff) are checked, so
# pre-existing text is never flagged. Rules are defined in
# .github/forbidden-words.json.
#
# In addition to failing when a forbidden phrase is found, this script records
# a machine-readable list of findings (see FINDINGS_FILE below). Each finding
# includes the corrected line produced by substituting every matched rule's
# 'pattern' with its 'replacement'. A companion workflow
# (.github/workflows/forbidden-words-suggest.yml) turns those findings into
# inline pull request review suggestions.
#
# Usage:
#   check-forbidden-words.sh <base_sha> <head_sha>
#
# Environment overrides:
#   CONFIG_FILE    Path to the rules file (default: .github/forbidden-words.json)
#   FINDINGS_FILE  When set, a JSON document of findings is written here (even
#                  when violations are present). Shape:
#                    { "findings": [ { "file", "line", "original",
#                                      "suggestion", "messages", "patterns" } ] }
#
# Exits non-zero when at least one forbidden phrase is found.

set -euo pipefail

BASE_SHA="${1:?base SHA required}"
HEAD_SHA="${2:?head SHA required}"
MERGE_BASE="$(git merge-base "$BASE_SHA" "$HEAD_SHA")" || { echo "::error::Unable to compute merge-base of $BASE_SHA and $HEAD_SHA"; exit 2; }
CONFIG_FILE="${CONFIG_FILE:-.github/forbidden-words.json}"
FINDINGS_FILE="${FINDINGS_FILE:-}"

if [[ ! -f "$CONFIG_FILE" ]]; then
  echo "::error::Config file not found: $CONFIG_FILE"
  exit 2
fi

command -v jq >/dev/null 2>&1 || { echo "::error::jq is required"; exit 2; }
command -v perl >/dev/null 2>&1 || { echo "::error::perl is required"; exit 2; }

# Read global exclude globs (newline separated).
mapfile -t GLOBAL_EXCLUDES < <(jq -r '.excludePaths // [] | .[]' "$CONFIG_FILE")

rule_count=$(jq '(.rules // []) | length' "$CONFIG_FILE")

# Emit an empty findings file up front so callers always have a valid document.
write_findings() {
  [[ -z "$FINDINGS_FILE" ]] && return 0
  if [[ -s "$FINDINGS_TMP" ]]; then
    jq -s '{findings: .}' "$FINDINGS_TMP" > "$FINDINGS_FILE"
  else
    printf '{"findings":[]}\n' > "$FINDINGS_FILE"
  fi
}

FINDINGS_TMP="$(mktemp)"
trap 'rm -f "$FINDINGS_TMP"' EXIT

if [[ "$rule_count" -eq 0 ]]; then
  echo "No rules defined in $CONFIG_FILE; nothing to check."
  write_findings
  exit 0
fi

# Every rule must define a non-empty replacement so a suggestion can be built.
missing_replacement=$(jq '[.rules[] | select((.replacement // "") == "")] | length' "$CONFIG_FILE")
if [[ "$missing_replacement" -ne 0 ]]; then
  echo "::error::Every rule in $CONFIG_FILE must define a non-empty \"replacement\". Found $missing_replacement rule(s) without one."
  exit 2
fi

# Preload rule fields to avoid re-invoking jq for every line.
mapfile -t PATTERNS       < <(jq -r '.rules[].pattern' "$CONFIG_FILE")
mapfile -t REPLACEMENTS   < <(jq -r '.rules[].replacement' "$CONFIG_FILE")
mapfile -t MESSAGES       < <(jq -r '.rules[] | (.message // "")' "$CONFIG_FILE")
mapfile -t CASE_SENSITIVE < <(jq -r '.rules[] | (.caseSensitive // false)' "$CONFIG_FILE")

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

# Substitutes every occurrence of a pattern with its replacement, inserting the
# replacement verbatim. Perl inserts the value of $r without reprocessing its
# contents, so no backreferences ($1) or escape sequences are interpreted.
# Matching honors the rule's case sensitivity.
apply_replacement() {
  CONTENT="$1" PAT="$2" REP="$3" CS="$4" perl -e '
    my $c = $ENV{CONTENT};
    my $p = $ENV{PAT};
    my $r = $ENV{REP};
    if ($ENV{CS} eq "true") { $c =~ s/$p/$r/g; } else { $c =~ s/$p/$r/gi; }
    print $c;
  '
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

  # Precompute which rules apply to this file (per-rule excludePaths).
  rule_applies=()
  for ((r = 0; r < rule_count; r++)); do
    mapfile -t RULE_EXCLUDES < <(jq -r ".rules[$r].excludePaths // [] | .[]" "$CONFIG_FILE")
    if ((${#RULE_EXCLUDES[@]} > 0)) && matches_any_glob "$file" "${RULE_EXCLUDES[@]}"; then
      rule_applies[$r]=0
    else
      rule_applies[$r]=1
    fi
  done

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

  # Check each added line against every applicable rule, aggregating all matches
  # on the line into a single corrected line (at most one suggestion per line).
  while IFS= read -r entry; do
    [[ -z "$entry" ]] && continue
    lineno="${entry%%:*}"
    content="${entry#*:}"

    corrected="$content"
    line_has_match=0
    line_messages=()
    line_patterns=()

    for ((r = 0; r < rule_count; r++)); do
      [[ "${rule_applies[$r]}" == "1" ]] || continue

      pattern="${PATTERNS[$r]}"
      replacement="${REPLACEMENTS[$r]}"
      message="${MESSAGES[$r]}"
      case_sensitive="${CASE_SENSITIVE[$r]}"

      grep_opts=(-P)
      if [[ "$case_sensitive" != "true" ]]; then
        grep_opts+=(-i)
      fi

      if printf '%s' "$content" | grep -q "${grep_opts[@]}" -- "$pattern"; then
        line_has_match=1
        violations=$((violations + 1))
        line_messages+=("$message")
        line_patterns+=("$pattern")

        printf '::error file=%s,line=%s::Forbidden phrase (/%s/): %s\n' \
          "$file" "$lineno" "$pattern" "$message"
        printf '    %s:%s: %s\n' "$file" "$lineno" "$content"

        corrected="$(apply_replacement "$corrected" "$pattern" "$replacement" "$case_sensitive")"
      fi
    done

    if [[ "$line_has_match" -eq 1 ]]; then
      messages_json=$(printf '%s\n' "${line_messages[@]}" | jq -R . | jq -s .)
      patterns_json=$(printf '%s\n' "${line_patterns[@]}" | jq -R . | jq -s .)
      jq -cn \
        --arg file "$file" \
        --argjson line "$lineno" \
        --arg original "$content" \
        --arg suggestion "$corrected" \
        --argjson messages "$messages_json" \
        --argjson patterns "$patterns_json" \
        '{file: $file, line: $line, original: $original, suggestion: $suggestion, messages: $messages, patterns: $patterns}' \
        >> "$FINDINGS_TMP"
    fi
  done <<< "$added_lines"
done

write_findings

echo
if [[ "$violations" -gt 0 ]]; then
  echo "Found $violations forbidden phrase occurrence(s) in added lines."
  echo "Update the wording, or adjust .github/forbidden-words.json if a rule is wrong."
  echo "Inline suggestions will be posted on the pull request where possible."
  exit 1
fi

echo "No forbidden phrases found in added lines."
