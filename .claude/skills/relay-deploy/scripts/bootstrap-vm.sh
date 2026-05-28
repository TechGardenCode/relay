#!/usr/bin/env bash
# relay-deploy/bootstrap-vm.sh — one-time setup of the Relay server on the dev VM.
# Run this ONCE on a fresh VM (or after wiping ~/relay-server). Afterwards use deploy.sh.
# See ../SKILL.md. Preserves ~/.relay (data) — init only runs if it doesn't exist yet.
set -euo pipefail

RELAY_VM_HOST="${RELAY_VM_HOST:-techgardencode@10.0.60.221}"
RELAY_VM_CODE_DIR="${RELAY_VM_CODE_DIR:-relay-server}"
RELAY_PORT="${RELAY_PORT:-7777}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RELAY_LOCAL_REPO="${RELAY_LOCAL_REPO:-$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)}"
HOST_ONLY="${RELAY_VM_HOST#*@}"
VM_USER="${RELAY_VM_HOST%@*}"

say()  { printf '\033[1;36m▶ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m! %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

EXCLUDES=(--exclude '.git' --exclude 'node_modules' --exclude '*.test.ts' \
          --exclude '*.test.js' --exclude 'test/' --exclude '.angular' \
          --exclude 'packages/spike-pwa/dist')

say "Bootstrapping Relay server on $RELAY_VM_HOST  (one-time)"

# --- Preflight ---------------------------------------------------------------
say "Preflight"
ssh -o ConnectTimeout=5 -o BatchMode=yes "$RELAY_VM_HOST" -- 'echo ok' >/dev/null \
  || die "passwordless ssh to $RELAY_VM_HOST failed — set up an ssh key first."
ssh "$RELAY_VM_HOST" -- 'node -e "process.exit(+process.versions.node.split(\".\")[0]>=22?0:1)"' \
  || die "VM needs Node >=22 on PATH (have: $(ssh "$RELAY_VM_HOST" -- 'node --version' 2>/dev/null || echo none))."
ssh "$RELAY_VM_HOST" -- 'command -v pnpm >/dev/null || corepack enable' \
  || warn "pnpm missing and 'corepack enable' failed — install pnpm on the VM before deploying."
ssh "$RELAY_VM_HOST" -- 'command -v cc >/dev/null && command -v make >/dev/null && command -v python3 >/dev/null' \
  || die "VM missing build tools (node-pty + better-sqlite3 need them). Run on the VM: sudo apt-get install -y build-essential python3"
ssh "$RELAY_VM_HOST" -- 'command -v claude >/dev/null' \
  || warn "claude not on the VM PATH — the server boots but spawned sessions exit immediately. Install Claude Code on the VM and run 'claude login' (writes ~/.claude/.credentials.json), per ND-19."

NODE_BIN=$(ssh "$RELAY_VM_HOST" -- 'command -v node')
VM_HOME=$(ssh "$RELAY_VM_HOST" -- 'echo "$HOME"')
say "VM node: $NODE_BIN   ·   \$HOME: $VM_HOME"

# --- First build + sync + native install ------------------------------------
say "Build locally (server + protocol)"
pnpm -C "$RELAY_LOCAL_REPO" --filter '@relay/relay...' build
say "First sync → VM (~/$RELAY_VM_CODE_DIR)"
ssh "$RELAY_VM_HOST" -- "mkdir -p ~/$RELAY_VM_CODE_DIR"
rsync -az --delete "${EXCLUDES[@]}" "$RELAY_LOCAL_REPO/" "$RELAY_VM_HOST:$RELAY_VM_CODE_DIR/"
say "pnpm install on VM — builds node-pty + better-sqlite3 for Linux (may take a minute)"
ssh "$RELAY_VM_HOST" -- "cd ~/$RELAY_VM_CODE_DIR && pnpm install" 2>&1 | tail -20

# --- ~/.relay: init if absent (preserve existing data); bind 0.0.0.0 --------
say "Ensure ~/.relay (init only if first run) + bind 0.0.0.0"
ssh "$RELAY_VM_HOST" -- "test -f ~/.relay/config.yaml \
  || $NODE_BIN ~/$RELAY_VM_CODE_DIR/packages/server/dist/cli/relay.js init --url http://$HOST_ONLY:$RELAY_PORT"
ssh "$RELAY_VM_HOST" -- 'cfg="$HOME/.relay/config.yaml"; if grep -q "^host:" "$cfg"; then sed -i "s/^host:.*/host: 0.0.0.0/" "$cfg"; else printf "host: 0.0.0.0\n" >> "$cfg"; fi'

# --- systemd --user service --------------------------------------------------
say "Install systemd --user unit"
UNIT_RENDERED=$(sed -e "s|__NODE_BIN__|$NODE_BIN|g" \
                    -e "s|__CODE_DIR__|$VM_HOME/$RELAY_VM_CODE_DIR|g" \
                    "$SCRIPT_DIR/relay-server.service")
ssh "$RELAY_VM_HOST" -- "mkdir -p ~/.config/systemd/user"
printf '%s\n' "$UNIT_RENDERED" | ssh "$RELAY_VM_HOST" -- "cat > ~/.config/systemd/user/relay-server.service"
ssh "$RELAY_VM_HOST" -- 'systemctl --user daemon-reload && systemctl --user enable relay-server'
ssh "$RELAY_VM_HOST" -- 'loginctl enable-linger "$USER"' 2>/dev/null \
  || warn "enable-linger failed (may need root). Without it the service stops at logout + won't survive reboot. Fix: 'sudo loginctl enable-linger $VM_USER' on the VM, or use the tmux+nohup fallback in SKILL.md."
ssh "$RELAY_VM_HOST" -- 'systemctl --user restart relay-server'
sleep 2

# --- Verify + print pairing --------------------------------------------------
say "Verify"
STATE=$(ssh "$RELAY_VM_HOST" -- 'systemctl --user is-active relay-server' || true)
LISTEN=$(ssh "$RELAY_VM_HOST" -- "ss -ltn 2>/dev/null | grep -q ':$RELAY_PORT' && echo LISTENING || echo NOT-LISTENING")
echo "   service: $STATE   ·   port $RELAY_PORT: $LISTEN"
[ "$STATE" = active ] && [ "$LISTEN" = LISTENING ] \
  || warn "server not healthy. Logs: ssh $RELAY_VM_HOST -- 'journalctl --user -u relay-server -n 50'"

say "Pairing snippet (open on the phone):"
ssh "$RELAY_VM_HOST" -- 'cat ~/.relay/last-pairing.txt 2>/dev/null' \
  || warn "no last-pairing.txt — run on the VM: $NODE_BIN ~/$RELAY_VM_CODE_DIR/packages/server/dist/cli/relay.js token create --device phone"
say "PWA URL once built: http://$HOST_ONLY:$RELAY_PORT/app   (or the VM's Tailscale IP)"
say "Bootstrap done. Upgrade later with: scripts/deploy.sh"
