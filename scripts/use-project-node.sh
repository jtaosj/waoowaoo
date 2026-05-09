#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REQUIRED_VERSION="$(tr -d '[:space:]' < "$PROJECT_ROOT/.nvmrc")"
REQUIRED_MAJOR="${REQUIRED_VERSION%%.*}"

if [ "$#" -eq 0 ]; then
  echo "usage: scripts/use-project-node.sh <command> [args...]" >&2
  exit 2
fi

if [ -s "$HOME/.nvm/nvm.sh" ]; then
  # shellcheck source=/dev/null
  . "$HOME/.nvm/nvm.sh"
  nvm use "$REQUIRED_VERSION" >/dev/null
elif [ -x "/opt/homebrew/opt/node@${REQUIRED_MAJOR}/bin/node" ]; then
  export PATH="/opt/homebrew/opt/node@${REQUIRED_MAJOR}/bin:$PATH"
elif [ -x "/usr/local/opt/node@${REQUIRED_MAJOR}/bin/node" ]; then
  export PATH="/usr/local/opt/node@${REQUIRED_MAJOR}/bin:$PATH"
fi

ACTUAL_VERSION="$(node -p "process.versions.node")"
ACTUAL_MAJOR="${ACTUAL_VERSION%%.*}"

if [ "$ACTUAL_MAJOR" != "$REQUIRED_MAJOR" ]; then
  echo "Node major version mismatch: expected ${REQUIRED_VERSION}, actual ${ACTUAL_VERSION}" >&2
  echo "Install node@${REQUIRED_MAJOR} or nvm install ${REQUIRED_VERSION}, then retry." >&2
  exit 1
fi

if [ "$ACTUAL_VERSION" != "$REQUIRED_VERSION" ]; then
  echo "Node version warning: .nvmrc expects ${REQUIRED_VERSION}, using ${ACTUAL_VERSION}" >&2
fi

exec "$@"
