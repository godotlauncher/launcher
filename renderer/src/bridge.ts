import {
    createRendererBridge,
    createRendererEvents,
    getPathForFile,
    type RendererIpcListener,
} from '@mariodebono/di-electron/renderer';
import type { AppBridgeNamespaces, AppEventMap } from '@shared/contracts';

const rendererBridge = createRendererBridge<AppBridgeNamespaces>();

export const appBridge = rendererBridge.app;
export const codeEditorIntegrationBridge = rendererBridge.codeEditorIntegration;

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
