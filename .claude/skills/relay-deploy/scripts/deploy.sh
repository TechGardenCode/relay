#!/usr/bin/env bash
# relay-deploy/deploy.sh — build the Relay server locally and push it to the dev VM
# as a running systemd --user service. Idempotent upgrade path. See ../SKILL.md.
#
# Inverse of vm-e2e: server runs ON the VM (persistent), so native modules
# (node-pty, better-sqlite3) are rebuilt on the VM. Never touches ~/.relay (data).
#
#   ./deploy.sh            # build → stop → rsync code → pnpm install → restart → health-check
#   ./deploy.sh --dry-run  # print the plan; build/send nothing; contact no host
set -euo pipefail

DRY_RUN=0
[ "${1:-}" = "--dry-run" ] && DRY_RUN=1

RELAY_VM_HOST="${RELAY_VM_HOST:-techgardencode@10.0.60.221}"
RELAY_VM_CODE_DIR="${RELAY_VM_CODE_DIR:-relay-server}"   # relative to the VM user's $HOME
RELAY_PORT="${RELAY_PORT:-7777}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RELAY_LOCAL_REPO="${RELAY_LOCAL_REPO:-$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)}"
HOST_ONLY="${RELAY_VM_HOST#*@}"

say()  { printf '\033[1;36m▶ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m! %s\033[0m\n' "$*"; }
plan() { printf '   \033[2m[dry-run] %s\033[0m\n' "$*"; }

EXCLUDES=(--exclude '.git' --exclude 'node_modules' --exclude '*.test.ts' \
          --exclude '*.test.js' --exclude 'test/' --exclude '.angular' \
          --exclude 'packages/spike-pwa/dist')

say "relay-deploy → $RELAY_VM_HOST:~/$RELAY_VM_CODE_DIR  (port $RELAY_PORT)"
say "repo: $RELAY_LOCAL_REPO"
[ "$DRY_RUN" = 1 ] && warn "DRY RUN — building/sending nothing, contacting no host."

# 1. Build locally — fail fast before the VM is touched. Server + its deps only
#    (skips extension/spike-pwa so a server deploy isn't coupled to their build health).
say "1/6 build locally (server + protocol)"
if [ "$DRY_RUN" = 1 ]; then plan "pnpm -C '$RELAY_LOCAL_REPO' --filter '@relay/relay...' build"
else pnpm -C "$RELAY_LOCAL_REPO" --filter '@relay/relay...' build; fi

# 2. Preflight: VM bootstrapped (code dir + unit present)?
say "2/6 preflight (ssh reachable + bootstrapped)"
if [ "$DRY_RUN" = 1 ]; then
  plan "ssh -o BatchMode=yes $RELAY_VM_HOST -- 'test -d ~/$RELAY_VM_CODE_DIR && systemctl --user cat relay-server'"
else
  ssh -o ConnectTimeout=5 -o BatchMode=yes "$RELAY_VM_HOST" -- \
    "test -d ~/$RELAY_VM_CODE_DIR && systemctl --user cat relay-server >/dev/null 2>&1" || {
      warn "VM not bootstrapped (missing ~/$RELAY_VM_CODE_DIR or the relay-server unit)."
      warn "Run scripts/bootstrap-vm.sh first."
      exit 1
    }
fi

# 3. Stop the running server.
say "3/6 stop relay-server"
if [ "$DRY_RUN" = 1 ]; then plan "ssh $RELAY_VM_HOST -- 'systemctl --user stop relay-server'"
else ssh "$RELAY_VM_HOST" -- 'systemctl --user stop relay-server' || true; fi

# 4. rsync code → VM. NEVER ~/.relay; --delete is scoped to the code dir only.
say "4/6 rsync code → VM (~/.relay untouched)"
if [ "$DRY_RUN" = 1 ]; then
  plan "rsync -az --delete ${EXCLUDES[*]} '$RELAY_LOCAL_REPO/' '$RELAY_VM_HOST:$RELAY_VM_CODE_DIR/'"
else
  rsync -az --delete "${EXCLUDES[@]}" "$RELAY_LOCAL_REPO/" "$RELAY_VM_HOST:$RELAY_VM_CODE_DIR/"
fi

# 5. Rebuild native deps on the VM (node-pty, better-sqlite3 for Linux). dist is shipped.
say "5/6 pnpm install on VM (rebuild native modules)"
if [ "$DRY_RUN" = 1 ]; then plan "ssh $RELAY_VM_HOST -- 'cd ~/$RELAY_VM_CODE_DIR && pnpm install'"
else ssh "$RELAY_VM_HOST" -- "cd ~/$RELAY_VM_CODE_DIR && pnpm install" 2>&1 | tail -15; fi

# 6. Restart + health check.
say "6/6 restart + health check"
if [ "$DRY_RUN" = 1 ]; then
  plan "ssh $RELAY_VM_HOST -- 'systemctl --user restart relay-server'"
  plan "ssh $RELAY_VM_HOST -- 'systemctl --user is-active relay-server; ss -ltn | grep :$RELAY_PORT'"
  say "dry run complete."
  exit 0
fi
ssh "$RELAY_VM_HOST" -- 'systemctl --user restart relay-server'
sleep 2
STATE=$(ssh "$RELAY_VM_HOST" -- 'systemctl --user is-active relay-server' || true)
LISTEN=$(ssh "$RELAY_VM_HOST" -- "ss -ltn 2>/dev/null | grep -q ':$RELAY_PORT' && echo LISTENING || echo NOT-LISTENING")
echo "   service: $STATE   ·   port $RELAY_PORT: $LISTEN"
if [ "$STATE" = active ] && [ "$LISTEN" = LISTENING ]; then
  say "deployed OK → reach it at http://$HOST_ONLY:$RELAY_PORT/app  (or the VM's Tailscale IP)"
else
  warn "server not healthy. Logs: ssh $RELAY_VM_HOST -- 'journalctl --user -u relay-server -n 50'"
  exit 1
fi
