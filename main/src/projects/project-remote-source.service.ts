import type { OnModuleDestroy } from '@mariodebono/di';
import { Injectable } from '@mariodebono/di';
import type {
    ListConnectedRepositoriesResult,
    PublicGitSourceInspectionResult,
} from '@shared/contracts';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { RepositoryHostingService } from '../app-integrations/repository-hosting.service.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { GitService } from '../tool-integration/integrations/git/git.service.js';
import { normalizeGitRemoteUrl } from '../tool-integration/integrations/git/git-remote-url-normalizer.util.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { PublicGitSourceService } from '../tool-integration/integrations/git/public-git-source.service.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { ProjectsStore } from './projects.store.js';

@Injectable()
export class ProjectRemoteSourceService implements OnModuleDestroy {
    private readonly originCaches = new Map<string, Promise<Set<string>>>();
    private readonly providerSessions = new Map<string, string>();

    /**
     * Creates the project-facing remote source boundary.
     *
     * @param publicSources - Anonymous public Git source inspector.
     * @param repositoryHosting - Connected hosting discovery service.
     * @param git - Guarded Git command service.
     * @param projects - Canonical stored project list.
     */
    constructor(
        private readonly publicSources: PublicGitSourceService,
        private readonly repositoryHosting: RepositoryHostingService,
        private readonly git: GitService,
        private readonly projects: ProjectsStore,
    ) {}

    /** Clears per-session normalised origin caches during shutdown. */
    onModuleDestroy(): void {
        this.originCaches.clear();
        this.providerSessions.clear();
    }

    /**
     * Inspects one public Git source without exposing resolved addresses.
     *
     * @param url - Anonymous HTTPS repository URL.
     * @returns Renderer-safe inspection result.
     */
    async inspectPublicGitSource(
        url: string,
    ): Promise<PublicGitSourceInspectionResult> {
        const inspected = await this.publicSources.inspect(url);
        if (!inspected.ok) {
            return inspected;
        }
        return {
            ok: true,
            canonicalUrl: inspected.source.canonicalUrl,
            suggestedDirectoryName: inspected.source.suggestedDirectoryName,
        };
    }

    /**
     * Lists connected repositories and marks conservative origin matches.
     *
     * @param providerId - Registered repository hosting provider.
     * @param cursor - Optional opaque browse cursor.
     * @returns Renderer-safe connected repository page.
     */
    async listConnectedRepositories(
        providerId: string,
        cursor?: string,
    ): Promise<ListConnectedRepositoriesResult> {
        const result = await this.repositoryHosting.listRepositories(
            providerId,
            cursor,
        );
        if (!result.ok) {
            const reason =
                result.reason === 'repository-unavailable'
                    ? 'provider-unavailable'
                    : result.reason;
            return { ok: false, reason };
        }

        const sessionId = result.page.sessionId;
        const previousSessionId = this.providerSessions.get(providerId);
        if (previousSessionId && previousSessionId !== sessionId) {
            this.originCaches.delete(previousSessionId);
        }
        this.providerSessions.set(providerId, sessionId);
        let cachedOrigins = this.originCaches.get(sessionId);
        if (!cachedOrigins) {
            cachedOrigins = this.readStoredOrigins();
            this.originCaches.set(sessionId, cachedOrigins);
        }
        const origins = await cachedOrigins;
        return {
            ok: true,
            page: {
                repositories: result.page.repositories.map((repository) => ({
                    repositoryRef: repository.repositoryRef,
                    providerId,
                    owner: repository.owner,
                    name: repository.name,
                    visibility: repository.visibility,
                    alreadyImported: origins.has(
                        normalizeGitRemoteUrl(repository.cloneUrl) ?? '',
                    ),
                })),
                nextCursor: result.page.nextCursor,
            },
        };
    }

    /** Reads safe canonical origins for exact stored project repositories. */
    private async readStoredOrigins(): Promise<Set<string>> {
        const origins = await Promise.all(
            (await this.projects.list()).map((project) =>
                this.git.getNormalizedRemoteOrigin(project.path),
            ),
        );
        return new Set(origins.filter((origin): origin is string => !!origin));
    }
}
