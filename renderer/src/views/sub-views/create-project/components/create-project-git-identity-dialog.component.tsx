import type { GitIdentityScope } from '@shared/contracts';
import type React from 'react';
import type { RefObject } from 'react';
import { Dialog } from '../../../../components/dialog.component';
import { TextField } from '../../../../components/ui/text-field.component';
import type { CreateProjectGitIdentitySaveChoice } from '../create-project.model';
import type { GitIdentityDialogPage } from '../create-project-workflow.types';

export type { GitIdentityDialogPage } from '../create-project-workflow.types';

type Translate = (key: string) => string;

type CreateProjectGitIdentityDialogProps = {
    page: GitIdentityDialogPage;
    name: string;
    email: string;
    scope: GitIdentityScope;
    showValidation: boolean;
    globalIdentityComplete: boolean;
    showDefaultChoices: boolean;
    saveChoice: CreateProjectGitIdentitySaveChoice;
    saving: boolean;
    saveError: string | null;
    allowSkip?: boolean;
    t: Translate;
    onNameChange: (name: string) => void;
    onEmailChange: (email: string) => void;
    onScopeChange: (scope: GitIdentityScope) => void;
    onSaveChoiceChange: (choice: CreateProjectGitIdentitySaveChoice) => void;
    onSkip: () => void;
    onAddIdentity: () => void;
    onUseGlobal: () => void;
    onUseDifferentIdentity: () => void;
    onBack: () => void;
    onSave: () => void;
    onRequestClose: () => void;
    returnFocusRef: RefObject<HTMLElement | null>;
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
    showDefaultChoices,
    saveChoice,
    saving,
    saveError,
    allowSkip = true,
    t,
    onNameChange,
    onEmailChange,
    onScopeChange,
    onSaveChoiceChange,
    onSkip,
    onAddIdentity,
    onUseGlobal,
    onUseDifferentIdentity,
    onBack,
    onSave,
    onRequestClose,
    returnFocusRef,
}) => {
    if (page === 'warning') {
        return (
            <Dialog
                tone="warning"
                title={t('gitIdentity.warningTitle')}
                onRequestClose={onRequestClose}
                returnFocusRef={returnFocusRef}
                footer={
                    <>
                        <button
                            type="button"
                            className="btn btn-ghost text-base mr-auto"
                            onClick={onRequestClose}
                        >
                            {t('common:buttons.cancel')}
                        </button>
                        {allowSkip && (
                            <button
                                type="button"
                                className="btn btn-ghost text-base"
                                onClick={onSkip}
                            >
                                {t('gitIdentity.skipCommit')}
                            </button>
                        )}
                        <button
                            type="button"
                            className="btn btn-primary text-base"
                            onClick={onAddIdentity}
                        >
                            {t('gitIdentity.addIdentity')}
                        </button>
                    </>
                }
            >
                <p className="text-base-content/75">
                    {t('gitIdentity.warningMessage')}
                </p>
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
            onRequestClose={saving ? undefined : onRequestClose}
            returnFocusRef={returnFocusRef}
            footer={
                presetPage ? (
                    <>
                        <button
                            type="button"
                            className="btn btn-ghost text-base mr-auto"
                            onClick={onRequestClose}
                            disabled={saving}
                        >
                            {t('common:buttons.cancel')}
                        </button>
                        {!globalIdentityComplete && allowSkip && (
                            <button
                                type="button"
                                className="btn btn-ghost text-base"
                                onClick={onSkip}
                            >
                                {t('gitIdentity.skipCommit')}
                            </button>
                        )}
                        <button
                            type="button"
                            className="btn btn-ghost text-base"
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
                            className="btn btn-primary text-base"
                            onClick={onSave}
                        >
                            {t('gitIdentity.usePresetAndCreate')}
                        </button>
                    </>
                ) : (
                    <>
                        <button
                            type="button"
                            className="btn btn-ghost text-base"
                            onClick={onBack}
                            disabled={saving}
                        >
                            {t('gitIdentity.back')}
                        </button>
                        <button
                            type="button"
                            className="btn btn-primary text-base"
                            onClick={onSave}
                            disabled={saving}
                        >
                            {saving && (
                                <span className="loading loading-spinner loading-xs" />
                            )}
                            {t('gitIdentity.saveAndCreate')}
                        </button>
                    </>
                )
            }
        >
            <div className="flex flex-col gap-4">
                <p className="text-base-content/75">
                    {t(
                        presetPage
                            ? 'gitIdentity.presetMessage'
                            : 'gitIdentity.formMessage',
                    )}
                </p>
                {saveError && (
                    <p
                        className="alert alert-error alert-soft text-base text-error-content dark:text-error"
                        role="alert"
                    >
                        {saveError}
                    </p>
                )}
                <TextField
                    id="createProjectGitName"
                    label={t('gitIdentity.name')}
                    help={t('gitIdentity.nameHelp')}
                    value={name}
                    onChange={onNameChange}
                    disabled={saving}
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
                    disabled={saving}
                    error={
                        showValidation && emailMissing
                            ? t('gitIdentity.emailRequired')
                            : undefined
                    }
                />
                {!presetPage && showDefaultChoices && (
                    <fieldset className="flex flex-col gap-2">
                        <legend className="mb-2 text-base font-semibold">
                            {t('gitIdentity.defaultChoice')}
                        </legend>
                        {(
                            [
                                ['ask', 'gitIdentity.alwaysAsk'],
                                ['local-default', 'gitIdentity.localDefault'],
                                ['global-default', 'gitIdentity.globalDefault'],
                            ] as const
                        ).map(([choice, labelKey]) => (
                            <label
                                key={choice}
                                className="flex items-center gap-2"
                            >
                                <input
                                    type="radio"
                                    className="radio radio-sm shrink-0"
                                    name="createProjectGitIdentitySaveChoice"
                                    checked={saveChoice === choice}
                                    onChange={() => onSaveChoiceChange(choice)}
                                    disabled={saving}
                                />
                                <span>{t(labelKey)}</span>
                            </label>
                        ))}
                    </fieldset>
                )}
                {!presetPage && !showDefaultChoices && (
                    <fieldset className="flex flex-col gap-2">
                        <legend className="mb-2 text-base font-semibold">
                            {t('gitIdentity.scope')}
                        </legend>
                        <label className="flex items-center gap-2">
                            <input
                                type="radio"
                                className="radio radio-sm shrink-0"
                                name="createProjectGitIdentityScope"
                                checked={scope === 'repository'}
                                onChange={() => onScopeChange('repository')}
                                disabled={saving}
                            />
                            <span>{t('gitIdentity.repositoryScope')}</span>
                        </label>
                        <label className="flex items-center gap-2">
                            <input
                                type="radio"
                                className="radio radio-sm shrink-0"
                                name="createProjectGitIdentityScope"
                                checked={scope === 'global'}
                                onChange={() => onScopeChange('global')}
                                disabled={saving}
                            />
                            <span>{t('gitIdentity.globalScope')}</span>
                        </label>
                    </fieldset>
                )}
            </div>
        </Dialog>
    );
};
