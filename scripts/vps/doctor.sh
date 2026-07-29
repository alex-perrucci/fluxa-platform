#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/lib.sh"
require_command docker
require_command curl
require_command jq
load_deploy_env

log "Validating Docker Compose"
fluxa_compose config --quiet

log "Checking internal data services"
fluxa_compose exec -T postgres \
  pg_isready -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" >/dev/null
fluxa_compose exec -T redis \
  redis-cli -a "${REDIS_PASSWORD}" ping | grep -q PONG

log "Checking required containers"
required_services=(postgres redis api background-worker web caddy)
if [[ "${ACUBE_ENABLED}" == "true" ]]; then
  required_services+=(fiscal-worker)
fi
running_services="$(fluxa_compose ps --services --filter status=running)"
for service in "${required_services[@]}"; do
  grep -qx "${service}" <<< "${running_services}" || die "Service is not running: ${service}"
done

log "Checking public HTTPS endpoints"
wait_for_url "https://${API_DOMAIN}/api/v1/health/ready" 60 2 ||
  die "API readiness did not become healthy."
wait_for_url "https://${WEB_DOMAIN}/health" 60 2 ||
  die "Web health page did not become healthy."
wait_for_url "https://${WEB_DOMAIN}/events" 60 2 ||
  die "Public event catalog did not become healthy."

health="$(curl --fail --silent --show-error "https://${API_DOMAIN}/api/v1/health/ready")"
jq -e --arg release_sha "${RELEASE_SHA}" '
  .status == "ok" and
  .checks.database == "up" and
  .checks.redis == "up" and
  .release.sha == $release_sha
' <<< "${health}" >/dev/null || die "API health does not match the deployed release."

log "Fluxa VPS diagnostics passed"
fluxa_compose ps
