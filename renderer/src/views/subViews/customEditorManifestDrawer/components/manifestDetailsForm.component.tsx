import type { CustomEngineManifestPlatformName } from '@shared/contracts';
import { CircleX } from 'lucide-react';
import type React from 'react';
import { HelpTooltip } from '../../../../components/ui/helpTooltip.component';
import { PathField } from '../../../../components/ui/pathField.component';
import { TextField } from '../../../../components/ui/textField.component';
import { getFieldError } from '../customEditorManifest.messages';
import type {
    CustomEditorManifestField,
    CustomEditorManifestFormState,
    CustomEditorManifestPlatformFormState,
    CustomEditorManifestValidationErrors,
} from '../customEditorManifest.model';
import { manifestPlatformNames } from '../customEditorManifest.model';
import { PlatformSection } from './platformSection.component';

type Translate = (key: string) => string;

type ManifestDetailsFormProps = {
    form: CustomEditorManifestFormState;
    errors: CustomEditorManifestValidationErrors;
    t: Translate;
    onFieldChange: <Field extends CustomEditorManifestField>(
        field: Field,
        value: CustomEditorManifestFormState[Field],
    ) => void;
    onPlatformFieldChange: <
        Field extends keyof CustomEditorManifestPlatformFormState,
    >(
        platform: CustomEngineManifestPlatformName,
        field: Field,
        value: CustomEditorManifestPlatformFormState[Field],
    ) => void;
    onFieldBlur: (field: string) => void;
    onPlatformFieldBlur: (
        platform: CustomEngineManifestPlatformName,
        field: 'editorPath' | 'consolePath',
    ) => void;
    onClearPlatform: (platform: CustomEngineManifestPlatformName) => void;
    onSelectOutputDirectory: () => void;
    onSelectPath: (
        platform: CustomEngineManifestPlatformName,
        field: 'editorPath' | 'consolePath',
        titleKey: string,
    ) => void;
};

export const ManifestDetailsForm: React.FC<ManifestDetailsFormProps> = ({
    form,
    errors,
    t,
    onFieldChange,
    onPlatformFieldChange,
    onFieldBlur,
    onPlatformFieldBlur,
    onClearPlatform,
    onSelectOutputDirectory,
    onSelectPath,
}) => {
    const platformsError = getFieldError('platforms', errors, t);

    return (
        <div className="flex min-w-0 flex-col gap-3">
            <PathField
                id="customEditorOutputDirectory"
                compact
                browseKind="directory"
                browseLabel={t(
                    'customEditor.creator.actions.selectOutputDirectory',
                )}
                label={t('customEditor.creator.fields.outputDirectory.label')}
                help={t('customEditor.creator.fields.outputDirectory.help')}
                error={getFieldError('outputDirectory', errors, t)}
                value={form.outputDirectory}
                onChange={(value) => onFieldChange('outputDirectory', value)}
                onBlur={() => onFieldBlur('outputDirectory')}
                onSelect={onSelectOutputDirectory}
            />
            <TextField
                id="customEditorName"
                compact
                label={t('customEditor.creator.fields.name.label')}
                help={t('customEditor.creator.fields.name.help')}
                error={getFieldError('name', errors, t)}
                value={form.name}
                onChange={(value) => onFieldChange('name', value)}
                onBlur={() => onFieldBlur('name')}
                placeholder={t('customEditor.creator.fields.name.placeholder')}
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <TextField
                    id="customEditorFlavor"
                    compact
                    label={t('customEditor.creator.fields.flavor.label')}
                    help={t('customEditor.creator.fields.flavor.help')}
                    error={getFieldError('flavor', errors, t)}
                    value={form.flavor}
                    onChange={(value) => onFieldChange('flavor', value)}
                    onBlur={() => onFieldBlur('flavor')}
                    placeholder="gdscript"
                />
                <label className="flex items-center gap-2 pt-5 text-sm">
                    <input
                        type="checkbox"
                        className="checkbox checkbox-sm"
                        checked={form.prerelease}
                        onChange={(event) =>
                            onFieldChange('prerelease', event.target.checked)
                        }
                    />
                    <span className="flex items-center gap-1.5">
                        {t('customEditor.creator.fields.prerelease.label')}
                        <HelpTooltip
                            help={t(
                                'customEditor.creator.fields.prerelease.help',
                            )}
                        />
                    </span>
                </label>
                <TextField
                    id="customEditorVersion"
                    compact
                    label={t('customEditor.creator.fields.version.label')}
                    help={t('customEditor.creator.fields.version.help')}
                    error={getFieldError('version', errors, t)}
                    value={form.version}
                    onChange={(value) => onFieldChange('version', value)}
                    onBlur={() => onFieldBlur('version')}
                    placeholder={t(
                        'customEditor.creator.fields.version.placeholder',
                    )}
                />
                <TextField
                    id="customEditorBaseVersion"
                    compact
                    label={t('customEditor.creator.fields.baseVersion.label')}
                    help={t('customEditor.creator.fields.baseVersion.help')}
                    error={getFieldError('baseVersion', errors, t)}
                    value={form.baseVersion}
                    onChange={(value) => onFieldChange('baseVersion', value)}
                    onBlur={() => onFieldBlur('baseVersion')}
                    placeholder={t(
                        'customEditor.creator.fields.baseVersion.placeholder',
                    )}
                />
            </div>
            <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase text-base-content/60">
                    {t('customEditor.creator.fields.platform.label')}
                </span>
                {platformsError && (
                    <span
                        className="tooltip tooltip-right tooltip-error relative z-20 text-error hover:z-50 focus-within:z-50"
                        data-tip={platformsError}
                        role="img"
                        aria-label={platformsError}
                    >
                        <CircleX size={15} aria-hidden="true" />
                    </span>
                )}
            </div>
            <div className="flex flex-col gap-2">
                {manifestPlatformNames.map((platform) => (
                    <PlatformSection
                        key={platform}
                        platform={platform}
                        platformForm={form.platforms[platform]}
                        errors={errors}
                        t={t}
                        onChange={onPlatformFieldChange}
                        onBlur={onPlatformFieldBlur}
                        onClear={onClearPlatform}
                        onSelectPath={(field, titleKey) =>
                            onSelectPath(platform, field, titleKey)
                        }
                    />
                ))}
            </div>
        </div>
    );
};
