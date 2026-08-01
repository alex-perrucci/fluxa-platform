#!/usr/bin/env bash
set -Eeuo pipefail

[[ "${EUID}" -eq 0 ]] || { echo 'Run as root.' >&2; exit 1; }
INSTALL_DIR="${FLUXA_INSTALL_DIR:-/opt/fluxa}"
NEW_TAG="${1:?Usage: update-ghcr.sh vX.Y.Z}"
ENV_FILE="${INSTALL_DIR}/deploy/vps/.env"
export FLUXA_COMPOSE_FILE="${INSTALL_DIR}/deploy/vps/compose.ghcr.yml"
export FLUXA_ENV_FILE="${ENV_FILE}"
source "${INSTALL_DIR}/scripts/vps/lib.sh"
load_deploy_env

bash "${INSTALL_DIR}/scripts/vps/backup.sh"
mkdir -p "${STATE_DIR}"
printf '%s\n' "${RELEASE_SHA}" > "${STATE_DIR}/previous-release"
set_env_value RELEASE_SHA "${NEW_TAG}"
set_env_value RELEASE_VERSION "${NEW_TAG#v}"
set_env_value FLUXA_BACKEND_IMAGE "ghcr.io/alex-perrucci/fluxa-backend:${NEW_TAG}"
set_env_value FLUXA_WEB_IMAGE "ghcr.io/alex-perrucci/fluxa-web:${NEW_TAG}"
set_env_value FLUXA_TOOLS_IMAGE "ghcr.io/alex-perrucci/fluxa-tools:${NEW_TAG}"
load_deploy_env
fluxa_compose pull
fluxa_tools_compose run --rm migrate
fluxa_compose up -d --remove-orphans
bash "${INSTALL_DIR}/scripts/vps/doctor.sh"
docker image prune --force >/dev/null
printf 'Fluxa updated to %s.\n' "${NEW_TAG}"
