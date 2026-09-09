import type {
    CustomEngineManifestArch,
    CustomEngineManifestPlatformName,
} from '@shared/contracts';
import clsx from 'clsx';
import { ChevronDown, RotateCcw } from 'lucide-react';
import type React from 'react';
import { PathField } from '../../../../components/ui/path-field.component';
import { SelectField } from '../../../../components/ui/select-field.component';
import { Tooltip } from '../../../../components/ui/tooltip.component';
import { getFieldError } from '../custom-editor-manifest.messages';
import type {
    CustomEditorManifestPlatformFormState,
    CustomEditorManifestValidationErrors,
} from '../custom-editor-manifest.model';

type Translate = (key: string) => string;

type PlatformSectionProps = {
    platform: CustomEngineManifestPlatformName;
    platformForm: CustomEditorManifestPlatformFormState;
    errors: CustomEditorManifestValidationErrors;
    t: Translate;
    onChange: <Field extends keyof CustomEditorManifestPlatformFormState>(
        platform: CustomEngineManifestPlatformName,
        field: Field,
        value: CustomEditorManifestPlatformFormState[Field],
    ) => void;
    onBlur: (
        platform: CustomEngineManifestPlatformName,
        field: 'editorPath' | 'consolePath',
    ) => void;
    onClear: (platform: CustomEngineManifestPlatformName) => void;
    onSelectPath: (
        field: 'editorPath' | 'consolePath',
        titleKey: string,
    ) => void;
};

/**
 * Renders an expandable platform section with compact fields.
 * @param props - Platform values, validation and editing actions.
 */
export const PlatformSection: React.FC<PlatformSectionProps> = ({
    platform,
    platformForm,
    errors,
    t,
    onChange,
    onBlur,
    onClear,
    onSelectPath,
}) => {
    const platformLabel = t(`customEditor.creator.platforms.${platform}`);
    const editorPathError = getFieldError(
        `platforms.${platform}.editorPath`,
        errors,
        t,
    );
    const consolePathError = getFieldError(
        `platforms.${platform}.consolePath`,
        errors,
        t,
    );
    const isIncludedInJson = platformForm.editorPath.trim().length > 0;
    const clearPlatformLabel = t('customEditor.creator.actions.clearPlatform');

    return (
        <section className="rounded-box bg-base-200/40">
            <div className="flex items-center gap-1 px-3 py-2">
                <button
                    type="button"
                    className="flex min-h-8 min-w-0 flex-1 items-center justify-between gap-2 text-left font-semibold"
                    aria-expanded={platformForm.expanded}
                    aria-controls={`customEditor${platform}Fields`}
                    onClick={() =>
                        onChange(platform, 'expanded', !platformForm.expanded)
                    }
                >
                    <span className="truncate">{platformLabel}</span>
                    <ChevronDown
                        size={16}
                        aria-hidden="true"
                        className={clsx('shrink-0 transition-transform', {
                            'rotate-180': platformForm.expanded,
                        })}
                    />
                </button>
                {platformForm.expanded && isIncludedInJson && (
                    <Tooltip tip={clearPlatformLabel} placement="right">
                        <button
                            type="button"
                            className="btn btn-sm btn-ghost btn-square"
                            aria-label={`${clearPlatformLabel}: ${platformLabel}`}
                            onClick={() => onClear(platform)}
                        >
                            <RotateCcw size={16} aria-hidden="true" />
                        </button>
                    </Tooltip>
                )}
            </div>
            {platformForm.expanded && (
                <div
                    id={`customEditor${platform}Fields`}
                    className="flex flex-col gap-[12px] p-3"
                >
                    <SelectField
                        size="sm"
                        id={`customEditor${platform}Arch`}
                        label={t('customEditor.creator.fields.arch.label')}
                        help={t('customEditor.creator.fields.arch.help')}
                        value={platformForm.arch}
                        onChange={(value) =>
                            onChange(
                                platform,
                                'arch',
                                value as CustomEngineManifestArch,
                            )
                        }
                        options={[
                            {
                                value: 'universal',
                                label: t(
                                    'customEditor.creator.architectures.universal',
                                ),
                            },
                            {
                                value: 'x64',
                                label: t(
                                    'customEditor.creator.architectures.x64',
                                ),
                            },
                            {
                                value: 'arm64',
                                label: t(
                                    'customEditor.creator.architectures.arm64',
                                ),
                            },
                        ]}
                    />
                    <PathField
                        id={`customEditor${platform}EditorPath`}
                        browseKind="file"
                        label={t(
                            'customEditor.creator.fields.editorPath.label',
                        )}
                        help={t('customEditor.creator.fields.editorPath.help')}
                        error={editorPathError}
                        value={platformForm.editorPath}
                        onChange={(value) =>
                            onChange(platform, 'editorPath', value)
                        }
                        onBlur={() => onBlur(platform, 'editorPath')}
                        onSelect={() =>
                            onSelectPath(
                                'editorPath',
                                'customEditor.creator.actions.selectEditorPath',
                            )
                        }
                    />
                    {platform === 'windows' && (
                        <PathField
                            id={`customEditor${platform}ConsolePath`}
                            browseKind="file"
                            label={t(
                                'customEditor.creator.fields.consolePath.label',
                            )}
                            help={t(
                                'customEditor.creator.fields.consolePath.help',
                            )}
                            error={consolePathError}
                            value={platformForm.consolePath}
                            onChange={(value) =>
                                onChange(platform, 'consolePath', value)
                            }
                            onBlur={() => onBlur(platform, 'consolePath')}
                            onSelect={() =>
                                onSelectPath(
                                    'consolePath',
                                    'customEditor.creator.actions.selectConsolePath',
                                )
                            }
                        />
                    )}
                </div>
            )}
        </section>
    );
};
