import {
    BridgeController,
    createIpcHandleTyped,
} from '@mariodebono/di-electron';
import type {
    AutomaticAliasChangeRequest,
    EditorInstallOrigin,
    EditorInstallsBridge,
    EditorRemovalSelection,
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

    /** Gets the registered default command-line editor. */
    @EditorInstallsHandler('getCommandLineGodot')
    getCommandLineGodot() {
        return this.installedEditors.getCommandLineGodot();
    }

    /**
     * Selects an installed editor for terminal use or clears the wrapper.
     * @param release - Registered version/flavour, or null to clear.
     */
    @EditorInstallsHandler('setCommandLineGodot')
    setCommandLineGodot(
        release: Pick<InstalledRelease, 'version' | 'mono'> | null,
    ) {
        return this.installedEditors.setCommandLineGodot(release);
    }

    /**
     * Previews automatic-command choices without persisting them.
     * @param request - Requested preference and treatment of existing commands.
     */
    @EditorInstallsHandler('previewAutomaticAliasChange')
    previewAutomaticAliasChange(request: AutomaticAliasChangeRequest) {
        return this.installedEditors.previewAutomaticAliasChange(request);
    }

    /**
     * Commits the exact reviewed command snapshot.
     * @param token - Opaque preview identity.
     */
    @EditorInstallsHandler('commitAutomaticAliasChange')
    commitAutomaticAliasChange(token: string) {
        return this.installedEditors.commitAutomaticAliasChange(token);
    }

    /** Gets all named command registrations. */
    @EditorInstallsHandler('getCommandLineAliases')
    getCommandLineAliases() {
        return this.installedEditors.getCommandLineAliases();
    }

    /**
     * Checks a draft command without writing it.
     * @param release - Registered version and flavour.
     * @param name - Literal draft command.
     */
    @EditorInstallsHandler('checkCommandLineAlias')
    checkCommandLineAlias(
        release: Pick<InstalledRelease, 'version' | 'mono'>,
        name: string,
    ) {
        return this.installedEditors.checkCommandLineAlias(release, name);
    }

    /**
     * Applies creation or removal of one named command.
     * @param release - Registered version and flavour.
     * @param name - New command or null for removal.
     */
    @EditorInstallsHandler('setCommandLineAlias')
    setCommandLineAlias(
        release: Pick<InstalledRelease, 'version' | 'mono'>,
        name: string | null,
    ) {
        return this.installedEditors.setCommandLineAlias(release, name);
    }

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
     * Removes selected editors and reports each result independently.
     *
     * @param selections - Selected editors and their unused-only restrictions.
     */
    @EditorInstallsHandler('removeEditors')
    removeEditors(selections: EditorRemovalSelection[]) {
        return this.installedEditors.removeEditors(selections, (release) =>
            this.installer.isInstallPending(release),
        );
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
