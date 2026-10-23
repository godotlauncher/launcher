import {
    ArrowRight,
    Box,
    File,
    FolderPlus,
    FolderSearch,
    GitBranch,
} from 'lucide-react';
import type React from 'react';
import { useId } from 'react';
import githubIcon from '../../../assets/icons/github-invertocat-black.svg';

type Translate = (key: string) => string;

type ProjectsWelcomeProps = {
    gitAvailable: boolean;
    t: Translate;
    onCreateProject: () => void;
    onAddFromGodotProjectManager: () => void;
    onScanFolder: () => void;
    onAddFromComputer: () => void;
    onAddFromGitHub: () => void;
    onAddFromPublicGit: () => void;
};

/**
 * Renders the first-project choices without requiring a locally installed editor.
 *
 * @param props - Available import choices and their actions.
 * @returns The Projects welcome experience.
 */
export const ProjectsWelcome: React.FC<ProjectsWelcomeProps> = ({
    gitAvailable,
    t,
    onCreateProject,
    onAddFromGodotProjectManager,
    onScanFolder,
    onAddFromComputer,
    onAddFromGitHub,
    onAddFromPublicGit,
}) => {
    const gitReasonId = useId();
    return (
        <section
            className="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col overflow-y-auto px-3 py-4 text-base"
            aria-labelledby="projectsWelcomeHeading"
            data-testid="projectsWelcome"
        >
            <div className="my-auto shrink-0 py-2">
                <div className="text-center">
                    <h2
                        id="projectsWelcomeHeading"
                        className="text-2xl font-semibold"
                    >
                        {t('emptyState.welcome.heading')}
                    </h2>
                    <p className="mt-2 text-base-content/75">
                        {t('emptyState.welcome.description')}
                    </p>
                </div>
                <div className="mt-6 grid auto-rows-fr grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <ActionTile
                        icon={<FolderPlus className="size-6" />}
                        primary
                        title={t('emptyState.welcome.newProject.action')}
                        description={t(
                            'emptyState.welcome.tiles.createDescription',
                        )}
                        testId="btnWelcomeCreateProject"
                        onAction={onCreateProject}
                    />
                    <ActionTile
                        icon={<Box className="size-6" />}
                        title={t('addProject.manager.title')}
                        description={t(
                            'emptyState.welcome.tiles.godotDescription',
                        )}
                        testId="btnWelcomeAddFromGodotProjectManager"
                        onAction={onAddFromGodotProjectManager}
                    />
                    <ActionTile
                        icon={<FolderSearch className="size-6" />}
                        title={t('emptyState.welcome.tiles.scanTitle')}
                        description={t(
                            'emptyState.welcome.tiles.scanDescription',
                        )}
                        testId="btnWelcomeScanFolder"
                        onAction={onScanFolder}
                    />
                    <ActionTile
                        icon={<File className="size-6" />}
                        title={t('emptyState.welcome.tiles.fileTitle')}
                        description={t(
                            'emptyState.welcome.tiles.fileDescription',
                        )}
                        testId="btnWelcomeAddFromComputer"
                        onAction={onAddFromComputer}
                    />
                    <ActionTile
                        icon={
                            <img
                                src={githubIcon}
                                alt=""
                                className="size-6 dark:invert"
                            />
                        }
                        title={t(
                            'emptyState.welcome.existingProject.fromGitHub',
                        )}
                        description={t(
                            'emptyState.welcome.tiles.githubDescription',
                        )}
                        testId="btnWelcomeAddFromGitHub"
                        onAction={onAddFromGitHub}
                        disabled={!gitAvailable}
                        unavailableReasonId={gitReasonId}
                    />
                    <ActionTile
                        icon={<GitBranch className="size-6" />}
                        title={t(
                            'emptyState.welcome.existingProject.fromPublicGit',
                        )}
                        description={t(
                            'emptyState.welcome.tiles.publicGitDescription',
                        )}
                        testId="btnWelcomeAddFromPublicGit"
                        onAction={onAddFromPublicGit}
                        disabled={!gitAvailable}
                        unavailableReasonId={gitReasonId}
                    />
                </div>
                {!gitAvailable && (
                    <p
                        id={gitReasonId}
                        className="mt-3 text-center text-sm text-base-content/70"
                    >
                        {t('emptyState.welcome.tiles.gitRequired')}
                    </p>
                )}
            </div>
        </section>
    );
};

type ActionTileProps = {
    icon: React.ReactNode;
    title: string;
    description: string;
    testId: string;
    onAction: () => void;
    primary?: boolean;
    disabled?: boolean;
    unavailableReasonId?: string;
};

/**
 * Renders a keyboard-accessible action with its explanation inside the tile.
 *
 * @param props - The tile's content, availability and existing action.
 * @returns One whole-tile button.
 */
const ActionTile: React.FC<ActionTileProps> = ({
    icon,
    title,
    description,
    testId,
    onAction,
    primary = false,
    disabled = false,
    unavailableReasonId,
}) => {
    const titleId = useId();
    const descriptionId = useId();
    return (
        <button
            type="button"
            data-testid={testId}
            onClick={onAction}
            disabled={disabled}
            aria-labelledby={titleId}
            aria-describedby={`${descriptionId}${disabled && unavailableReasonId ? ` ${unavailableReasonId}` : ''}`}
            className={`group flex min-h-44 flex-col rounded-md border p-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50 ${primary ? 'border-primary/30 bg-primary/5 enabled:hover:bg-primary/10' : 'border-base-content/15 bg-base-100 enabled:hover:border-primary/40 enabled:hover:bg-base-200'}`}
        >
            <span
                className="flex w-full items-center justify-between"
                aria-hidden="true"
            >
                <span className="text-primary">{icon}</span>
                <ArrowRight className="size-4 text-base-content/40 group-enabled:group-hover:text-primary" />
            </span>
            <span id={titleId} className="mt-3 font-semibold leading-snug">
                {title}
            </span>
            <span
                id={descriptionId}
                className="mt-2 text-sm leading-5 text-base-content/70"
            >
                {description}
            </span>
        </button>
    );
};
