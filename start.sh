#!/bin/sh
set -eu

cd "$(dirname "$0")/app"
export PATH="$PATH:${HOME}/.cargo/bin:/opt/homebrew/bin:/usr/local/bin"

if command -v corepack >/dev/null 2>&1; then
    if [ ! -x apps/native/node_modules/.bin/tauri ]; then
        corepack pnpm install --frozen-lockfile
    fi
    exec corepack pnpm --filter native exec tauri dev --config '{"build":{"beforeDevCommand":"corepack pnpm dev"}}' "$@"
fi

if ! command -v pnpm >/dev/null 2>&1; then
    printf '%s\n' 'Install Node.js and pnpm (or Corepack) to run VNCCS Studio.' >&2
    exit 1
fi

if [ ! -x apps/native/node_modules/.bin/tauri ]; then
    pnpm install --frozen-lockfile
fi
exec pnpm --filter native exec tauri dev "$@"
