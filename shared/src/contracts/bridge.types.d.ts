import type { AppBridge } from './app/index.js';
import type { CodeEditorIntegrationBridge } from './codeEditorIntegration/index.js';
import type { EditorCatalogBridge } from './editor-catalog/index.js';
import type { ToolIntegrationBridge } from './tools/index.js';

/**
 * Lists the independent bridges exposed to the renderer.
 */
export type BridgeNamespaces = {
    app: AppBridge;
    codeEditorIntegration: CodeEditorIntegrationBridge;
    editorCatalog: EditorCatalogBridge;
    toolIntegration: ToolIntegrationBridge;
};
