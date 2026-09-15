import {
    BridgeController,
    createIpcHandleTyped,
} from '@mariodebono/di-electron';
import type { ExportTemplatesBridge } from '@shared/contracts';
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
    /** Lists project migration candidates without hashing their files. */
    @Handler('getMigrationAssessment')
    getMigrationAssessment() {
        return this.service.getMigrationAssessment();
    }
    /** Compares the selected project's local and shared files without changing them.
     * @param projectPath - Registered project identity.
     */
    @Handler('inspectProjectTemplates')
    inspectProjectTemplates(projectPath: string) {
        return this.service.inspectProjectTemplates(projectPath);
    }
    /** Remembers that a local project must not be connected automatically.
     * @param projectPath - Registered project identity.
     */
    @Handler('keepProjectTemplatesSeparate')
    keepProjectTemplatesSeparate(projectPath: string) {
        return this.service.keepProjectTemplatesSeparate(projectPath);
    }
    /** Delegates getInventory to the template service.
     */
    @Handler('getInventory')
    getInventory() {
        return this.service.getInventory();
    }
    /** Delegates getJob to the template service.
     */
    @Handler('getJob')
    getJob() {
        return this.service.getJob();
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
    /** Delegates download to the template service.
     * @param releaseId - Requested operation input.
     * @param assetId - Requested operation input.
     */
    @Handler('download')
    download(releaseId: string, assetId: string) {
        return this.service.download(releaseId, assetId);
    }
    /** Delegates importArchive to the template service.
     */
    @Handler('importArchive')
    importArchive() {
        return this.service.importArchive();
    }
    /** Delegates prepareMigration to the template service.
     * @param projectPath - Requested operation input.
     */
    @Handler('prepareMigration')
    prepareMigration(projectPath: string) {
        return this.service.prepareMigration(projectPath);
    }
    /** Delegates apply to the template service.
     * @param jobId - Requested operation input.
     * @param decisions - Requested operation input.
     */
    @Handler('apply')
    apply(jobId: string, decisions: Record<string, 'shared' | 'incoming'>) {
        return this.service.apply(jobId, decisions);
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
