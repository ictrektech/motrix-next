#!/usr/bin/env bash
set -euo pipefail

IMG_NAME="motrix"

FEISHU_CONFIG_FILE="${HOME}/.feishu.json"
FEISHU_SPREADSHEET_TOKEN="Htotsn3oahO1zxt73YMcaB1zn8e"

AMD_SHEETS=("AMD_with_cuda" "AMD_with_mxn100")
ARM_SHEETS=("ARM_without_cuda" "ARM_with_cuda" "l4t" "thor_spark" "SOPHON_bm1688")

declare -A PROFILE_TO_DOCKERFILE=(
  ["amd"]="Dockerfile.amd"
  ["arm"]="Dockerfile.arm"
)

declare -A PROFILE_TO_PLATFORM=(
  ["amd"]="linux/amd64"
  ["arm"]="linux/arm64"
)

log() {
  echo "[INFO] $*"
}

err() {
  echo "[ERROR] $*" >&2
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    err "missing command: $1"
    exit 1
  }
}

contains() {
  local needle="$1"
  shift
  local item
  for item in "$@"; do
    [[ "$item" == "$needle" ]] && return 0
  done
  return 1
}

read_feishu_field() {
  local field="$1"
  python3 - "$FEISHU_CONFIG_FILE" "$field" <<'PY'
import json, sys
path, field = sys.argv[1], sys.argv[2]
with open(path, 'r', encoding='utf-8') as f:
    data = json.load(f)
val = data.get(field, "")
if not isinstance(val, str):
    val = str(val)
print(val)
PY
}

get_feishu_token() {
  local app_id="$1"
  local app_secret="$2"
  local resp

  resp=$(
    curl --fail -sS -X POST 'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal' \
      -H 'Content-Type: application/json' \
      -d "{
        \"app_id\": \"${app_id}\",
        \"app_secret\": \"${app_secret}\"
      }"
  ) || {
    err "get_feishu_token: curl failed"
    return 1
  }

  python3 - "$resp" <<'PY'
import json, sys
resp = sys.argv[1]
if not resp:
    raise SystemExit("get_feishu_token: empty response")
try:
    data = json.loads(resp)
except Exception as e:
    raise SystemExit(f"get_feishu_token: invalid json: {resp[:500]!r}, error={e}")
if data.get("code") != 0:
    raise SystemExit(f"get_feishu_token failed: {data}")
print(data["tenant_access_token"])
PY
}

feishu_api_json() {
  local method="$1"
  local url="$2"
  local token="$3"
  local body="${4:-}"

  if [[ -n "$body" ]]; then
    curl --fail -sS -X "$method" "$url" \
      -H "Authorization: Bearer ${token}" \
      -H "Content-Type: application/json" \
      --data "$body"
  else
    curl --fail -sS -X "$method" "$url" \
      -H "Authorization: Bearer ${token}"
  fi
}

get_sheet_id_by_title() {
  local token="$1"
  local spreadsheet_token="$2"
  local target_title="$3"
  local resp

  resp=$(
    feishu_api_json "GET" \
      "https://open.feishu.cn/open-apis/sheets/v3/spreadsheets/${spreadsheet_token}/sheets/query" \
      "$token"
  ) || {
    err "get_sheet_id_by_title: curl failed"
    return 1
  }

  python3 - "$target_title" "$resp" <<'PY'
import sys, json
target = sys.argv[1]
resp = sys.argv[2]
if not resp:
    raise SystemExit("get_sheet_id_by_title: empty response")
try:
    data = json.loads(resp)
except Exception as e:
    raise SystemExit(f"get_sheet_id_by_title invalid json: {resp[:500]!r}, error={e}")
if data.get("code") != 0:
    raise SystemExit(f"query sheets failed: {data}")
for s in data["data"]["sheets"]:
    if s.get("title") == target:
        print(s["sheet_id"])
        raise SystemExit(0)
raise SystemExit(f"sheet title not found: {target}")
PY
}

get_range_values() {
  local token="$1"
  local spreadsheet_token="$2"
  local range="$3"

  feishu_api_json "GET" \
    "https://open.feishu.cn/open-apis/sheets/v2/spreadsheets/${spreadsheet_token}/values/${range}" \
    "$token"
}

