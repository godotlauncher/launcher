import { ImageOff, Play, TriangleAlert } from 'lucide-react';
import { CopyBadge } from '../../../components/ui/copyBadge.component';
import { Tooltip } from '../../../components/ui/tooltip.component';
import { getInvalidProjectTableKey } from '../projectsView.model';
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
        <div className="flex min-w-0 flex-col gap-4 pl-2">
            <div className="grid min-w-0 grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-4">
                <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-base-content/8">
                    {project.icon_path ? (
                        <img
                            src={project.icon_path}
                            className="h-full w-full object-contain"
                            alt=""
                        />
                    ) : (
                        <ImageOff className="h-6 w-6 stroke-base-content/30" />
                    )}
                </div>

                <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex min-w-0 items-center gap-2">
                        {!project.valid && (
                            <Tooltip
                                placement="top"
                                tip={t(getInvalidProjectTableKey(project))}
                                tone="warning"
                            >
                                <TriangleAlert className="size-5 shrink-0 stroke-warning" />
                            </Tooltip>
                        )}
                        <h3 className="truncate text-xl font-semibold leading-tight text-base-content">
                            {project.name}
                        </h3>
                    </div>
                    <CopyBadge
                        value={project.path}
                        label={t('common:buttons.copyPath')}
                        copiedLabel={t('common:success')}
                        className="max-w-full self-start rounded-md bg-transparent px-0 text-base-content/55"
                        data-testid={`btnCopyProjectPath_${sectionKey}_${project.path}`}
                    />
                </div>

                {actions}
            </div>

            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-6">
                {badges}

                <div
                    data-testid="projectLaunchActions"
                    className="flex min-w-36 shrink-0 items-center gap-2"
                >
                    <p className="whitespace-nowrap text-sm text-base-content/55">
                        {lastOpened}
                    </p>

                    <button
                        type="button"
                        data-testid="btnEditProjectInGodot"
                        disabled={launchDisabled}
                        onClick={() => onLaunchProject(project)}
                        className="btn btn-primary btn-sm min-w-32 gap-2 rounded-md"
                    >
                        <Play size={16} />
                        {t('card.editInGodot')}
                    </button>
                </div>
            </div>
        </div>
    );
}
