// @novnc/novnc ships no TypeScript definitions; this covers only what this
// project actually uses. See https://github.com/novnc/noVNC/blob/master/docs/API.md
declare module "@novnc/novnc" {
    export interface RFBCredentials {
        username?: string;
        password?: string;
        target?: string;
    }

    export interface RFBOptions {
        shared?: boolean;
        credentials?: RFBCredentials;
        repeaterID?: string;
        wsProtocols?: string[];
    }

    export default class RFB extends EventTarget {
        constructor(target: HTMLElement, urlOrChannel: string | WebSocket, options?: RFBOptions);

        viewOnly: boolean;
        scaleViewport: boolean;
        clipViewport: boolean;
        dragViewport: boolean;
        resizeSession: boolean;
        background: string;
        qualityLevel: number;
        compressionLevel: number;
        focusOnClick: boolean;
        readonly capabilities: { power?: boolean };
        readonly clippingViewport: boolean;

        disconnect(): void;
        focus(): void;
        blur(): void;
        sendCtrlAltDel(): void;
        sendKey(keysym: number, code: string | null, down?: boolean): void;
        clipboardPasteFrom(text: string): void;
        machineShutdown(): void;
        machineReboot(): void;
        machineReset(): void;
        sendCredentials(credentials: RFBCredentials): void;
        approveServer(): void;
        getImageData(): ImageData;
    }
}
