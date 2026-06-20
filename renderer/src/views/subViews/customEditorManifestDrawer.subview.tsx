import type { CustomEngineManifestPlatformName } from '@shared';
import type React from 'react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Drawer } from '../../components/ui/drawer/drawer.component';
import { GeneratedManifestPreview } from './customEditorManifestDrawer/components/generatedManifestPreview.component';
import { ManifestDetailsForm } from './customEditorManifestDrawer/components/manifestDetailsForm.component';
import {
    getFirstValidationMessage,
    getPathMissingMessage,
} from './customEditorManifestDrawer/customEditorManifest.messages';
import type {
    CustomEditorManifestField,
    CustomEditorManifestFormState,
    CustomEditorManifestPlatformFormState,
    CustomEditorManifestValidationErrors,
} from './customEditorManifestDrawer/customEditorManifest.model';
import {
    buildCustomEngineManifest,
    createDefaultCustomEditorManifestFormState,
    createDefaultPlatformFormState,
    getIncludedPlatforms,
    nodePlatformToManifestPlatform,
    resolveExistingDialogDefaultPath,
    validateCustomEditorManifestField,
    validateCustomEditorManifestForm,
} from './customEditorManifestDrawer/customEditorManifest.model';

export type {
    CustomEditorManifestField,
    CustomEditorManifestFormState,
    CustomEditorManifestPlatformFormState,
    CustomEditorManifestValidationErrors,
    IncludedCustomEditorManifestPlatform,
} from './customEditorManifestDrawer/customEditorManifest.model';
export {
    buildCustomEngineManifest,
    CUSTOM_ENGINE_MANIFEST_SCHEMA_URL,
    createDefaultCustomEditorManifestFormState,
    createDefaultPlatformFormState,
    getIncludedPlatforms,
    manifestPlatformNames,
    nodePlatformToManifestPlatform,
    resolveExistingDialogDefaultPath,
    validateCustomEditorManifestField,
    validateCustomEditorManifestForm,
} from './customEditorManifestDrawer/customEditorManifest.model';

type CustomEditorManifestDrawerProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onManifestCreated: (manifestPath: string) => Promise<boolean>;
};

export const CustomEditorManifestDrawer: React.FC<
    CustomEditorManifestDrawerProps
