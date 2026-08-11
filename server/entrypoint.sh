#!/usr/bin/env bash
set -euo pipefail

DATA_DIR="${DATA_DIR:-/data}"
ISO_PATH="$DATA_DIR/TOS_Distro.ISO"
DISK_PATH="$DATA_DIR/qemu_disk.qcow2"
DISK_SIZE="${DISK_SIZE:-3G}"

# The real, official TempleOS 5.03 distro image, straight from the primary
# source. MD5 pinned from templeos.org/Downloads/md5sums.txt (published by
# the site itself) -- verified independently before this was ever committed.
ISO_URL="https://templeos.org/Downloads/TOS_Distro.ISO"
ISO_MD5="bc0a9310776e536ad52c68df558cfdc1"

mkdir -p "$DATA_DIR"

verify_md5() {
    local file="$1" expected="$2" actual
    actual=$(md5sum "$file" | awk '{print $1}')
    [ "$actual" = "$expected" ]
}

if [ -f "$ISO_PATH" ] && verify_md5 "$ISO_PATH" "$ISO_MD5"; then
    echo "[entrypoint] TempleOS ISO already present at $ISO_PATH and MD5-verified."
else
    echo "[entrypoint] Downloading the real TempleOS 5.03 distro ISO from the official source:"
    echo "[entrypoint]   $ISO_URL"
    rm -f "$ISO_PATH"
    curl -fL --retry 3 -o "$ISO_PATH" "$ISO_URL"
    if ! verify_md5 "$ISO_PATH" "$ISO_MD5"; then
        echo "[entrypoint] FATAL: MD5 mismatch -- refusing to boot an unverified image." >&2
        echo "[entrypoint]   expected: $ISO_MD5" >&2
        echo "[entrypoint]   actual:   $(md5sum "$ISO_PATH" | awk '{print $1}')" >&2
        rm -f "$ISO_PATH"
        exit 1
    fi
    echo "[entrypoint] Downloaded and MD5-verified OK."
fi

if [ ! -f "$DISK_PATH" ]; then
    echo "[entrypoint] Creating a fresh ${DISK_SIZE} virtual hard disk at $DISK_PATH"
    qemu-img create -f qcow2 "$DISK_PATH" "$DISK_SIZE" >/dev/null
fi

# --boot order=cd tries the hard disk (c) first, falling back to the CD-ROM
# (d) automatically when the disk has nothing bootable on it yet. That means
# a fresh disk boots TempleOS's own installer straight off TOS_Distro.ISO,
# and once TempleOS has installed itself to the disk, later container
# restarts boot straight from it -- with no install-vs-normal-boot detection
# logic needed here at all; SeaBIOS' own boot-order fallback handles it.
ACCEL_ARGS=(-accel tcg -cpu qemu64)
if [ "${QEMU_KVM:-0}" = "1" ] && [ -e /dev/kvm ]; then
    echo "[entrypoint] /dev/kvm available and QEMU_KVM=1 -- using KVM acceleration."
    ACCEL_ARGS=(-accel kvm -cpu host)
else
    echo "[entrypoint] Using TCG (software) CPU emulation."
    echo "[entrypoint] For much better performance, run on a Linux host with KVM, pass"
    echo "[entrypoint] --device=/dev/kvm to the container, and set QEMU_KVM=1."
fi

# Basic auth is off by default (so a plain \`docker compose up\` just works),
# but strongly recommended before exposing this to the public internet --
# TempleOS itself has no login/permission model at all, and this VM is
# shared by every visitor.
: > /etc/nginx/auth.conf
if [ -n "${BASIC_AUTH_USER:-}" ] && [ -n "${BASIC_AUTH_PASS:-}" ]; then
    echo "[entrypoint] HTTP basic auth enabled for user '${BASIC_AUTH_USER}'."
    htpasswd -b -c /etc/nginx/htpasswd "$BASIC_AUTH_USER" "$BASIC_AUTH_PASS" >/dev/null
    {
        echo "auth_basic \"TempleOS\";"
        echo "auth_basic_user_file /etc/nginx/htpasswd;"
    } > /etc/nginx/auth.conf
else
    echo "[entrypoint] WARNING: no BASIC_AUTH_USER/BASIC_AUTH_PASS set -- this instance is"
    echo "[entrypoint] open to anyone who can reach it. See README.md before deploying publicly."
fi

rm -f /tmp/qemu-monitor.sock

echo "[entrypoint] Starting websockify (VNC <-> WebSocket bridge) on :6080..."
websockify 6080 localhost:5900 &
WS_PID=$!

echo "[entrypoint] Starting control API on :8081..."
python3 /opt/control-server.py &
CTRL_PID=$!

echo "[entrypoint] Starting nginx on :8080..."
nginx -c /etc/nginx/nginx.conf -g 'daemon off;' &
NGINX_PID=$!

cleanup() {
    echo "[entrypoint] shutting down..."
    kill "$WS_PID" "$CTRL_PID" "$NGINX_PID" "$QEMU_PID" 2>/dev/null || true
}
trap cleanup TERM INT

echo "[entrypoint] Starting QEMU (this is the real TempleOS 5.03)..."
qemu-system-x86_64 \
    -name templeos \
    -machine pc \
    "${ACCEL_ARGS[@]}" \
    -smp cores="${QEMU_CORES:-2}" \
    -m "${QEMU_RAM:-2048}" \
    -rtc base=localtime \
    -drive if=ide,format=qcow2,file="$DISK_PATH" \
    -cdrom "$ISO_PATH" \
    -boot order=cd \
    -vnc 0.0.0.0:0 \
    -monitor unix:/tmp/qemu-monitor.sock,server,nowait \
    -display none &
QEMU_PID=$!

wait -n "$QEMU_PID" "$WS_PID" "$CTRL_PID" "$NGINX_PID"
cleanup
