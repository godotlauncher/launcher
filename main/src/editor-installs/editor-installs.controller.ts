import {
    BridgeController,
    createIpcHandleTyped,
} from '@mariodebono/di-electron';
import type {
    EditorInstallOrigin,
    EditorInstallsBridge,
    InstalledRelease,
    ReleaseSummary,
} from '@shared/contracts';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { EditorInstallService } from './editor-install.service.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { InstalledEditorService } from './installed-editor.service.js';

const EditorInstallsHandler = createIpcHandleTyped<EditorInstallsBridge>();

/** Handles installed-editor and installation requests from the renderer. */
@BridgeController({ namespace: 'editorInstalls' })
export class EditorInstallsController implements EditorInstallsBridge {
    /**
     * Creates the editor installs controller.
     *
     * @param installedEditors - Registered editor lifecycle service.
     * @param installer - Official editor installation service.
     */
    constructor(
        private readonly installedEditors: InstalledEditorService,
        private readonly installer: EditorInstallService,
    ) {}

    /** Gets every registered editor. */
    @EditorInstallsHandler('getInstalledEditors')
    getInstalledEditors() {
        return this.installedEditors.getInstalledEditors();
    }

    /**
     * Installs one official editor.
     *
     * @param release - Official release metadata.
     * @param mono - Whether to install the .NET flavour.
     * @param origin - Workflow requesting the install.
     */
    @EditorInstallsHandler('installEditor')
    installEditor(
        release: ReleaseSummary,
        mono: boolean,
        origin: EditorInstallOrigin,
    ) {
        return this.installer.installEditor(release, mono, origin);
    }

    /**
     * Reinstalls one registered editor.
     *
     * @param release - Registered editor to reinstall.
     */
    @EditorInstallsHandler('reinstallEditor')
    reinstallEditor(release: InstalledRelease) {
        return this.installer.reinstallEditor(release);
    }

    /**
     * Cancels one queued or downloading install job.
     *
     * @param jobId - Exact process-local install job ID.
     */
    @EditorInstallsHandler('cancelInstall')
    cancelInstall(jobId: string) {
        return this.installer.cancelInstall(jobId);
    }

    /**
     * Removes one registered editor.
     *
     * @param release - Registered editor to remove.
     */
    @EditorInstallsHandler('removeEditor')
    removeEditor(release: InstalledRelease) {
        return this.installedEditors.removeEditor(release);
    }

    /**
     * Registers one custom editor manifest.
     *
     * @param manifestPath - Path to the custom editor manifest.
     * @param options - Optional duplicate replacement behaviour.
     */
    @EditorInstallsHandler('registerCustomEditor')
    registerCustomEditor(
        manifestPath: string,
        options?: { replaceExisting?: boolean },
    ) {
        return this.installedEditors.registerCustomEditor(
            manifestPath,
            options,
        );
    }

    /**
     * Opens one editor's project manager.
     *
     * @param release - Registered editor to launch.
     */
    @EditorInstallsHandler('openProjectManager')
    async openProjectManager(release: InstalledRelease): Promise<void> {
        this.installedEditors.openProjectManager(release);
    }

    /** Revalidates all registered editors. */
    @EditorInstallsHandler('revalidateInstalledEditors')
    revalidateInstalledEditors() {
        return this.installedEditors.revalidateInstalledEditors();
    }
}
