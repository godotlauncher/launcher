import type {
    TemplateMigrationDecision,
    TemplateProjectAssessment,
} from '@shared/contracts';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { SelectField } from '../../../components/ui/select-field.component';
import { Switch } from '../../../components/ui/switch.component';
import {
    canChooseMigration,
    migrationOptions,
    migrationVersionName,
} from '../template-migration-choice.util';
import type {
    MigrationChoices,
    MigrationProjectChoice,
} from '../template-migration-wizard.types';
import { MigrationChoiceHelp } from './migration-choice-help.component';
import {
    MigrationChoiceIcon,
    migrationChoiceTone,
} from './migration-choice-indicator.component';
import { MigrationChoiceSummary } from './migration-choice-summary.component';

type ChooseProps = {
    projects: TemplateProjectAssessment[];
    choices: MigrationChoices;
    onChoose: (
        path: string,
        choice: TemplateMigrationDecision,
        setId?: string,
    ) => void;
    onIndividual: (path: string, individual: boolean) => void;
    onReset: () => void;
};

/** Keeps the project count, reset action and effective choice summary above the list.
 * @param props - Current projects, remembered choices and global reset action.
 */
export function MigrationChooseSummary({
    projects,
    choices,
    onReset,
}: Pick<ChooseProps, 'projects' | 'choices' | 'onReset'>) {
    const { t } = useTranslation('exportTemplates');
    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <p className="font-medium">
                        {t('wizardMigration.projectSummary', {
                            projects: projects.length,
                            versions: projects.reduce(
                                (total, project) =>
                                    total + project.setIds.length,
                                0,
                            ),
                        })}
                    </p>
                    <p className="text-sm text-base-content/65">
                        {t('wizardMigration.chooseIntro')}
                    </p>
                </div>
                <button
                    type="button"
                    className="btn btn-ghost btn-sm shrink-0 text-base"
                    onClick={onReset}
                >
                    {t('wizardMigration.keepAll')}
                </button>
            </div>
            <MigrationChoiceSummary
                choices={projects.flatMap((project) =>
                    project.setIds.map((setId) =>
                        choices[project.projectPath].mode === 'per-version'
                            ? choices[project.projectPath].versions[setId]
                            : choices[project.projectPath].allChoice,
                    ),
                )}
            />
        </div>
    );
}

/** Lists every project together, expanding versions only when requested.
 * @param props - Current discovery, choices and session actions.
 */
export function MigrationChooseStep({
    projects,
    choices,
    onChoose,
    onIndividual,
}: Omit<ChooseProps, 'onReset'>) {
    const { t } = useTranslation('exportTemplates');
    return (
        <div className="rounded-md border border-base-content/10">
            <table className="w-full table-fixed text-base">
                <thead className="sticky top-0 z-10 bg-base-200 text-left text-sm text-base-content/65">
                    <tr>
                        <th scope="col" className="w-[28%] p-3 font-medium">
                            {t('wizardMigration.projectColumn')}
                        </th>
                        <th scope="col" className="w-[25%] p-3 font-medium">
                            {t('wizardMigration.versionsColumn')}
                        </th>
                        <th scope="col" className="p-3 font-medium">
                            {t('wizardMigration.choiceColumn')}
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {projects.map((project) => (
                        <MigrationProjectRows
                            key={project.projectPath}
                            project={project}
                            choice={choices[project.projectPath]}
                            onChoose={onChoose}
                            onIndividual={onIndividual}
                        />
                    ))}
                </tbody>
            </table>
        </div>
    );
}

/** Groups the exact affected versions beside one selector or individual selectors.
 * @param props - One project's remembered mode and choice actions.
 */
