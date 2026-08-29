import { Injectable } from '@mariodebono/di';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { GitService } from '../tool-integration/integrations/git/git.service.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { ProjectsStore } from './projects.store.js';

const ORIGIN_READ_CONCURRENCY = 4;

type CachedOrigins = {
    version: string;
    origins: ReadonlySet<string>;
};

/** Builds a bounded, process-local index of stored project Git origins. */
@Injectable()
export class ProjectRepositoryOriginIndexService {
    private cached: CachedOrigins | null = null;
    private readonly inFlight = new Map<string, Promise<ReadonlySet<string>>>();
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
        this.latestRequestedVersion = snapshot.version;

        if (this.cached?.version === snapshot.version) {
            return this.cached.origins;
        }

        const currentBuild = this.inFlight.get(snapshot.version);
        if (currentBuild) {
            return currentBuild;
        }

        const build = this.buildOrigins([
            ...new Set(snapshot.projects.map((project) => project.path)),
        ])
            .then((origins) => {
                if (this.latestRequestedVersion === snapshot.version) {
                    this.cached = { version: snapshot.version, origins };
                }
                return origins;
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
    private async buildOrigins(
        projectPaths: readonly string[],
    ): Promise<ReadonlySet<string>> {
        const origins = new Set<string>();
        let nextIndex = 0;

        /** Reads successive project origins until the shared queue is empty. */
        const readNext = async (): Promise<void> => {
            while (nextIndex < projectPaths.length) {
                const projectPath = projectPaths[nextIndex];
                nextIndex += 1;
                const origin = await this.git
                    .getNormalizedRemoteOrigin(projectPath)
                    .catch(() => null);
                if (origin) {
                    origins.add(origin);
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
        return origins;
    }
}