find_component_column_letter() {
  local token="$1"
  local spreadsheet_token="$2"
  local sheet_id="$3"
  local component_name="$4"
  local resp result status value cell resp2 meta_resp column_count

  resp=$(get_range_values "$token" "$spreadsheet_token" "${sheet_id}!A1:ZZ2") || {
    err "find_component_column_letter: read range failed"
    return 1
  }

  result=$(python3 - "$component_name" "$resp" <<'PYFIND'
import sys, json

target = sys.argv[1]
resp = sys.argv[2]
if not resp:
    raise SystemExit("find_component_column_letter: empty response")
try:
    data = json.loads(resp)
except Exception as e:
    raise SystemExit(f"find_component_column_letter invalid json: {resp[:500]!r}, error={e}")
if data.get("code") != 0:
    raise SystemExit(f"read header failed: {data}")
values = data.get("data", {}).get("valueRange", {}).get("values", [])
rows = values[:2]
header = rows[0] if rows else []
repo = rows[1] if len(rows) > 1 else []

def text(v):
    if v is None:
        return ""
    if isinstance(v, str):
        return v.strip()
    if isinstance(v, dict):
        return str(v.get("text") or v.get("link") or "").strip()
    if isinstance(v, list):
        return "".join(text(x) for x in v).strip()
    return str(v).strip()

def col(n):
    s = ""
    while n > 0:
        n, r = divmod(n - 1, 26)
        s = chr(ord("A") + r) + s
    return s

for i, v in enumerate(header, start=1):
    if text(v) == target:
        print(f"FOUND\t{col(i)}")
        raise SystemExit(0)

last = 1
for row in (header, repo):
    for i, v in enumerate(row, start=1):
        if text(v):
            last = max(last, i)
print(f"MISSING\t{last}")
PYFIND
  )

  status="${result%%$'\t'*}"
  value="${result#*$'\t'}"
  if [[ "$status" == "FOUND" ]]; then
    echo "$value"
    return 0
  fi
  if [[ "$status" != "MISSING" ]]; then
    err "find_component_column_letter: unexpected result: $result"
    return 1
  fi

  meta_resp=$(feishu_api_json "GET" \
    "https://open.feishu.cn/open-apis/sheets/v3/spreadsheets/${spreadsheet_token}/sheets/query" \
    "$token") || {
    err "query sheet metadata failed"
    return 1
  }

  column_count=$(python3 - "$sheet_id" "$meta_resp" <<'PYSHEET'
import json, sys
sheet_id, resp = sys.argv[1], sys.argv[2]
data = json.loads(resp)
if data.get("code") != 0:
    raise SystemExit(f"query sheets failed: {data}")
for sheet in data.get("data", {}).get("sheets", []):
    if sheet.get("sheet_id") == sheet_id:
        print(sheet.get("grid_properties", {}).get("column_count", 0))
        raise SystemExit(0)
raise SystemExit(f"sheet id not found: {sheet_id}")
PYSHEET
  )

  if (( value >= column_count )); then
    resp2=$(feishu_api_json "POST" \
      "https://open.feishu.cn/open-apis/sheets/v2/spreadsheets/${spreadsheet_token}/dimension_range" \
      "$token" \
      "{\"dimension\":{\"sheetId\":\"${sheet_id}\",\"majorDimension\":\"COLUMNS\",\"length\":1}}") || {
      err "append component column failed"
      return 1
    }
  else
    resp2=$(feishu_api_json "POST" \
      "https://open.feishu.cn/open-apis/sheets/v2/spreadsheets/${spreadsheet_token}/insert_dimension_range" \
      "$token" \
      "{\"dimension\":{\"sheetId\":\"${sheet_id}\",\"majorDimension\":\"COLUMNS\",\"startIndex\":${value},\"endIndex\":$((value + 1))},\"inheritStyle\":\"BEFORE\"}") || {
      err "insert component column failed"
      return 1
    }
  fi

  python3 - "$resp2" <<'PYCHECK'
import json, sys
resp = sys.argv[1]
data = json.loads(resp)
if data.get("code") != 0:
    raise SystemExit(f"add component column failed: {data}")
PYCHECK

  cell=$(python3 - "$value" <<'PYCOL'
import sys
n = int(sys.argv[1]) + 1
s = ""
while n > 0:
    n, r = divmod(n - 1, 26)
    s = chr(ord("A") + r) + s
print(s)
PYCOL
  )

  write_cell "$token" "$spreadsheet_token" "$sheet_id" "${cell}1" "$component_name" >/dev/null
  echo "$cell"
}

find_date_row() {
  local token="$1"
  local spreadsheet_token="$2"
  local sheet_id="$3"
  local target_date="$4"
  local resp

  resp=$(get_range_values "$token" "$spreadsheet_token" "${sheet_id}!A4:A2000") || {
    err "find_date_row: read range failed"
    return 1
  }

  python3 - "$target_date" "$resp" <<'PY'
import sys, json
target = sys.argv[1]
resp = sys.argv[2]
if not resp:
    raise SystemExit("find_date_row: empty response")
try:
    data = json.loads(resp)
except Exception as e:
    raise SystemExit(f"find_date_row invalid json: {resp[:500]!r}, error={e}")
if data.get("code") != 0:
    raise SystemExit(f"read date column failed: {data}")
values = data.get("data", {}).get("valueRange", {}).get("values", [])
for idx, row in enumerate(values, start=4):
    if row and str(row[0]).strip() == target:
        print(idx)
        raise SystemExit(0)
print("")
PY
}

