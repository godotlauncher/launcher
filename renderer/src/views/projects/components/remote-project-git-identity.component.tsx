import type {
    GitIdentityScope,
    ProjectGitIdentityPreset,
} from '@shared/contracts';
import type React from 'react';
import type { RefObject } from 'react';
import { SelectField } from '../../../components/ui/select-field.component';
import { TextField } from '../../../components/ui/text-field.component';
import type { GitIdentitySaveChoice } from '../../../git-identity.model';

export type RemoteProjectGitIdentityPage = 'preset' | 'identity';

type RemoteProjectGitIdentityProps = {
    page: RemoteProjectGitIdentityPage;
    name: string;
    email: string;
    scope: GitIdentityScope;
    saveChoice: GitIdentitySaveChoice;
    preset: ProjectGitIdentityPreset | null;
    globalIdentityComplete: boolean;
    showValidation: boolean;
    saving: boolean;
    primaryActionRef: RefObject<HTMLButtonElement | null>;
    t: (key: string) => string;
    onNameChange: (name: string) => void;
    onEmailChange: (email: string) => void;
    onScopeChange: (scope: GitIdentityScope) => void;
    onSaveChoiceChange: (choice: GitIdentitySaveChoice) => void;
    onContinueWithoutIdentity: () => void;
    onAddIdentity: () => void;
    onUseGlobal: () => void;
    onUseDifferentIdentity: () => void;
    onUsePreset: () => void;
    onBack: () => void;
    onSave: () => void;
};

/**
 * Renders the post-clone Git identity step inside remote project import.
 *
 * @param props - Controlled identity state and workflow callbacks.
 * @returns The saved identity suggestion or editable form.
 */
export const RemoteProjectGitIdentity: React.FC<
    RemoteProjectGitIdentityProps
> = ({
    page,
    name,
    email,
    scope,
    saveChoice,
    preset,
    showValidation,
    saving,
    t,
    onNameChange,
    onEmailChange,
    onScopeChange,
    onSaveChoiceChange,
}) => {
    if (page === 'preset' && preset) {
        return (
            <div className="flex w-full max-w-2xl flex-col gap-4">
                <div className="flex flex-col gap-1">
                    <h2 className="text-base font-semibold">
                        {t('createProject:gitIdentity.presetTitle')}
                    </h2>
                    <p className="text-base text-base-content/75">
                        {t('addProject.remote.gitIdentity.presetMessage')}
                    </p>
                </div>
                <dl className="grid gap-3 rounded-box bg-base-200/60 p-3">
                    <div>
                        <dt className="text-sm text-base-content/60">
                            {t('createProject:gitIdentity.name')}
                        </dt>
                        <dd className="break-words">{preset.name}</dd>
                    </div>
                    <div>
                        <dt className="text-sm text-base-content/60">
                            {t('createProject:gitIdentity.email')}
                        </dt>
                        <dd className="break-all">{preset.email}</dd>
                    </div>
                </dl>
            </div>
        );
    }

    const nameMissing = name.trim().length === 0;
    const emailMissing = email.trim().length === 0;
    const showDefaultChoices = !preset;

    return (
        <div className="flex w-full max-w-2xl flex-col gap-4">
            <div className="flex flex-col gap-1">
                <h2 className="text-base font-semibold">
                    {t('createProject:gitIdentity.formTitle')}
                </h2>
                <p className="text-base text-base-content/75">
                    {t('addProject.remote.gitIdentity.formMessage')}
                </p>
            </div>
            <div className="flex flex-col gap-1">
                <TextField
                    id="remoteProjectGitName"
                    label={t('createProject:gitIdentity.name')}
                    help={t('createProject:gitIdentity.nameHelp')}
                    value={name}
                    onChange={onNameChange}
                    disabled={saving}
                    error={
                        showValidation && nameMissing
                            ? t('createProject:gitIdentity.nameRequired')
                            : undefined
                    }
                />
                {showValidation && nameMissing && (
                    <p
                        id="remoteProjectGitNameError"
                        role="alert"
                        className="text-base text-error"
                    >
                        {t('createProject:gitIdentity.nameRequired')}
                    </p>
                )}
            </div>
            <div className="flex flex-col gap-1">
                <TextField
                    id="remoteProjectGitEmail"
                    label={t('createProject:gitIdentity.email')}
                    help={t('createProject:gitIdentity.emailHelp')}
                    value={email}
                    onChange={onEmailChange}
                    disabled={saving}
                    error={
                        showValidation && emailMissing
                            ? t('createProject:gitIdentity.emailRequired')
                            : undefined
                    }
                />
                {showValidation && emailMissing && (
                    <p
                        id="remoteProjectGitEmailError"
                        role="alert"
                        className="text-base text-error"
                    >
                        {t('createProject:gitIdentity.emailRequired')}
                    </p>
                )}
            </div>
            {showDefaultChoices ? (
                <SelectField
                    id="remoteProjectGitIdentitySaveChoice"
                    label={t('createProject:gitIdentity.defaultChoice')}
                    size="sm"
                    value={saveChoice}
                    disabled={saving}
                    onChange={(value) =>
                        onSaveChoiceChange(value as GitIdentitySaveChoice)
                    }
                    options={[
                        {
                            value: 'ask',
                            label: t('createProject:gitIdentity.alwaysAsk'),
                        },
                        {
                            value: 'local-default',
                            label: t('createProject:gitIdentity.localDefault'),
                        },
                        {
                            value: 'global-default',
                            label: t('createProject:gitIdentity.globalDefault'),
                        },
                    ]}
                />
            ) : (
                <SelectField
                    id="remoteProjectGitIdentityScope"
                    label={t('createProject:gitIdentity.scope')}
                    size="sm"
                    value={scope}
                    disabled={saving}
                    onChange={(value) =>
                        onScopeChange(value as GitIdentityScope)
                    }
                    options={[
                        {
                            value: 'repository',
                            label: t(
                                'createProject:gitIdentity.repositoryScope',
                            ),
                        },
                        {
                            value: 'global',
                            label: t('createProject:gitIdentity.globalScope'),
                        },
                    ]}
                />
            )}
        </div>
    );
};

