#!/usr/bin/env bash
set -Eeuo pipefail

[[ "${EUID}" -eq 0 ]] || { echo 'Run as root.' >&2; exit 1; }
INSTALL_DIR="${FLUXA_INSTALL_DIR:-/opt/fluxa}"
ENV_FILE="${INSTALL_DIR}/deploy/vps/.env"
export FLUXA_COMPOSE_FILE="${INSTALL_DIR}/deploy/vps/compose.ghcr.yml"
export FLUXA_ENV_FILE="${ENV_FILE}"
source "${INSTALL_DIR}/scripts/vps/lib.sh"
load_deploy_env

TARGET_TAG="${1:-}"
if [[ -z "${TARGET_TAG}" ]]; then
  [[ -f "${STATE_DIR}/previous-release" ]] || die 'No previous release recorded.'
  TARGET_TAG="$(tr -d '[:space:]' < "${STATE_DIR}/previous-release")"
fi
CURRENT_TAG="${RELEASE_SHA}"
set_env_value RELEASE_SHA "${TARGET_TAG}"
set_env_value RELEASE_VERSION "${TARGET_TAG#v}"
set_env_value FLUXA_BACKEND_IMAGE "ghcr.io/alex-perrucci/fluxa-backend:${TARGET_TAG}"
set_env_value FLUXA_WEB_IMAGE "ghcr.io/alex-perrucci/fluxa-web:${TARGET_TAG}"
set_env_value FLUXA_TOOLS_IMAGE "ghcr.io/alex-perrucci/fluxa-tools:${TARGET_TAG}"
load_deploy_env
fluxa_compose pull
fluxa_compose up -d --remove-orphans
bash "${INSTALL_DIR}/scripts/vps/doctor.sh"
printf '%s\n' "${CURRENT_TAG}" > "${STATE_DIR}/rollback-source"
printf 'Application rollback completed to %s. Database migrations were not reversed.\n' "${TARGET_TAG}"
