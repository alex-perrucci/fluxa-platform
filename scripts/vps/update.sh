#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/lib.sh"
require_root
require_command git
require_command docker
require_command jq
load_deploy_env

TARGET_REF="${1:-main}"
CURRENT_SHA="$(current_release_sha)"
ROLLBACK_ARMED=false

rollback_failed_release() {
  local exit_code="$?"
  trap - ERR

  if [[ "${ROLLBACK_ARMED}" == "true" ]]; then
    log "Target release failed validation; restoring ${CURRENT_SHA}"
    if bash "${SCRIPT_DIR}/rollback.sh" "${CURRENT_SHA}"; then
      log "Automatic application rollback completed"
    else
      printf 'CRITICAL: automatic rollback failed. Run %s/doctor.sh and restore %s manually.\n' \
        "${SCRIPT_DIR}" "${CURRENT_SHA}" >&2
    fi
  fi

  exit "${exit_code}"
}

log "Creating the pre-update backup"
bash "${SCRIPT_DIR}/backup.sh"

log "Resolving release ${TARGET_REF}"
git -C "${REPO_ROOT}" fetch --prune origin
if git -C "${REPO_ROOT}" rev-parse --verify --quiet "origin/${TARGET_REF}" >/dev/null; then
  TARGET_SHA="$(git -C "${REPO_ROOT}" rev-parse "origin/${TARGET_REF}")"
else
  TARGET_SHA="$(git -C "${REPO_ROOT}" rev-parse "${TARGET_REF}")"
fi

[[ "${TARGET_SHA}" != "${CURRENT_SHA}" ]] || {
  log "Fluxa is already at ${TARGET_SHA}"
  exit 0
}

mkdir -p "${STATE_DIR}"
printf '%s\n' "${CURRENT_SHA}" > "${STATE_DIR}/previous-release"
trap rollback_failed_release ERR
ROLLBACK_ARMED=true

git -C "${REPO_ROOT}" checkout --detach "${TARGET_SHA}"
set_env_value RELEASE_SHA "${TARGET_SHA}"
set_env_value RELEASE_VERSION "$(current_release_version)"
load_deploy_env

log "Validating the target release"
docker run --rm \
  --volume "${REPO_ROOT}:/workspace:ro" \
  --workdir /workspace \
  node:24-bookworm-slim \
  node scripts/verify-production-config.mjs --env deploy/vps/.env
docker run --rm \
  --volume "${REPO_ROOT}:/workspace:ro" \
  --workdir /workspace \
  node:24-bookworm-slim \
  node scripts/verify-vps-deployment.mjs

log "Building the target images"
fluxa_tools_compose build migrate
fluxa_compose build api web

log "Applying forward migrations"
fluxa_tools_compose run --rm migrate

log "Starting the target release"
fluxa_compose up -d --remove-orphans

log "Running release-alignment diagnostics"
bash "${SCRIPT_DIR}/doctor.sh"

ROLLBACK_ARMED=false
trap - ERR
docker image prune --force >/dev/null
printf 'Fluxa updated from %s to %s.\n' "${CURRENT_SHA}" "${TARGET_SHA}"
