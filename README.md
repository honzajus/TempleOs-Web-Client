<p align="center">
  <img src="public/favicon.png" alt="TempleOS" width="96" height="96" />
</p>

<h1 align="center">TempleOS in the Browser</h1>

<p align="center">
  The real, unmodified <strong>TempleOS 5.03</strong> — booted in a real QEMU VM on a server
  and streamed to your browser over VNC (noVNC). No simulation, no fake shell.
</p>

<p align="center">
  Made by <a href="https://studio.flowx.lol/">studio.flowx.lol</a> &amp; <strong>Honzajus</strong>
</p>

---

## Download & run

Requires [Docker](https://www.docker.com/) and Docker Compose.

```bash
git clone https://github.com/honzajus/templeos-web.git
cd templeos-web
docker compose up --build
```

Open **http://localhost:8080** and click **Connect**.

First boot downloads the real TempleOS ISO straight from
[templeos.org](https://templeos.org/Downloads/) and boots it — give it a
minute. TempleOS will ask a couple of its own real boot-time questions:

```
Install onto hard drive (y or n)?
```

- **`n`** — play with it live, without installing.
- **`y`** — installs to a persistent disk, so it survives restarts.

### Configuration

Copy `.env.example` to `.env` to change the port, VM RAM/CPU, or add basic
auth (`BASIC_AUTH_USER` / `BASIC_AUTH_PASS`) before exposing this publicly —
recommended, since the VM is shared by everyone who connects.
