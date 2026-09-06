import { FlaskConical, PanelTop, Tag, TriangleAlert } from 'lucide-react';
import gitIconColor from '../../../assets/icons/git_icon_color.svg';
import { CodeEditorIntegrationIcon } from '../../../components/codeEditorIntegrationIcon.component';
import { Tooltip } from '../../../components/ui/tooltip.component';
import type { ProjectListItemProps } from './project-list.types';

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
                    ? 'flex shrink-0 items-center gap-1.5'
                    : 'flex min-w-0 flex-wrap content-start items-start gap-1.5'
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
                >
                    <span
                        className={`${compact ? 'inline-flex items-center gap-1' : 'badge badge-outline h-7 gap-1.5 px-2 text-xs'} ${releaseInstalled ? 'border-base-content/25' : 'border-warning/60 text-warning'}`}
                    >
                        {editorDownloading ? (
                            <span className="loading loading-spinner loading-xs" />
                        ) : releaseInstalled ? (
                            !compact && <Tag size={13} />
                        ) : (
                            <TriangleAlert size={compact ? 16 : 13} />
                        )}
                        {!compact && <span>{versionLabel}</span>}
                        {project.release.prerelease && (
                            <FlaskConical
                                size={compact ? 16 : 12}
                                className="text-secondary"
                            />
                        )}
                    </span>
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
                    <span
                        className={`${compact ? 'inline-flex items-center gap-1' : 'badge badge-outline h-7 gap-1.5 px-2 text-xs'} ${codeEditorUnavailable ? 'border-warning/60 text-warning' : 'border-base-content/25'}`}
                    >
                        {codeEditorUnavailable ? (
                            <TriangleAlert
                                size={compact ? 16 : 13}
                                className="stroke-warning"
                            />
                        ) : (
                            <CodeEditorIntegrationIcon
                                integrationId={project.codeEditorId}
                                className={compact ? 'size-[16px]' : 'size-3.5'}
                            />
                        )}
                        <span
                            className={
                                compact ? 'sr-only' : 'max-w-48 truncate'
                            }
                        >
                            {codeEditorName}
                        </span>
                    </span>
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
                    <span
                        className={
                            compact
                                ? 'inline-flex items-center'
                                : 'badge badge-outline h-7 gap-1.5 border-base-content/25 px-2 text-xs'
                        }
                    >
                        {isGitHubProject ? (
                            <img
                                src={githubIconSrc}
                                className={
                                    compact ? 'size-[16px]' : 'h-3.5 w-3.5'
                                }
                                alt=""
                                aria-hidden="true"
                                data-testid="githubProjectIcon"
                            />
                        ) : (
                            <img
                                src={gitIconColor}
                                className={
                                    compact ? 'size-[16px]' : 'h-3.5 w-3.5'
                                }
                                alt=""
                                data-testid="gitProjectIcon"
                            />
                        )}
                        <span className={compact ? 'sr-only' : undefined}>
                            {isGitHubProject ? 'GitHub' : 'Git'}
                        </span>
                    </span>
                </Tooltip>
            )}

            {project.open_windowed && (
                <Tooltip
                    placement="top"
                    tip={t('table.windowedMode')}
                    tone="default"
                >
                    <span
                        className={
                            compact
                                ? 'inline-flex items-center'
                                : 'badge badge-outline h-7 gap-1.5 border-base-content/25 px-2 text-xs'
                        }
                    >
                        <PanelTop size={compact ? 16 : 13} />
                        <span className={compact ? 'sr-only' : undefined}>
                            {t('card.windowed')}
                        </span>
                    </span>
                </Tooltip>
            )}
        </div>
    );
}
