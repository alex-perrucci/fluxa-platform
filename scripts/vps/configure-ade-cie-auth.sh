#!/usr/bin/env bash
set -Eeuo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "Run as root: sudo bash scripts/vps/configure-ade-cie-auth.sh" >&2
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ADE_RUNTIME_DIR="${ADE_RUNTIME_DIR:-/opt/fluxa/runtime/ade}"
ADE_SESSION_DIR="${ADE_SESSION_DIR:-/opt/fluxa/runtime/ade-session}"
ADE_SECRET_DIR="${ADE_SECRET_DIR:-/opt/fluxa/runtime/ade-secrets}"
PW_UID="${ADE_PLAYWRIGHT_UID:-1000}"
PW_GID="${ADE_PLAYWRIGHT_GID:-1000}"

read -r -p "CIE username / codice fiscale: " cie_username
read -r -s -p "CIE password: " cie_password
echo

if [[ -z "${cie_username}" || -z "${cie_password}" ]]; then
  echo "Username and password must not be empty." >&2
  exit 1
fi

install -d -m 0755 "${ADE_RUNTIME_DIR}"
install -d -m 0700 -o "${PW_UID}" -g "${PW_GID}" "${ADE_SESSION_DIR}"
install -d -m 0700 -o "${PW_UID}" -g "${PW_GID}" "${ADE_SECRET_DIR}"

install -m 0644 \
  "${REPO_ROOT}/docs/operations/ade-cie-auth-profile.example.json" \
  "${ADE_RUNTIME_DIR}/auth-profile.json"

umask 077
printf '%s' "${cie_username}" > "${ADE_SECRET_DIR}/cie-username"
printf '%s' "${cie_password}" > "${ADE_SECRET_DIR}/cie-password"
chown "${PW_UID}:${PW_GID}" \
  "${ADE_SECRET_DIR}/cie-username" \
  "${ADE_SECRET_DIR}/cie-password"
chmod 0600 \
  "${ADE_SECRET_DIR}/cie-username" \
  "${ADE_SECRET_DIR}/cie-password"

unset cie_password

echo
printf 'Configured:\n'
printf '  %s/auth-profile.json\n' "${ADE_RUNTIME_DIR}"
printf '  %s/cie-username\n' "${ADE_SECRET_DIR}"
printf '  %s/cie-password\n' "${ADE_SECRET_DIR}"
printf '  %s/ (writable session directory)\n' "${ADE_SESSION_DIR}"
echo
echo "Now set ADE_AUTH_ENTRY_URL and ADE_INCARICANTE_CF in deploy/vps/.env, then recreate ade-fiscal-worker."
