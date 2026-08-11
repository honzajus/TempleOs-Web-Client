import { defineConfig } from "vite";

// Served from the container's nginx at the root path, so an absolute base
// is correct here (this is no longer a static site deployed to an arbitrary
// sub-path). For local frontend-only iteration, `npm run dev` proxies
// /websockify and /api to a docker-compose backend running on HOST_PORT
// (default 8080) -- run `docker compose up` in another terminal first.
const BACKEND = `http://localhost:${process.env.HOST_PORT ?? "8080"}`;

export default defineConfig({
    base: "/",
    server: {
        port: 5173,
        open: true,
        proxy: {
            "/websockify": {
                target: BACKEND,
                ws: true,
            },
            "/api": {
                target: BACKEND,
            },
        },
    },
    preview: {
        port: 4173,
    },
    build: {
        // noVNC's decoders use top-level await, which needs es2022+.
        target: "es2022",
        assetsInlineLimit: 0,
    },
});
