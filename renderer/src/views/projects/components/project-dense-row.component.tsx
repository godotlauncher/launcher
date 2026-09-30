import {
    Clock,
    FlaskConical,
    ImageOff,
    TriangleAlert,
    UserRound,
} from 'lucide-react';
import { Tooltip } from '../../../components/ui/tooltip.component';
import { getInvalidProjectTableKey } from '../projects-view.model';
import type { ProjectPresentationProps } from './project-list.types';
import { ProjectStatusTooltip } from './project-status-tooltip.component';

type ProjectDenseRowProps = ProjectPresentationProps & {
    editorMissing: boolean;
    editorDownloading: boolean;
    versionLabel: string;
};

/**
 * Keeps a single-line project row with space between tags, badges and the editor.
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
    lastOpened,
    editorMissing,
    editorDownloading,
    versionLabel,
}: ProjectDenseRowProps) {
    const launchButton = (
        <button
            type="button"
            data-testid="btnLaunchDenseProject"
            aria-disabled={launchDisabled || undefined}
            aria-label={t('view.openProject', { project: project.name })}
            onClick={() => {
                if (!launchDisabled) onLaunchProject(project);
            }}
            className="flex min-h-8 min-w-0 items-center text-left text-base font-semibold aria-disabled:opacity-45"
        >
            <span className="truncate">{project.name}</span>
        </button>
    );

    return (
        <div className="grid w-full min-w-0 grid-cols-[24px_minmax(0,1fr)_12rem_auto] items-center gap-2">
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
            <div className="flex min-w-0 items-center gap-2 pr-2">
                <Tooltip
                    tip={
                        <div className="flex min-w-0 flex-col gap-2">
                            <p className="break-words font-semibold">
                                {project.name}
                            </p>
                            <p className="break-all font-mono text-xs text-base-content/70">
                                {project.path}
                            </p>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-base-content/70">
                                <span className="inline-flex items-center gap-1">
                                    <Clock
                                        size={12}
                                        className="shrink-0"
                                        aria-hidden="true"
                                    />
                                    {lastOpened}
                                </span>
                            </div>
                        </div>
                    }
                    variant="panel"
                    delay={1000}
                    placement="top"
                    className="min-w-0"
                >
                    {launchButton}
                </Tooltip>
                {tagIndicators}
                <div
                    data-testid="denseProjectIndicators"
                    className="ml-2 flex shrink-0 items-center gap-2"
                >
                    {!project.valid &&
                        project.invalid_reason !== 'missing_editor' && (
                            <ProjectStatusTooltip
                                placement="top"
                                tip={t(getInvalidProjectTableKey(project))}
                                role="img"
                                ariaLabel={t(
                                    getInvalidProjectTableKey(project),
                                )}
                                warning
                            >
                                <TriangleAlert className="size-4 shrink-0 text-warning" />
                            </ProjectStatusTooltip>
                        )}
                    {badges}
                </div>
            </div>
            <ProjectStatusTooltip
                tip={
                    editorMissing
                        ? t('table.invalidReasons.missingEditor')
                        : t('card.godotVersion', { version: versionLabel })
                }
                warning={editorMissing}
                delay={1000}
                placement="top"
                className="w-fit min-w-0 max-w-full justify-self-start"
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
                    {project.release.source === 'custom' && (
                        <span
                            role="img"
                            aria-label={t('installs:badges.custom')}
                            className="inline-flex shrink-0"
                        >
                            <UserRound
                                size={14}
                                className="text-info"
                                aria-hidden="true"
                            />
                        </span>
                    )}
                    <span
                        data-testid="denseProjectEditorVersionLabel"
                        className="min-w-0 truncate"
                    >
                        {versionLabel}
                    </span>
                    {project.release.prerelease && (
                        <span
                            role="img"
                            aria-label={t('table.prerelease')}
                            className="inline-flex shrink-0"
                        >
                            <FlaskConical
                                size={14}
                                className="text-purple-500"
                                aria-hidden="true"
                            />
                        </span>
                    )}
                </span>
            </ProjectStatusTooltip>
            {actions}
        </div>
    );
}
