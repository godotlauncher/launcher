import { useRef } from 'react';
import { Dialog } from '../../../../components/dialog.component';
import { CopyButton } from '../../../../components/ui/copy-button.component';
import type { ExistingRepositoryConsequences } from '../create-project-workflow.types';

type Translate = (key: string, values?: Record<string, string>) => string;

export type { ExistingRepositoryConsequences } from '../create-project-workflow.types';

type CreateProjectExistingRepositoryDialogProps = {
    mode: 'confirmation' | 'completion';
    root: string;
    consequences: ExistingRepositoryConsequences;
    t: Translate;
    returnFocusRef: React.RefObject<HTMLElement | null>;
    onCancel: () => void;
    onContinue: () => void;
    onDone: () => void;
};

/**
 * Confirms or reports Create Project work inside an existing parent repository.
 *
 * @param props - Dialog mode, repository details, skipped work, and actions.
 * @returns The parent-repository confirmation or completion dialog.
 */
export const CreateProjectExistingRepositoryDialog: React.FC<
    CreateProjectExistingRepositoryDialogProps
> = ({
    mode,
    root,
    consequences,
    t,
    returnFocusRef,
    onCancel,
    onContinue,
    onDone,
}) => {
    const primaryActionRef = useRef<HTMLButtonElement>(null);
    const completion = mode === 'completion';
    const pathMarker = '{{repositoryPath}}';
    const [messageBefore, messageAfter = ''] = t(
        completion
            ? 'existingRepository.completionMessage'
            : 'existingRepository.warningMessage',
        { root: pathMarker },
    ).split(pathMarker);

    return (
        <Dialog
            title={t(
                completion
                    ? 'existingRepository.completionTitle'
                    : 'existingRepository.confirmationTitle',
            )}
            tone={completion ? 'success' : 'warning'}
            initialFocusRef={primaryActionRef}
            returnFocusRef={returnFocusRef}
            onRequestClose={completion ? undefined : onCancel}
            footer={
                completion ? (
                    <button
                        ref={primaryActionRef}
                        type="button"
                        className="btn btn-primary text-base"
                        onClick={onDone}
                    >
                        {t('existingRepository.done')}
                    </button>
                ) : (
                    <>
                        <button
                            ref={primaryActionRef}
                            type="button"
                            className="btn btn-ghost text-base"
                            onClick={onCancel}
                        >
                            {t('common:buttons.cancel')}
                        </button>
                        <button
                            type="button"
                            className="btn btn-primary text-base"
                            onClick={onContinue}
                        >
                            {t('common:buttons.continue')}
                        </button>
                    </>
                )
            }
        >
            <div className="flex flex-col gap-4 text-base">
                {completion && (
                    <p className="font-semibold">
                        {t('existingRepository.completionLead')}
                    </p>
                )}
                <p className="text-base-content/75">{messageBefore.trim()}</p>
                <div className="flex items-center gap-2 rounded-box bg-base-200/60 p-3">
                    <span className="min-w-0 flex-1 select-none break-all font-mono text-sm text-base-content/75">
                        {root}
                    </span>
                    <div className="shrink-0">
                        <CopyButton value={root} />
                    </div>
                </div>
                {messageAfter.trim() &&
                    !/^[.!。]+$/.test(messageAfter.trim()) && (
                        <p className="text-base-content/75">
                            {messageAfter.trim()}
                        </p>
                    )}
                <div className="flex flex-col gap-2 text-base-content/75">
                    {consequences.git && (
                        <p>{t('existingRepository.gitSkipped')}</p>
                    )}
                    {consequences.gitLfs && (
                        <p>{t('existingRepository.gitLfsSkipped')}</p>
                    )}
                    {consequences.github && (
                        <p>{t('existingRepository.githubSkipped')}</p>
                    )}
                </div>
                {!completion && <p>{t('existingRepository.question')}</p>}
            </div>
        </Dialog>
    );
};
