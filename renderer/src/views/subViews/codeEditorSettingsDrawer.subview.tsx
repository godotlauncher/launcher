import type {
    CodeEditorId,
    CodeEditorIntegrationSettings,
    CodeEditorPathValidationResult,
    UpdateCodeEditorIntegrationSettings,
} from '@shared/contracts';
import type React from 'react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { appBridge } from '../../bridge.ts';
import { Drawer } from '../../components/ui/drawer/drawer.component';
import { PathField } from '../../components/ui/pathField.component';
import { TextField } from '../../components/ui/textField.component';
import { WaitingForDialogOverlay } from '../../components/waitingForDialogOverlay.component';
import {
    type CodeEditorSettingsForm,
    createCodeEditorSettingsForm,
    hasCodeEditorSettingsChanges,
    resetCodeEditorExecFlags,
    resolveCodeEditorPathFieldState,
    toCodeEditorSettingsUpdate,
} from './codeEditorSettingsDrawer/codeEditorSettings.model';

type CodeEditorSettingsDrawerProps = {
    settings: CodeEditorIntegrationSettings | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onValidatePath: (
        integrationId: CodeEditorId,
        pathToValidate: string,
    ) => Promise<CodeEditorPathValidationResult>;
    onSave: (
        integrationId: CodeEditorId,
        settings: UpdateCodeEditorIntegrationSettings,
    ) => Promise<CodeEditorIntegrationSettings>;
    onSaved: (settings: CodeEditorIntegrationSettings) => void;
};

export const CodeEditorSettingsDrawer: React.FC<
    CodeEditorSettingsDrawerProps
