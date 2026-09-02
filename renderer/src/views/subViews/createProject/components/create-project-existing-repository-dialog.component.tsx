import { CircleCheck, TriangleAlert } from 'lucide-react';
import { useRef } from 'react';
import { Dialog } from '../../../../components/dialog.component';

type Translate = (key: string, values?: Record<string, string>) => string;

export type ExistingRepositoryConsequences = {
    git: boolean;
    gitLfs: boolean;
    github: boolean;
};

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

    return (
        <Dialog
            title={t(
                completion
                    ? 'existingRepository.completionTitle'
                    : 'existingRepository.confirmationTitle',
            )}
            icon={
                completion ? (
                    <CircleCheck className="text-success" aria-hidden="true" />
                ) : (
                    <TriangleAlert
                        className="text-warning"
                        aria-hidden="true"
                    />
                )
            }
            initialFocusRef={primaryActionRef}
            returnFocusRef={returnFocusRef}
            onRequestClose={completion ? undefined : onCancel}
            footer={
                completion ? (
                    <button
                        ref={primaryActionRef}
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={onDone}
                    >
                        {t('existingRepository.done')}
                    </button>
                ) : (
                    <>
                        <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={onCancel}
                        >
                            {t('common:buttons.cancel')}
                        </button>
                        <button
                            ref={primaryActionRef}
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={onContinue}
                        >
                            {t('common:buttons.continue')}
                        </button>
                    </>
                )
            }
        >
            <div className="flex flex-col gap-3">
                {completion && (
                    <p className="font-semibold text-base-content">
                        {t('existingRepository.completionLead')}
                    </p>
                )}
                <p className="break-words">
                    {t(
                        completion
                            ? 'existingRepository.completionMessage'
                            : 'existingRepository.warningMessage',
                        { root },
                    )}
                </p>
                <div className="flex flex-col gap-1">
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
                {!completion && (
                    <p className="font-medium text-base-content">
                        {t('existingRepository.question')}
                    </p>
                )}
            </div>
        </Dialog>
    );
};
