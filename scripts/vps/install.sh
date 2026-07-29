#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  printf 'Run the installer as root.\n' >&2
  exit 1
fi

INSTALL_DIR="${FLUXA_INSTALL_DIR:-/opt/fluxa}"
GIT_REF="${FLUXA_GIT_REF:-main}"
REPOSITORY_URL="${FLUXA_REPOSITORY_URL:-https://github.com/alex-perrucci/fluxa-platform.git}"

apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
  ca-certificates curl git

if [[ -d "${INSTALL_DIR}/.git" && -f "${INSTALL_DIR}/deploy/vps/.env" ]]; then
  exec bash "${INSTALL_DIR}/scripts/vps/update.sh" "${GIT_REF}"
fi

if [[ -d "${INSTALL_DIR}/.git" ]]; then
  git -C "${INSTALL_DIR}" fetch --prune origin
else
  mkdir -p "$(dirname -- "${INSTALL_DIR}")"
  git clone "${REPOSITORY_URL}" "${INSTALL_DIR}"
fi

git -C "${INSTALL_DIR}" fetch --prune origin
if git -C "${INSTALL_DIR}" rev-parse --verify --quiet "origin/${GIT_REF}" >/dev/null; then
  git -C "${INSTALL_DIR}" checkout --detach "origin/${GIT_REF}"
else
  git -C "${INSTALL_DIR}" checkout --detach "${GIT_REF}"
fi

exec bash "${INSTALL_DIR}/scripts/vps/provision.sh"
