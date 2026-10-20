import path from 'node:path';
import { Injectable, type OnModuleDestroy } from '@mariodebono/di';
import type { FolderProjectScanResult } from '@shared/contracts';
import { ipcSendToMainWindowSync } from '../utils.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { ProjectDiscoveryService } from './project-discovery.service.js';

/** Owns read-only, cancellable local folder scans. */
@Injectable()
export class ProjectFolderScanService implements OnModuleDestroy {
    private active: { id: string; controller: AbortController } | null = null;

    /** Creates the local scan boundary.
     * @param discovery - Existing project discovery and metadata reader.
     */
    constructor(private readonly discovery: ProjectDiscoveryService) {}

    /** Stops filesystem work when the application closes. */
    onModuleDestroy(): void {
        this.active?.controller.abort();
    }

    /** Cancels only the matching active scan.
     * @param scanId - Renderer-generated identifier of this scan.
     * @returns Whether the matching scan was stopped.
     */
    cancel(scanId: string): boolean {
        if (!this.active || this.active.id !== scanId) return false;
        this.active.controller.abort();
        return true;
    }

    /** Scans one absolute root without registering or changing projects.
     * @param folder - Selected existing directory.
     * @param scanId - Identifier known before scan work starts, allowing early cancellation.
     * @returns Findings and safe partial-failure details.
     */
    async scan(
        folder: string,
        scanId: string,
    ): Promise<FolderProjectScanResult> {
        const failed: FolderProjectScanResult = {
            scanId,
            folder,
            status: 'failed',
            projects: [],
            issues: [],
            omittedIssueCount: 0,
            visitedDirectories: 0,
            visitedEntries: 0,
        };
        if (
            this.active ||
            typeof folder !== 'string' ||
            !path.isAbsolute(folder) ||
            typeof scanId !== 'string' ||
            !/^[\w-]{1,100}$/.test(scanId)
        )
            return failed;
        const controller = new AbortController();
        const job = { id: scanId, controller };
        this.active = job;
        let publishedAt = 0;
        try {
            const result = await this.discovery.scanFolder(
                path.resolve(folder),
                controller.signal,
                (progress) => {
                    const now = Date.now();
                    if (now - publishedAt < 100) return;
                    publishedAt = now;
                    try {
                        ipcSendToMainWindowSync(
                            'folder-project-scan-progress',
                            { scanId, ...progress },
                        );
                    } catch {
                        /* A closing renderer does not invalidate scan findings. */
                    }
                },
            );
            return { ...result, scanId };
        } finally {
            if (this.active === job) this.active = null;
        }
    }
}
