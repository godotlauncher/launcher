import { Injectable } from '@mariodebono/di';
import type {
    ListConnectedRepositoriesResult,
    PublicGitSourceInspectionResult,
} from '@shared/contracts';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { RepositoryHostingService } from '../app-integrations/repository-hosting.service.js';
import { normalizeGitRemoteUrl } from '../tool-integration/integrations/git/git-remote-url-normalizer.util.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { PublicGitSourceService } from '../tool-integration/integrations/git/public-git-source.service.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { ProjectRepositoryOriginIndexService } from './project-repository-origin-index.service.js';

@Injectable()
export class ProjectRemoteSourceService {
    /**
     * Creates the project-facing remote source boundary.
     *
     * @param publicSources - Anonymous public Git source inspector.
     * @param repositoryHosting - Connected hosting discovery service.
     * @param projectOrigins - Cached stored-project origin index.
     */
    constructor(
        private readonly publicSources: PublicGitSourceService,
        private readonly repositoryHosting: RepositoryHostingService,
        private readonly projectOrigins: ProjectRepositoryOriginIndexService,
    ) {}

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
        const originsPromise = this.projectOrigins
            .getOrigins()
            .catch(() => new Set<string>());
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

        const origins = await originsPromise;
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
}
