#!/usr/bin/env bash

set -Eeuo pipefail

APP_DIR="${APP_DIR:-/home/container}"
REPO_URL="${INSTALL_REPO:-https://github.com/Rigelynx/verifcation-bot.git}"
GIT_BRANCH="${GIT_BRANCH:-main}"
NODE_BIN="${NODE_BIN:-/usr/local/bin/node}"
NPM_BIN="${NPM_BIN:-/usr/local/bin/npm}"
TMP_CLONE_DIR=""

log() {
    printf '[STARTUP] %s\n' "$*"
}

warn() {
    printf '[STARTUP] ADVERTENCIA: %s\n' "$*" >&2
}

fail() {
    printf '[STARTUP] ERROR: %s\n' "$*" >&2
    exit 1
}

cleanup() {
    if [[ -n "$TMP_CLONE_DIR" && -d "$TMP_CLONE_DIR" ]]; then
        rm -rf -- "$TMP_CLONE_DIR"
    fi
}
trap cleanup EXIT

# Tolera que la URL haya sido pegada accidentalmente como enlace Markdown.
MARKDOWN_LINK_REGEX='^\[[^]]+\]\((https?://[^)]+)\)$'
if [[ "$REPO_URL" =~ $MARKDOWN_LINK_REGEX ]]; then
    REPO_URL="${BASH_REMATCH[1]}"
    warn 'INSTALL_REPO tenía formato Markdown; se extrajo la URL real automáticamente.'
fi

command -v git >/dev/null 2>&1 || fail 'Git no está instalado en el contenedor.'
[[ -x "$NODE_BIN" ]] || fail "Node.js no fue encontrado en $NODE_BIN."
[[ -x "$NPM_BIN" ]] || fail "npm no fue encontrado en $NPM_BIN."

mkdir -p "$APP_DIR"
cd "$APP_DIR"

if [[ ! -d .git ]]; then
    log "Instalación inicial desde $REPO_URL (rama $GIT_BRANCH)."
    TMP_CLONE_DIR="$(mktemp -d /tmp/verificationbot.XXXXXX)"
    git clone --branch "$GIT_BRANCH" --single-branch "$REPO_URL" "$TMP_CLONE_DIR/repo"

    # Copia el repositorio sin borrar archivos persistentes ya existentes.
    # .env y database.sqlite no forman parte de Git y se conservan.
    cp -a "$TMP_CLONE_DIR/repo/." "$APP_DIR/"
    rm -rf -- "$TMP_CLONE_DIR"
    TMP_CLONE_DIR=""
else
    log "Repositorio detectado. Buscando actualizaciones en origin/$GIT_BRANCH."

    # Respalda cambios rastreados y archivos nuevos. Los archivos ignorados y
    # persistentes (.env, database.sqlite y WAL) nunca entran al stash.
    if [[ -n "$(git status --porcelain --untracked-files=normal)" ]]; then
        STASH_NAME="holy-auto-backup-$(date -u +%Y%m%dT%H%M%SZ)"
        git stash push --include-untracked -m "$STASH_NAME"
        warn "Había cambios locales; quedaron respaldados en el stash '$STASH_NAME'."
    fi

    git fetch --prune origin "$GIT_BRANCH"

    CURRENT_BRANCH="$(git branch --show-current)"
    if [[ "$CURRENT_BRANCH" != "$GIT_BRANCH" ]]; then
        log "Cambiando de '${CURRENT_BRANCH:-detached HEAD}' a '$GIT_BRANCH'."
        if git show-ref --verify --quiet "refs/heads/$GIT_BRANCH"; then
            git checkout "$GIT_BRANCH"
        else
            git checkout --track -b "$GIT_BRANCH" "origin/$GIT_BRANCH"
        fi
    fi

    # Solo acepta actualizaciones lineales. Nunca sobrescribe commits locales.
    git merge --ff-only "origin/$GIT_BRANCH"
fi

[[ -f package.json ]] || fail "No existe $APP_DIR/package.json."

if [[ -f package-lock.json ]]; then
    log 'Instalando dependencias reproducibles con npm ci.'
    if ! "$NPM_BIN" ci --omit=dev --no-audit --no-fund; then
        warn 'package-lock.json no coincide con package.json; usando recuperación con npm install.'
        "$NPM_BIN" install --omit=dev --package-lock=false --no-audit --no-fund
    fi
else
    warn 'No existe package-lock.json; usando npm install sin generar lockfile local.'
    "$NPM_BIN" install --omit=dev --package-lock=false --no-audit --no-fund
fi

if [[ -n "${NODE_PACKAGES:-}" ]]; then
    warn "Instalando paquetes adicionales definidos por NODE_PACKAGES: $NODE_PACKAGES"
    # La separación intencional permite varios nombres de paquete en la variable.
    # shellcheck disable=SC2086
    "$NPM_BIN" install --no-save --package-lock=false --no-audit --no-fund $NODE_PACKAGES
fi

log 'Dependencias listas. Iniciando Verification Bot USMC.'
exec "$NODE_BIN" "$APP_DIR/src/index.js"
