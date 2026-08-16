import type { GitIdentityScope } from '@shared/contracts';
import { TriangleAlert } from 'lucide-react';
import type React from 'react';
import { Dialog } from '../../../../components/dialog.component';
import { TextField } from '../../../../components/ui/textField.component';

export type GitIdentityDialogPage = 'warning' | 'preset' | 'identity';

type Translate = (key: string) => string;

type CreateProjectGitIdentityDialogProps = {
    page: GitIdentityDialogPage;
    name: string;
    email: string;
    scope: GitIdentityScope;
    showValidation: boolean;
    globalIdentityComplete: boolean;
    t: Translate;
    onNameChange: (name: string) => void;
    onEmailChange: (email: string) => void;
    onScopeChange: (scope: GitIdentityScope) => void;
    onSkip: () => void;
    onAddIdentity: () => void;
    onUseGlobal: () => void;
    onUseDifferentIdentity: () => void;
    onBack: () => void;
    onSave: () => void;
};

/**
 * Renders the missing Git identity warning or identity form.
 *
 * @param props - Controlled dialog state and action callbacks.
 * @returns The active Git identity dialog page.
 */
export const CreateProjectGitIdentityDialog: React.FC<
    CreateProjectGitIdentityDialogProps
> = ({
    page,
    name,
    email,
    scope,
    showValidation,
    globalIdentityComplete,
    t,
    onNameChange,
    onEmailChange,
    onScopeChange,
    onSkip,
    onAddIdentity,
    onUseGlobal,
    onUseDifferentIdentity,
    onBack,
    onSave,
}) => {
    if (page === 'warning') {
        return (
            <Dialog
                icon={<TriangleAlert className="text-warning" />}
                title={t('gitIdentity.warningTitle')}
                footer={
                    <>
                        <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={onSkip}
                        >
                            {t('gitIdentity.skipCommit')}
                        </button>
                        <button
                            type="button"
                            className="btn btn-primary"
                            onClick={onAddIdentity}
                        >
                            {t('gitIdentity.addIdentity')}
                        </button>
                    </>
                }
            >
                <p>{t('gitIdentity.warningMessage')}</p>
            </Dialog>
        );
    }

    const nameMissing = name.trim().length === 0;
    const emailMissing = email.trim().length === 0;
    const presetPage = page === 'preset';

    return (
        <Dialog
            title={t(
                presetPage
                    ? 'gitIdentity.presetTitle'
                    : 'gitIdentity.formTitle',
            )}
            footer={
                presetPage ? (
                    <>
                        {!globalIdentityComplete && (
                            <button
                                type="button"
                                className="btn btn-ghost"
                                onClick={onSkip}
                            >
                                {t('gitIdentity.skipCommit')}
                            </button>
                        )}
                        <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={
                                globalIdentityComplete
                                    ? onUseGlobal
                                    : onUseDifferentIdentity
                            }
                        >
                            {t(
                                globalIdentityComplete
                                    ? 'gitIdentity.useGlobal'
                                    : 'gitIdentity.useDifferent',
                            )}
                        </button>
                        <button
                            type="button"
                            className="btn btn-primary"
                            onClick={onSave}
                        >
                            {t('gitIdentity.usePresetAndCreate')}
                        </button>
                    </>
                ) : (
                    <>
                        <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={onBack}
                        >
                            {t('gitIdentity.back')}
                        </button>
                        <button
                            type="button"
                            className="btn btn-primary"
                            onClick={onSave}
                        >
                            {t('gitIdentity.saveAndCreate')}
                        </button>
                    </>
                )
            }
        >
            <div className="flex flex-col gap-4">
                <p>
                    {t(
                        presetPage
                            ? 'gitIdentity.presetMessage'
                            : 'gitIdentity.formMessage',
                    )}
                </p>
                <TextField
                    id="createProjectGitName"
                    label={t('gitIdentity.name')}
                    help={t('gitIdentity.nameHelp')}
                    value={name}
                    onChange={onNameChange}
                    error={
                        showValidation && nameMissing
                            ? t('gitIdentity.nameRequired')
                            : undefined
                    }
                />
                <TextField
                    id="createProjectGitEmail"
                    label={t('gitIdentity.email')}
                    help={t('gitIdentity.emailHelp')}
                    value={email}
                    onChange={onEmailChange}
                    error={
                        showValidation && emailMissing
                            ? t('gitIdentity.emailRequired')
                            : undefined
                    }
                />
                {!presetPage && (
                    <fieldset className="flex flex-col gap-2">
                        <legend className="font-medium">
                            {t('gitIdentity.scope')}
                        </legend>
                        <label className="flex items-center gap-2">
                            <input
                                type="radio"
                                className="radio radio-primary radio-sm"
                                name="createProjectGitIdentityScope"
                                checked={scope === 'repository'}
                                onChange={() => onScopeChange('repository')}
                            />
                            <span>{t('gitIdentity.repositoryScope')}</span>
                        </label>
                        <label className="flex items-center gap-2">
                            <input
                                type="radio"
                                className="radio radio-primary radio-sm"
                                name="createProjectGitIdentityScope"
                                checked={scope === 'global'}
                                onChange={() => onScopeChange('global')}
                            />
                            <span>{t('gitIdentity.globalScope')}</span>
                        </label>
                    </fieldset>
                )}
            </div>
        </Dialog>
    );
};
