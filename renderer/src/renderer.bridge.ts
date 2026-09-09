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
const appEventCallbacks = new Map<
    keyof AppEventMap,
    Set<RendererIpcListener>
>();

/**
 * Returns the local callback set for one application event.
 *
 * The Electron transport listener remains for the renderer lifetime because
 * callback identity does not survive separate context-bridge calls reliably.
 *
 * @param event - Application event channel to initialise.
 * @returns Local callbacks currently subscribed to the event.
 */
function getAppEventCallbacks(
    event: keyof AppEventMap,
): Set<RendererIpcListener> {
    const existingCallbacks = appEventCallbacks.get(event);
    if (existingCallbacks) return existingCallbacks;

    const callbacks = new Set<RendererIpcListener>();
    appEventCallbacks.set(event, callbacks);
    appEvents.on(event, (payload) => {
        for (const callback of callbacks) callback(payload);
    });
    return callbacks;
}

/**
 * Subscribes one renderer callback to an application event.
 *
 * @param event - Application event channel to observe.
 * @param callback - Callback that receives the typed event payload.
 * @returns Function that removes the local callback.
 */
export function subscribeAppEvent<Event extends keyof AppEventMap>(
    event: Event,
    callback: (payload: AppEventMap[Event]) => void,
): () => void {
    const listener: RendererIpcListener = (payload) => {
        callback(payload as AppEventMap[Event]);
    };

    const callbacks = getAppEventCallbacks(event);
    callbacks.add(listener);
    return () => callbacks.delete(listener);
}

export { getPathForFile };
