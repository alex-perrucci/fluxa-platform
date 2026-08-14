#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/../.." && pwd)"
DEPLOY_DIR="${REPO_ROOT}/deploy/vps"
ENV_FILE="${FLUXA_ENV_FILE:-${DEPLOY_DIR}/.env}"
COMPOSE_FILE="${FLUXA_COMPOSE_FILE:-${DEPLOY_DIR}/compose.production.yml}"
STATE_DIR="${DEPLOY_DIR}/.state"
PROJECT_NAME="${FLUXA_PROJECT_NAME:-fluxa}"

log() {
  printf '\n==> %s\n' "$*"
}

die() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

require_root() {
  [[ "${EUID}" -eq 0 ]] || die "Run this command as root."
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "Required command not found: $1"
}

load_deploy_env() {
  [[ -f "${ENV_FILE}" ]] || die "Deployment environment missing: ${ENV_FILE}"
  set -a
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
  set +a
  mkdir -p "${STATE_DIR}"
}

compose_base() {
  docker compose \
    --project-name "${PROJECT_NAME}" \
    --env-file "${ENV_FILE}" \
    --file "${COMPOSE_FILE}" \
    "$@"
}

fluxa_compose() {
  local profile_args=()
  if [[ "${ACUBE_ENABLED:-false}" == "true" || "${OPENAPI_ENABLED:-false}" == "true" ]]; then
    profile_args+=(--profile fiscal)
  fi
  compose_base "${profile_args[@]}" "$@"
}

fluxa_tools_compose() {
  compose_base --profile tools "$@"
}

set_env_value() {
  local key="$1"
  local value="$2"
  local temporary
  temporary="$(mktemp)"
  awk -v key="${key}" -v value="${value}" '
    BEGIN { updated = 0 }
    $0 ~ ("^" key "=") {
      print key "=" value
      updated = 1
      next
    }
    { print }
    END {
      if (!updated) print key "=" value
    }
  ' "${ENV_FILE}" > "${temporary}"
  chmod 600 "${temporary}"
  mv "${temporary}" "${ENV_FILE}"
}

wait_for_url() {
  local url="$1"
  local attempts="${2:-60}"
  local sleep_seconds="${3:-2}"
  for ((attempt = 1; attempt <= attempts; attempt += 1)); do
    if curl --fail --silent --show-error --max-time 10 "${url}" >/dev/null; then
      return 0
    fi
    sleep "${sleep_seconds}"
  done
  return 1
}

current_release_sha() {
  git -C "${REPO_ROOT}" rev-parse HEAD
}

current_release_version() {
  jq -r '.version' "${REPO_ROOT}/package.json"
}
