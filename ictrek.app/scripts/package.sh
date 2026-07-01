#!/usr/bin/env bash
set -euo pipefail

APP_NAME="motrix-next"
APP_ID="com.ictrek.motrix-next"
COMPONENT_NAME="motrix"
REGISTRY="swr.cn-southwest-2.myhuaweicloud.com/ictrek"
SPREADSHEET_TOKEN="${FEISHU_SPREADSHEET_TOKEN:-Htotsn3oahO1zxt73YMcaB1zn8e}"
FEISHU_CONFIG_FILE="${FEISHU_CONFIG_FILE:-${HOME}/.feishu.json}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC_DIR="${ROOT_DIR}/src"
DIST_DIR="${ROOT_DIR}/dist"
STAGE_DIR="${DIST_DIR}/staging"
PACKAGE_ROOT="${DIST_DIR}/package-root"
LOCK_DIR="${DIST_DIR}/.package.lock"

PROFILE=""
SKIP_PULL="${SKIP_PULL:-0}"

log() { echo "[INFO] $*"; }
err() { echo "[ERROR] $*" >&2; }
die() { err "$*"; exit 1; }

usage() {
  cat <<'EOF'
Usage:
  ./ictrek.app/scripts/package.sh arm
  ./ictrek.app/scripts/package.sh amd

Environment:
  FEISHU_CONFIG_FILE        Feishu credential JSON. Default: ~/.feishu.json
  FEISHU_SPREADSHEET_TOKEN  Release spreadsheet token.
  SKIP_PULL=1               Reuse an already-pulled local image when exporting.
EOF
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "missing command: $1"
}

acquire_lock() {
  while ! mkdir "$LOCK_DIR" 2>/dev/null; do
    sleep 1
  done
  trap 'rm -rf "$LOCK_DIR"' EXIT
}

detect_profile() {
  case "$(uname -m)" in
    x86_64|amd64) echo "amd" ;;
    arm64|aarch64) echo "arm" ;;
    *) die "unsupported architecture: $(uname -m). Use arm or amd." ;;
  esac
}

profile_arch() {
  case "$1" in
    arm) echo "arm64" ;;
    amd) echo "amd64" ;;
    *) die "unsupported profile: $1" ;;
  esac
}

profile_sheet() {
  case "$1" in
    arm) echo "ARM_without_cuda" ;;
    amd) echo "AMD_with_cuda" ;;
    *) die "unsupported profile: $1" ;;
  esac
}

read_feishu_field() {
  local field="$1"
  python3 - "$FEISHU_CONFIG_FILE" "$field" <<'PY'
import json
import sys

path, field = sys.argv[1], sys.argv[2]
with open(path, "r", encoding="utf-8") as f:
    data = json.load(f)
val = data.get(field, "")
print(val if isinstance(val, str) else str(val))
PY
}

feishu_api_json() {
  local method="$1"
  local url="$2"
  local token="$3"

  curl --fail -sS -X "$method" "$url" \
    -H "Authorization: Bearer ${token}"
}

get_feishu_token() {
  local app_id="$1"
  local app_secret="$2"
  local resp

  resp="$(
    curl --fail -sS -X POST "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal" \
      -H "Content-Type: application/json" \
      -d "{\"app_id\":\"${app_id}\",\"app_secret\":\"${app_secret}\"}"
  )"

  python3 - "$resp" <<'PY'
import json
import sys

data = json.loads(sys.argv[1])
if data.get("code") != 0:
    raise SystemExit(f"get_feishu_token failed: {data}")
print(data["tenant_access_token"])
PY
}

get_sheet_id_by_title() {
  local token="$1"
  local target_title="$2"
  local resp

  resp="$(feishu_api_json "GET" \
    "https://open.feishu.cn/open-apis/sheets/v3/spreadsheets/${SPREADSHEET_TOKEN}/sheets/query" \
    "$token")"

  python3 - "$target_title" "$resp" <<'PY'
