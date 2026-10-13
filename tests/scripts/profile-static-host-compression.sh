#!/usr/bin/env bash
set -euo pipefail

root="$RUNNER_TEMP/statichost-publish"
comparison="$root/comparison"
tool="$root/profiler/CompressionProfile.dll"
project="$GITHUB_WORKSPACE/src/statichost/StaticHost/StaticHost.csproj"
publish="$GITHUB_WORKSPACE/src/statichost/StaticHost/bin/Release/net10.0/linux-x64/publish"
compressed="$GITHUB_WORKSPACE/src/statichost/StaticHost/obj/Release/net10.0/linux-x64/compressed/publish"
frontend="$GITHUB_WORKSPACE/src/frontend/dist"
server_pid=""

stop_server() {
  if [[ -n "$server_pid" ]] && kill -0 "$server_pid" 2>/dev/null; then
    kill "$server_pid"
    wait "$server_pid" || true
  fi
  server_pid=""
}
trap stop_server EXIT

mkdir -p "$comparison"
dotnet --info > "$comparison/dotnet-info.txt"
dotnet "$tool" snapshot "$frontend" "$comparison/frontend-input.json"
sha256sum "$publish/StaticHost.dll" "$publish/StaticHost.deps.json" \
  "$publish/StaticHost.runtimeconfig.json" > "$comparison/binaries.sha256"

# The initial publish rendered the frontend once. Keep its measurements but
# remove its archive before producing the controlled pair on this same runner.
rm -- "$root/images/aspiredev.tar.gz"

for level in SmallestSize Optimal; do
  variant="$comparison/$level"
  mkdir -p "$variant/images"
  if [[ "$(realpath "$publish")" != "$publish" || "$(realpath "$compressed")" != "$compressed" ]]; then
    echo "Refusing to clean redirected publish or compression directories." >&2
    exit 1
  fi
  rm -rf -- "$publish" "$compressed"
  /usr/bin/time -v -o "$variant/resources.txt" \
    dotnet publish "$project" --configuration Release --runtime linux-x64 --no-build \
      /t:PublishContainer \
      -p:BrotliCompressionLevel="$level" \
      "-p:BuildCommand=dotnet \"$tool\" verify \"$comparison/frontend-input.json\"" \
      -p:ContainerRepository=aspiredev \
      -p:ContainerImageTag=ci \
      -p:ContainerImageFormat=OCI \
      -p:ContainerArchiveOutputPath="$variant/images" \
      "-bl:$variant/publish.binlog;ProjectImports=None" \
      2>&1 | tee "$variant/publish.log"
  dotnet "$tool" verify "$comparison/frontend-input.json"
  sha256sum --check "$comparison/binaries.sha256"
  pwsh -NoProfile -NonInteractive -File "$GITHUB_WORKSPACE/tests/scripts/Measure-StaticHostPublish.ps1" \
    -PublishDirectory "$publish" -FrontendDirectory "$frontend" \
    -DiagnosticsDirectory "$variant" -SummaryPath "$GITHUB_STEP_SUMMARY" -BrotliLevel "$level"
  dotnet "$tool" describe "$publish" "$variant/files.json"
  dotnet "$tool" tasks "$variant/publish.binlog" "$variant/tasks.json"
  dotnet "$tool" image "$variant/images/aspiredev.tar.gz" "$variant/image.json"

  dotnet "$tool" serve "$publish" http://127.0.0.1:4322 > "$variant/server.log" 2>&1 &
  server_pid=$!
  ready=false
  for attempt in $(seq 1 120); do
    if ! kill -0 "$server_pid" 2>/dev/null; then
      cat "$variant/server.log" >&2
      echo "Published endpoint server exited before becoming ready." >&2
      exit 1
    fi
    if curl --fail --silent http://127.0.0.1:4322/__profile/stats > /dev/null; then
      ready=true
      break
    fi
    sleep 1
  done
  if [[ "$ready" != true ]]; then
    cat "$variant/server.log" >&2
    echo "Published endpoint server did not become ready." >&2
    exit 1
  fi
  (
    cd "$GITHUB_WORKSPACE/src/frontend"
    node scripts/profile-static-host-compression.mjs run \
      http://127.0.0.1:4322 "$variant/files.json" "$level" "$variant/browser.json"
  )
  stop_server
  rm -- "$variant/images/aspiredev.tar.gz"
done

(
  cd "$GITHUB_WORKSPACE/src/frontend"
  node scripts/profile-static-host-compression.mjs compare "$comparison" "$GITHUB_STEP_SUMMARY"
)
