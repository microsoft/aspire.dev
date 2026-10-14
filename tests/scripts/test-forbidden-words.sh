#!/usr/bin/env bash
set -euo pipefail

scanner="$(cd "$(dirname "$0")/../.." && pwd)/.github/scripts/check-forbidden-words.sh"
fixture="$(mktemp -d)"
trap 'rm -rf "$fixture"' EXIT
cd "$fixture"
git init -q
git config user.name "Scanner test"
git config user.email "scanner-test@example.invalid"
git config core.autocrlf false

printf 'legacy\nunchanged\n' > content.txt
git add content.txt
git commit -qm base
base="$(git rev-parse HEAD)"

cat >> content.txt <<'EOF'
Legacy OLD
prefix legacy
legacy: exact
SPECIAL special
context old
EOF
printf 'Legacy OLD\n' > excluded.txt
printf 'Legacy OLD\n' > per-rule.txt
awk 'BEGIN { for (i = 1; i <= 20000; i++) print "ordinary generated metadata" }' > large.txt
git add .
git commit -qm additions
head="$(git rev-parse HEAD)"

cat > rules.json <<'EOF'
{
  "excludePaths": ["excluded.txt"],
  "rules": [
    {"pattern": "^legacy", "replacement": "$1\\literal", "message": "Rename legacy"},
    {"pattern": "\\bOLD\\b", "replacement": "new", "message": "Rename old", "excludePaths": ["per-*.txt"]},
    {"pattern": "SPECIAL", "replacement": "current", "caseSensitive": true, "message": "Case sensitive"},
    {"pattern": "(?<=context )old", "replacement": "modern", "message": "Lookbehind"}
  ]
}
EOF

run_scan() {
  local expected="$1" status=0
  CONFIG_FILE=rules.json FINDINGS_FILE=findings.json \
    bash "$scanner" "$base" "$head" > scan.log 2>&1 || status=$?
  if [[ "$status" != "$expected" ]]; then
    cat scan.log
    echo "Expected exit $expected, received $status" >&2
    exit 1
  fi
}

run_scan 1
# The anchored rule must not match "prefix legacy"; only new lines are scanned.
jq -e '
  (.findings | length) == 5 and
  ([.findings[] | select(.file == "content.txt") | .line] == [3, 5, 6, 7]) and
  (.findings[] | select(.file == "content.txt" and .line == 3) |
    .original == "Legacy OLD" and .suggestion == "$1\\literal new" and
    .patterns == ["^legacy", "\\bOLD\\b"]) and
  (.findings[] | select(.line == 6) | .suggestion == "current special") and
  (.findings[] | select(.line == 7) | .suggestion == "context new" and (.patterns | length) == 2) and
  (.findings[] | select(.file == "per-rule.txt") | .suggestion == "$1\\literal OLD") and
  (all(.findings[]; .file != "excluded.txt" and .file != "large.txt"))
' findings.json > /dev/null

printf '{"rules":[{"pattern":"not present","replacement":"fine"}]}\n' > rules.json
run_scan 0
jq -e '.findings == []' findings.json > /dev/null

printf '{"rules":[{"pattern":"(","replacement":"fine"}]}\n' > rules.json
run_scan 2

printf '{"rules":[{"pattern":"legacy"}]}\n' > rules.json
run_scan 2

printf '{"rules":[]}\n' > rules.json
run_scan 0
jq -e '.findings == []' findings.json > /dev/null

echo "Forbidden-word scanner regression checks passed."