prepend_date_row() {
  local token="$1"
  local spreadsheet_token="$2"
  local sheet_id="$3"
  local today="$4"
  local resp

  resp=$(
    feishu_api_json "POST" \
      "https://open.feishu.cn/open-apis/sheets/v2/spreadsheets/${spreadsheet_token}/values_prepend" \
      "$token" \
      "{\"valueRange\":{\"range\":\"${sheet_id}!A4:A4\",\"values\":[[\"${today}\"]]}}"
  ) || {
    err "prepend_date_row: curl failed"
    return 1
  }

  python3 - "$resp" <<'PY'
import json, sys
resp = sys.argv[1]
if not resp:
    raise SystemExit("prepend_date_row: empty response")
try:
    data = json.loads(resp)
except Exception as e:
    raise SystemExit(f"prepend_date_row invalid json: {resp[:500]!r}, error={e}")
if data.get("code") != 0:
    raise SystemExit(f"prepend_date_row failed: {data}")
print("ok")
PY
}

write_cell() {
  local token="$1"
  local spreadsheet_token="$2"
  local sheet_id="$3"
  local cell="$4"
  local value="$5"
  local resp

  resp=$(
    feishu_api_json "PUT" \
      "https://open.feishu.cn/open-apis/sheets/v2/spreadsheets/${spreadsheet_token}/values" \
      "$token" \
      "{\"valueRange\":{\"range\":\"${sheet_id}!${cell}:${cell}\",\"values\":[[\"${value}\"]]}}"
  ) || {
    err "write_cell: curl failed"
    return 1
  }

  python3 - "$resp" <<'PY'
import json, sys
resp = sys.argv[1]
if not resp:
    raise SystemExit("write_cell: empty response")
try:
    data = json.loads(resp)
except Exception as e:
    raise SystemExit(f"write_cell invalid json: {resp[:500]!r}, error={e}")
if data.get("code") != 0:
    raise SystemExit(f"write_cell failed: {data}")
print("ok")
PY
}

usage() {
  cat <<'EOF'
Usage:
  ./build_image.sh [amd|arm]
  ./build_image.sh --profile [amd|arm]
  ./build_image.sh --sheet AMD_with_cuda
  ./build_image.sh --sheet l4t --sheet thor_spark

Supported sheets:
  AMD: AMD_with_cuda, AMD_with_mxn100
  ARM: ARM_without_cuda, ARM_with_cuda, l4t, thor_spark, SOPHON_bm1688
EOF
}

detect_profile() {
  case "$(uname -m)" in
    x86_64) echo "amd" ;;
    aarch64|arm64) echo "arm" ;;
    *) echo "amd" ;;
  esac
}

PROFILE="$(detect_profile)"
TARGET_SHEETS=()

if [[ -n "${MOTRIX_RELEASE_SHEETS:-}" ]]; then
  IFS=',' read -r -a ENV_SHEETS <<< "${MOTRIX_RELEASE_SHEETS}"
  for sheet in "${ENV_SHEETS[@]}"; do
    [[ -n "$sheet" ]] && TARGET_SHEETS+=("$sheet")
  done
fi

while [[ $# -gt 0 ]]; do
  case "$1" in
    amd|arm)
      PROFILE="$1"
      shift
      ;;
    --profile)
      PROFILE="${2:-}"
      shift 2
      ;;
    --sheet)
      TARGET_SHEETS+=("${2:-}")
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      err "Unknown option: $1"
      usage
      exit 1
      ;;
  esac
done

if [[ "$PROFILE" != "amd" && "$PROFILE" != "arm" ]]; then
  err "Unsupported profile: $PROFILE"
  usage
  exit 1
fi