import json
import sys

target, resp = sys.argv[1], sys.argv[2]
data = json.loads(resp)
if data.get("code") != 0:
    raise SystemExit(f"query sheets failed: {data}")
for sheet in data.get("data", {}).get("sheets", []):
    if sheet.get("title") == target:
        print(sheet["sheet_id"])
        raise SystemExit(0)
raise SystemExit(f"sheet title not found: {target}")
PY
}

get_range_values() {
  local token="$1"
  local range="$2"

  feishu_api_json "GET" \
    "https://open.feishu.cn/open-apis/sheets/v2/spreadsheets/${SPREADSHEET_TOKEN}/values/${range}" \
    "$token"
}

find_component_column_letter() {
  local token="$1"
  local sheet_id="$2"
  local component="$3"
  local resp

  resp="$(get_range_values "$token" "${sheet_id}!A1:ZZ1")"

  python3 - "$component" "$resp" <<'PY'
import json
import sys

target, resp = sys.argv[1], sys.argv[2]
data = json.loads(resp)
if data.get("code") != 0:
    raise SystemExit(f"read header failed: {data}")
values = data.get("data", {}).get("valueRange", {}).get("values", [])
row = values[0] if values else []

def text(value):
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, dict):
        return str(value.get("text") or value.get("link") or "").strip()
    if isinstance(value, list):
        return "".join(text(v) for v in value).strip()
    return str(value).strip()

def col(num):
    out = ""
    while num > 0:
        num, rem = divmod(num - 1, 26)
        out = chr(ord("A") + rem) + out
    return out

for index, value in enumerate(row, start=1):
    if text(value) == target:
        print(col(index))
        raise SystemExit(0)
raise SystemExit(f"component column not found in row1: {target}")
PY
}

find_latest_tag() {
  local token="$1"
  local sheet_id="$2"
  local column="$3"
  local resp

  resp="$(get_range_values "$token" "${sheet_id}!${column}4:${column}2000")"

  python3 - "$resp" <<'PY'
import json
import sys

data = json.loads(sys.argv[1])
if data.get("code") != 0:
    raise SystemExit(f"read version column failed: {data}")
values = data.get("data", {}).get("valueRange", {}).get("values", [])
for row in values:
    if not row:
        continue
    value = row[0]
    if value is None:
        continue
    text = str(value).strip()
    if text:
        print(text)
        raise SystemExit(0)
raise SystemExit("latest version not found")
PY
}

safe_name_from_image() {
  local image="$1"
  echo "$image" | sed -E 's|.*/||; s|[:/]|-|g'
}

render_file() {
  local src="$1"
  local dst="$2"
  python3 - "$src" "$dst" "$APP_VERSION" "$VOS_ARCH" "$MOTRIX_IMAGE" "$MOTRIX_ARCHIVE" <<'PY'
import sys
from pathlib import Path

src, dst = Path(sys.argv[1]), Path(sys.argv[2])
replacements = {
    "__APP_VERSION__": sys.argv[3],
    "__VOS_ARCH__": sys.argv[4],
    "__MOTRIX_IMAGE__": sys.argv[5],
    "__MOTRIX_ARCHIVE__": sys.argv[6],
}
text = src.read_text(encoding="utf-8")
for key, value in replacements.items():
    text = text.replace(key, value)
dst.write_text(text, encoding="utf-8")
PY
}

export_image() {
  local image="$1"
  local archive="$2"
  local out_dir="$3"

  mkdir -p "$out_dir"
  if [[ "$SKIP_PULL" != "1" ]]; then
    log "Pull ${image}"
    docker pull --platform "linux/${VOS_ARCH}" "$image"
  fi
  log "Save ${image} -> ${out_dir}/${archive}"
  docker save "$image" | gzip > "${out_dir}/${archive}"
  if command -v sha256sum >/dev/null 2>&1; then
    (cd "$out_dir" && sha256sum "$archive" > "${archive}.sha256")
  else
    (cd "$out_dir" && shasum -a 256 "$archive" > "${archive}.sha256")
  fi
}

