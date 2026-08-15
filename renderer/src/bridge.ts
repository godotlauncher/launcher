import {
    createRendererBridge,
    createRendererEvents,
    getPathForFile,
    type RendererIpcListener,
} from '@mariodebono/di-electron/renderer';
import type { AppEventMap, BridgeNamespaces } from '@shared/contracts';

const rendererBridge = createRendererBridge<BridgeNamespaces>();

export const appBridge = rendererBridge.app;
export const codeEditorIntegrationBridge = rendererBridge.codeEditorIntegration;
export const editorCatalogBridge = rendererBridge.editorCatalog;
export const toolIntegrationBridge = rendererBridge.toolIntegration;

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