> = ({ settings, open, onOpenChange, onValidatePath, onSave, onSaved }) => {
    const { t } = useTranslation('settings');
    const [form, setForm] = useState<CodeEditorSettingsForm | null>(null);
    const [pathError, setPathError] = useState<string>();
    const [formError, setFormError] = useState<string>();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [dialogOpen, setDialogOpen] = useState(false);

    useEffect(() => {
        if (!open || !settings) {
            return;
        }

        setForm(createCodeEditorSettingsForm(settings));
        setPathError(undefined);
        setFormError(undefined);
        setIsSubmitting(false);
        setDialogOpen(false);
    }, [open, settings]);

    const updateForm = (update: Partial<CodeEditorSettingsForm>) => {
        setForm((current) => (current ? { ...current, ...update } : current));
        setPathError(undefined);
        setFormError(undefined);
    };

    const selectCustomPath = async () => {
        if (!settings || !form) {
            return;
        }

        setDialogOpen(true);
        try {
            const result = await appBridge.openFileDialog(
                form.customPath ||
                    settings.resolvedGodotExecPath ||
                    settings.installation?.path ||
                    '',
                t('codeEditors.drawer.path.select'),
                [
                    {
                        name: t('codeEditors.drawer.path.allFiles'),
                        extensions: ['*'],
                    },
                ],
            );

            if (!result.canceled && result.filePaths[0]) {
                updateForm({ customPath: result.filePaths[0] });
            }
        } catch (error) {
            setFormError(
                error instanceof Error
                    ? error.message
                    : t('codeEditors.drawer.errors.dialog'),
            );
        } finally {
            setDialogOpen(false);
        }
    };

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!settings || !form) {
            return;
        }

        const update = toCodeEditorSettingsUpdate(settings, form);
        setPathError(undefined);
        setFormError(undefined);
        setIsSubmitting(true);

        try {
            if (update.customPath) {
                const validation = await onValidatePath(
                    settings.integration.id,
                    update.customPath,
                );
                if (!validation.valid) {
                    setPathError(
                        validation.reason ??
                            t('codeEditors.drawer.errors.invalidPath'),
                    );
                    return;
                }
            }

            const updatedSettings = await onSave(
                settings.integration.id,
                update,
            );
            onSaved(updatedSettings);
            onOpenChange(false);
        } catch (error) {
            setFormError(
                error instanceof Error
                    ? error.message
                    : t('codeEditors.drawer.errors.save'),
            );
        } finally {
            setIsSubmitting(false);
        }
    };

    const hasChanges =
        settings && form ? hasCodeEditorSettingsChanges(settings, form) : false;
    const pathFieldState =
        settings && form
            ? resolveCodeEditorPathFieldState(settings, form.customPath)
            : { value: '', autodetected: false };

    return (
        <>
            {dialogOpen && (
                <WaitingForDialogOverlay
                    message={t('codeEditors.drawer.path.waiting')}
                    className="z-60"
                />
            )}
            <Drawer
                open={open && Boolean(settings && form)}
                onOpenChange={onOpenChange}
                side="right"
                ariaLabel={
                    settings
                        ? t('codeEditors.drawer.title', {
                              editor: settings.integration.displayName,
                          })
                        : t('codeEditors.drawer.fallbackTitle')
                }
                width={560}
                panelClassName="max-w-[100vw]"
            >
                <Drawer.Header>
                    <Drawer.Title className="flex min-w-0 items-center gap-2">
                        <span className="truncate">
                            {settings
                                ? t('codeEditors.drawer.title', {
                                      editor: settings.integration.displayName,
                                  })
                                : t('codeEditors.drawer.fallbackTitle')}
                        </span>
                        {settings?.integration.capabilities.dotnet && (
                            <span className="badge badge-outline badge-sm shrink-0">
                                .NET {t('codeEditors.drawer.dotnet.supported')}
                            </span>
                        )}
                    </Drawer.Title>
                    <Drawer.CloseButton />
                </Drawer.Header>

                {settings && form && (
                    <form
                        className="flex min-h-0 flex-1 flex-col"
                        onSubmit={(event) => void handleSubmit(event)}
                    >
                        <Drawer.Body className="flex flex-col gap-0">
                            {formError && (
                                <div
                                    className="alert alert-error alert-soft mb-5"
                                    role="alert"
                                >
                                    {formError}
                                </div>
                            )}

                            <section className="flex flex-col gap-4 pb-5">
                                <div className="flex items-center justify-between gap-6">
                                    <span className="text-base font-bold">
                                        {t(
                                            'codeEditors.drawer.integration.enabled',
                                        )}
                                    </span>
                                    <input
                                        type="checkbox"
                                        className="toggle toggle-primary shrink-0"
                                        checked={form.enabled}
                                        aria-label={t(
                                            'codeEditors.drawer.integration.enabled',
                                        )}
                                        onChange={(event) =>
                                            updateForm({
                                                enabled:
                                                    event.currentTarget.checked,
                                            })
                                        }
                                        disabled={isSubmitting}
                                    />
                                </div>

                                <PathField
                                    id="codeEditorCustomPath"
                                    label={t(
                                        pathFieldState.autodetected
                                            ? 'codeEditors.drawer.path.autodetectedLabel'
                                            : 'codeEditors.drawer.path.label',
                                    )}
                                    labelAction={
                                        form.customPath ? (
                                            <button
                                                type="button"
                                                className="btn btn-xs btn-ghost"
                                                onClick={() =>
                                                    updateForm({
                                                        customPath: '',
                                                    })
                                                }
                                                disabled={isSubmitting}
                                            >
                                                {t(
                                                    'codeEditors.drawer.path.reset',
                                                )}
                                            </button>
                                        ) : undefined
                                    }
                                    help={t('codeEditors.drawer.path.help')}
                                    value={pathFieldState.value}
                                    onChange={(customPath) =>
                                        updateForm({ customPath })
                                    }
                                    placeholder={t(
                                        'codeEditors.drawer.path.automatic',
                                    )}
                                    error={pathError}
                                    browseKind="file"
                                    browseLabel={t(
                                        'codeEditors.drawer.path.browse',
                                    )}
                                    onSelect={() => void selectCustomPath()}
                                    disabled={isSubmitting}
                                />
                            </section>

                            <div className="divider my-0"></div>

                            <section className="flex flex-col gap-4 py-5">
                                <div>
                                    <h3 className="text-base font-bold">
                                        {t(
                                            'codeEditors.drawer.textEditor.title',
                                        )}
                                    </h3>
                                    <p className="text-sm">
                                        {t(
                                            'codeEditors.drawer.textEditor.help',
                                        )}
                                    </p>
                                </div>
                                <TextField
                                    id="codeEditorExecFlags"
                                    label={t(
                                        'codeEditors.drawer.textEditor.flagsLabel',
                                    )}
                                    labelAction={
                                        <button
                                            type="button"
                                            className="btn btn-xs btn-ghost"
                                            onClick={() =>
                                                updateForm({
                                                    execFlags:
                                                        resetCodeEditorExecFlags(
                                                            settings,
                                                        ),
                                                })
                                            }
                                            disabled={
                                                isSubmitting ||
                                                form.execFlags ===
                                                    settings.defaultExecFlags
                                            }
                                        >
                                            {t(
                                                'codeEditors.drawer.textEditor.reset',
                                            )}
                                        </button>
                                    }
                                    help={t(
                                        'codeEditors.drawer.textEditor.flagsHelp',
                                    )}
                                    value={form.execFlags}
                                    onChange={(execFlags) =>
                                        updateForm({ execFlags })
                                    }
                                />
                            </section>
                        </Drawer.Body>

                        <Drawer.Footer>
                            <button
                                type="button"
                                className="btn btn-ghost"
                                onClick={() => onOpenChange(false)}
                                disabled={isSubmitting}
                            >
                                {t('codeEditors.actions.cancel')}
                            </button>
                            <button
                                type="submit"
                                className="btn btn-primary"
                                disabled={isSubmitting || !hasChanges}
                            >
                                {isSubmitting && (
                                    <span className="loading loading-spinner loading-xs" />
                                )}
                                {isSubmitting
                                    ? t('codeEditors.actions.saving')
                                    : t('codeEditors.actions.save')}
                            </button>
                        </Drawer.Footer>
                    </form>
                )}
            </Drawer>
        </>
    );
};
