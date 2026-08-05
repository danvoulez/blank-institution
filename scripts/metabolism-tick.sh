#!/bin/sh
# Drives institutional liveness from outside the app.
#
# eve/nuxt does not compile agent schedules into the Nitro output, so nothing
# inside the process fires on a cadence. This script is the cadence. The
# endpoint it calls takes a lease, so firing it while a previous run is still
# going is safe — the second call reports the lease and does nothing.
#
# Reads INTERNAL_API_SECRET and optionally INTERNAL_ORIGIN from the environment,
# or from an env file passed as the first argument.

set -eu

if [ $# -ge 1 ] && [ -f "$1" ]; then
  # shellcheck disable=SC1090
  . "$1"
fi

ORIGIN="${INTERNAL_ORIGIN:-http://127.0.0.1:3000}"
HOLDER="${METABOLISM_TICK_HOLDER:-$(hostname -s)}"

if [ -z "${INTERNAL_API_SECRET:-}" ]; then
  echo "metabolism-tick: INTERNAL_API_SECRET is not set" >&2
  exit 78
fi

exec curl --fail --silent --show-error --max-time 300 \
  --request POST \
  --header "authorization: Bearer ${INTERNAL_API_SECRET}" \
  "${ORIGIN}/api/internal/metabolism/tick?holder=${HOLDER}"
