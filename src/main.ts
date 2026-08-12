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
const btnGames = byId<HTMLButtonElement>("btn-games");
const btnPaste = byId<HTMLButtonElement>("btn-paste");
const pasteCatcher = byId<HTMLTextAreaElement>("paste-catcher");

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
        btnGames.disabled = false;
        btnPaste.disabled = false;
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
    btnGames.disabled = true;
    btnPaste.disabled = true;
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

btnGames.addEventListener("click", () => {
    remote.focus();
    // Real command, verified against templeos.org's own TOS_Distro.ISO
    // help-text ("::/Demo/Games/Talons.HC" etc.) -- typed as genuine
    // keystrokes into TempleOS's real shell, which lists the real games as
    // clickable entries via Dir;.
    remote.sendText('Cd("::/Demo/Games");\nDir;\n');
});

screenWrap.addEventListener("click", () => {
    if (remote.isConnected) {
        remote.focus();
    }
});

btnPaste.addEventListener("click", async () => {
    try {
        const text = await navigator.clipboard.readText();
        if (text) remote.sendText(text);
        remote.focus();
    } catch (err) {
        console.error(err); // eslint-disable-line no-console
        showError(
            `Could not read the clipboard: ${err instanceof Error ? err.message : String(err)}\n\n` +
                `Your browser may need clipboard permission for this site, or you can use the Paste button after copying text elsewhere.`,
        );
    }
});

// Real browsers only fire the native `paste` event on an editable element,
// never on a canvas/div -- so on Ctrl/Cmd+V we redirect focus to a hidden
// textarea *before* the browser's own paste handling runs (capture phase,
// and no preventDefault so the browser still processes the shortcut, just
// against the new focus target). stopPropagation/stopImmediatePropagation
// keep noVNC's own keydown handler on the canvas from also seeing "v" and
// forwarding a literal Ctrl+V to the guest.
document.addEventListener(
    "keydown",
    (event) => {
        if (!remote.isConnected) return;
        const isPaste = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v";
        if (!isPaste) return;
        event.stopPropagation();
        event.stopImmediatePropagation();
        pasteCatcher.value = "";
        pasteCatcher.focus();
    },
    true,
);

pasteCatcher.addEventListener("paste", (event) => {
    const text = event.clipboardData?.getData("text");
    event.preventDefault();
    pasteCatcher.value = "";
    if (text) remote.sendText(text);
    remote.focus();
});
