import type { CustomEngineManifestPlatformName } from '@shared/contracts';
import { CircleX } from 'lucide-react';
import type React from 'react';
import { HelpTooltip } from '../../../../components/ui/help-tooltip.component';
import { PathField } from '../../../../components/ui/path-field.component';
import { TextField } from '../../../../components/ui/text-field.component';
import { Tooltip } from '../../../../components/ui/tooltip.component';
import { getFieldError } from '../custom-editor-manifest.messages';
import type {
    CustomEditorManifestField,
    CustomEditorManifestFormState,
    CustomEditorManifestPlatformFormState,
    CustomEditorManifestValidationErrors,
} from '../custom-editor-manifest.model';
import { manifestPlatformNames } from '../custom-editor-manifest.model';
import { PlatformSection } from './platform-section.component';

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

/**
 * Renders compact manifest fields and platform sections in the Settings style.
 * @param props - Form values, validation messages and field actions.
 */
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
        <div className="flex min-w-0 flex-col gap-[12px]">
            <PathField
                id="customEditorOutputDirectory"
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
                    label={t('customEditor.creator.fields.flavor.label')}
                    help={t('customEditor.creator.fields.flavor.help')}
                    error={getFieldError('flavor', errors, t)}
                    value={form.flavor}
                    onChange={(value) => onFieldChange('flavor', value)}
                    onBlur={() => onFieldBlur('flavor')}
                    placeholder="gdscript"
                />
                <label className="flex min-h-8 items-center self-end gap-2">
                    <input
                        type="checkbox"
                        className="checkbox checkbox-sm shrink-0"
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
                <h3 className="font-semibold">
                    {t('customEditor.creator.fields.platform.label')}
                </h3>
                {platformsError && (
                    <Tooltip
                        tip={platformsError}
                        placement="right"
                        tone="error"
                        className="text-error"
                        role="img"
                        ariaLabel={platformsError}
                    >
                        <CircleX size={16} aria-hidden="true" />
                    </Tooltip>
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
