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
JINT_COMMIT=9468698ffa683bf71bdfe3002bd434d5cdc4bc9e
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
    # Jint 5 is not on nuget.org yet: build the tool from a pinned commit (the runner has the .NET 10 SDK).
    git clone -q --filter=blob:none https://github.com/sebastienros/jint.git "$TOOLS/jint"
    git -C "$TOOLS/jint" checkout -q "$JINT_COMMIT"
    dotnet build -c Release -f net10.0 "$TOOLS/jint/Jint.Browser.Tool" -p:TreatWarningsAsErrors=false -p:RunAnalyzers=false > "$OUT/jint-build.log" 2>&1 \
      || { tail -n 30 "$OUT/jint-build.log"; exit 1; }
    dotnet "$TOOLS/jint/artifacts/bin/Jint.Browser.Tool/release_net10.0/Jint.Browser.Tool.dll" serve --port 9222 > "$OUT/browser.log" 2>&1 &
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
CDP_ENDPOINT=$endpoint PLAYWRIGHT_JSON_OUTPUT_NAME="$OUT/$ENGINE.json" \
  bun run playwright test --config "$config" --project=desktop-chromium --retries=0 --reporter=dot,json "$SLICE"
status=$?
tests_end=$(now)

{
  node tests/cdp/summarize.mjs "$OUT/$ENGINE.json" "$ENGINE"
  printf 'Browser provisioning: %.1f s. Playwright command: %.1f s. Exit code: %s.\n\n' \
    "$(echo "$setup_end - $setup_start" | bc)" "$(echo "$tests_end - $tests_start" | bc)" "$status"
} | tee -a "${GITHUB_STEP_SUMMARY:-/dev/null}"
printf '{"engine":"%s","setupS":%.1f,"testsS":%.1f,"exit":%s}\n' "$ENGINE" \
  "$(echo "$setup_end - $setup_start" | bc)" "$(echo "$tests_end - $tests_start" | bc)" "$status" > "$OUT/$ENGINE.timing.json"
# The prototype reports; it does not gate the PR.
exit 0
