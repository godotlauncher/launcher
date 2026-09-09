import { Clock, FlaskConical, ImageOff, TriangleAlert } from 'lucide-react';
import { CopyBadge } from '../../../components/ui/copy-badge.component';
import { Tooltip } from '../../../components/ui/tooltip.component';
import { getInvalidProjectTableKey } from '../projects-view.model';
import type { ProjectPresentationProps } from './project-list.types';

type ProjectCompactRowProps = ProjectPresentationProps & {
    editorMissing: boolean;
    editorDownloading: boolean;
    versionLabel: string;
};

/**
 * Renders the compact presentation of a project.
 * @param props - Project presentation data and existing action callbacks.
 */
export function ProjectCompactRow({
    project,
    sectionKey,
    onLaunchProject,
    t,
    actions,
    badges,
    launchDisabled,
    lastOpened,
    editorMissing,
    editorDownloading,
    versionLabel,
}: ProjectCompactRowProps) {
    const compactLaunchButton = (
        <button
            type="button"
            data-testid="btnLaunchCompactProject"
            disabled={launchDisabled}
            aria-label={t('view.openProject', { project: project.name })}
            onClick={() => onLaunchProject(project)}
            className="group flex min-h-8 min-w-0 items-center gap-2 text-left text-base font-semibold disabled:opacity-45"
        >
            <span className="truncate">{project.name}</span>
        </button>
    );

    return (
        <div className="grid w-full min-w-0 grid-cols-[48px_minmax(0,1fr)] items-center gap-3">
            <button
                type="button"
                tabIndex={-1}
                disabled={launchDisabled}
                aria-label={t('view.openProject', { project: project.name })}
                onClick={() => onLaunchProject(project)}
                className="flex size-[48px] items-center justify-center overflow-hidden disabled:opacity-45"
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
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-stretch gap-4">
                <div className="flex min-w-0 flex-col justify-between gap-1">
                    <div className="flex min-h-10 min-w-0 items-center gap-2 pl-3">
                        {launchDisabled ? (
                            compactLaunchButton
                        ) : (
                            <Tooltip
                                tip={t('card.editInGodot')}
                                placement="top"
                                className="min-w-0"
                            >
                                {compactLaunchButton}
                            </Tooltip>
                        )}
                        {!project.valid &&
                            project.invalid_reason !== 'missing_editor' && (
                                <Tooltip
                                    placement="top"
                                    tip={t(getInvalidProjectTableKey(project))}
                                    role="img"
                                    ariaLabel={t(
                                        getInvalidProjectTableKey(project),
                                    )}
                                    tone="warning"
                                >
                                    <TriangleAlert className="size-5 shrink-0 text-warning" />
                                </Tooltip>
                            )}
                        {badges}
                    </div>
                    <CopyBadge
                        value={project.path}
                        label={t('common:buttons.copyPath')}
                        copiedLabel={t('common:success')}
                        className="self-start hover:bg-base-100! focus-within:bg-base-100!"
                        data-testid={`btnCopyProjectPath_${sectionKey}_${project.path}`}
                    />
                </div>
                <div className="flex min-w-0 max-w-80 flex-col items-end self-stretch justify-between gap-1">
                    {actions}
                    <div className="flex min-h-7 w-full min-w-0 flex-wrap items-center justify-end gap-x-2 gap-y-1 text-sm text-base-content/60">
                        <Tooltip
                            tip={
                                editorMissing
                                    ? t('table.invalidReasons.missingEditor')
                                    : t('card.godotVersion', {
                                          version: versionLabel,
                                      })
                            }
                            tone={editorMissing ? 'warning' : 'default'}
                            placement="top"
                            className="min-w-0"
                        >
                            <span
                                data-testid="compactProjectEditorVersion"
                                className={`flex min-w-0 items-center gap-1 ${editorMissing ? 'text-warning' : ''}`}
                            >
                                {editorMissing && (
                                    <>
                                        <TriangleAlert
                                            className="size-5 shrink-0"
                                            aria-hidden="true"
                                        />
                                        <span className="sr-only">
                                            {t(
                                                'table.invalidReasons.missingEditor',
                                            )}
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
                                    />
                                )}
                                <span className="min-w-0 truncate">
                                    {versionLabel}
                                </span>
                            </span>
                        </Tooltip>
                        <span className="inline-flex min-w-0 items-center gap-1">
                            <Clock
                                size={12}
                                className="shrink-0"
                                aria-hidden="true"
                            />
                            <span className="min-w-0 truncate">
                                {lastOpened}
                            </span>
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}
