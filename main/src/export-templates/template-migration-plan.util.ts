import type {
    TemplateMigrationDecision,
    TemplateMigrationProjectDecision,
    TemplateMigrationProjectPlan,
    TemplateMigrationVersionPlan,
} from '@shared/contracts';
import {
    isTemplateIdentity,
    templateFingerprint,
    templateMetadataSnapshot,
} from './template-files.util.js';
import type { TemplateMigrationSource } from './template-migration.types.js';

/** Checks a renderer-supplied choice without accepting new execution policies.
 * @param value - Untrusted choice.
 */
function isDecision(value: unknown): value is TemplateMigrationDecision {
    return ['save-imported', 'share-project', 'use-shared', 'later'].includes(
        value as string,
    );
}

/** Copies and validates the complete batch before inspecting any project.
 * @param decisions - Untrusted project and version choices.
 */
export function migrationDecisions(
    decisions: TemplateMigrationProjectDecision[],
): TemplateMigrationProjectDecision[] {
    if (!Array.isArray(decisions) || !decisions.length)
        throw new Error('exportTemplates:errors.decision');
    const paths = new Set<string>();
    return decisions.map((decision) => {
        if (
            !decision ||
            typeof decision.projectPath !== 'string' ||
            !decision.projectPath ||
            paths.has(decision.projectPath) ||
            !decision.selection
        )
            throw new Error('exportTemplates:errors.decision');
        paths.add(decision.projectPath);
        const selection = decision.selection;
        if (selection.mode === 'all-versions' && isDecision(selection.choice))
            return {
                projectPath: decision.projectPath,
                selection: { mode: 'all-versions', choice: selection.choice },
            };
        if (
            selection.mode !== 'per-version' ||
            !selection.choices ||
            typeof selection.choices !== 'object' ||
            Array.isArray(selection.choices) ||
            Object.entries(selection.choices).some(
                ([id, choice]) =>
                    !isTemplateIdentity(id) || !isDecision(choice),
            )
        )
            throw new Error('exportTemplates:errors.decision');
        return {
            projectPath: decision.projectPath,
            selection: {
                mode: 'per-version',
                choices: { ...selection.choices },
            },
        };
    });
}

/** Expands the reviewed policy into explicit effects for each local version folder.
 * @param decision - Validated project selection.
 * @param source - Fresh main-owned source files and project identity.
 */
export function migrationProjectPlan(
    decision: TemplateMigrationProjectDecision,
    source: TemplateMigrationSource,
): TemplateMigrationProjectPlan {
    const versions = source.entries
        .filter(
            (setId) =>
                isTemplateIdentity(setId) && !source.managedLinks?.[setId],
        )
        .sort()
        .map((setId) => ({
            setId,
            files: source.files.filter((file) =>
                file.relative.startsWith(`${setId}/`),
            ),
        }));
    const selection = decision.selection;
    if (
        source.projectPath !== decision.projectPath ||
        !versions.length ||
        (selection.mode === 'per-version' &&
            (Object.keys(selection.choices).length !== versions.length ||
                versions.some(
                    ({ setId }) => !Object.hasOwn(selection.choices, setId),
                )))
    )
        throw new Error('exportTemplates:errors.changed');
    return {
        projectPath: source.projectPath,
        name: source.name,
        selectionMode: selection.mode,
        versions: versions.map(
            ({ setId, files }): TemplateMigrationVersionPlan => {
                const choice =
                    selection.mode === 'all-versions'
                        ? selection.choice
                        : selection.choices[setId];
                return {
                    setId,
                    choice,
                    fileCount: files.length,
                    sizeBytes: files.reduce((sum, file) => sum + file.size, 0),
                    destination:
                        choice === 'save-imported'
                            ? 'imported'
                            : choice === 'later'
                              ? 'local'
                              : 'shared',
                    sharedFiles:
                        choice === 'share-project'
                            ? 'add-missing'
                            : 'unchanged',
                    localFiles:
                        choice === 'later'
                            ? 'keep'
                            : choice === 'save-imported'
                              ? 'remove-after-verification'
                              : 'remove-after-connection',
                    pending: choice === 'later',
                };
            },
        ),
    };
}

/** Refuses stale reviews before any version in the batch may be changed.
 * @param reviewed - Trusted source captured for Review.
 * @param current - Fresh source captured under the executor's operation lock.
 */
export function assertMigrationSourceUnchanged(
    reviewed: TemplateMigrationSource,
    current: TemplateMigrationSource,
): void {
    /** Normalises unordered discovery data before comparing the source context.
     * @param source - Source snapshot to compare.
     */
    const context = (source: TemplateMigrationSource) =>
        JSON.stringify({
            files: templateMetadataSnapshot(source.files),
            projectPath: source.projectPath,
            name: source.name,
            launchPath: source.launchPath,
            setId: source.setId,
            mode: source.mode,
            localRoot: source.localRoot,
            localRealPath: source.localRealPath,
            sharedRoot: source.sharedRoot,
            entries: [...source.entries].sort(),
            managedLinks: Object.entries(source.managedLinks ?? {}).sort(
                ([a], [b]) => a.localeCompare(b),
            ),
            buildSelections: Object.entries(source.buildSelections).sort(
                ([a], [b]) => a.localeCompare(b),
            ),
        });
    if (
        context(reviewed) !== context(current) ||
        templateFingerprint(reviewed.files) !==
            templateFingerprint(current.files)
    )
        throw new Error('exportTemplates:errors.changed');
}
