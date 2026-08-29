import type { AppBridge } from './app/index.js';
import type { AppIntegrationsBridge } from './app-integrations/index.js';
import type { CodeEditorIntegrationBridge } from './codeEditorIntegration/index.js';
import type { EditorCatalogBridge } from './editor-catalog/index.js';
import type { EditorInstallsBridge } from './editor-installs/index.js';
import type { GitBridge } from './git/index.js';
import type { GitLfsBridge } from './git-lfs/index.js';
import type { ProjectsBridge } from './projects/index.js';
import type { ToolIntegrationBridge } from './tools/index.js';

/**
 * Lists the independent bridges exposed to the renderer.
 */
export type BridgeNamespaces = {
    app: AppBridge;
    appIntegrations: AppIntegrationsBridge;
    codeEditorIntegration: CodeEditorIntegrationBridge;
    editorCatalog: EditorCatalogBridge;
    editorInstalls: EditorInstallsBridge;
    git: GitBridge;
    gitLfs: GitLfsBridge;
    projects: ProjectsBridge;
    toolIntegration: ToolIntegrationBridge;
};
