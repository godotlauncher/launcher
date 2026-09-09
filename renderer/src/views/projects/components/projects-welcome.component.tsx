import { FolderOpen, FolderPlus } from 'lucide-react';
import type React from 'react';
import { useId } from 'react';
import githubInvertocatWhite from '../../../assets/icons/github-invertocat-white.svg';

type Translate = (key: string) => string;

type ProjectsWelcomeProps = {
    gitAvailable: boolean;
    t: Translate;
    onCreateProject: () => void;
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
    onAddFromComputer,
    onAddFromGitHub,
    onAddFromPublicGit,
}) => (
    <section
        className="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col overflow-y-auto px-3 py-6 text-base"
        aria-labelledby="projectsWelcomeHeading"
        data-testid="projectsWelcome"
    >
        <div className="my-auto shrink-0 py-6">
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
            <div className="mt-10 grid grid-cols-2 divide-x divide-base-content/5">
                <WelcomeChoice
                    icon={FolderPlus}
                    heading={t('emptyState.welcome.newProject.heading')}
                    description={t('emptyState.welcome.newProject.description')}
                    actionLabel={t('emptyState.welcome.newProject.action')}
                    actionTestId="btnWelcomeCreateProject"
                    onAction={onCreateProject}
                />
                <WelcomeChoice
                    icon={FolderOpen}
                    heading={t('emptyState.welcome.existingProject.heading')}
                    description={t(
                        'emptyState.welcome.existingProject.description',
                    )}
                    actionLabel={t(
                        'emptyState.welcome.existingProject.fromComputer',
                    )}
                    actionTestId="btnWelcomeAddFromComputer"
                    onAction={onAddFromComputer}
                    secondaryAction={{
                        available: gitAvailable,
                        unavailableReason: t(
                            'emptyState.welcome.existingProject.gitRequired',
                        ),
                        label: t(
                            'emptyState.welcome.existingProject.fromGitHub',
                        ),
                        testId: 'btnWelcomeAddFromGitHub',
                        onAction: onAddFromGitHub,
                        publicGitLabel: t(
                            'emptyState.welcome.existingProject.fromPublicGit',
                        ),
                        onPublicGit: onAddFromPublicGit,
                    }}
                />
            </div>
        </div>
    </section>
);

type WelcomeChoiceProps = {
    icon: typeof FolderOpen;
    heading: string;
    description: string;
    actionLabel: string;
    actionTestId: string;
    onAction: () => void;
    secondaryAction?: {
        available: boolean;
        unavailableReason: string;
        label: string;
        testId: string;
        onAction: () => void;
        publicGitLabel: string;
        onPublicGit: () => void;
    };
};

/**
 * Renders one action column in the Projects welcome experience.
 *
 * @param props - The choice copy, icon, and actions.
 * @returns A welcome action column.
 */
const WelcomeChoice: React.FC<WelcomeChoiceProps> = ({
    icon: Icon,
    heading,
    description,
    actionLabel,
    actionTestId,
    onAction,
    secondaryAction,
}) => {
    const reasonId = useId();
    return (
        <div className="flex flex-col items-center px-6 py-8 text-center">
            <div
                className="flex size-16 items-center justify-center rounded-md text-primary ring-1 ring-primary/15"
                aria-hidden="true"
            >
                <Icon className="size-8" />
            </div>
            <h3 className="mt-6 text-base font-semibold">{heading}</h3>
            <p className="mt-3 max-w-xs whitespace-pre-line text-base-content/75">
                {description}
            </p>
            <div className="mt-6 flex w-full max-w-xs flex-col gap-3">
                <button
                    type="button"
                    className="btn btn-primary w-full text-base"
                    data-testid={actionTestId}
                    onClick={onAction}
                >
                    {actionLabel}
                </button>
                {secondaryAction && (
                    <>
                        <button
                            type="button"
                            className="btn btn-neutral w-full text-base"
                            data-testid={secondaryAction.testId}
                            disabled={!secondaryAction.available}
                            aria-describedby={
                                !secondaryAction.available
                                    ? reasonId
                                    : undefined
                            }
                            onClick={secondaryAction.onAction}
                        >
                            <img
                                src={githubInvertocatWhite}
                                alt=""
                                className="size-5"
                                aria-hidden="true"
                            />
                            {secondaryAction.label}
                        </button>
                        <button
                            type="button"
                            className="link link-primary self-center text-base disabled:opacity-50"
                            data-testid="btnWelcomeAddFromPublicGit"
                            disabled={!secondaryAction.available}
                            onClick={secondaryAction.onPublicGit}
                        >
                            {secondaryAction.publicGitLabel}
                        </button>
                        <p
                            id={reasonId}
                            aria-hidden={secondaryAction.available}
                            className={`text-sm text-base-content/60 ${secondaryAction.available ? 'invisible' : ''}`}
                        >
                            {secondaryAction.unavailableReason}
                        </p>
                    </>
                )}
            </div>
        </div>
    );
};
