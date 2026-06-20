import type {
    CustomEngineManifestArch,
    CustomEngineManifestPlatformName,
} from '@shared';
import clsx from 'clsx';
import { ChevronDown, RotateCcw } from 'lucide-react';
import type React from 'react';
import { PathField } from '../../../../components/ui/pathField.component';
import { SelectField } from '../../../../components/ui/selectField.component';
import { getFieldError } from '../customEditorManifest.messages';
import type {
    CustomEditorManifestPlatformFormState,
    CustomEditorManifestValidationErrors,
} from '../customEditorManifest.model';

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

    return (
        <section className="rounded-box border border-base-300 bg-base-100">
            <div className="flex items-center gap-1 px-3 py-2">
                <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left"
                    onClick={() =>
                        onChange(platform, 'expanded', !platformForm.expanded)
                    }
                >
                    <span className="truncate text-sm font-bold">
                        {platformLabel}
                    </span>
                    <ChevronDown
                        size={16}
                        aria-hidden="true"
                        className={clsx('shrink-0 transition-transform', {
                            'rotate-180': platformForm.expanded,
                        })}
                    />
                </button>
                {platformForm.expanded && isIncludedInJson && (
                    <span
                        className="tooltip tooltip-right relative z-20 hover:z-50 focus-within:z-50"
                        data-tip={t(
                            'customEditor.creator.actions.clearPlatform',
                        )}
                    >
                        <button
                            type="button"
                            className="btn btn-ghost btn-square btn-xs"
                            aria-label={`${t(
                                'customEditor.creator.actions.clearPlatform',
                            )}: ${platformLabel}`}
                            onClick={() => onClear(platform)}
                        >
                            <RotateCcw size={14} aria-hidden="true" />
                        </button>
                    </span>
                )}
            </div>
            {platformForm.expanded && (
                <div className="flex flex-col gap-2 border-t border-base-300 p-3">
                    <SelectField
                        id={`customEditor${platform}Arch`}
                        compact
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
                            [
                                'universal',
                                t(
                                    'customEditor.creator.architectures.universal',
                                ),
                            ],
                            [
                                'x64',
                                t('customEditor.creator.architectures.x64'),
                            ],
                            [
                                'arm64',
                                t('customEditor.creator.architectures.arm64'),
                            ],
                        ]}
                    />
                    <PathField
                        id={`customEditor${platform}EditorPath`}
                        compact
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
                    <PathField
                        id={`customEditor${platform}ConsolePath`}
                        compact
                        browseKind="file"
                        label={t(
                            'customEditor.creator.fields.consolePath.label',
                        )}
                        help={t('customEditor.creator.fields.consolePath.help')}
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
                </div>
            )}
        </section>
    );
};