type RemoteProjectGitIdentityFooterProps = Pick<
    RemoteProjectGitIdentityProps,
    | 'page'
    | 'preset'
    | 'saving'
    | 'globalIdentityComplete'
    | 'primaryActionRef'
    | 't'
    | 'onContinueWithoutIdentity'
    | 'onUseGlobal'
    | 'onUseDifferentIdentity'
    | 'onUsePreset'
    | 'onBack'
    | 'onSave'
> & { onCancel: () => void };

/**
 * Keeps identity navigation in the import dialog footer.
 * @param props - Current identity choice and action callbacks.
 */
export function RemoteProjectGitIdentityFooter({
    page,
    preset,
    saving,
    globalIdentityComplete,
    primaryActionRef,
    t,
    onContinueWithoutIdentity,
    onUseGlobal,
    onUseDifferentIdentity,
    onUsePreset,
    onBack,
    onSave,
    onCancel,
}: RemoteProjectGitIdentityFooterProps) {
    const suggestingPreset = page === 'preset' && preset !== null;
    return (
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
            <button
                type="button"
                className="btn btn-ghost text-base"
                disabled={saving}
                onClick={onCancel}
            >
                {t('addProject.remote.actions.cancelImport')}
            </button>
            <div className="flex flex-wrap items-center justify-end gap-2">
                {!suggestingPreset && preset && (
                    <button
                        type="button"
                        className="btn btn-ghost text-base"
                        disabled={saving}
                        onClick={onBack}
                    >
                        {t('createProject:gitIdentity.back')}
                    </button>
                )}
                {(!suggestingPreset || !globalIdentityComplete) && (
                    <button
                        type="button"
                        className="btn btn-ghost text-base"
                        disabled={saving}
                        onClick={onContinueWithoutIdentity}
                    >
                        {t('addProject.remote.gitIdentity.continueWithout')}
                    </button>
                )}
                {suggestingPreset && (
                    <button
                        type="button"
                        className="btn btn-ghost text-base"
                        disabled={saving}
                        onClick={
                            globalIdentityComplete
                                ? onUseGlobal
                                : onUseDifferentIdentity
                        }
                    >
                        {t(
                            globalIdentityComplete
                                ? 'createProject:gitIdentity.useGlobal'
                                : 'createProject:gitIdentity.useDifferent',
                        )}
                    </button>
                )}
                <button
                    type="button"
                    className="btn btn-primary text-base"
                    disabled={saving}
                    ref={primaryActionRef}
                    onClick={suggestingPreset ? onUsePreset : onSave}
                >
                    {saving && (
                        <span className="loading loading-spinner loading-xs" />
                    )}
                    {t(
                        suggestingPreset
                            ? 'addProject.remote.gitIdentity.usePreset'
                            : 'addProject.remote.gitIdentity.saveAndContinue',
                    )}
                </button>
            </div>
        </div>
    );
}