> = ({ open, onOpenChange, onManifestCreated }) => {
    const { t } = useTranslation(['installs', 'common']);
    const [form, setForm] = useState<CustomEditorManifestFormState>(() =>
        createDefaultCustomEditorManifestFormState(),
    );
    const [errors, setErrors] = useState<CustomEditorManifestValidationErrors>(
        {},
    );
    const [formError, setFormError] = useState<string>();
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (!open) {
            return;
        }

        let disposed = false;
        setForm(createDefaultCustomEditorManifestFormState());
        setErrors({});
        setFormError(undefined);
        setIsSubmitting(false);

        void window.electron.getPlatform().then((platform) => {
            if (disposed) {
                return;
            }

            const manifestPlatform = nodePlatformToManifestPlatform(platform);

            setForm((currentForm) => ({
                ...currentForm,
                platforms: {
                    ...currentForm.platforms,
                    [manifestPlatform]: {
                        ...currentForm.platforms[manifestPlatform],
                        expanded: true,
                    },
                },
            }));
        });

        return () => {
            disposed = true;
        };
    }, [open]);

    const updateField = <Field extends CustomEditorManifestField>(
        field: Field,
        value: CustomEditorManifestFormState[Field],
    ) => {
        setForm((currentForm) => ({
            ...currentForm,
            [field]: value,
        }));
        setErrors((currentErrors) => {
            const { [field]: _fieldError, ...remainingErrors } = currentErrors;
            return remainingErrors;
        });
        setFormError(undefined);
    };

    const updatePlatformField = <
        Field extends keyof CustomEditorManifestPlatformFormState,
    >(
        platform: CustomEngineManifestPlatformName,
        field: Field,
        value: CustomEditorManifestPlatformFormState[Field],
    ) => {
        setForm((currentForm) => ({
            ...currentForm,
            platforms: {
                ...currentForm.platforms,
                [platform]: {
                    ...currentForm.platforms[platform],
                    [field]: value,
                },
            },
        }));
        setErrors((currentErrors) => {
            const {
                [`platforms.${platform}.${field}`]: _fieldError,
                platforms: _platformsError,
                ...remainingErrors
            } = currentErrors;
            return remainingErrors;
        });
        setFormError(undefined);
    };

    const clearPlatform = (platform: CustomEngineManifestPlatformName) => {
        setForm((currentForm) => ({
            ...currentForm,
            platforms: {
                ...currentForm.platforms,
                [platform]: {
                    ...createDefaultPlatformFormState()[platform],
                    expanded: true,
                },
            },
        }));
        setErrors((currentErrors) => {
            const {
                [`platforms.${platform}.editorPath`]: _editorPathError,
                [`platforms.${platform}.consolePath`]: _consolePathError,
                platforms: _platformsError,
                ...remainingErrors
            } = currentErrors;
            return remainingErrors;
        });
        setFormError(undefined);
    };

    const validateFieldOnBlur = (field: string) => {
        const error = validateCustomEditorManifestField(field, form);
        setErrors((currentErrors) => {
            if (error) {
                return {
                    ...currentErrors,
                    [field]: error,
                };
            }

            const { [field]: _fieldError, ...remainingErrors } = currentErrors;
            return remainingErrors;
        });
    };

    const validatePlatformFieldOnBlur = (
        platform: CustomEngineManifestPlatformName,
        field: 'editorPath' | 'consolePath',
    ) => {
        const fieldKey =
            field === 'consolePath'
                ? `platforms.${platform}.editorPath`
                : `platforms.${platform}.${field}`;
        const relatedEditorKey = `platforms.${platform}.editorPath`;
        const platformError = validateCustomEditorManifestField(
            'platforms',
            form,
        );
        const fieldError = validateCustomEditorManifestField(fieldKey, form);

        setErrors((currentErrors) => {
            const {
                [fieldKey]: _fieldError,
                [relatedEditorKey]: _relatedEditorError,
                platforms: _platformsError,
                ...remainingErrors
            } = currentErrors;

            return {
                ...remainingErrors,
                ...(platformError ? { platforms: platformError } : {}),
                ...(fieldError ? { [fieldKey]: fieldError } : {}),
            };
        });
    };

    const selectOutputDirectory = async () => {
        const result = await window.electron.openDirectoryDialog(
            form.outputDirectory,
            t('customEditor.creator.actions.selectOutputDirectory'),
        );

        if (!result.canceled && result.filePaths.length > 0) {
            updateField('outputDirectory', result.filePaths[0]);
        }
    };

    const selectPath = async (
        platform: CustomEngineManifestPlatformName,
        field: 'editorPath' | 'consolePath',
        titleKey: string,
    ) => {
        const defaultPath = await resolveExistingDialogDefaultPath(
            form.platforms[platform][field],
            form.outputDirectory,
            window.electron.pathExists,
        );
        const result = await window.electron.openFileDialog(
            defaultPath,
            t(titleKey),
        );

        if (!result.canceled && result.filePaths.length > 0) {
            updatePlatformField(platform, field, result.filePaths[0]);
        }
    };

    const setPathMissingError = (field: string) => {
        setErrors((currentErrors) => ({
            ...currentErrors,
            [field]: 'pathMissing',
        }));
        setFormError(getPathMissingMessage(field, t));
    };

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();

        const validationErrors = validateCustomEditorManifestForm(form);
        if (Object.keys(validationErrors).length > 0) {
            setErrors(validationErrors);
            setFormError(getFirstValidationMessage(validationErrors, t));
            return;
        }

        setIsSubmitting(true);
        setFormError(undefined);

        try {
            if (!(await window.electron.pathExists(form.outputDirectory))) {
                setPathMissingError('outputDirectory');
                return;
            }

            for (const platformForm of getIncludedPlatforms(form)) {
                if (
                    !(await window.electron.pathExists(platformForm.editorPath))
                ) {
                    setPathMissingError(
                        `platforms.${platformForm.platform}.editorPath`,
                    );
                    return;
                }

                if (
                    platformForm.consolePath.trim().length > 0 &&
                    !(await window.electron.pathExists(
                        platformForm.consolePath,
                    ))
                ) {
                    setPathMissingError(
                        `platforms.${platformForm.platform}.consolePath`,
                    );
                    return;
                }
            }

            const result = await window.electron.createCustomEngineManifest(
                form.outputDirectory.trim(),
                buildCustomEngineManifest(form),
            );

            if (!result.success || !result.manifestPath) {
                setFormError(
                    result.error ??
                        t('customEditor.creator.validation.createFailed'),
                );
                return;
            }

            const registered = await onManifestCreated(result.manifestPath);
            if (registered) {
                onOpenChange(false);
            }
        } catch (error) {
            setFormError((error as Error).message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const generatedManifestJson = JSON.stringify(
        buildCustomEngineManifest(form),
        null,
        2,
    );

    return (
        <Drawer
            open={open}
            onOpenChange={onOpenChange}
            side="right"
            ariaLabel={t('customEditor.creator.title')}
            width={800}
            panelClassName="max-w-[100vw]"
        >
            <Drawer.Header>
                <div className="flex flex-col gap-1">
                    <Drawer.Title>
                        {t('customEditor.creator.title')}
                    </Drawer.Title>
                    <p className="text-sm text-base-content/70">
                        {t('customEditor.creator.description')}
                    </p>
                </div>
                <Drawer.CloseButton />
            </Drawer.Header>
            <form
                className="flex min-h-0 flex-1 flex-col"
                onSubmit={(event) => void handleSubmit(event)}
            >
                <Drawer.Body className="grid grid-cols-1 gap-4 p-4 md:grid-cols-[minmax(0,0.82fr)_minmax(340px,1.18fr)]">
                    {formError && (
                        <div className="alert alert-error alert-soft md:col-span-2">
                            {formError}
                        </div>
                    )}
                    <ManifestDetailsForm
                        form={form}
                        errors={errors}
                        t={t}
                        onFieldChange={updateField}
                        onPlatformFieldChange={updatePlatformField}
                        onFieldBlur={validateFieldOnBlur}
                        onPlatformFieldBlur={validatePlatformFieldOnBlur}
                        onClearPlatform={clearPlatform}
                        onSelectOutputDirectory={() =>
                            void selectOutputDirectory()
                        }
                        onSelectPath={(platform, field, titleKey) =>
                            void selectPath(platform, field, titleKey)
                        }
                    />
                    <GeneratedManifestPreview
                        manifestJson={generatedManifestJson}
                    />
                </Drawer.Body>
                <Drawer.Footer>
                    <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => onOpenChange(false)}
                        disabled={isSubmitting}
                    >
                        {t('common:buttons.cancel')}
                    </button>
                    <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={isSubmitting}
                    >
                        {isSubmitting && (
                            <span className="loading loading-spinner loading-xs" />
                        )}
                        {isSubmitting
                            ? t('customEditor.creator.actions.creating')
                            : t(
                                  'customEditor.creator.actions.createAndRegister',
                              )}
                    </button>
                </Drawer.Footer>
            </form>
        </Drawer>
    );
};
