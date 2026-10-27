#!/usr/bin/env bash
#
# Posts inline pull request review suggestions for forbidden-word findings.
#
# Reads the findings document produced by check-forbidden-words.sh and, for each
# finding, posts an inline review comment containing a GitHub ```suggestion```
# block that rewrites the offending line. A suggestion is skipped when a review
# comment already exists on that (path, line), so re-runs do not pile up
# duplicates.
#
# This script only reads the findings JSON as data and calls the GitHub API; it
# never checks out or executes pull request code, so it is safe to run from the
# privileged `workflow_run` context.
#
# Required environment:
#   GH_TOKEN       Token with `pull-requests: write` (the Aspire bot app token).
#   REPO           "owner/repo".
#   PR_NUMBER      Pull request number.
#   HEAD_SHA       Commit SHA the findings were computed against.
#   FINDINGS_FILE  Path to the findings JSON document.
#   CONFIG_FILE    Path to the trusted forbidden-words rules document.

set -euo pipefail

: "${GH_TOKEN:?GH_TOKEN required}"
: "${REPO:?REPO required}"
: "${PR_NUMBER:?PR_NUMBER required}"
: "${HEAD_SHA:?HEAD_SHA required}"
: "${FINDINGS_FILE:?FINDINGS_FILE required}"
: "${CONFIG_FILE:?CONFIG_FILE required}"

command -v jq >/dev/null 2>&1 || { echo "::error::jq is required"; exit 2; }
command -v gh >/dev/null 2>&1 || { echo "::error::gh is required"; exit 2; }

if [[ ! -f "$FINDINGS_FILE" ]]; then
  echo "Findings file not found ($FINDINGS_FILE); nothing to suggest."
  exit 0
fi

if ! jq -e '.rules | type == "array"' "$CONFIG_FILE" >/dev/null 2>&1; then
  echo "::error::Trusted rules file is missing or invalid ($CONFIG_FILE)."
  exit 2
fi

# The findings document originates from a PR-scoped run, so treat it as
# untrusted input: if it isn't valid JSON with a findings array, skip quietly
# instead of failing this best-effort workflow.
if ! jq -e '.findings | type == "array"' "$FINDINGS_FILE" >/dev/null 2>&1; then
  echo "::warning::Findings file is missing or not a valid findings document ($FINDINGS_FILE); skipping suggestions."
  exit 0
fi

total=$(jq '.findings | length' "$FINDINGS_FILE")
if [[ "$total" -eq 0 ]]; then
  echo "No findings; nothing to suggest."
  exit 0
fi

# Existing review comments on the PR, as {path, line} objects (line falls back to
# original_line for outdated comments). Used to avoid duplicate suggestions.
# If the listing fails (permissions, rate limiting, transient network), skip
# rather than risk posting duplicates or failing this best-effort workflow.
if ! existing_raw=$(gh api --paginate "/repos/$REPO/pulls/$PR_NUMBER/comments" \
    --jq '.[] | {path: .path, line: (.line // .original_line)}' 2>/tmp/list-comments.err); then
  echo "::warning::Could not list existing PR comments; skipping suggestions to avoid duplicates."
  sed 's/^/  gh: /' /tmp/list-comments.err >&2 || true
  exit 0
fi
existing_json=$(printf '%s' "$existing_raw" | jq -s '.')

# Build the list of comments to post: findings that don't already have a comment
# on the same (path, line), rendered as a suggestion block.
comments_json=$(jq -n \
  --slurpfile f "$FINDINGS_FILE" \
  --slurpfile config "$CONFIG_FILE" \
  --argjson existing "$existing_json" \
  '
  ($config[0].rules | map({key: .pattern, value: (.message // "")}) | from_entries) as $messages
  |
  $f[0].findings
  | map(select(
      (.file | type) == "string" and
      (.file | length > 0) and
      (.line | type) == "number" and
      (.line > 0 and .line == (.line | floor)) and
      (.suggestion | type) == "string" and
      ((.suggestion | contains("\n")) | not) and
      ((.suggestion | contains("\r")) | not) and
      ((.suggestion | contains("```")) | not) and
      (.patterns | type == "array") and
      (.patterns | length > 0) and
      (all(.patterns[]; type == "string")) and
      (all(.patterns[]; . as $pattern | $messages | has($pattern)))
    ))
  | map(select(. as $find
      | ($existing | any(.path == $find.file and .line == $find.line)) | not))
  | map({
      path: .file,
      line: .line,
      side: "RIGHT",
      body: ((.patterns | map($messages[.]) | join("\n")) + "\n\n```suggestion\n" + .suggestion + "\n```")
    })
  ')

count=$(jq 'length' <<< "$comments_json")
if [[ "$count" -eq 0 ]]; then
  echo "All $total finding(s) already have a comment on their line; nothing to post."
  exit 0
fi

echo "Posting $count new inline suggestion(s) (of $total finding(s))."

# Prefer a single batched review so all suggestions appear together.
review_payload=$(jq -n \
  --arg commit "$HEAD_SHA" \
  --argjson comments "$comments_json" \
  '{
     commit_id: $commit,
     event: "COMMENT",
     body: "Automated wording suggestions from the forbidden-words check. Apply the suggestions to resolve them.",
     comments: $comments
   }')

if printf '%s' "$review_payload" \
    | gh api --method POST "/repos/$REPO/pulls/$PR_NUMBER/reviews" --input - >/dev/null 2>/tmp/review.err; then
  echo "Posted a review with $count inline suggestion(s)."
  exit 0
fi

echo "::warning::Batched review failed; falling back to individual comments."
sed 's/^/  gh: /' /tmp/review.err >&2 || true

# Fallback: post each suggestion independently so one bad line can't block the rest.
ok=0
fail=0
while IFS= read -r c; do
  [[ -z "$c" ]] && continue
  path=$(jq -r '.path' <<< "$c")
  line=$(jq -r '.line' <<< "$c")
  if jq -n \
      --arg commit "$HEAD_SHA" \
      --arg path "$path" \
      --argjson line "$line" \
      --arg body "$(jq -r '.body' <<< "$c")" \
      '{commit_id: $commit, path: $path, line: $line, side: "RIGHT", body: $body}' \
      | gh api --method POST "/repos/$REPO/pulls/$PR_NUMBER/comments" --input - >/dev/null 2>&1; then
    ok=$((ok + 1))
  else
    fail=$((fail + 1))
    echo "::warning::Could not post suggestion on $path:$line."
  fi
done < <(jq -c '.[]' <<< "$comments_json")

echo "Individual fallback: $ok posted, $fail failed."
# Best-effort: never fail the workflow just because suggestions couldn't post.
exit 0
