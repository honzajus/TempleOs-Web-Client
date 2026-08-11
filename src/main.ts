import "./style.css";
import { RemoteDisplay } from "./remote";

function byId<T extends HTMLElement>(id: string): T {
    const el = document.getElementById(id);
    if (!el) throw new Error(`Missing #${id} in index.html`);
    return el as T;
}

const screenWrap = byId<HTMLDivElement>("screen-wrap");
const screenContainer = byId<HTMLDivElement>("screen_container");
const overlay = byId<HTMLDivElement>("overlay");
const overlayMessage = byId<HTMLParagraphElement>("overlay-message");
const errorBox = byId<HTMLPreElement>("error-box");
const statusText = byId<HTMLSpanElement>("status-text");

const btnStart = byId<HTMLButtonElement>("btn-start");
const btnPause = byId<HTMLButtonElement>("btn-pause");
const btnRestart = byId<HTMLButtonElement>("btn-restart");
const btnFullscreen = byId<HTMLButtonElement>("btn-fullscreen");
const btnCtrlAltDel = byId<HTMLButtonElement>("btn-ctrlaltdel");

let paused = false;

function wsUrl(): string {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${location.host}/websockify`;
}

const remote = new RemoteDisplay(screenContainer, {
    onConnected() {
        overlay.hidden = true;
        statusText.textContent = "Connected";
        btnStart.disabled = true;
        btnPause.disabled = false;
        btnPause.textContent = "⏸ Pause";
        btnRestart.disabled = false;
        btnFullscreen.disabled = false;
        btnCtrlAltDel.disabled = false;
        paused = false;
    },
    onDisconnected() {
        statusText.textContent = "Disconnected";
        resetToIdle();
    },
    onError(message) {
        showError(message);
        resetToIdle();
    },
});

function showError(message: string): void {
    errorBox.hidden = false;
    errorBox.textContent = message;
    overlay.hidden = false;
    overlayMessage.textContent = "Something went wrong.";
}

function resetToIdle(): void {
    btnStart.disabled = false;
    btnPause.disabled = true;
    btnRestart.disabled = true;
    btnFullscreen.disabled = true;
    btnCtrlAltDel.disabled = true;
    if (!statusText.textContent || statusText.textContent === "Connected") {
        statusText.textContent = "Idle";
    }
}

async function callControlApi(action: "restart" | "pause" | "resume"): Promise<void> {
    try {
        const res = await fetch(`/api/${action}`, { method: "POST" });
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body.error ?? `HTTP ${res.status}`);
        }
    } catch (err) {
        console.error(err); // eslint-disable-line no-console
        showError(
            `Could not ${action} the VM: ${err instanceof Error ? err.message : String(err)}\n\n` +
                `The control API may be unreachable even though the VNC connection is fine.`,
        );
    }
}

btnStart.addEventListener("click", () => {
    btnStart.disabled = true;
    errorBox.hidden = true;
    overlay.hidden = false;
    overlayMessage.textContent = "Connecting…";
    statusText.textContent = "Connecting…";
    remote.connect(wsUrl());
});

btnPause.addEventListener("click", async () => {
    if (!paused) {
        await callControlApi("pause");
        paused = true;
        btnPause.textContent = "▶ Resume";
        statusText.textContent = "Paused (shared VM)";
    } else {
        await callControlApi("resume");
        paused = false;
        btnPause.textContent = "⏸ Pause";
        statusText.textContent = "Connected";
    }
});

btnRestart.addEventListener("click", async () => {
    await callControlApi("restart");
    paused = false;
    btnPause.textContent = "⏸ Pause";
    statusText.textContent = "Connected (restarting…)";
});

btnFullscreen.addEventListener("click", () => {
    if (screenWrap.requestFullscreen) {
        screenWrap.requestFullscreen().catch((err) => console.error(err)); // eslint-disable-line no-console
    }
});

btnCtrlAltDel.addEventListener("click", () => {
    remote.sendCtrlAltDel();
});

screenWrap.addEventListener("click", () => {
    if (remote.isConnected) {
        remote.focus();
    }
});