function MigrationProjectRows({
    project,
    choice,
    onChoose,
    onIndividual,
}: Pick<ChooseProps, 'onChoose' | 'onIndividual'> & {
    project: TemplateProjectAssessment;
    choice: MigrationProjectChoice;
}) {
    const { t } = useTranslation('exportTemplates');
    const id = useId();
    const individual =
        choice.mode === 'per-version' && project.setIds.length > 1;
    const eligible = canChooseMigration(project);
    const rows = individual
        ? project.setIds.map((setId) => [setId])
        : [project.setIds];
    return (
        <>
            {rows.map((setIds, index) => {
                const setId = individual ? setIds[0] : undefined;
                const selected = setId
                    ? choice.versions[setId]
                    : choice.allChoice;
                const label = setId
                    ? t('wizardMigration.versionChoiceLabel', {
                          project: project.name,
                          version: migrationVersionName(setId),
                      })
                    : t('wizardMigration.choiceLabel', {
                          project: project.name,
                      });
                return (
                    <tr
                        key={index === 0 ? 'project' : setId}
                        className="border-t border-base-content/10 align-top"
                    >
                        {index === 0 && (
                            <th
                                scope="rowgroup"
                                rowSpan={rows.length}
                                className="break-words p-3 text-left font-normal"
                            >
                                <p className="font-semibold">{project.name}</p>
                                <p className="mt-1 text-sm text-base-content/60">
                                    {project.version} -{' '}
                                    {t(
                                        `migration.edition.${project.edition ?? 'standard'}`,
                                    )}
                                </p>
                                {project.setIds.length > 1 && (
                                    <label
                                        htmlFor={`${id}-individual`}
                                        className="mt-2 flex items-start gap-2 text-sm"
                                    >
                                        <Switch
                                            id={`${id}-individual`}
                                            role="switch"
                                            aria-label={t(
                                                'wizardMigration.individualLabel',
                                                { project: project.name },
                                            )}
                                            checked={individual}
                                            aria-checked={individual}
                                            disabled={!eligible}
                                            onChange={(event) =>
                                                onIndividual(
                                                    project.projectPath,
                                                    event.target.checked,
                                                )
                                            }
                                        />
                                        {t('wizardMigration.individual')}
                                    </label>
                                )}
                            </th>
                        )}
                        <td className="break-words p-3 text-base-content/65">
                            {setIds.length ? (
                                <ul className="space-y-1">
                                    {setIds.map((version) => (
                                        <li key={version}>
                                            {migrationVersionName(version)}
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                t('wizardMigration.leftLater')
                            )}
                        </td>
                        <td className="p-3">
                            <div className="flex items-center gap-1">
                                <div className="min-w-0 flex-1">
                                    <SelectField
                                        id={`${id}-${index}`}
                                        ariaLabel={label}
                                        size="sm"
                                        value={selected}
                                        disabled={!eligible}
                                        onChange={(value) =>
                                            onChoose(
                                                project.projectPath,
                                                value as TemplateMigrationDecision,
                                                setId,
                                            )
                                        }
                                        options={migrationOptions.map(
                                            (value) => ({
                                                value,
                                                startIcon: (
                                                    <MigrationChoiceIcon
                                                        choice={value}
                                                    />
                                                ),
                                                label: t(
                                                    `wizardMigration.choices.${value}`,
                                                ),
                                            }),
                                        )}
                                    />
                                </div>
                                <MigrationChoiceHelp
                                    projectName={
                                        setId
                                            ? `${project.name}, ${migrationVersionName(setId)}`
                                            : project.name
                                    }
                                    choice={selected}
                                    setIds={setIds}
                                />
                            </div>
                            <p
                                className={`mt-1 text-sm ${migrationChoiceTone[selected]}`}
                            >
                                {t(`wizardMigration.choiceNotice.${selected}`)}
                            </p>
                            {!individual && setIds.length > 1 && (
                                <p className="mt-1 text-sm text-base-content/60">
                                    {t('wizardMigration.allVersions', {
                                        number: setIds.length,
                                    })}
                                </p>
                            )}
                            {!eligible && (
                                <p className="mt-1 text-sm text-base-content/70">
                                    {t(`migration.reasons.${project.reason}`)}
                                </p>
                            )}
                        </td>
                    </tr>
                );
            })}
        </>
    );
}
