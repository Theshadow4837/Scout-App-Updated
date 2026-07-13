#!/usr/bin/env bash
set -Eeuo pipefail

APP_NAME="Scout-App"
APP_PORT="${APP_PORT:-3001}"
BRANCH="${DEPLOY_BRANCH:-main}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$SCRIPT_DIR"
APP_DIR="$REPO_DIR/Clasue-scout-app"
SERVER_PATH="$APP_DIR/server.cjs"
LOG_FILE="$REPO_DIR/deploy.log"
LOCK_FILE="$APP_DIR/deploy.lock"
PM2_SERVER_PATH="$SERVER_PATH"

export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"
export DISPLAY="${DISPLAY:-:0}"
DEPLOY_USER="$(logname 2>/dev/null || echo "${SUDO_USER:-$USER}")"
export XAUTHORITY="${XAUTHORITY:-/home/$DEPLOY_USER/.Xauthority}"

mkdir -p "$(dirname "$LOG_FILE")"
exec > >(tee -a "$LOG_FILE") 2>&1

log() {
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S %Z')" "$*"
}

die() {
  log "ERROR: $*"
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Required command not found: $1"
}

PM2_CWD="$APP_DIR"

pm2_run() {
  sudo pm2 "$@"
}

acquire_lock() {
  if command -v flock >/dev/null 2>&1; then
    exec 9>"$LOCK_FILE"
    if ! flock -n 9; then
      log "Already deploying; exiting."
      exit 0
    fi
    return
  fi

  if ! mkdir "$LOCK_FILE.d" 2>/dev/null; then
    log "Already deploying; exiting."
    exit 0
  fi
  trap 'rm -rf "$LOCK_FILE.d"' EXIT
}

health_check() {
  local url="http://127.0.0.1:$APP_PORT/"
  local attempt

  for attempt in {1..20}; do
    if curl -fsS "$url" >/dev/null 2>&1; then
      log "Health check passed: $url"
      return
    fi
    sleep 1
  done

  sudo pm2 logs "$APP_NAME" --lines 80 --nostream || true
  die "Health check failed: $url"
}

trap 'log "Deploy failed on line $LINENO."' ERR

require_cmd git
require_cmd npm
require_cmd pm2
require_cmd curl
require_cmd sudo

acquire_lock

log "--- DEPLOY START ---"
log "Repo: $REPO_DIR"
log "App:  $APP_DIR"
log "Branch: origin/$BRANCH"

cd "$REPO_DIR"
git fetch origin "$BRANCH"
git pull --ff-only origin "$BRANCH"

cd "$APP_DIR"
if [ -f package-lock.json ]; then
  npm ci
else
  npm install
fi

log "--- BUILDING ---"
npm run build

log "--- RESTARTING $APP_NAME FROM CURRENT BUILD ---"
if sudo pm2 list | grep -q "$APP_NAME"; then
  sudo pm2 restart "$APP_NAME" --update-env || (sudo pm2 delete "$APP_NAME" && sudo pm2 start "$PM2_SERVER_PATH" --name "$APP_NAME" --cwd "$PM2_CWD" --update-env)
else
  sudo pm2 start "$PM2_SERVER_PATH" --name "$APP_NAME" --cwd "$PM2_CWD" --update-env || true
fi
sudo pm2 save

health_check

# Open a new terminal to show logs for 3 seconds, then close
if command -v gnome-terminal >/dev/null 2>&1; then
  gnome-terminal -- bash -c "sudo pm2 logs $APP_NAME; sleep 3; exit" &
elif command -v xterm >/dev/null 2>&1; then
  xterm -e "sudo pm2 logs $APP_NAME; sleep 3; exit" &
else
  log "Warning: No terminal emulator (gnome-terminal or xterm) found to display logs."
fi

log "--- DEPLOY FINISHED ---"