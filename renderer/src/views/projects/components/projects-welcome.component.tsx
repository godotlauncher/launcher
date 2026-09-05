import { FolderOpen, FolderPlus } from 'lucide-react';
import type React from 'react';
import githubInvertocatWhite from '../../../assets/icons/github-invertocat-white.svg';

type Translate = (key: string) => string;

type ProjectsWelcomeProps = {
    gitAvailable: boolean;
    t: Translate;
    onCreateProject: () => void;
    onAddFromComputer: () => void;
    onAddFromGitHub: () => void;
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
}) => (
    <section
        className="mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center py-12"
        aria-labelledby="projectsWelcomeHeading"
        data-testid="projectsWelcome"
    >
        <div className="text-center">
            <h2
                id="projectsWelcomeHeading"
                className="text-3xl font-semibold text-base-content"
            >
                {t('emptyState.welcome.heading')}
            </h2>
            <p className="mt-2 text-base text-base-content/65">
                {t('emptyState.welcome.description')}
            </p>
        </div>
        <div className="mt-14 grid grid-cols-1 divide-y divide-base-content/15 md:grid-cols-2 md:divide-x md:divide-y-0">
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
                secondaryAction={
                    gitAvailable
                        ? {
                              label: t(
                                  'emptyState.welcome.existingProject.fromGitHub',
                              ),
                              testId: 'btnWelcomeAddFromGitHub',
                              onAction: onAddFromGitHub,
                          }
                        : undefined
                }
            />
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
        label: string;
        testId: string;
        onAction: () => void;
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
}) => (
    <div className="flex flex-col items-center px-6 py-10 text-center md:px-14">
        <div
            className="flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/15"
            aria-hidden="true"
        >
            <Icon className="size-8" strokeWidth={1.75} />
        </div>
        <h3 className="mt-8 text-2xl font-semibold text-base-content">
            {heading}
        </h3>
        <p className="mt-3 max-w-xs whitespace-pre-line text-base text-base-content/65">
            {description}
        </p>
        <div className="mt-8 flex w-full max-w-xs flex-col gap-3">
            <button
                type="button"
                className="btn btn-primary w-full"
                data-testid={actionTestId}
                onClick={onAction}
            >
                {actionLabel}
            </button>
            {secondaryAction && (
                <button
                    type="button"
                    className="btn btn-neutral w-full"
                    data-testid={secondaryAction.testId}
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
            )}
        </div>
    </div>
);
