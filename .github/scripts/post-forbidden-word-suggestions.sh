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

set -euo pipefail

: "${GH_TOKEN:?GH_TOKEN required}"
: "${REPO:?REPO required}"
: "${PR_NUMBER:?PR_NUMBER required}"
: "${HEAD_SHA:?HEAD_SHA required}"
: "${FINDINGS_FILE:?FINDINGS_FILE required}"

command -v jq >/dev/null 2>&1 || { echo "::error::jq is required"; exit 2; }
command -v gh >/dev/null 2>&1 || { echo "::error::gh is required"; exit 2; }

if [[ ! -f "$FINDINGS_FILE" ]]; then
  echo "Findings file not found ($FINDINGS_FILE); nothing to suggest."
  exit 0
fi

total=$(jq '.findings | length' "$FINDINGS_FILE")
if [[ "$total" -eq 0 ]]; then
  echo "No findings; nothing to suggest."
  exit 0
fi

# Existing review comments on the PR, as {path, line} objects (line falls back to
# original_line for outdated comments). Used to avoid duplicate suggestions.
existing_json=$(gh api --paginate "/repos/$REPO/pulls/$PR_NUMBER/comments" \
  --jq '.[] | {path: .path, line: (.line // .original_line)}' | jq -s '.')

# Build the list of comments to post: findings that don't already have a comment
# on the same (path, line), rendered as a suggestion block.
comments_json=$(jq -n \
  --slurpfile f "$FINDINGS_FILE" \
  --argjson existing "$existing_json" \
  '
  $f[0].findings
  | map(select(. as $find
      | ($existing | any(.path == $find.file and .line == $find.line)) | not))
  | map({
      path: .file,
      line: .line,
      side: "RIGHT",
      body: ((.messages | join("\n")) + "\n\n```suggestion\n" + .suggestion + "\n```")
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
