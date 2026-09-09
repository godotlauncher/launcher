import { FlaskConical, PanelTop, Tag, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import gitIconColor from '../../../assets/icons/git-icon-color.svg';
import { CodeEditorIntegrationIcon } from '../../../components/code-editor-integration-icon.component';
import { StatusBadge } from '../../../components/ui/status-badge.component';
import { Tooltip } from '../../../components/ui/tooltip.component';
import type { ProjectListItemProps } from './project-list.types';

/**
 * Fits 14px card icons inside pill badges with balanced padding and spacing.
 * @param props - Presentation mode, warning state and badge content.
 */
function ProjectBadge({
    compact,
    warning = false,
    children,
}: {
    compact: boolean;
    warning?: boolean;
    children: ReactNode;
}) {
    return compact ? (
        <span
            className={`inline-flex items-center gap-1 ${warning ? 'text-warning' : ''}`}
        >
            {children}
        </span>
    ) : (
        <StatusBadge
            tone={warning ? 'warning' : 'neutral'}
            className="h-[22px] max-w-full gap-[4px] rounded-full px-[6px] [&>svg]:size-[14px] [&>img]:size-[14px]"
        >
            {children}
        </StatusBadge>
    );
}

type ProjectBadgesProps = Pick<
    ProjectListItemProps,
    'project' | 'githubIconSrc' | 't'
> & {
    compact: boolean;
    releaseInstalled: boolean;
    editorDownloading: boolean;
    versionLabel: string;
    codeEditorUnavailable: boolean;
    codeEditorName: string | null | undefined;
    codeEditorTooltip: string;
    isGitHubProject: boolean;
};

/**
 * Renders project status badges or compact status icons.
 * @param props - Project presentation data and existing action callbacks.
 */
export function ProjectBadges({
    project,
    githubIconSrc,
    t,
    compact,
    releaseInstalled,
    editorDownloading,
    versionLabel,
    codeEditorUnavailable,
    codeEditorName,
    codeEditorTooltip,
    isGitHubProject,
}: ProjectBadgesProps) {
    return (
        <div
            data-testid="projectBadges"
            className={
                compact
                    ? 'flex shrink-0 items-center gap-2'
                    : 'flex min-w-0 flex-wrap content-start items-start gap-2'
            }
        >
            {!compact && (
                <Tooltip
                    role={compact ? 'img' : undefined}
                    ariaLabel={
                        releaseInstalled
                            ? t('card.godotVersion', { version: versionLabel })
                            : t('table.invalidReasons.missingEditor')
                    }
                    placement="top"
                    tip={
                        releaseInstalled
                            ? t('card.godotVersion', {
                                  version: versionLabel,
                              })
                            : t('table.invalidReasons.missingEditor')
                    }
                    tone={releaseInstalled ? 'default' : 'warning'}
                    className="min-w-0 max-w-full"
                >
                    <ProjectBadge compact={false} warning={!releaseInstalled}>
                        {editorDownloading ? (
                            <span className="loading loading-spinner loading-xs" />
                        ) : releaseInstalled ? (
                            !compact && <Tag size={16} aria-hidden="true" />
                        ) : (
                            <TriangleAlert
                                size={16}
                                className="text-warning"
                                aria-hidden="true"
                            />
                        )}
                        {!compact && (
                            <span className="min-w-0 truncate">
                                {versionLabel}
                            </span>
                        )}
                        {project.release.prerelease && (
                            <FlaskConical
                                size={14}
                                className="text-purple-500"
                                aria-hidden="true"
                            />
                        )}
                    </ProjectBadge>
                </Tooltip>
            )}

            {project.codeEditorId && (
                <Tooltip
                    placement="top"
                    role={compact ? 'img' : undefined}
                    ariaLabel={codeEditorTooltip}
                    tip={codeEditorTooltip}
                    tone={codeEditorUnavailable ? 'warning' : 'default'}
                >
                    <ProjectBadge
                        compact={compact}
                        warning={codeEditorUnavailable}
                    >
                        {codeEditorUnavailable ? (
                            <TriangleAlert
                                size={16}
                                className="text-warning"
                                aria-hidden="true"
                            />
                        ) : (
                            <CodeEditorIntegrationIcon
                                integrationId={project.codeEditorId}
                                className="size-[16px]"
                            />
                        )}
                        <span
                            className={
                                compact ? 'sr-only' : 'max-w-48 truncate'
                            }
                        >
                            {codeEditorName}
                        </span>
                    </ProjectBadge>
                </Tooltip>
            )}

            {project.withGit && (
                <Tooltip
                    placement="top"
                    tip={t(
                        isGitHubProject
                            ? 'table.githubProject'
                            : 'table.gitProject',
                    )}
                    tone="default"
                >
                    <ProjectBadge compact={compact}>
                        {isGitHubProject ? (
                            <img
                                src={githubIconSrc}
                                className="size-[16px]"
                                alt=""
                                aria-hidden="true"
                                data-testid="githubProjectIcon"
                            />
                        ) : (
                            <img
                                src={gitIconColor}
                                className="size-[16px]"
                                alt=""
                                data-testid="gitProjectIcon"
                            />
                        )}
                        <span className={compact ? 'sr-only' : undefined}>
                            {isGitHubProject ? 'GitHub' : 'Git'}
                        </span>
                    </ProjectBadge>
                </Tooltip>
            )}

            {project.open_windowed && (
                <Tooltip
                    placement="top"
                    tip={t('table.windowedMode')}
                    tone="default"
                >
                    <ProjectBadge compact={compact}>
                        <PanelTop size={16} aria-hidden="true" />
                        <span className={compact ? 'sr-only' : undefined}>
                            {t('card.windowed')}
                        </span>
                    </ProjectBadge>
                </Tooltip>
            )}
        </div>
    );
}
