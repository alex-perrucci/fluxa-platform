#!/usr/bin/env bash
set -Eeuo pipefail

[[ "${EUID}" -eq 0 ]] || { echo 'Run as root.' >&2; exit 1; }

INSTALL_DIR="${FLUXA_INSTALL_DIR:-/opt/fluxa}"
RELEASE_TAG="${FLUXA_RELEASE_TAG:?Set FLUXA_RELEASE_TAG, for example v0.8.0}"
GHCR_USERNAME="${GHCR_USERNAME:?Set GHCR_USERNAME}"
GHCR_TOKEN="${GHCR_TOKEN:?Set GHCR_TOKEN with read:packages}"
WEB_DOMAIN="${WEB_DOMAIN:?Set WEB_DOMAIN}"
API_DOMAIN="${API_DOMAIN:?Set API_DOMAIN}"
ACME_EMAIL="${ACME_EMAIL:?Set ACME_EMAIL}"
BOOTSTRAP_ADMIN_EMAIL="${BOOTSTRAP_ADMIN_EMAIL:?Set BOOTSTRAP_ADMIN_EMAIL}"
REGISTRY="ghcr.io/alex-perrucci"

apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y ca-certificates curl gnupg openssl jq ufw
if ! command -v docker >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/$(. /etc/os-release; echo "$ID")/gpg |
    gpg --dearmor --yes -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  . /etc/os-release
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/${ID} ${VERSION_CODENAME} stable" > /etc/apt/sources.list.d/docker.list
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
systemctl enable --now docker
printf '%s' "${GHCR_TOKEN}" | docker login ghcr.io -u "${GHCR_USERNAME}" --password-stdin

docker pull "${REGISTRY}/fluxa-deploy:${RELEASE_TAG}"
container_id="$(docker create "${REGISTRY}/fluxa-deploy:${RELEASE_TAG}")"
rm -rf "${INSTALL_DIR}.new"
mkdir -p "${INSTALL_DIR}.new"
docker cp "${container_id}:/bundle/." "${INSTALL_DIR}.new"
docker rm "${container_id}" >/dev/null
if [[ -f "${INSTALL_DIR}/deploy/vps/.env" ]]; then
  cp "${INSTALL_DIR}/deploy/vps/.env" "${INSTALL_DIR}.new/deploy/vps/.env"
fi
rm -rf "${INSTALL_DIR}.previous"
[[ ! -d "${INSTALL_DIR}" ]] || mv "${INSTALL_DIR}" "${INSTALL_DIR}.previous"
mv "${INSTALL_DIR}.new" "${INSTALL_DIR}"
chmod 0755 "${INSTALL_DIR}"/scripts/vps/*.sh

ENV_FILE="${INSTALL_DIR}/deploy/vps/.env"
if [[ ! -f "${ENV_FILE}" ]]; then
  umask 077
  postgres_password="$(openssl rand -hex 32)"
  redis_password="$(openssl rand -hex 32)"
  admin_password="$(openssl rand -base64 30 | tr -d '\n' | tr '+/' '-_')"
  cat > "${ENV_FILE}" <<EOF
NODE_ENV=production
API_PORT=3000
LOG_LEVEL=info
SWAGGER_ENABLED=false
TRUST_PROXY=true
RELEASE_SHA=${RELEASE_TAG}
RELEASE_VERSION=${RELEASE_TAG#v}
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
ACCESS_TOKEN_SECRET=$(openssl rand -hex 48)
REFRESH_TOKEN_SECRET=$(openssl rand -hex 48)
SESSION_IP_HASH_SECRET=$(openssl rand -hex 48)
ACCESS_TOKEN_TTL_SECONDS=900
REFRESH_TOKEN_TTL_DAYS=30
JWT_ISSUER=fluxa-platform
JWT_AUDIENCE=fluxa-pos
BOOTSTRAP_ADMIN_EMAIL=${BOOTSTRAP_ADMIN_EMAIL}
BOOTSTRAP_ADMIN_PASSWORD=${admin_password}
BOOTSTRAP_ADMIN_DISPLAY_NAME=Fluxa Admin
STRIPE_ENABLED=false
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
ACUBE_ENABLED=false
ACUBE_BEARER_TOKEN=
ACUBE_EMAIL=
ACUBE_PASSWORD=
ACUBE_API_BASE_URL=https://api.acubeapi.com
ACUBE_AUTH_BASE_URL=https://common.api.acubeapi.com
FLUXA_BACKUP_DIRECTORY=/var/backups/fluxa
FLUXA_BACKUP_RETENTION_DAYS=14
FLUXA_BACKEND_IMAGE=${REGISTRY}/fluxa-backend:${RELEASE_TAG}
FLUXA_WEB_IMAGE=${REGISTRY}/fluxa-web:${RELEASE_TAG}
FLUXA_TOOLS_IMAGE=${REGISTRY}/fluxa-tools:${RELEASE_TAG}
EOF
  chmod 600 "${ENV_FILE}"
  mkdir -p "${INSTALL_DIR}/deploy/vps/.state"
  printf 'Email: %s\nTemporary password: %s\n' "${BOOTSTRAP_ADMIN_EMAIL}" "${admin_password}" > "${INSTALL_DIR}/deploy/vps/.state/admin-credentials.txt"
  chmod 600 "${INSTALL_DIR}/deploy/vps/.state/admin-credentials.txt"
fi

export FLUXA_COMPOSE_FILE="${INSTALL_DIR}/deploy/vps/compose.ghcr.yml"
export FLUXA_ENV_FILE="${ENV_FILE}"
source "${INSTALL_DIR}/scripts/vps/lib.sh"
load_deploy_env
fluxa_compose pull
fluxa_compose up -d postgres redis
fluxa_tools_compose run --rm migrate
fluxa_compose up -d --remove-orphans
fluxa_tools_compose run --rm bootstrap-admin
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable
bash "${INSTALL_DIR}/scripts/vps/doctor.sh"
printf 'Fluxa %s installed. Credentials: %s\n' "${RELEASE_TAG}" "${INSTALL_DIR}/deploy/vps/.state/admin-credentials.txt"
