#!/usr/bin/env bash
set -euo pipefail

language="${1:?language is required}"
scenario_directory="${2:?scenario directory is required}"
tools_root="${3:-$HOME/.cache/aspire-lang-tools}"

aspire="$tools_root/aspire/aspire"
export PATH="$tools_root/bin:$tools_root/go/bin:$tools_root/node/bin:$tools_root/jdk/bin:$tools_root/cargo/bin:$PATH"
export ASPIRE_HOME="$tools_root/aspire-home"
export ASPIRE_CLI_TELEMETRY_OPTOUT=1
export ASPIRE_CLI_START_TIMEOUT=300
export NO_COLOR=1
export DOTNET_DEV_CERTS_OPENSSL_CERTIFICATE_DIRECTORY="$tools_root/dev-certs"
export DOTNET_DEV_CERTS_NSSDB_PATHS="$tools_root/no-browser-dbs"
export SSL_CERT_DIR="$tools_root/dev-certs:/usr/lib/ssl/certs"
export RUSTUP_HOME="$tools_root/rustup"
export CARGO_HOME="$tools_root/cargo"
export CC="$tools_root/bin/cc"
export CARGO_TARGET_X86_64_UNKNOWN_LINUX_GNU_LINKER="$tools_root/bin/cc"
export "features__experimentalPolyglot__${language}=true"

json_field() {
  local field="$1"
  python3 -c '
import json, sys
field = sys.argv[1]
text = sys.stdin.read()
start = text.find("{")
if start < 0:
    raise SystemExit("Aspire did not return JSON")
print(json.loads(text[start:])[field])
' "$field"
}

apphost_file=''
cleanup() {
  printf '\n$ aspire stop --force --non-interactive\n'
  "$aspire" --nologo stop --force --non-interactive >/dev/null 2>&1 || true
  if [[ -n "$apphost_file" ]]; then
    printf '%s stopped and cleaned up.\n' "$apphost_file"
  fi
}
trap cleanup EXIT

cd "$scenario_directory"

printf '$ aspire start --isolated --format Json --non-interactive\n'
start_output="$("$aspire" --nologo start --isolated --format Json --non-interactive 2>&1)"
apphost_path="$(printf '%s' "$start_output" | json_field appHostPath)"
apphost_file="$(basename "$apphost_path")"
apphost_pid="$(printf '%s' "$start_output" | json_field appHostPid)"
dashboard_url="$(printf '%s' "$start_output" | json_field dashboardUrl)"
dashboard_base="${dashboard_url%%/login*}/"

printf 'AppHost: %s\n' "$apphost_file"
printf 'Process: %s\n' "$apphost_pid"
printf 'Dashboard: %s\n\n' "$dashboard_base"

resource_url=''
for _ in $(seq 1 30); do
  sleep 1
  describe_output="$("$aspire" --nologo describe --format Json --non-interactive 2>&1 || true)"
  resource_url="$(
    printf '%s' "$describe_output" |
      python3 -c '
import json, sys
text = sys.stdin.read()
start = text.find("{")
if start < 0:
    raise SystemExit(0)
data = json.loads(text[start:])
for resource in data.get("resources", []):
    if resource.get("displayName") == "web" and resource.get("state") == "Running":
        urls = resource.get("urls", [])
        if urls:
            print(urls[0]["url"])
            break
'
  )"
  [[ -n "$resource_url" ]] && break
done

if [[ -z "$resource_url" ]]; then
  echo 'The web resource did not become healthy.' >&2
  exit 1
fi

printf '$ aspire describe --format Table\n'
"$aspire" --nologo describe --format Table --non-interactive
printf '\n$ curl %s\n' "$resource_url"
if [[ "$language" == 'rust' ]]; then
  status="$(curl -LsS -o /dev/null -w '%{http_code}' "$resource_url")"
  printf 'HTTP/%s\nExternal service reachable.\n' "$status"
else
  response_file="$(mktemp)"
  status="$(curl -sS -o "$response_file" -w '%{http_code}' "$resource_url")"
  printf 'HTTP/%s\n' "$status"
  cat "$response_file"
  rm "$response_file"
fi
