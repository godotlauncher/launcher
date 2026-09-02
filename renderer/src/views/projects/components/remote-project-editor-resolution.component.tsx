import type { TFunction } from 'i18next';
import type { RefObject } from 'react';
import type {
    RemoteProjectEditorChoice,
    RemoteProjectEditorPlanGroup,
} from '../remote-project-editor-plan.model';
import { RemoteProjectEditorPlan } from './remote-project-editor-plan.component';

type RemoteProjectEditorResolutionProps = {
    repositoryPath: string;
    plan: RemoteProjectEditorPlanGroup[];
    t: TFunction;
    onChoiceChange: (key: string, choice: RemoteProjectEditorChoice) => void;
};

/**
 * Renders the grouped editor requirements for pending remote projects.
 *
 * @param props - Repository, editor plan, translations, and choice action.
 * @returns Editor-resolution content.
 */
export function RemoteProjectEditorResolution({
    repositoryPath,
    plan,
    t,
    onChoiceChange,
}: RemoteProjectEditorResolutionProps) {
    const projectCount = plan.reduce(
        (count, group) => count + group.candidates.length,
        0,
    );

    return (
        <div className="flex h-full min-h-0 flex-col gap-4">
            <div>
                <p className="font-medium">
                    {t('addProject.remote.editorBatch.title')}
                </p>
                <p className="text-sm text-base-content/70">
                    {t('addProject.remote.editorBatch.description', {
                        count: projectCount,
                    })}
                </p>
            </div>
            <code className="break-all rounded-box bg-base-200 p-3 text-sm">
                {repositoryPath}
            </code>
            <p className="text-sm font-medium">
                {t('addProject.remote.editorBatch.summary', {
                    editors: plan.length,
                    projects: projectCount,
                })}
            </p>
            <RemoteProjectEditorPlan
                plan={plan}
                t={t}
                onChoiceChange={onChoiceChange}
            />
        </div>
    );
}

type RemoteProjectEditorResolutionFooterProps = {
    plan: RemoteProjectEditorPlanGroup[];
    applyButtonRef: RefObject<HTMLButtonElement | null>;
    t: TFunction;
    onFinishWithoutRemaining: () => void;
    onApply: () => void;
};

/**
 * Renders editor-resolution completion actions.
 *
 * @param props - Editor plan, focus target, translations, and actions.
 * @returns Editor-resolution footer actions.
 */
export function RemoteProjectEditorResolutionFooter({
    plan,
    applyButtonRef,
    t,
    onFinishWithoutRemaining,
    onApply,
}: RemoteProjectEditorResolutionFooterProps) {
    const projectCount = plan.reduce(
        (count, group) => count + group.candidates.length,
        0,
    );
    const downloadCount = plan.filter(
        (group) => group.choice === 'download',
    ).length;

    return (
        <div className="flex w-full items-center justify-between gap-4">
            <button
                type="button"
                className="btn btn-ghost"
                onClick={onFinishWithoutRemaining}
            >
                {t('addProject.remote.editorBatch.finishWithoutRemaining')}
            </button>
            <button
                ref={applyButtonRef}
                type="button"
                data-testid="btnApplyRemoteProjectEditorPlan"
                className="btn btn-primary"
                onClick={onApply}
            >
                {t('addProject.remote.editorBatch.apply', {
                    projects: projectCount,
                    editors: downloadCount,
                })}
            </button>
        </div>
    );
}
