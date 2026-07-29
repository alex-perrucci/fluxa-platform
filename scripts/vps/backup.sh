#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/lib.sh"
require_root
require_command docker
require_command sha256sum
require_command jq
load_deploy_env

BACKUP_DIRECTORY="${FLUXA_BACKUP_DIRECTORY:-/var/backups/fluxa}"
RETENTION_DAYS="${FLUXA_BACKUP_RETENTION_DAYS:-14}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BASE_NAME="fluxa-${TIMESTAMP}-${RELEASE_SHA:0:12}"
DUMP_PATH="${BACKUP_DIRECTORY}/${BASE_NAME}.dump"
MANIFEST_PATH="${BACKUP_DIRECTORY}/${BASE_NAME}.manifest.json"

mkdir -p "${BACKUP_DIRECTORY}"
chmod 700 "${BACKUP_DIRECTORY}"
log "Creating PostgreSQL backup ${DUMP_PATH}"
fluxa_compose exec -T postgres \
  pg_dump \
  --username "${POSTGRES_USER}" \
  --dbname "${POSTGRES_DB}" \
  --format custom \
  --no-owner \
  --no-privileges \
  > "${DUMP_PATH}"
[[ -s "${DUMP_PATH}" ]] || die "PostgreSQL produced an empty backup."
cat "${DUMP_PATH}" | fluxa_compose exec -T postgres pg_restore --list >/dev/null

CHECKSUM="$(sha256sum "${DUMP_PATH}" | awk '{ print $1 }')"
SIZE_BYTES="$(stat --format '%s' "${DUMP_PATH}")"
jq -n \
  --arg created_at "$(date --iso-8601=seconds)" \
  --arg release_sha "${RELEASE_SHA}" \
  --arg release_version "${RELEASE_VERSION}" \
  --arg dump_file "$(basename -- "${DUMP_PATH}")" \
  --arg sha256 "${CHECKSUM}" \
  --argjson size_bytes "${SIZE_BYTES}" \
  '{
    format: "postgresql-custom",
    createdAt: $created_at,
    releaseSha: $release_sha,
    releaseVersion: $release_version,
    dumpFile: $dump_file,
    sizeBytes: $size_bytes,
    sha256: $sha256
  }' > "${MANIFEST_PATH}"
chmod 600 "${DUMP_PATH}" "${MANIFEST_PATH}"
find "${BACKUP_DIRECTORY}" \
  -type f \
  \( -name 'fluxa-*.dump' -o -name 'fluxa-*.manifest.json' \) \
  -mtime "+${RETENTION_DAYS}" \
  -delete
printf 'Backup: %s\n' "${DUMP_PATH}"
printf 'Manifest: %s\n' "${MANIFEST_PATH}"
