#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/lib.sh"
require_root

[[ ! -f "${ENV_FILE}" ]] ||
  die "Fluxa is already configured. Use scripts/vps/update.sh instead."

prompt_required() {
  local variable_name="$1"
  local label="$2"
  local current_value="${!variable_name:-}"
  while [[ -z "${current_value}" ]]; do
    read -r -p "${label}: " current_value
  done
  printf -v "${variable_name}" '%s' "${current_value}"
}

prompt_yes_no() {
  local variable_name="$1"
  local label="$2"
  local default_value="${3:-false}"
  local answer=""
  if [[ -n "${!variable_name:-}" ]]; then return; fi
  local suffix="[y/N]"
  [[ "${default_value}" == "true" ]] && suffix="[Y/n]"
  read -r -p "${label} ${suffix}: " answer
  answer="${answer,,}"
  if [[ "${answer}" == "y" || "${answer}" == "yes" ]]; then
    printf -v "${variable_name}" '%s' "true"
  elif [[ -z "${answer}" ]]; then
    printf -v "${variable_name}" '%s' "${default_value}"
  else
    printf -v "${variable_name}" '%s' "false"
  fi
}

prompt_secret() {
  local variable_name="$1"
  local label="$2"
  local value="${!variable_name:-}"
  while [[ -z "${value}" ]]; do
    read -r -s -p "${label}: " value
    printf '\n'
  done
  printf -v "${variable_name}" '%s' "${value}"
}

validate_domain() {
  [[ "$1" =~ ^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$ ]] ||
    die "Invalid domain: $1"
  [[ "$1" != *"://"* ]] || die "Enter a hostname without a URL scheme."
}

install_base_packages() {
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    ca-certificates curl git gnupg jq openssl ufw
}

install_docker() {
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    log "Docker and Docker Compose are already installed"
    systemctl enable --now docker
    return
  fi

  log "Installing Docker Engine"
  . /etc/os-release
  case "${ID}" in
    ubuntu | debian) ;;
    *) die "Supported operating systems: Ubuntu and Debian." ;;
  esac

  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL "https://download.docker.com/linux/${ID}/gpg" |
    gpg --dearmor --yes -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  local architecture
  architecture="$(dpkg --print-architecture)"
  printf '%s\n' \
    "deb [arch=${architecture} signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/${ID} ${VERSION_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y \
    docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
}

check_dns() {
  [[ "${FLUXA_SKIP_DNS_CHECK:-false}" == "true" ]] && return
  local public_ip
  public_ip="$(curl -4 --fail --silent --show-error https://api.ipify.org)"
  local domain
  for domain in "${WEB_DOMAIN}" "${API_DOMAIN}"; do
    local resolved
    resolved="$(getent ahostsv4 "${domain}" | awk 'NR == 1 { print $1 }')"
    [[ -n "${resolved}" ]] || die "${domain} does not resolve to IPv4."
    if [[ "${resolved}" != "${public_ip}" ]]; then
      printf 'WARNING: %s resolves to %s, while this VPS is %s.\n' \
        "${domain}" "${resolved}" "${public_ip}" >&2
      if [[ -t 0 ]]; then
        local answer
        read -r -p "Continue anyway? [y/N]: " answer
        [[ "${answer,,}" == "y" || "${answer,,}" == "yes" ]] || exit 1
      else
        die "DNS mismatch. Set FLUXA_SKIP_DNS_CHECK=true only after manual verification."
      fi
    fi
  done
}

configure_firewall() {
  local ssh_port="${SSH_PORT:-22}"
  log "Configuring UFW"
  ufw allow "${ssh_port}/tcp"
  ufw allow 80/tcp
  ufw allow 443/tcp
  ufw allow 443/udp
  ufw --force enable
}

