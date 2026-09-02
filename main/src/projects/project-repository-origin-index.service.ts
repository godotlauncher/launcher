import { Injectable } from '@mariodebono/di';
import type { ProjectGitHubLink } from '@shared/contracts';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { GitService } from '../tool-integration/integrations/git/git.service.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { ProjectsStore } from './projects.store.js';

const ORIGIN_READ_CONCURRENCY = 4;

type CachedOriginIndex = {
    version: string;
    origins: ReadonlySet<string>;
    githubLinks: readonly ProjectGitHubLink[];
};

/** Builds a bounded, process-local index of stored project Git origins. */
@Injectable()
export class ProjectRepositoryOriginIndexService {
    private cached: CachedOriginIndex | null = null;
    private readonly inFlight = new Map<string, Promise<CachedOriginIndex>>();
    private latestRequestedVersion: string | null = null;

    /**
     * Creates the stored-project origin index.
     *
     * @param projects - Canonical project persistence store.
     * @param git - Guarded Git command service.
     */
    constructor(
        private readonly projects: ProjectsStore,
        private readonly git: GitService,
    ) {}

    /**
     * Gets normalised token-free origins for the current project snapshot.
     *
     * Concurrent callers for the same snapshot share one bounded index build.
     * A later project-store version invalidates the cached result without
     * adding persisted repository metadata or a refresh timer.
     *
     * @returns Normalised origins for stored projects with readable remotes.
     */
    async getOrigins(): Promise<ReadonlySet<string>> {
        const snapshot = await this.projects.snapshot();
        return (await this.getIndex(snapshot, false)).origins;
    }

    /**
     * Rebuilds and returns safe GitHub links for the current project snapshot.
     *
     * @returns Project paths paired with validated public GitHub URLs.
     */
    async refreshGitHubLinks(): Promise<readonly ProjectGitHubLink[]> {
        const snapshot = await this.projects.snapshot();
        return (await this.getIndex(snapshot, true)).githubLinks;
    }

    /**
     * Gets or rebuilds the bounded origin index for one store snapshot.
     *
     * @param snapshot - Current stored-project snapshot.
     * @param force - Whether to bypass a completed cache entry.
     * @returns Cached safe origins and GitHub links.
     */
    private async getIndex(
        snapshot: Awaited<ReturnType<ProjectsStore['snapshot']>>,
        force: boolean,
    ): Promise<CachedOriginIndex> {
        this.latestRequestedVersion = snapshot.version;
        if (!force && this.cached?.version === snapshot.version) {
            return this.cached;
        }

        const currentBuild = this.inFlight.get(snapshot.version);
        if (currentBuild) {
            return currentBuild;
        }

        const build = this.buildIndex([
            ...new Set(snapshot.projects.map((project) => project.path)),
        ])
            .then((index) => {
                const cached = { version: snapshot.version, ...index };
                if (this.latestRequestedVersion === snapshot.version) {
                    this.cached = cached;
                }
                return cached;
            })
            .finally(() => {
                if (this.inFlight.get(snapshot.version) === build) {
                    this.inFlight.delete(snapshot.version);
                }
            });
        this.inFlight.set(snapshot.version, build);
        return build;
    }

    /**
     * Reads project origins through a fixed number of workers.
     *
     * @param projectPaths - Unique stored project paths to inspect.
     * @returns Every successfully normalised origin.
     */
    private async buildIndex(
        projectPaths: readonly string[],
    ): Promise<Omit<CachedOriginIndex, 'version'>> {
        const origins = new Set<string>();
        const githubLinks = new Map<string, string>();
        let nextIndex = 0;

        /** Reads successive project origins until the shared queue is empty. */
        const readNext = async (): Promise<void> => {
            while (nextIndex < projectPaths.length) {
                const projectPath = projectPaths[nextIndex];
                nextIndex += 1;
                const details = await this.git
                    .getRemoteOriginDetails(projectPath)
                    .catch(() => null);
                if (details?.normalizedOrigin) {
                    origins.add(details.normalizedOrigin);
                }
                if (details?.githubWebUrl) {
                    githubLinks.set(projectPath, details.githubWebUrl);
                }
            }
        };

        await Promise.all(
            Array.from(
                {
                    length: Math.min(
                        projectPaths.length,
                        ORIGIN_READ_CONCURRENCY,
                    ),
                },
                () => readNext(),
            ),
        );
        return {
            origins,
            githubLinks: [...githubLinks].map(([projectPath, url]) => ({
                projectPath,
                url,
            })),
        };
    }
}
