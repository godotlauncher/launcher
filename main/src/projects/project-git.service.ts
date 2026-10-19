import { Injectable } from '@mariodebono/di';
import type {
    GitIdentity,
    InitializeProjectGitResult,
    ProjectDetails,
    ProjectGitIdentityResult,
    ProjectGitIdentityValue,
} from '@shared/contracts';
import { t } from '../i18n/index.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { GitService } from '../tool-integration/integrations/git/git.service.js';
import { publishProjectUpdates } from './project-events.util.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { ProjectsStore } from './projects.store.js';

/** Owns guarded Git setup and repository identity for stored projects. */
@Injectable()
export class ProjectGitService {
    /**
     * Creates the project Git workflow boundary.
     * @param git - Guarded Git operations.
     * @param store - Canonical project persistence store.
     */
    constructor(
        private readonly git: GitService,
        private readonly store: ProjectsStore,
    ) {}

    /**
     * Initialises or detects the Git repository for a project.
     *
     * @param project - Project to inspect or initialise.
     */
    async initializeProjectGit(project: ProjectDetails) {
        let gitSetup: InitializeProjectGitResult['gitSetup'] | undefined;
        let updatedProject: ProjectDetails | undefined;

        const projects = await this.store.update(async (currentProjects) => {
            const projectIndex = currentProjects.findIndex(
                (candidate) => candidate.path === project.path,
            );
            if (projectIndex === -1) {
                throw new Error(t('projects:initGit.errors.projectNotFound'));
            }

            const targetProject: ProjectDetails = {
                ...currentProjects[projectIndex],
                release: { ...currentProjects[projectIndex].release },
            };
            let inspection = await this.git.inspectRepository(
                targetProject.path,
            );

            if (inspection.status === 'inside-work-tree') {
                gitSetup = {
                    status: 'existing-repository',
                    root: inspection.root,
                    isProjectRoot: inspection.isProjectRoot,
                    kind: inspection.kind,
                };
            } else if (inspection.status === 'not-a-repository') {
                if (!(await this.git.init(targetProject.path))) {
                    inspection = await this.git.inspectRepository(
                        targetProject.path,
                    );
                    if (inspection.status !== 'inside-work-tree') {
                        throw new Error(
                            t('projects:initGit.errors.initFailed'),
                        );
                    }
                    gitSetup = {
                        status: 'existing-repository',
                        root: inspection.root,
                        isProjectRoot: inspection.isProjectRoot,
                        kind: inspection.kind,
                    };
                } else {
                    inspection = await this.git.inspectRepository(
                        targetProject.path,
                    );
                    if (
                        inspection.status !== 'inside-work-tree' ||
                        !inspection.isProjectRoot
                    ) {
                        throw new Error(
                            t('projects:initGit.errors.initFailed'),
                        );
                    }
                    gitSetup = {
                        status: 'initialized',
                        root: inspection.root,
                        isProjectRoot: inspection.isProjectRoot,
                        kind: inspection.kind,
                    };
                }
            } else {
                throw new Error(t('projects:initGit.errors.initFailed'));
            }

            targetProject.withGit = true;
            updatedProject = targetProject;
            const updatedProjects = [...currentProjects];
            updatedProjects[projectIndex] = targetProject;
            return updatedProjects;
        });

        const latestProject =
            projects.find((candidate) => candidate.path === project.path) ??
            updatedProject;
        if (!latestProject || !gitSetup) {
            throw new Error('Failed to initialise git for project');
        }

        project.withGit = latestProject.withGit;
        publishProjectUpdates(projects);
        return { project: latestProject, gitSetup };
    }

    /**
     * Gets effective Git identity values for a project.
     *
     * @param project - Project whose Git identity is required.
     */
    async getProjectGitIdentity(
        project: ProjectDetails,
    ): Promise<ProjectGitIdentityResult> {
        const storedProject = (await this.store.list()).find(
            (candidate) => candidate.path === project.path,
        );
        if (!storedProject) {
            throw new Error(t('projects:initGit.errors.projectNotFound'));
        }

        const inspection = await this.git.inspectRepository(storedProject.path);
        if (inspection.status !== 'inside-work-tree') {
            return inspection;
        }

        const [effectiveIdentity, localIdentity] = await Promise.all([
            this.git.getIdentity(storedProject.path),
            this.git.getLocalIdentity(storedProject.path),
        ]);
        const identityValue = (
            effectiveValue: string,
            localValue: string,
        ): ProjectGitIdentityValue => ({
            value: effectiveValue,
            source: localValue
                ? 'repository'
                : effectiveValue
                  ? 'inherited'
                  : 'missing',
        });

        return {
            status: 'available',
            repository: inspection,
            name: identityValue(effectiveIdentity.name, localIdentity.name),
            email: identityValue(effectiveIdentity.email, localIdentity.email),
            canUpdate:
                inspection.isProjectRoot &&
                inspection.kind !== 'linked-worktree',
        };
    }

    /**
     * Saves repository-scoped Git identity for a project.
     *
     * @param project - Project whose repository should be configured.
     * @param identity - Git identity to save.
     */
    async setProjectGitIdentity(
        project: ProjectDetails,
        identity: GitIdentity,
    ): Promise<ProjectGitIdentityResult> {
        const storedProject = (await this.store.list()).find(
            (candidate) => candidate.path === project.path,
        );
        if (!storedProject) {
            throw new Error(t('projects:initGit.errors.projectNotFound'));
        }

        const inspection = await this.git.inspectRepository(storedProject.path);
        if (
            inspection.status !== 'inside-work-tree' ||
            !inspection.isProjectRoot ||
            inspection.kind === 'linked-worktree'
        ) {
            throw new Error(
                t('projects:editProject.sourceControl.updateNotAllowed'),
            );
        }

        const saved = await this.git.setIdentity(
            identity.name,
            identity.email,
            'repository',
            storedProject.path,
        );
        if (!saved) {
            throw new Error(
                t('projects:editProject.sourceControl.updateFailed'),
            );
        }

        return this.getProjectGitIdentity(storedProject);
    }
}