write_environment() {
  local postgres_password redis_password access_secret refresh_secret ip_secret
  local admin_password release_sha release_version
  postgres_password="$(openssl rand -hex 32)"
  redis_password="$(openssl rand -hex 32)"
  access_secret="$(openssl rand -hex 48)"
  refresh_secret="$(openssl rand -hex 48)"
  ip_secret="$(openssl rand -hex 48)"
  admin_password="$(openssl rand -base64 30 | tr -d '\n' | tr '+/' '-_')"
  release_sha="$(current_release_sha)"
  release_version="$(current_release_version)"

  umask 077
  mkdir -p "${DEPLOY_DIR}" "${STATE_DIR}"
  cat > "${ENV_FILE}" <<ENVEOF
NODE_ENV=production
API_PORT=3000
LOG_LEVEL=info
SWAGGER_ENABLED=false
TRUST_PROXY=true
RELEASE_SHA=${release_sha}
RELEASE_VERSION=${release_version}
WEB_DOMAIN=${WEB_DOMAIN}
API_DOMAIN=${API_DOMAIN}
ACME_EMAIL=${ACME_EMAIL}
POSTGRES_USER=fluxa
POSTGRES_PASSWORD=${postgres_password}
POSTGRES_DB=fluxa
DATABASE_URL=postgresql://fluxa:${postgres_password}@postgres:5432/fluxa
DATABASE_SSL=false
DATABASE_POOL_MAX=20
INFRASTRUCTURE_TRUST_MODE=private-docker-network
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=${redis_password}
REDIS_TLS=false
CORS_ORIGINS=https://${WEB_DOMAIN}
BOOKING_WEB_BASE_URL=https://${WEB_DOMAIN}
ACCESS_TOKEN_SECRET=${access_secret}
REFRESH_TOKEN_SECRET=${refresh_secret}
SESSION_IP_HASH_SECRET=${ip_secret}
ACCESS_TOKEN_TTL_SECONDS=900
REFRESH_TOKEN_TTL_DAYS=30
JWT_ISSUER=fluxa-platform
JWT_AUDIENCE=fluxa-pos
BOOTSTRAP_ADMIN_EMAIL=${BOOTSTRAP_ADMIN_EMAIL}
BOOTSTRAP_ADMIN_PASSWORD=${admin_password}
BOOTSTRAP_ADMIN_DISPLAY_NAME=Fluxa Admin
STRIPE_ENABLED=${STRIPE_ENABLED}
STRIPE_SECRET_KEY=${STRIPE_SECRET_KEY:-}
STRIPE_WEBHOOK_SECRET=${STRIPE_WEBHOOK_SECRET:-}
ACUBE_ENABLED=${ACUBE_ENABLED}
ACUBE_BEARER_TOKEN=${ACUBE_BEARER_TOKEN:-}
ACUBE_EMAIL=
ACUBE_PASSWORD=
ACUBE_API_BASE_URL=https://api.acubeapi.com
ACUBE_AUTH_BASE_URL=https://common.api.acubeapi.com
FLUXA_BACKUP_DIRECTORY=/var/backups/fluxa
FLUXA_BACKUP_RETENTION_DAYS=14
ENVEOF
  chmod 600 "${ENV_FILE}"
  cat > "${STATE_DIR}/admin-credentials.txt" <<STATEEOF
Fluxa platform administrator
Email: ${BOOTSTRAP_ADMIN_EMAIL}
Temporary password: ${admin_password}
Created: $(date --iso-8601=seconds)
STATEEOF
  chmod 600 "${STATE_DIR}/admin-credentials.txt"
}

install_backup_timer() {
  log "Installing the daily backup timer"
  sed "s|@INSTALL_DIR@|${REPO_ROOT}|g" \
    "${DEPLOY_DIR}/systemd/fluxa-backup.service" \
    > /etc/systemd/system/fluxa-backup.service
  cp "${DEPLOY_DIR}/systemd/fluxa-backup.timer" \
    /etc/systemd/system/fluxa-backup.timer
  systemctl daemon-reload
  systemctl enable --now fluxa-backup.timer
}

log "Collecting deployment configuration"
prompt_required WEB_DOMAIN "Public web domain, for example app.example.com"
prompt_required API_DOMAIN "Public API domain, for example api.example.com"
prompt_required ACME_EMAIL "Email for TLS certificate notifications"
prompt_required BOOTSTRAP_ADMIN_EMAIL "Initial Fluxa platform-admin email"
validate_domain "${WEB_DOMAIN}"
validate_domain "${API_DOMAIN}"
[[ "${WEB_DOMAIN}" != "${API_DOMAIN}" ]] || die "Web and API domains must differ."

prompt_yes_no STRIPE_ENABLED "Enable Stripe live reservation payments" "false"
if [[ "${STRIPE_ENABLED}" == "true" ]]; then
  prompt_secret STRIPE_SECRET_KEY "Stripe live secret key"
  prompt_secret STRIPE_WEBHOOK_SECRET "Stripe webhook signing secret"
  [[ "${STRIPE_SECRET_KEY}" == sk_live_* ]] || die "Stripe key must start with sk_live_."
  [[ "${STRIPE_WEBHOOK_SECRET}" == whsec_* ]] || die "Stripe webhook secret must start with whsec_."
fi

prompt_yes_no ACUBE_ENABLED "Enable A-Cube production fiscal processing" "false"
if [[ "${ACUBE_ENABLED}" == "true" ]]; then
  prompt_secret ACUBE_BEARER_TOKEN "A-Cube production bearer token"
fi

install_base_packages
install_docker
require_command jq
require_command openssl
require_command curl
require_command git
check_dns
configure_firewall
write_environment
load_deploy_env

log "Validating the generated production environment"
docker run --rm \
  --volume "${REPO_ROOT}:/workspace:ro" \
  --workdir /workspace \
  node:24-bookworm-slim \
  node scripts/verify-production-config.mjs --env deploy/vps/.env

log "Building immutable Fluxa images"
fluxa_tools_compose build migrate
fluxa_compose build api web

log "Starting PostgreSQL and Redis"
fluxa_compose up -d postgres redis

log "Applying database migrations"
fluxa_tools_compose run --rm migrate

log "Starting Fluxa"
fluxa_compose up -d

log "Creating the initial platform administrator"
fluxa_tools_compose run --rm bootstrap-admin

install_backup_timer

log "Running deployment diagnostics"
bash "${SCRIPT_DIR}/doctor.sh"

printf '\nFluxa installation completed.\n'
printf 'Web: https://%s\n' "${WEB_DOMAIN}"
printf 'API readiness: https://%s/api/v1/health/ready\n' "${API_DOMAIN}"
printf 'Admin credentials: %s\n' "${STATE_DIR}/admin-credentials.txt"
printf 'Stripe enabled: %s\n' "${STRIPE_ENABLED}"
printf 'A-Cube enabled: %s\n' "${ACUBE_ENABLED}"
