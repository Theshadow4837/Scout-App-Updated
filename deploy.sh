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
WINDOWS_BASH=0

export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"

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

if command -v cmd.exe >/dev/null 2>&1; then
  WINDOWS_BASH=1

  if command -v wslpath >/dev/null 2>&1; then
    PM2_SERVER_PATH="$(wslpath -w "$SERVER_PATH")"
    PM2_CWD="$(wslpath -w "$APP_DIR")"
  else
    PM2_CWD="$APP_DIR"
  fi

  pm2_run() {
    cmd.exe /c pm2 "$@"
  }
else
  PM2_CWD="$APP_DIR"

  pm2_run() {
    pm2 "$@"
  }
fi

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
    if [ "$WINDOWS_BASH" -eq 1 ]; then
      if powershell.exe -NoProfile -Command "Invoke-WebRequest -UseBasicParsing '$url' -TimeoutSec 5 | Out-Null" >/dev/null 2>&1; then
        log "Health check passed: $url"
        return
      fi
    elif curl -fsS "$url" >/dev/null 2>&1; then
      log "Health check passed: $url"
      return
    fi
    sleep 1
  done

  pm2_run logs "$APP_NAME" --lines 80 --nostream || true
  die "Health check failed: $url"
}

trap 'log "Deploy failed on line $LINENO."' ERR

require_cmd git
require_cmd npm
require_cmd pm2
if [ "$WINDOWS_BASH" -eq 1 ]; then
  require_cmd powershell.exe
else
  require_cmd curl
fi

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

if pm2_run describe "$APP_NAME" >/dev/null 2>&1; then
  log "--- RESTARTING $APP_NAME ---"
  pm2_run restart "$APP_NAME" --update-env
else
  log "--- STARTING $APP_NAME ---"
  pm2_run start "$PM2_SERVER_PATH" --name "$APP_NAME" --cwd "$PM2_CWD"
fi

pm2_run save
health_check

log "--- DEPLOY FINISHED ---"