if [[ ${#TARGET_SHEETS[@]} -eq 0 ]]; then
  if [[ "$PROFILE" == "amd" ]]; then
    TARGET_SHEETS=("${AMD_SHEETS[@]}")
  else
    TARGET_SHEETS=("${ARM_SHEETS[@]}")
  fi
fi

for sheet in "${TARGET_SHEETS[@]}"; do
  if [[ "$PROFILE" == "amd" ]]; then
    contains "$sheet" "${AMD_SHEETS[@]}" || {
      err "Sheet ${sheet} is not valid for amd"
      exit 1
    }
  else
    contains "$sheet" "${ARM_SHEETS[@]}" || {
      err "Sheet ${sheet} is not valid for arm"
      exit 1
    }
  fi
done

DOCKERFILE="${PROFILE_TO_DOCKERFILE[$PROFILE]}"
PLATFORM="${PROFILE_TO_PLATFORM[$PROFILE]}"

DATE=$(date +%Y%m%d)
TAG="${PROFILE}_${DATE}"
IMAGE_REPOSITORY="swr.cn-southwest-2.myhuaweicloud.com/ictrek/${IMG_NAME}"
IMAGE_URI="${IMAGE_REPOSITORY}:${TAG}"

require_cmd curl
require_cmd python3
require_cmd docker

if [[ ! -f "$DOCKERFILE" ]]; then
  err "Dockerfile not found: $DOCKERFILE"
  exit 1
fi

if [[ ! -f "$FEISHU_CONFIG_FILE" ]]; then
  err "Feishu config not found: $FEISHU_CONFIG_FILE"
  exit 1
fi

FEISHU_APP_ID="$(read_feishu_field "feishu_app_id")"
FEISHU_APP_SECRET="$(read_feishu_field "feishu_app_secret")"

if [[ -z "$FEISHU_APP_ID" || -z "$FEISHU_APP_SECRET" ]]; then
  err "feishu_app_id or feishu_app_secret missing in $FEISHU_CONFIG_FILE"
  exit 1
fi

log "PROFILE=${PROFILE}"
log "PLATFORM=${PLATFORM}"
log "DOCKERFILE=${DOCKERFILE}"
log "TARGET_SHEETS=${TARGET_SHEETS[*]}"
log "IMG_NAME=${IMG_NAME}"
log "TAG=${TAG}"

DOCKER_BUILDKIT=1 docker build \
  --platform "${PLATFORM}" \
  -t "${IMG_NAME}" \
  -t "${IMAGE_URI}" \
  -f "${DOCKERFILE}" .

docker push "${IMAGE_URI}"

log "Docker push succeeded: ${IMAGE_URI}"

for sheet in "${TARGET_SHEETS[@]}"; do
  FEISHU_TOKEN="$(get_feishu_token "$FEISHU_APP_ID" "$FEISHU_APP_SECRET")"
  SHEET_ID="$(get_sheet_id_by_title "$FEISHU_TOKEN" "$FEISHU_SPREADSHEET_TOKEN" "$sheet")"
  log "Resolved sheet: ${sheet} -> ${SHEET_ID}"

  FEISHU_TOKEN="$(get_feishu_token "$FEISHU_APP_ID" "$FEISHU_APP_SECRET")"
  COMPONENT_COL="$(find_component_column_letter "$FEISHU_TOKEN" "$FEISHU_SPREADSHEET_TOKEN" "$SHEET_ID" "$IMG_NAME")"
  log "Resolved component column: ${IMG_NAME} -> ${COMPONENT_COL}"

  FEISHU_TOKEN="$(get_feishu_token "$FEISHU_APP_ID" "$FEISHU_APP_SECRET")"
  write_cell "$FEISHU_TOKEN" "$FEISHU_SPREADSHEET_TOKEN" "$SHEET_ID" "${COMPONENT_COL}1" "$IMG_NAME" >/dev/null
  write_cell "$FEISHU_TOKEN" "$FEISHU_SPREADSHEET_TOKEN" "$SHEET_ID" "${COMPONENT_COL}2" "$IMAGE_REPOSITORY" >/dev/null

  FEISHU_TOKEN="$(get_feishu_token "$FEISHU_APP_ID" "$FEISHU_APP_SECRET")"
  DATE_ROW="$(find_date_row "$FEISHU_TOKEN" "$FEISHU_SPREADSHEET_TOKEN" "$SHEET_ID" "$DATE")"

  if [[ -z "$DATE_ROW" ]]; then
    log "Date ${DATE} not found, creating a new row at top of data area"
    FEISHU_TOKEN="$(get_feishu_token "$FEISHU_APP_ID" "$FEISHU_APP_SECRET")"
    prepend_date_row "$FEISHU_TOKEN" "$FEISHU_SPREADSHEET_TOKEN" "$SHEET_ID" "$DATE" >/dev/null
    DATE_ROW=4
  else
    log "Date ${DATE} already exists at row ${DATE_ROW}"
  fi

  FEISHU_TOKEN="$(get_feishu_token "$FEISHU_APP_ID" "$FEISHU_APP_SECRET")"
  write_cell "$FEISHU_TOKEN" "$FEISHU_SPREADSHEET_TOKEN" "$SHEET_ID" "${COMPONENT_COL}${DATE_ROW}" "$TAG" >/dev/null

  log "Feishu updated: ${sheet}!${COMPONENT_COL}${DATE_ROW} = ${TAG}"
done
