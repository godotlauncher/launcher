import type {
    TemplateMigrationDecision,
    TemplateMigrationProjectDecision,
    TemplateProjectAssessment,
} from '@shared/contracts';
import type {
    MigrationChoices,
    MigrationProjectChoice,
} from './template-migration-wizard.types';

export const migrationOptions: TemplateMigrationDecision[] = [
    'save-imported',
    'share-project',
    'use-shared',
    'later',
];

/** Allows decisions only for populated projects that discovery can safely review.
 * @param project - Read-only project assessment.
 */
export function canChooseMigration(
    project: TemplateProjectAssessment,
): boolean {
    return (
        ['ready', 'needs-review'].includes(project.state) &&
        project.setIds.length > 0
    );
}

/** Retains active and inactive choices while reconciling a fresh discovery result.
 * @param projects - Current unresolved projects.
 * @param previous - Choices from the same open session.
 */
export function reconcileMigrationChoices(
    projects: TemplateProjectAssessment[],
    previous: MigrationChoices = {},
): MigrationChoices {
    return Object.fromEntries(
        projects.map((project) => {
            const existing = previous[project.projectPath];
            const allChoice = canChooseMigration(project)
                ? (existing?.allChoice ?? 'save-imported')
                : 'later';
            return [
                project.projectPath,
                {
                    mode:
                        project.setIds.length > 1
                            ? (existing?.mode ?? 'all-versions')
                            : 'all-versions',
                    allChoice,
                    versions: Object.fromEntries(
                        project.setIds.map((setId) => [
                            setId,
                            canChooseMigration(project)
                                ? (existing?.versions[setId] ?? allChoice)
                                : 'later',
                        ]),
                    ),
                } satisfies MigrationProjectChoice,
            ];
        }),
    );
}

/** Changes one version or explicitly applies a project choice to every version.
 * @param current - Project's saved active and inactive choices.
 * @param choice - Selected option.
 * @param setId - Specific version, or absent for all versions.
 */
export function changeMigrationChoice(
    current: MigrationProjectChoice,
    choice: TemplateMigrationDecision,
    setId?: string,
): MigrationProjectChoice {
    if (setId)
        return {
            ...current,
            versions: { ...current.versions, [setId]: choice },
        };
    return {
        ...current,
        allChoice: choice,
        versions: Object.fromEntries(
            Object.keys(current.versions).map((id) => [id, choice]),
        ),
    };
}

/** Expands the effective choices without losing remembered inactive selections.
 * @param project - Project identity and populated versions.
 * @param choices - Session choices.
 */
export function migrationProjectDecision(
    project: TemplateProjectAssessment,
    choices: MigrationChoices,
): TemplateMigrationProjectDecision {
    const selection = choices[project.projectPath];
    return {
        projectPath: project.projectPath,
        selection:
            selection.mode === 'all-versions'
                ? { mode: 'all-versions', choice: selection.allChoice }
                : {
                      mode: 'per-version',
                      choices: Object.fromEntries(
                          project.setIds.map((id) => [
                              id,
                              selection.versions[id],
                          ]),
                      ),
                  },
    };
}

/** Labels a version without hiding release or edition information.
 * @param setId - Exact template directory identity.
 */
export function migrationVersionName(setId: string): string {
    return setId.replace(/\.mono$/, ' .NET');
}

/** Maps bridge failures to bounded locale keys without exposing raw paths.
 * @param error - Bridge or host failure.
 */
export function migrationErrorKey(error: unknown): string {
    const code = String(error).match(/exportTemplates:errors\.([\w]+)/)?.[1];
    return `errors.${code && ['changed', 'read', 'busy', 'failed', 'unsafe', 'recovery', 'connection', 'space', 'decision'].includes(code) ? code : 'failed'}`;
}
