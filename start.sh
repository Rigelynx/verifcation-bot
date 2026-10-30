#!/usr/bin/env bash

set -Eeuo pipefail
TMP_CLONE_DIR=""

log() { printf '[STARTUP] %s\n' "$*"; }
warn() { printf '[STARTUP] ADVERTENCIA: %s\n' "$*" >&2; }
fail() { printf '[STARTUP] ERROR: %s\n' "$*" >&2; exit 1; }

cleanup() {
    # Solo elimina el temporal creado por este script.
    if [[ -n "$TMP_CLONE_DIR" && "$TMP_CLONE_DIR" == /tmp/verificationbot.* && -d "$TMP_CLONE_DIR" ]]; then
        rm -rf -- "$TMP_CLONE_DIR"
    fi
}
trap cleanup EXIT

protect_persistent_files() {
    local repo_dir="$1" revision="$2" filename
    while IFS= read -r filename; do
        case "$filename" in
            .env.example|.env.*.example) continue ;;
            .env|.env.*|database.sqlite*|*.sqlite|*.sqlite-*|*.db|*.db-*|data/*|guilds/*|backups/*)
                fail "Git contiene un archivo persistente ($filename). Retíralo del seguimiento de Git antes de actualizar para proteger los datos del host." ;;
        esac
    done < <(git -C "$repo_dir" ls-tree -r --name-only "$revision")
}

# Bash lee main completa antes de ejecutarla. Git puede actualizar start.sh
# durante el arranque sin alterar las instrucciones que ya se están ejecutando.
main() {
    local app_dir="${APP_DIR:-/home/container}"
    local repo_url="${INSTALL_REPO:-https://github.com/Rigelynx/verifcation-bot.git}"
    local branch="${GIT_BRANCH:-${INSTALL_BRANCH:-main}}"
    local node_bin="${NODE_BIN:-$(command -v node || true)}"
    local npm_bin="${NPM_BIN:-$(command -v npm || true)}"
    local markdown_regex='^\[[^]]+\]\((https?://[^)]+)\)$'
    local target_revision backup_ref stash_name

    if [[ "$repo_url" =~ $markdown_regex ]]; then
        repo_url="${BASH_REMATCH[1]}"
        warn 'INSTALL_REPO tenía formato Markdown; se extrajo la URL real.'
    fi

    command -v git >/dev/null 2>&1 || fail 'Git no está instalado en el contenedor.'
    [[ -n "$node_bin" && -x "$node_bin" ]] || fail 'No se encontró Node.js. Revisa NODE_BIN o la imagen del contenedor.'
    [[ -n "$npm_bin" && -x "$npm_bin" ]] || fail 'No se encontró npm. Revisa NPM_BIN o la imagen del contenedor.'
    git check-ref-format --branch "$branch" >/dev/null || fail 'GIT_BRANCH no es una rama válida.'

    mkdir -p "$app_dir"
    cd "$app_dir"
    app_dir="$(pwd -P)"
    log "Actualizador activo. Carpeta: $app_dir · rama: $branch."

    if [[ ! -e .git ]]; then
        log 'Instalando el repositorio configurado en INSTALL_REPO.'
        TMP_CLONE_DIR="$(mktemp -d /tmp/verificationbot.XXXXXX)"
        git clone --branch "$branch" --single-branch -- "$repo_url" "$TMP_CLONE_DIR/repo" || fail 'No se pudo clonar el repositorio. Revisa INSTALL_REPO, la rama y el acceso a GitHub.'
        protect_persistent_files "$TMP_CLONE_DIR/repo" HEAD
        cp -a "$TMP_CLONE_DIR/repo/." "$app_dir/"
        cleanup
        TMP_CLONE_DIR=""
    else
        git rev-parse --verify HEAD >/dev/null 2>&1 || fail 'La carpeta .git está dañada o no contiene un commit válido.'
        [[ "$(git rev-parse --show-toplevel)" == "$app_dir" ]] || fail 'APP_DIR debe ser la raíz del repositorio del bot.'
        protect_persistent_files . HEAD

        # INSTALL_REPO también se aplica a instalaciones existentes.
        if git remote get-url origin >/dev/null 2>&1; then
            git remote set-url origin "$repo_url"
        else
            git remote add origin "$repo_url"
        fi
        log "Descargando origin/$branch."
        git fetch --prune origin "+refs/heads/$branch:refs/remotes/origin/$branch" || fail 'Falló la descarga desde GitHub. No se iniciará una versión antigua.'
        target_revision="$(git rev-parse --verify "refs/remotes/origin/$branch^{commit}")"
        protect_persistent_files . "$target_revision"

        # Exclusiones independientes del .gitignore antiguo del contenedor.
        # Nunca se usa git clean ni se guardan datos persistentes en el stash.
        local -a exclusions=(
            ':(exclude).env' ':(exclude).env.*'
            ':(exclude)*.sqlite' ':(exclude)*.sqlite-*'
            ':(exclude)*.db' ':(exclude)*.db-*'
            ':(exclude)data' ':(exclude)guilds' ':(exclude)backups'
        )
        if [[ -n "$(git status --porcelain --untracked-files=normal -- . "${exclusions[@]}")" ]]; then
            stash_name="holy-auto-backup-$(date -u +%Y%m%dT%H%M%SZ)-$$"
            git -c user.name='HolyHosting Startup' -c user.email='startup@localhost' stash push --include-untracked -m "$stash_name" -- . "${exclusions[@]}" || fail 'No se pudieron respaldar los cambios locales. Se cancela la actualización.'
            warn "Los cambios locales de código se guardaron en el stash '$stash_name'."
        fi

        if ! git merge-base --is-ancestor HEAD "$target_revision"; then
            backup_ref="holy-backup-$(date -u +%Y%m%dT%H%M%SZ)-$$"
            git branch "$backup_ref" HEAD || fail 'No se pudieron respaldar los commits locales.'
            warn "Los commits locales se conservaron en '$backup_ref'."
        fi

        # Usa exactamente el commit remoto; los commits locales quedan respaldados.
        git checkout --detach "$target_revision" || fail 'No se pudo aplicar la actualización de GitHub.'
    fi

    target_revision="$(git rev-parse HEAD)"
    export APP_REVISION="$target_revision"
    log "Código activo: $(git log -1 --format='%h %s') · origen: origin/$branch."
    [[ -f package.json && -f src/index.js ]] || fail "Falta package.json o src/index.js en $app_dir."

    if [[ -f package-lock.json ]]; then
        log 'Instalando dependencias con npm ci.'
        if ! "$npm_bin" ci --omit=dev --no-audit --no-fund; then
            warn 'npm ci falló; intentando recuperar las dependencias con npm install.'
            "$npm_bin" install --omit=dev --package-lock=false --no-audit --no-fund || fail 'No se pudieron instalar las dependencias.'
        fi
    else
        "$npm_bin" install --omit=dev --package-lock=false --no-audit --no-fund || fail 'No se pudieron instalar las dependencias.'
    fi

    if [[ -n "${NODE_PACKAGES:-}" ]]; then
        local -a extra_packages
        read -r -a extra_packages <<< "$NODE_PACKAGES"
        "$npm_bin" install --no-save --package-lock=false --no-audit --no-fund -- "${extra_packages[@]}" || fail 'Falló la instalación de NODE_PACKAGES.'
    fi

    log "Iniciando src/index.js · commit ${APP_REVISION:0:12}."
    exec "$node_bin" "$app_dir/src/index.js"
}

main "$@"
