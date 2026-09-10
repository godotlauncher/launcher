import type React from 'react';
import { formatRelativeTime } from '../../../i18n/relative-time.util';
import { ProjectActions } from './project-actions.component';
import { ProjectBadges } from './project-badges.component';
import { ProjectCard } from './project-card.component';
import { ProjectCompactRow } from './project-compact-row.component';
import type { ProjectListItemProps } from './project-list.types';

/**
 * Renders a project using shared status and actions in either presentation.
 * @param props - Project state, presentation and existing project handlers.
 */
export const ProjectListItem: React.FC<ProjectListItemProps> = ({
    viewMode = 'cards',
    project,
    sectionKey,
    highlighted,
    pinnedItemRef,
    reorderHandle,
    reorderStateClassName = '',
    locale,
    busyProjects,
    codeEditorSettings,
    projectGitHubUrls,
    githubIconSrc,
    isInstalledRelease,
    isProjectEditorDownloading,
    getDownloadableProjectEditor,
    onInstallRequiredProjectEditor,
    onLaunchProject,
    onOpenTerminal,
    onProjectFoldersOptions,
    onTogglePinned,
    onProjectSettings,
    onProjectMoreOptions,
    t,
}) => {
    const editorDownloading = isProjectEditorDownloading(project);
    const releaseInstalled = isInstalledRelease(
        project.release.version,
        project.release.mono,
    );
    const downloadableProjectEditor = getDownloadableProjectEditor(project);
    const selectedCodeEditor = project.codeEditorId
        ? codeEditorSettings.find(
              (settings) => settings.integration.id === project.codeEditorId,
          )
        : undefined;
    const codeEditorUnavailable = Boolean(
        selectedCodeEditor && !selectedCodeEditor.installation,
    );
    const codeEditorName =
        selectedCodeEditor?.integration.displayName ?? project.codeEditorId;
    const codeEditorTooltip = project.codeEditorId
        ? t(
              codeEditorUnavailable
                  ? 'table.codeEditorUnavailable'
                  : 'table.codeEditorProject',
              { editor: codeEditorName },
          )
        : '';
    const editorMissing =
        !releaseInstalled ||
        (!project.valid && project.invalid_reason === 'missing_editor');
    const launchDisabled =
        !project.valid || !releaseInstalled || editorDownloading;
    const versionLabel = `${project.version}${project.release.mono ? ' (.NET)' : ''}`;
    const isGitHubProject = projectGitHubUrls.has(project.path);

    const compact = viewMode === 'list';
    const actions = (
        <ProjectActions
            project={project}
            onInstallRequiredProjectEditor={onInstallRequiredProjectEditor}
            onTogglePinned={onTogglePinned}
            onProjectFoldersOptions={onProjectFoldersOptions}
            onOpenTerminal={onOpenTerminal}
            onProjectSettings={onProjectSettings}
            onProjectMoreOptions={onProjectMoreOptions}
            t={t}
            compact={compact}
            downloadableProjectEditor={downloadableProjectEditor}
            releaseInstalled={releaseInstalled}
            editorDownloading={editorDownloading}
        />
    );
    const badges = (
        <ProjectBadges
            project={project}
            githubIconSrc={githubIconSrc}
            t={t}
            compact={compact}
            releaseInstalled={releaseInstalled}
            editorDownloading={editorDownloading}
            versionLabel={versionLabel}
            codeEditorUnavailable={codeEditorUnavailable}
            codeEditorName={codeEditorName}
            codeEditorTooltip={codeEditorTooltip}
            isGitHubProject={isGitHubProject}
        />
    );
    const lastOpened = project.last_opened
        ? t('card.opened', {
              age: formatRelativeTime(project.last_opened, locale),
          })
        : t('card.notOpened');

    const presentationProps = {
        project,
        sectionKey,
        onLaunchProject,
        t,
        actions,
        badges,
        launchDisabled,
        lastOpened,
    };

    return (
        <li
            ref={pinnedItemRef}
            tabIndex={sectionKey === 'pinned' ? -1 : undefined}
            className={`group/project relative rounded-md bg-base-content/2 text-base hover:bg-base-content/5 ${compact ? 'flex min-h-[68px] items-center px-3 py-3' : 'p-4'} motion-reduce:transition-none ${highlighted ? 'project-pin-highlight' : ''} ${reorderStateClassName}`}
            data-project-view={viewMode}
            data-project-path={project.path}
            data-project-section={sectionKey}
        >
            {reorderHandle}
            {busyProjects.includes(project.path) && (
                <div className="absolute inset-0 z-10 flex items-center justify-center rounded-md bg-base-100">
                    <div className="loading loading-bars" />
                </div>
            )}

            {compact ? (
                <ProjectCompactRow
                    {...presentationProps}
                    editorMissing={editorMissing}
                    editorDownloading={editorDownloading}
                    versionLabel={versionLabel}
                />
            ) : (
                <ProjectCard {...presentationProps} />
            )}
        </li>
    );
};
