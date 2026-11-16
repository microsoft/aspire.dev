#!/usr/bin/env bash
# Prototype (E2E driver and browser alternatives): provisions one browser, runs the slice of specs against it on the
# desktop-chromium project and writes a summary. Run from src/frontend once StaticHost is built (STATICHOST_NO_BUILD).
#   ENGINE: playwright | playwright-no-recording | chromium-cdp | lightpanda | jint-browser | kitesurf
#   SLICE:  a Playwright file filter (regular expression)
# kitesurf expects the engine to be already listening on 127.0.0.1:9222 (the kitesurf job builds and starts it).
set -uo pipefail

ENGINE=${ENGINE:?}
SLICE=${SLICE:-'/(analytics-scripts|dev-browse|cookie-dialog-layout|og-metadata)\.spec\.ts'}
OUT=${OUT:-"$PWD/cdp-results"}
TOOLS=${RUNNER_TEMP:-/tmp}/cdp-tools
LIGHTPANDA_VERSION=1.0.4
JINT_VERSION=5.0.0-preview.2503
# SUBSET=1: the 34 tests that tests/E2E.Jint ports to xUnit on Jint.Browser's in-process API.
SUBSET_GREP='only displayed resource artwork|Dev Hub leads to the complete|tutorials and quickstarts keep|article language filters include|every ingested official blog post|empty results preserve useful|multi-type filters and sorting|legacy provider links|analytics|metadata|og:type|og:image|site description|site-wide image|content languages'
grep_args=()
if [ -n "${SUBSET:-}" ]; then
  SLICE='/(analytics-scripts|dev-browse|og-metadata)\.spec\.ts'
  grep_args=(--grep "$SUBSET_GREP" --grep-invert 'video platforms')
fi
LABEL="$ENGINE${SUBSET:+-subset}"
mkdir -p "$OUT" "$TOOLS"

now() { date +%s.%N; }
wait_for() { for _ in $(seq 1 "${2:-120}"); do curl -sf -o /dev/null "$1" && return 0; sleep 1; done; echo "::error::$1 did not answer"; return 1; }

setup_start=$(now)
config=playwright.cdp.config.mjs
case "$ENGINE" in
  playwright | playwright-no-recording)
    # playwright.cdp.config.mjs without CDP_ENDPOINT: Playwright launches Chromium, with no trace or video.
    [ "$ENGINE" = playwright ] && config=playwright.douze.config.mjs
    bun run playwright install --with-deps chromium >/dev/null
    ;;
  chromium-cdp)
    bun run playwright install --with-deps chromium-headless-shell >/dev/null
    shell=$(ls -d "$HOME"/.cache/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell | head -n 1)
    "$shell" --remote-debugging-port=9222 --user-data-dir="$TOOLS/chrome-profile" --no-first-run --no-sandbox \
      --hide-scrollbars --mute-audio about:blank > "$OUT/browser.log" 2>&1 &
    wait_for http://127.0.0.1:9222/json/version 60 || exit 1
    ;;
  lightpanda)
    curl -sSfL -o "$TOOLS/lightpanda" "https://github.com/lightpanda-io/browser/releases/download/$LIGHTPANDA_VERSION/lightpanda-x86_64-linux"
    chmod +x "$TOOLS/lightpanda"
    "$TOOLS/lightpanda" version || true
    # Stylesheets and images are off by default in `serve`; the specs read styles and wait for images.
    "$TOOLS/lightpanda" serve --host 127.0.0.1 --port 9222 --load-resources stylesheet,image --disable-metrics \
      --cdp-max-connections 64 > "$OUT/browser.log" 2>&1 &
    wait_for http://127.0.0.1:9222/json/version 30 || { cat "$OUT/browser.log"; exit 1; }
    ;;
  jint-browser)
    # The jint-browser tool from the Jint preview feed (Jint 5 is not on nuget.org yet): a native AOT executable,
    # the same package version as the Jint.Browser library of tests/E2E.Jint.
    dotnet tool install Jint.Browser.Tool --version "$JINT_VERSION" --tool-path "$TOOLS/jint-browser" \
      --configfile ../../tests/E2E.Jint/NuGet.config > "$OUT/jint-install.log" 2>&1 \
      || { cat "$OUT/jint-install.log"; exit 1; }
    "$TOOLS/jint-browser/jint-browser" version
    "$TOOLS/jint-browser/jint-browser" serve --port 9222 > "$OUT/browser.log" 2>&1 &
    wait_for http://127.0.0.1:9222/json/version 60 || { cat "$OUT/browser.log"; exit 1; }
    ;;
  kitesurf)
    wait_for http://127.0.0.1:9222/json/version 30 || exit 1
    ;;
  *) echo "::error::Unknown engine $ENGINE"; exit 1 ;;
esac
setup_end=$(now)
curl -s http://127.0.0.1:9222/json/version 2>/dev/null | head -c 300 && echo

endpoint=http://127.0.0.1:9222
case "$ENGINE" in playwright | playwright-no-recording) endpoint= ;; esac

tests_start=$(now)
CDP_ENDPOINT=$endpoint PLAYWRIGHT_JSON_OUTPUT_NAME="$OUT/$LABEL.json" \
  bun run playwright test --config "$config" --project=desktop-chromium --retries=0 --reporter=dot,json "${grep_args[@]}" "$SLICE"
status=$?
tests_end=$(now)

{
  node tests/cdp/summarize.mjs "$OUT/$LABEL.json" "$LABEL"
  printf 'Browser provisioning (download and install included): %.1f s. Playwright command: %.1f s. Exit code: %s.\n\n' \
    "$(echo "$setup_end - $setup_start" | bc)" "$(echo "$tests_end - $tests_start" | bc)" "$status"
} | tee -a "${GITHUB_STEP_SUMMARY:-/dev/null}"
printf '{"engine":"%s","setupS":%.1f,"testsS":%.1f,"exit":%s}\n' "$LABEL" \
  "$(echo "$setup_end - $setup_start" | bc)" "$(echo "$tests_end - $tests_start" | bc)" "$status" > "$OUT/$LABEL.timing.json"
# The prototype reports; it does not gate the PR.
exit 0
