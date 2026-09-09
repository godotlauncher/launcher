import { ImageOff, Play, TriangleAlert } from 'lucide-react';
import { CopyBadge } from '../../../components/ui/copy-badge.component';
import { Tooltip } from '../../../components/ui/tooltip.component';
import { getInvalidProjectTableKey } from '../projects-view.model';
import type { ProjectPresentationProps } from './project-list.types';

type ProjectCardProps = ProjectPresentationProps;

/**
 * Renders the card presentation of a project.
 * @param props - Project presentation data and existing action callbacks.
 */
export function ProjectCard({
    project,
    sectionKey,
    onLaunchProject,
    t,
    actions,
    badges,
    launchDisabled,
    lastOpened,
}: ProjectCardProps) {
    return (
        <div className="flex min-w-0 flex-col gap-4">
            <div className="grid min-w-0 grid-cols-[48px_minmax(0,1fr)_auto] items-start gap-3">
                <div className="flex size-[48px] shrink-0 self-center items-center justify-center overflow-hidden">
                    {project.icon_path ? (
                        <img
                            src={project.icon_path}
                            className="h-full w-full object-contain"
                            alt=""
                        />
                    ) : (
                        <ImageOff className="h-6 w-6" />
                    )}
                </div>

                <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex min-h-10 min-w-0 items-center gap-2 pl-3">
                        {!project.valid && (
                            <Tooltip
                                placement="top"
                                tip={t(getInvalidProjectTableKey(project))}
                                tone="warning"
                            >
                                <TriangleAlert className="size-5 shrink-0 text-warning" />
                            </Tooltip>
                        )}
                        <h3 className="truncate text-base font-semibold">
                            {project.name}
                        </h3>
                    </div>
                    <CopyBadge
                        value={project.path}
                        label={t('common:buttons.copyPath')}
                        copiedLabel={t('common:success')}
                        className="self-start hover:bg-base-100! focus-within:bg-base-100!"
                        data-testid={`btnCopyProjectPath_${sectionKey}_${project.path}`}
                    />
                </div>

                {actions}
            </div>

            <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
                <div className="min-w-0 flex-1">{badges}</div>

                <div
                    data-testid="projectLaunchActions"
                    className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-2"
                >
                    <p className="text-sm text-base-content/60">{lastOpened}</p>

                    <button
                        type="button"
                        data-testid="btnEditProjectInGodot"
                        disabled={launchDisabled}
                        onClick={() => onLaunchProject(project)}
                        className="btn btn-primary gap-2 text-base"
                    >
                        <Play size={16} />
                        {t('card.editInGodot')}
                    </button>
                </div>
            </div>
        </div>
    );
}