verify_package() {
  local package_path="$1"
  local app_tarball="$2"

  tar tzf "$app_tarball" >/dev/null
  tar tf "$package_path" | grep -qx "app.tar.gz"
  tar tf "$package_path" | grep -qx "assets/${VOS_ARCH}/${MOTRIX_ARCHIVE}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    arm|amd)
      PROFILE="$1"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      err "unknown argument: $1"
      usage >&2
      exit 1
      ;;
  esac
done

PROFILE="${PROFILE:-$(detect_profile)}"
VOS_ARCH="$(profile_arch "$PROFILE")"
SHEET_TITLE="$(profile_sheet "$PROFILE")"
PACKAGE_VERSION="${PROFILE}_$(date +%y%m%d)"
APP_VERSION="0.0.1-${PROFILE}.$(date +%y%m%d)"

require_cmd curl
require_cmd docker
require_cmd gzip
require_cmd python3
require_cmd tar

[[ -f "$FEISHU_CONFIG_FILE" ]] || die "Feishu config not found: $FEISHU_CONFIG_FILE"

mkdir -p "$DIST_DIR"
acquire_lock

FEISHU_APP_ID="$(read_feishu_field "feishu_app_id")"
FEISHU_APP_SECRET="$(read_feishu_field "feishu_app_secret")"
[[ -n "$FEISHU_APP_ID" && -n "$FEISHU_APP_SECRET" ]] || die "feishu_app_id or feishu_app_secret missing"

log "Package version: ${PACKAGE_VERSION}"
log "Manifest version: ${APP_VERSION}"
log "Profile: ${PROFILE} (${VOS_ARCH}), sheet: ${SHEET_TITLE}"

FEISHU_TOKEN="$(get_feishu_token "$FEISHU_APP_ID" "$FEISHU_APP_SECRET")"
SHEET_ID="$(get_sheet_id_by_title "$FEISHU_TOKEN" "$SHEET_TITLE")"
COMPONENT_COL="$(find_component_column_letter "$FEISHU_TOKEN" "$SHEET_ID" "$COMPONENT_NAME")"
MOTRIX_TAG="$(find_latest_tag "$FEISHU_TOKEN" "$SHEET_ID" "$COMPONENT_COL")"
MOTRIX_IMAGE="${REGISTRY}/${COMPONENT_NAME}:${MOTRIX_TAG}"
MOTRIX_ARCHIVE="$(safe_name_from_image "$MOTRIX_IMAGE").tar.gz"

log "Motrix image: ${MOTRIX_IMAGE}"

rm -rf "$STAGE_DIR" "$PACKAGE_ROOT"
mkdir -p "$STAGE_DIR" "$PACKAGE_ROOT"

for file in manifest.yml docker-compose.yml configs.yml routers.yml README.zh-CN.md README.en.md; do
  render_file "${SRC_DIR}/${file}" "${STAGE_DIR}/${file}"
done

APP_TARBALL="${DIST_DIR}/app.tar.gz"
PACKAGE_PATH="${DIST_DIR}/${APP_NAME}_${PACKAGE_VERSION}.tar"
ASSET_DIR="${PACKAGE_ROOT}/assets/${VOS_ARCH}"

tar czf "$APP_TARBALL" -C "$STAGE_DIR" manifest.yml docker-compose.yml configs.yml routers.yml README.zh-CN.md README.en.md
cp "$APP_TARBALL" "${PACKAGE_ROOT}/app.tar.gz"
export_image "$MOTRIX_IMAGE" "$MOTRIX_ARCHIVE" "$ASSET_DIR"
tar cf "$PACKAGE_PATH" -C "$PACKAGE_ROOT" app.tar.gz assets
verify_package "$PACKAGE_PATH" "$APP_TARBALL"

log "Done: ${PACKAGE_PATH}"
