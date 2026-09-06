import { Clock, FlaskConical, ImageOff, TriangleAlert } from 'lucide-react';
import { CopyBadge } from '../../../components/ui/copyBadge.component';
import { Tooltip } from '../../../components/ui/tooltip.component';
import { getInvalidProjectTableKey } from '../projectsView.model';
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
            aria-label={t('view.openProject', {
                project: project.name,
            })}
            onClick={() => onLaunchProject(project)}
            className="group flex h-[24px] min-w-0 items-center gap-2 rounded-sm text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-45 disabled:cursor-not-allowed"
        >
            <span className="absolute left-0 top-1/2 flex size-[48px] -translate-y-1/2 items-center justify-center overflow-hidden rounded bg-base-content/8 group-focus-visible:outline-2 group-focus-visible:outline-primary">
                {project.icon_path ? (
                    <img
                        src={project.icon_path}
                        className="size-full object-contain"
                        alt=""
                    />
                ) : (
                    <ImageOff className="size-5 stroke-base-content/30" />
                )}
            </span>
            <span className="truncate text-[16px] font-semibold underline-offset-2 group-hover:underline">
                {project.name}
            </span>
        </button>
    );

    return (
        <div className="flex w-full min-w-0 items-center gap-2 pl-2">
            <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(12rem,auto)] items-stretch gap-4">
                <div className="relative flex min-h-[48px] min-w-0 flex-col justify-center pl-[60px]">
                    <div className="flex min-w-0 items-center gap-2">
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
                                    <TriangleAlert className="size-[16px] shrink-0 text-warning" />
                                </Tooltip>
                            )}
                        {badges}
                    </div>
                    <CopyBadge
                        value={project.path}
                        label={t('common:buttons.copyPath')}
                        copiedLabel={t('common:success')}
                        className="self-start hover:bg-base-100"
                        data-testid={`btnCopyProjectPath_${sectionKey}_${project.path}`}
                    />
                </div>
                <div className="flex min-h-[48px] min-w-0 max-w-80 flex-col items-end self-stretch justify-between gap-1">
                    {actions}
                    <div className="flex w-full min-w-0 items-center justify-end gap-2 text-xs text-base-content/55">
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
                                            size={16}
                                            className="shrink-0"
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
                                        size={16}
                                        className="shrink-0 text-secondary"
                                    />
                                )}
                                <span className="min-w-0 truncate">
                                    {versionLabel}
                                </span>
                            </span>
                        </Tooltip>
                        <span
                            aria-hidden="true"
                            className="h-3 border-l border-base-300"
                        />
                        <Clock
                            size={12}
                            className="shrink-0"
                            aria-hidden="true"
                        />
                        <span className="min-w-0 truncate">{lastOpened}</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
