import RFB from "@novnc/novnc";

// X11 keysym constants for the handful of non-printable keys this project
// needs to send. @novnc/novnc's internal keysym table isn't importable (the
// package only exposes its root "@novnc/novnc" specifier), but Latin-1
// printable characters map 1:1 to their Unicode code point as a keysym,
// which covers everything in the HolyC commands sent here.
const XK_Return = 0xff0d;
const XK_BackSpace = 0xff08;
const XK_Shift_L = 0xffe1;

// QEMU's simple (non-extended) RFB key event path maps a keysym straight to
// the scancode of its *unshifted* base key and doesn't infer Shift from the
// keysym itself -- sending the keysym for e.g. '(' or 'C' directly produces
// '9' / 'c' in the guest. So shifted characters must be sent as an explicit
// Shift press wrapped around the keysym of the unshifted key that produces
// them on a US layout, exactly as a real keyboard reports it.
const SHIFTED_SYMBOL_BASE: Record<string, string> = {
    "~": "`", "!": "1", "@": "2", "#": "3", "$": "4", "%": "5",
    "^": "6", "&": "7", "*": "8", "(": "9", ")": "0", "_": "-",
    "+": "=", "{": "[", "}": "]", "|": "\\", ":": ";", "\"": "'",
    "<": ",", ">": ".", "?": "/",
};

export interface RemoteCallbacks {
    onConnected(): void;
    onDisconnected(clean: boolean): void;
    onError(message: string): void;
}

/** Thin wrapper around noVNC's RFB client, tailored to this project's single VM. */
export class RemoteDisplay {
    private rfb: RFB | null = null;
    private readonly target: HTMLElement;
    private readonly callbacks: RemoteCallbacks;

    constructor(target: HTMLElement, callbacks: RemoteCallbacks) {
        this.target = target;
        this.callbacks = callbacks;
    }

    get isConnected(): boolean {
        return this.rfb !== null;
    }

    connect(wsUrl: string): void {
        if (this.rfb) return;

        const rfb = new RFB(this.target, wsUrl);
        rfb.background = "#000000";
        rfb.scaleViewport = true;
        rfb.clipViewport = false;
        rfb.resizeSession = false;
        // TempleOS is a simple, mostly-text/flat-color 640x480 display -- low
        // compression costs little bandwidth here but noticeably cuts server-side
        // encode latency, which matters more than image quality for pointer/keyboard
        // responsiveness over TCG (software-emulated) QEMU.
        rfb.compressionLevel = 1;
        rfb.qualityLevel = 9;

        rfb.addEventListener("connect", () => {
            this.callbacks.onConnected();
        });

        rfb.addEventListener("disconnect", (event) => {
            this.rfb = null;
            const clean = (event as CustomEvent<{ clean: boolean }>).detail?.clean ?? false;
            this.callbacks.onDisconnected(clean);
            if (!clean) {
                this.callbacks.onError(
                    "Lost connection to the TempleOS server. It may still be starting up " +
                        "(first boot + install can take a minute or two) or temporarily unavailable.",
                );
            }
        });

        rfb.addEventListener("securityfailure", (event) => {
            const detail = (event as CustomEvent<{ status: number; reason?: string }>).detail;
            this.callbacks.onError(`Connection security negotiation failed: ${detail?.reason ?? detail?.status}`);
        });

        this.rfb = rfb;
    }

    disconnect(): void {
        this.rfb?.disconnect();
        this.rfb = null;
    }

    sendCtrlAltDel(): void {
        this.rfb?.sendCtrlAltDel();
    }

    focus(): void {
        this.rfb?.focus();
    }

    /**
     * Types real text into the guest as individual key events -- this is
     * genuine keyboard input the real OS receives and processes itself, not
     * a client-side simulation of anything. `\n` sends Return.
     */
    sendText(text: string): void {
        if (!this.rfb) return;
        for (const ch of text) {
            if (ch === "\n" || ch === "\r") {
                this.rfb.sendKey(XK_Return, null);
                continue;
            }
            if (ch === "\b") {
                this.rfb.sendKey(XK_BackSpace, null);
                continue;
            }

            const isUpper = ch >= "A" && ch <= "Z";
            const base = isUpper ? ch.toLowerCase() : (SHIFTED_SYMBOL_BASE[ch] ?? ch);
            const needsShift = isUpper || ch in SHIFTED_SYMBOL_BASE;

            const code = base.codePointAt(0);
            if (code === undefined || code < 0x20 || code > 0xff) continue;

            if (needsShift) this.rfb.sendKey(XK_Shift_L, null, true);
            this.rfb.sendKey(code, null);
            if (needsShift) this.rfb.sendKey(XK_Shift_L, null, false);
        }
    }
}
