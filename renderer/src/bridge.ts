import {
    createRendererBridge,
    createRendererEvents,
    getPathForFile,
    type RendererIpcListener,
} from '@mariodebono/di-electron/renderer';
import type { AppEventMap, BridgeNamespaces } from '@shared/contracts';

const rendererBridge = createRendererBridge<BridgeNamespaces>();

export const appBridge = rendererBridge.app;
export const appIntegrationsBridge = rendererBridge.appIntegrations;
export const codeEditorIntegrationBridge = rendererBridge.codeEditorIntegration;
export const editorCatalogBridge = rendererBridge.editorCatalog;
export const editorInstallsBridge = rendererBridge.editorInstalls;
export const gitBridge = rendererBridge.git;
export const gitLfsBridge = rendererBridge.gitLfs;
export const projectsBridge = rendererBridge.projects;
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
