import {
    BridgeController,
    createIpcHandleTyped,
} from '@mariodebono/di-electron';
import type {
    ExportTemplatesBridge,
    RemoveImportedTemplateOptions,
    TemplateMigrationChoice,
    TemplateMigrationVersionChoices,
    TemplateStorageKind,
} from '@shared/contracts';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { ExportTemplatesService } from './export-templates.service.js';

const Handler = createIpcHandleTyped<ExportTemplatesBridge>();
/** Handles the shared export-template bridge. */
@BridgeController({ namespace: 'exportTemplates' })
export class ExportTemplatesController implements ExportTemplatesBridge {
    /** Creates the bridge controller.
     * @param service - Template operations.
     */
    constructor(private readonly service: ExportTemplatesService) {}
    /** Reads current storage locations and retained move progress. */
    @Handler('getStorageSettings')
    getStorageSettings() {
        return this.service.getStorageSettings();
    }
    /** Reviews the exact destination and affected projects.
     * @param kind - Store selected for relocation.
     * @param destination - Exact physical directory.
     */
    @Handler('prepareStorageMove')
    prepareStorageMove(kind: TemplateStorageKind, destination: string) {
        return this.service.prepareStorageMove(kind, destination);
    }
    /** Starts the main-owned relocation job.
     * @param token - Process-owned review token.
     */
    @Handler('startStorageMove')
    startStorageMove(token: string) {
        return this.service.startStorageMove(token);
    }
    /** Cancels preparation or copying.
     * @param jobId - Active relocation job.
     */
    @Handler('cancelStorageMove')
    cancelStorageMove(jobId: string) {
        return this.service.cancelStorageMove(jobId);
    }
    /** Recovers an interrupted storage relocation. */
    @Handler('recoverStorageMove')
    recoverStorageMove() {
        return this.service.recoverStorageMove();
    }
    /** Reads project export template status.
     * @param projectPath - Registered project identity.
     * @param setId - Version selected in the drawer, if different from the saved editor.
     */
    @Handler('getProjectSettings')
    getProjectSettings(projectPath: string, setId?: string) {
        return this.service.getProjectSettings(projectPath, setId);
    }
    /** Loads a selection scoped to one separate project.
     * @param projectPath - Registered project identity.
     * @param localOnly - Whether to avoid remote package lookup.
     * @param setId - Explicit version and edition to manage.
     */
    @Handler('getProjectPackage')
    getProjectPackage(
        projectPath: string,
        localOnly?: boolean,
        setId?: string,
    ) {
        return this.service.getProjectPackage(projectPath, localOnly, setId);
    }
    /** Connects empty official project environments automatically. */
    @Handler('connectEmptyProjects')
    connectEmptyProjects() {
        return this.service.connectEmptyProjects();
    }
    /** Lists project migration candidates without hashing their files. */
    @Handler('getMigrationAssessment')
    getMigrationAssessment() {
        return this.service.getMigrationAssessment();
    }
    /** Compares the selected project's local and shared files without changing them.
     * @param projectPath - Registered project identity.
     * @param contents - Whether to compare contents after listing metadata.
     */
    @Handler('inspectProjectTemplates')
    inspectProjectTemplates(projectPath: string, contents = true) {
        return this.service.inspectProjectTemplates(projectPath, contents);
    }
    /** Stops an obsolete advisory comparison. */
    @Handler('cancelTemplateInspection')
    cancelTemplateInspection() {
        return this.service.cancelTemplateInspection();
    }
    /** Delegates getInventory to the template service.
     */
    @Handler('getInventory')
    getInventory() {
        return this.service.getInventory();
    }
    /** Returns active, queued and failed operations. */
    @Handler('getJobs')
    getJobs() {
        return this.service.getJobs();
    }
    /** Retries a failed operation.
     * @param jobId - Failed queue entry.
     */
    @Handler('retryJob')
    retryJob(jobId: string) {
        return this.service.retryJob(jobId);
    }
    /** Offers local files when an official package is unavailable.
     * @param setId - Installed version and flavour.
     */
    @Handler('getLocalPackage')
    getLocalPackage(setId: string) {
        return this.service.getLocalPackage(setId);
    }
    /** Resolves the actual files and current local snapshot.
     * @param releaseId - Official release identity.
     * @param assetId - Official template asset identity.
     */
    @Handler('getPackage')
    getPackage(releaseId: string, assetId: string) {
        return this.service.getPackage(releaseId, assetId);
    }
    /** Applies a desired file selection.
     * @param token - Main-owned package snapshot.
     * @param selected - Files the user wants to keep or add.
     */
    @Handler('savePackage')
    savePackage(token: string, selected: string[]) {
        return this.service.savePackage(token, selected);
    }
    /** Delegates imported library operations.
     */
    @Handler('getImportedTemplates')
    getImportedTemplates() {
        return this.service.getImportedTemplates();
    }
    /** Delegates imported library operations.
     */
    @Handler('chooseTemplateImport')
    chooseTemplateImport() {
        return this.service.chooseTemplateImport();
    }
    /** Prepares a selected archive for review.
     * @param token - Main-owned file selection token.
     */
    @Handler('prepareTemplateImport')
    prepareTemplateImport(token: string) {
        return this.service.prepareTemplateImport(token);
    }
    /** Reads preparation progress for the selected archive.
     * @param token - Main-owned file selection token.
     */
    @Handler('getTemplateImportProgress')
    getTemplateImportProgress(token: string) {
        return this.service.getTemplateImportProgress(token);
    }
    /** Delegates imported library operations.
     * @param token - Validated operation input.
     */
    @Handler('discardTemplateImport')
    discardTemplateImport(token: string) {
        return this.service.discardTemplateImport(token);
    }
    /** Delegates imported library operations.
     * @param token - Validated operation input.
     * @param label - Validated operation input.
     * @param replaceId - Validated operation input.
     */
    @Handler('installTemplateImport')
    installTemplateImport(token: string, label: string, replaceId?: string) {
        return this.service.installTemplateImport(token, label, replaceId);
    }
    /** Delegates imported library operations.
     * @param id - Validated operation input.
     * @param label - Validated operation input.
     */
    @Handler('renameImportedTemplate')
    renameImportedTemplate(id: string, label: string) {
        return this.service.renameImportedTemplate(id, label);
    }
    /** Opens the stored files for one imported build.
     * @param id - Imported build ID.
     */
    @Handler('openImportedTemplateFolder')
    openImportedTemplateFolder(id: string) {
        return this.service.openImportedTemplateFolder(id);
    }
    /** Delegates imported library operations.
     * @param id - Validated operation input.
     * @param options - Reviewed replacement and exact project references.
     */
    @Handler('removeImportedTemplate')
    removeImportedTemplate(
        id: string,
        options?: RemoveImportedTemplateOptions,
    ) {
        return this.service.removeImportedTemplate(id, options);
    }
    /** Delegates imported library operations.
     * @param projectPath - Validated operation input.
     * @param choices - Validated operation input.
     */
    @Handler('setProjectTemplateBuilds')
    setProjectTemplateBuilds(
        projectPath: string,
        choices: Record<string, string>,
    ) {
        return this.service.setProjectTemplateBuilds(projectPath, choices);
    }
    /** Delegates prepareMigration to the template service.
     * @param projectPath - Requested operation input.
     * @param choice - Whether reviewed project files should join shared storage.
     * @param versionChoices - Optional explicit choices for every populated version.
     */
    @Handler('prepareMigration')
    prepareMigration(
        projectPath: string,
        choice?: TemplateMigrationChoice,
        versionChoices?: TemplateMigrationVersionChoices,
    ) {
        return this.service.prepareMigration(
            projectPath,
            choice,
            versionChoices,
        );
    }
    /** Delegates cancel to the template service.
     * @param jobId - Requested operation input.
     */
    @Handler('cancel')
    cancel(jobId: string) {
        return this.service.cancel(jobId);
    }
    /** Delegates remove to the template service.
     * @param setId - Requested operation input.
     */
    @Handler('remove')
    remove(setId: string) {
        return this.service.remove(setId);
    }
    /** Delegates openFolder to the template service.
     */
    @Handler('openFolder')
    openFolder() {
        return this.service.openFolder();
    }
    /** Delegates recover to the template service.
     * @param recoveryId - Requested operation input.
     */
    @Handler('recover')
    recover(recoveryId: string) {
        return this.service.recover(recoveryId);
    }
}
