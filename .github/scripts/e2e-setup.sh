#!/usr/bin/env bash
# Runs the E2E setup tasks of frontend-build.yml in the background and times them.
#
#   e2e-setup.sh start NAME COMMAND...   start COMMAND detached, logging to $RUNNER_TEMP/NAME.log
#   e2e-setup.sh wait NAME...            wait for each task, print its log tail, fail if it failed
#   e2e-setup.sh time NAME COMMAND...    run COMMAND in the foreground and record its duration
#   e2e-setup.sh mark NAME               record a zero-length task (the origin of the report)
#   e2e-setup.sh report                  print the timings as a Markdown table into the step summary
#
# The detached subshell closes the step's stdout and stderr: a background process that keeps them
# open makes the runner wait about 5 s before it ends the step.
set -uo pipefail

dir="${RUNNER_TEMP:?}/e2e-setup"
mkdir -p "$dir"
now() { date +%s.%N; }
since() { awk -v a="$1" -v b="$(now)" 'BEGIN { printf "%.1f", b - a }'; }
record() { printf '%s\t%s\t%s\n' "$1" "$2" "$3" >> "$dir/timings.tsv"; }

case "${1:-}" in
  start)
    name=$2; shift 2
    (
      start=$(now)
      "$@" > "$dir/$name.log" 2>&1
      code=$?
      record "$name" "$start" "$(now)"
      echo "$code" > "$dir/$name.exit"
    ) < /dev/null > /dev/null 2>&1 &
    ;;
  wait)
    shift
    status=0
    for name in "$@"; do
      start=$(now)
      while [ ! -f "$dir/$name.exit" ]; do sleep 0.2; done
      code=$(cat "$dir/$name.exit")
      echo "::group::$name (exit $code, waited $(since "$start") s)"
      tail -n 20 "$dir/$name.log"
      echo "::endgroup::"
      [ "$code" = 0 ] || status=1
    done
    exit "$status"
    ;;
  time)
    name=$2; shift 2
    start=$(now)
    "$@"
    code=$?
    record "$name" "$start" "$(now)"
    exit "$code"
    ;;
  mark)
    t=$(now); record "$2" "$t" "$t"
    ;;
  report)
    {
      echo '### E2E setup timings'
      echo
      echo '| Task | Start (s) | End (s) | Duration (s) |'
      echo '|---|---:|---:|---:|'
      t0=$(sort -t$'\t' -k2,2n "$dir/timings.tsv" | head -n1 | cut -f2)
      sort -t$'\t' -k2,2n "$dir/timings.tsv" |
        awk -F'\t' -v t0="$t0" '{printf "| %s | %.1f | %.1f | %.1f |\n", $1, $2-t0, $3-t0, $3-$2}'
    } | tee -a "${GITHUB_STEP_SUMMARY:-/dev/null}"
    ;;
  *)
    echo "usage: $0 start|wait|time|report ..." >&2
    exit 2
    ;;
esac
