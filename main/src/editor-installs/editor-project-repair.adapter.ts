import path from 'node:path';
import { Injectable } from '@mariodebono/di';
import type { InstalledRelease, ProjectDetails } from '@shared/contracts';
import logger from 'electron-log';
import { checkAndUpdateProjects } from '../checks.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { CodeEditorIntegrationService } from '../codeEditorIntegration/codeEditorIntegration.service.js';
import { setProjectEditor } from '../commands/setProjectEditor.js';
import { PROJECTS_FILENAME } from '../constants.js';
import { removeProjectEditor } from '../utils/godot.utils.js';
import { getDefaultDirs } from '../utils/platform.utils.js';
import { getStoredProjectsList } from '../utils/projects.utils.js';
import { hasSameInstalledEditorIdentity } from './installed-editor.store.js';

function projectUsesEditor(
    project: ProjectDetails,
    release: InstalledRelease,
): boolean {
    return (
        project.release.editor_path === release.editor_path ||
        hasSameInstalledEditorIdentity(project.release, release)
    );
}

/** Keeps project repair behind one temporary boundary until Projects DI moves. */
@Injectable()
export class EditorProjectRepairAdapter {
    /**
     * Creates the project repair adapter.
     *
     * @param codeEditorIntegrationService - Service used when resetting project editors.
     */
    constructor(
        private readonly codeEditorIntegrationService: CodeEditorIntegrationService,
    ) {}

    /** Revalidates every stored project. */
    async revalidateProjects(): Promise<void> {
        await checkAndUpdateProjects();
    }

    /**
     * Removes project editor files that use one removed editor.
     *
     * @param release - Removed editor record.
     */
    async removeEditorFromProjects(release: InstalledRelease): Promise<void> {
        const projects = await this.listProjects();
        for (const project of projects) {
            if (project.release.editor_path === release.editor_path) {
                await removeProjectEditor(project);
            }
        }
    }

    /**
     * Reassigns projects from an old editor record to its replacement.
     *
     * @param previousRelease - Editor record previously assigned to projects.
     * @param newRelease - Replacement editor record.
     */
    async repairAfterReinstall(
        previousRelease: InstalledRelease,
        newRelease: InstalledRelease,
    ): Promise<void> {
        const projects = await this.listProjects();
        for (const project of projects.filter((candidate) =>
            projectUsesEditor(candidate, previousRelease),
        )) {
            const result = await setProjectEditor(
                project,
                newRelease,
                this.codeEditorIntegrationService,
            );
            if (!result.success) {
                logger.warn(
                    `Failed to repair project '${project.name}' after reinstall: ${result.error}`,
                );
            }
        }
        await this.revalidateProjects();
    }

    /** Reads the current legacy project list through its existing store. */
    private async listProjects(): Promise<ProjectDetails[]> {
        const { configDir } = getDefaultDirs();
        return getStoredProjectsList(
            path.resolve(configDir, PROJECTS_FILENAME),
        );
    }
}
