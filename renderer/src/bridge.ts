import {
    createRendererBridge,
    createRendererEvents,
    getPathForFile,
    type RendererIpcListener,
} from '@mariodebono/di-electron/renderer';
import type { AppBridgeNamespaces, AppEventMap } from '@shared/contracts';

export const appBridge = createRendererBridge<AppBridgeNamespaces>().app;

const appEvents = createRendererEvents();

export function subscribeAppEvent<Event extends keyof AppEventMap>(
    event: Event,
    callback: (payload: AppEventMap[Event]) => void,
): () => void {
    const listener: RendererIpcListener = (payload) => {
        callback(payload as AppEventMap[Event]);
    };

    appEvents.on(event, listener);
    return () => appEvents.off(event, listener);
}

export { getPathForFile };
