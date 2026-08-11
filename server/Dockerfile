# --- Stage 1: build the static frontend (noVNC-based viewer + controls) ---
FROM node:22-slim AS frontend-build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY index.html vite.config.ts tsconfig.json ./
COPY src ./src
COPY public ./public
RUN npm run build

# --- Stage 2: runtime -- QEMU (real TempleOS), websockify, control API, nginx ---
FROM debian:bookworm-slim AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends \
        qemu-system-x86 \
        qemu-utils \
        websockify \
        nginx \
        python3 \
        curl \
        ca-certificates \
        apache2-utils \
    && rm -rf /var/lib/apt/lists/*

COPY server/entrypoint.sh /opt/entrypoint.sh
COPY server/control-server.py /opt/control-server.py
COPY server/nginx.conf /etc/nginx/nginx.conf
RUN chmod +x /opt/entrypoint.sh

COPY --from=frontend-build /app/dist /usr/share/nginx/html

# TOS_Distro.ISO + the persistent qemu_disk.qcow2 live here; mount a volume
# so the installed OS / user data survives container restarts.
RUN mkdir -p /data
VOLUME /data

EXPOSE 8080
ENTRYPOINT ["/opt/entrypoint.sh"]
