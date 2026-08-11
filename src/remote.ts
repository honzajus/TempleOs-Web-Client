import RFB from "@novnc/novnc";

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
}
