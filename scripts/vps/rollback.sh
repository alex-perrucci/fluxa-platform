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

TARGET_SHA="${1:-}"
if [[ -z "${TARGET_SHA}" ]]; then
  [[ -f "${STATE_DIR}/previous-release" ]] || die "No previous release is recorded."
  TARGET_SHA="$(tr -d '[:space:]' < "${STATE_DIR}/previous-release")"
fi

CURRENT_SHA="$(current_release_sha)"
git -C "${REPO_ROOT}" cat-file -e "${TARGET_SHA}^{commit}" 2>/dev/null ||
  die "Unknown release commit: ${TARGET_SHA}"

log "Rolling back application images to ${TARGET_SHA}"
git -C "${REPO_ROOT}" checkout --detach "${TARGET_SHA}"
set_env_value RELEASE_SHA "${TARGET_SHA}"
set_env_value RELEASE_VERSION "$(current_release_version)"
load_deploy_env

fluxa_compose build api web
fluxa_compose up -d --remove-orphans
bash "${SCRIPT_DIR}/doctor.sh"
printf '%s\n' "${CURRENT_SHA}" > "${STATE_DIR}/rollback-source"
printf 'Application rollback completed. Database migrations were not reversed.\n'
