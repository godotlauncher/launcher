import { randomUUID } from 'node:crypto';
import type {
    TemplateMigrationCheckProgress,
    TemplateMigrationProjectDecision,
    TemplateMigrationReview,
} from '@shared/contracts';
import type {
    ReviewedTemplateMigration,
    TemplateMigrationSource,
    TemplateMigrationSourceProgress,
} from './template-migration.types.js';
import {
    assertMigrationSourceUnchanged,
    migrationDecisions,
    migrationProjectPlan,
} from './template-migration-plan.util.js';

/** Holds one read-only batch review; preparing a replacement invalidates the old token. */
export class TemplateMigrationReviewService {
    private revision = 0;
    private progress?: {
        requestId: string;
        value?: TemplateMigrationCheckProgress;
    };
    private review?: { token: string; projects: ReviewedTemplateMigration[] };

    /** Creates a review owner without filesystem mutation responsibilities.
     * @param readSource - Reads current project identity and file metadata.
     */
    constructor(
        private readonly readSource: (
            projectPath: string,
            report?: (progress: TemplateMigrationSourceProgress) => void,
        ) => Promise<TemplateMigrationSource>,
    ) {}

    /** Reviews all decisions without creating jobs or changing files or settings.
     * @param decisions - Choices for the entire selected project list.
     * @param requestId - Renderer-owned identifier for progress polling.
     */
    async prepare(
        decisions: TemplateMigrationProjectDecision[],
        requestId: string = randomUUID(),
    ): Promise<TemplateMigrationReview> {
        if (
            typeof requestId !== 'string' ||
            !/^[a-f0-9-]{36}$/i.test(requestId)
        )
            throw new Error('exportTemplates:errors.decision');
        const requests = migrationDecisions(decisions);
        const revision = ++this.revision;
        this.review = undefined;
        const progress = { requestId } as {
            requestId: string;
            value?: TemplateMigrationCheckProgress;
        };
        this.progress = progress;
        const projects: ReviewedTemplateMigration[] = [];
        for (const decision of requests) {
            const source = structuredClone(
                await this.readSource(decision.projectPath, (value) => {
                    if (revision === this.revision)
                        progress.value = {
                            ...value,
                            projectIndex: projects.length + 1,
                            projectCount: requests.length,
                        };
                }),
            );
            if (revision !== this.revision)
                throw new Error('exportTemplates:errors.changed');
            if (
                projects.some(
                    (project) =>
                        project.source.localRealPath === source.localRealPath,
                )
            )
                throw new Error('exportTemplates:errors.connection');
            projects.push({
                source,
                plan: migrationProjectPlan(decision, source),
            });
        }
        const token = randomUUID();
        this.review = { token, projects };
        return structuredClone({
            token,
            projects: projects.map(({ plan }) => plan),
            requiresRemovalConfirmation: projects.some(({ plan }) =>
                plan.versions.some(
                    ({ choice }) =>
                        choice === 'share-project' || choice === 'use-shared',
                ),
            ),
        });
    }

    /** Rechecks every project and consumes the review before returning trusted execution inputs.
     * The executor must call this while holding the template operation lock.
     * @param token - Token returned by the latest Review.
     * @param removalConfirmed - Explicit acknowledgement of Share and Use shared removal.
     */
    async consume(
        token: string,
        removalConfirmed = false,
    ): Promise<ReviewedTemplateMigration[]> {
        const review = this.review;
        if (!review || review.token !== token)
            throw new Error('exportTemplates:errors.changed');
        if (
            review.projects.some(({ plan }) =>
                plan.versions.some(
                    ({ choice }) =>
                        choice === 'share-project' || choice === 'use-shared',
                ),
            ) &&
            removalConfirmed !== true
        )
            throw new Error('exportTemplates:errors.decision');
        try {
            for (const { source } of review.projects) {
                assertMigrationSourceUnchanged(
                    source,
                    await this.readSource(source.projectPath),
                );
                if (this.review !== review)
                    throw new Error('exportTemplates:errors.changed');
            }
            this.review = undefined;
            this.revision += 1;
            return structuredClone(review.projects);
        } catch (error) {
            if (this.review === review) this.review = undefined;
            throw error;
        }
    }

    /** Returns progress only to the caller owning the current request.
     * @param requestId - Identifier supplied when preparing the review.
     */
    getProgress(requestId: string): TemplateMigrationCheckProgress | undefined {
        return this.progress?.requestId === requestId
            ? structuredClone(this.progress.value)
            : undefined;
    }

    /** Releases a closed review without invalidating a newer one.
     * @param token - Review being closed by the renderer.
     */
    discard(token: string): void {
        if (this.review?.token !== token) return;
        this.review = undefined;
        this.revision += 1;
    }
}
