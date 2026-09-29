import { FlaskConical, ImageOff, TriangleAlert } from 'lucide-react';
import { Tooltip } from '../../../components/ui/tooltip.component';
import { getInvalidProjectTableKey } from '../projects-view.model';
import type { ProjectPresentationProps } from './project-list.types';

type ProjectDenseRowProps = ProjectPresentationProps & {
    editorMissing: boolean;
    editorDownloading: boolean;
    versionLabel: string;
};

/**
 * Renders a single-line project with shared actions and launch eligibility.
 * @param props - Project identity, status, version and existing controls.
 */
export function ProjectDenseRow({
    project,
    onLaunchProject,
    t,
    actions,
    badges,
    tagIndicators,
    launchDisabled,
    editorMissing,
    editorDownloading,
    versionLabel,
}: ProjectDenseRowProps) {
    const launchButton = (
        <button
            type="button"
            data-testid="btnLaunchDenseProject"
            disabled={launchDisabled}
            aria-label={t('view.openProject', { project: project.name })}
            onClick={() => onLaunchProject(project)}
            className="flex min-h-8 w-full min-w-0 items-center text-left text-base font-semibold disabled:opacity-45"
        >
            <span className="truncate">{project.name}</span>
        </button>
    );

    return (
        <div className="grid w-full min-w-0 grid-cols-[24px_minmax(0,1fr)_auto_auto_minmax(0,10.5rem)_auto] items-center gap-2">
            <button
                type="button"
                tabIndex={-1}
                disabled={launchDisabled}
                aria-label={t('view.openProject', { project: project.name })}
                onClick={() => onLaunchProject(project)}
                className="flex size-[24px] items-center justify-center overflow-hidden disabled:opacity-45"
            >
                {project.icon_path ? (
                    <img
                        src={project.icon_path}
                        className="size-full object-contain"
                        alt=""
                    />
                ) : (
                    <ImageOff className="size-5" />
                )}
            </button>
            {launchDisabled ? (
                launchButton
            ) : (
                <Tooltip
                    tip={t('card.editInGodot')}
                    placement="top"
                    className="min-w-0"
                >
                    {launchButton}
                </Tooltip>
            )}
            <div className="flex items-center gap-2">
                {!project.valid &&
                    project.invalid_reason !== 'missing_editor' && (
                        <Tooltip
                            placement="top"
                            tip={t(getInvalidProjectTableKey(project))}
                            role="img"
                            ariaLabel={t(getInvalidProjectTableKey(project))}
                            tone="warning"
                        >
                            <TriangleAlert className="size-4 shrink-0 text-warning" />
                        </Tooltip>
                    )}
                {badges}
            </div>
            {tagIndicators}
            <Tooltip
                tip={
                    editorMissing
                        ? t('table.invalidReasons.missingEditor')
                        : t('card.godotVersion', { version: versionLabel })
                }
                tone={editorMissing ? 'warning' : 'default'}
                placement="top"
                className="min-w-0"
            >
                <span
                    data-testid="denseProjectEditorVersion"
                    className={`flex min-w-0 items-center gap-1 text-sm ${editorMissing ? 'text-warning' : 'text-base-content/60'}`}
                >
                    {editorMissing && (
                        <>
                            <TriangleAlert
                                className="size-4 shrink-0"
                                aria-hidden="true"
                            />
                            <span className="sr-only">
                                {t('table.invalidReasons.missingEditor')}
                            </span>
                        </>
                    )}
                    {editorDownloading && (
                        <span className="loading loading-spinner loading-xs shrink-0" />
                    )}
                    {project.release.prerelease && (
                        <FlaskConical
                            size={14}
                            className="shrink-0 text-purple-500"
                            aria-hidden="true"
                        />
                    )}
                    <span className="min-w-0 truncate">{versionLabel}</span>
                </span>
            </Tooltip>
            {actions}
        </div>
    );
}
