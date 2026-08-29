import type {
    GitIdentityScope,
    ProjectGitIdentityPreset,
} from '@shared/contracts';
import type React from 'react';
import type { RefObject } from 'react';
import { TextField } from '../../../components/ui/textField.component';
import type { GitIdentitySaveChoice } from '../../../git-identity.model';

export type RemoteProjectGitIdentityPage = 'warning' | 'preset' | 'identity';

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
 * @returns The active identity warning, preset, or form section.
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
    globalIdentityComplete,
    showValidation,
    saving,
    primaryActionRef,
    t,
    onNameChange,
    onEmailChange,
    onScopeChange,
    onSaveChoiceChange,
    onContinueWithoutIdentity,
    onAddIdentity,
    onUseGlobal,
    onUseDifferentIdentity,
    onUsePreset,
    onBack,
    onSave,
}) => {
    if (page === 'warning') {
        return (
            <div className="flex flex-col gap-4">
                <div>
                    <p className="font-medium">
                        {t('addProject.remote.gitIdentity.title')}
                    </p>
                    <p className="text-sm text-base-content/70">
                        {t('addProject.remote.gitIdentity.message')}
                    </p>
                </div>
                <div className="flex justify-end gap-2">
                    <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={onContinueWithoutIdentity}
                    >
                        {t('addProject.remote.gitIdentity.continueWithout')}
                    </button>
                    <button
                        type="button"
                        className="btn btn-primary"
                        ref={primaryActionRef}
                        onClick={onAddIdentity}
                    >
                        {t('createProject:gitIdentity.addIdentity')}
                    </button>
                </div>
            </div>
        );
    }

    if (page === 'preset' && preset) {
        return (
            <div className="flex flex-col gap-4">
                <div>
                    <p className="font-medium">
                        {t('createProject:gitIdentity.presetTitle')}
                    </p>
                    <p className="text-sm text-base-content/70">
                        {t('addProject.remote.gitIdentity.presetMessage')}
                    </p>
                </div>
                <dl className="grid gap-2 rounded-box bg-base-200 p-4">
                    <div>
                        <dt className="text-xs text-base-content/60">
                            {t('createProject:gitIdentity.name')}
                        </dt>
                        <dd>{preset.name}</dd>
                    </div>
                    <div>
                        <dt className="text-xs text-base-content/60">
                            {t('createProject:gitIdentity.email')}
                        </dt>
                        <dd>{preset.email}</dd>
                    </div>
                </dl>
                <div className="flex flex-wrap justify-end gap-2">
                    {!globalIdentityComplete && (
                        <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={onContinueWithoutIdentity}
                        >
                            {t('addProject.remote.gitIdentity.continueWithout')}
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
                                ? 'createProject:gitIdentity.useGlobal'
                                : 'createProject:gitIdentity.useDifferent',
                        )}
                    </button>
                    <button
                        type="button"
                        className="btn btn-primary"
                        disabled={saving}
                        ref={primaryActionRef}
                        onClick={onUsePreset}
                    >
                        {saving && (
                            <span className="loading loading-spinner loading-xs" />
                        )}
                        {t('addProject.remote.gitIdentity.usePreset')}
                    </button>
                </div>
            </div>
        );
    }

    const nameMissing = name.trim().length === 0;
    const emailMissing = email.trim().length === 0;
    const showDefaultChoices = !preset;

    return (
        <div className="flex flex-col gap-4">
            <div>
                <p className="font-medium">
                    {t('createProject:gitIdentity.formTitle')}
                </p>
                <p className="text-sm text-base-content/70">
                    {t('addProject.remote.gitIdentity.formMessage')}
                </p>
            </div>
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
            {showDefaultChoices ? (
                <fieldset className="flex flex-col gap-2">
                    <legend className="font-medium">
                        {t('createProject:gitIdentity.defaultChoice')}
                    </legend>
                    {(
                        [
                            ['ask', 'alwaysAsk'],
                            ['local-default', 'localDefault'],
                            ['global-default', 'globalDefault'],
                        ] as const
                    ).map(([choice, key]) => (
                        <label key={choice} className="flex items-center gap-2">
                            <input
                                type="radio"
                                className="radio radio-primary radio-sm"
                                name="remoteProjectGitIdentitySaveChoice"
                                checked={saveChoice === choice}
                                onChange={() => onSaveChoiceChange(choice)}
                                disabled={saving}
                            />
                            <span>{t(`createProject:gitIdentity.${key}`)}</span>
                        </label>
                    ))}
                </fieldset>
            ) : (
                <fieldset className="flex flex-col gap-2">
                    <legend className="font-medium">
                        {t('createProject:gitIdentity.scope')}
                    </legend>
                    <label className="flex items-center gap-2">
                        <input
                            type="radio"
                            className="radio radio-primary radio-sm"
                            name="remoteProjectGitIdentityScope"
                            checked={scope === 'repository'}
                            onChange={() => onScopeChange('repository')}
                            disabled={saving}
                        />
                        <span>
                            {t('createProject:gitIdentity.repositoryScope')}
                        </span>
                    </label>
                    <label className="flex items-center gap-2">
                        <input
                            type="radio"
                            className="radio radio-primary radio-sm"
                            name="remoteProjectGitIdentityScope"
                            checked={scope === 'global'}
                            onChange={() => onScopeChange('global')}
                            disabled={saving}
                        />
                        <span>
                            {t('createProject:gitIdentity.globalScope')}
                        </span>
                    </label>
                </fieldset>
            )}
            <div className="flex justify-end gap-2">
                <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={saving}
                    onClick={onBack}
                >
                    {t('createProject:gitIdentity.back')}
                </button>
                <button
                    type="button"
                    className="btn btn-primary"
                    disabled={saving}
                    ref={primaryActionRef}
                    onClick={onSave}
                >
                    {saving && (
                        <span className="loading loading-spinner loading-xs" />
                    )}
                    {t('addProject.remote.gitIdentity.saveAndContinue')}
                </button>
            </div>
        </div>
    );
};
