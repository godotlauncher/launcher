import type {
    CodeEditorId,
    CodeEditorIntegrationSettings,
    CodeEditorPathValidationResult,
    UpdateCodeEditorIntegrationSettings,
} from '@shared/contracts';
import type React from 'react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ContentDivider } from '../../components/ui/content-divider.component';
import { Drawer } from '../../components/ui/drawer/drawer.component';
import { PathField } from '../../components/ui/path-field.component';
import { Switch } from '../../components/ui/switch.component';
import { TextField } from '../../components/ui/text-field.component';
import { WaitingForDialogOverlay } from '../../components/waiting-for-dialog-overlay.component';
import { appBridge } from '../../renderer.bridge.ts';
import {
    type CodeEditorSettingsForm,
    createCodeEditorSettingsForm,
    hasCodeEditorSettingsChanges,
    resetCodeEditorExecFlags,
    resolveCodeEditorPathFieldState,
    toCodeEditorSettingsUpdate,
} from './code-editor-settings-drawer/code-editor-settings.model';

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
    onConfirmDisable: (
        settings: CodeEditorIntegrationSettings,
        onConfirm: () => Promise<boolean>,
    ) => boolean;
    onSaved: (settings: CodeEditorIntegrationSettings) => void;
};

export const CodeEditorSettingsDrawer: React.FC<
    CodeEditorSettingsDrawerProps
> = ({
    settings,
    open,
    onOpenChange,
    onValidatePath,
    onSave,
    onConfirmDisable,
    onSaved,
}) => {
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

    const saveUpdate = async (
        integrationId: CodeEditorId,
        update: UpdateCodeEditorIntegrationSettings,
    ): Promise<boolean> => {
        setIsSubmitting(true);

        try {
            const updatedSettings = await onSave(integrationId, update);
            onSaved(updatedSettings);
            onOpenChange(false);
            return true;
        } catch (error) {
            setFormError(
                error instanceof Error
                    ? error.message
                    : t('codeEditors.drawer.errors.save'),
            );
            return false;
        } finally {
            setIsSubmitting(false);
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

        if (update.customPath) {
            setIsSubmitting(true);
            try {
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
            } catch (error) {
                setFormError(
                    error instanceof Error
                        ? error.message
                        : t('codeEditors.drawer.errors.save'),
                );
                return;
            } finally {
                setIsSubmitting(false);
            }
        }

        const integrationId = settings.integration.id;
        const isDisabling = settings.enabled && !update.enabled;
        if (
            isDisabling &&
            onConfirmDisable(settings, () => saveUpdate(integrationId, update))
        ) {
            return;
        }

        await saveUpdate(integrationId, update);
    };

    const hasChanges =
        settings && form ? hasCodeEditorSettingsChanges(settings, form) : false;
    const pathFieldState =
        settings && form
            ? resolveCodeEditorPathFieldState(settings, form.customPath)
            : { value: '', autodetected: false };
    const handleDrawerOpenChange = (nextOpen: boolean) => {
        if (!nextOpen && isSubmitting) {
            return;
        }

        onOpenChange(nextOpen);
    };

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
                onOpenChange={handleDrawerOpenChange}
                closeOnBackdrop={!isSubmitting}
                closeOnEscape={!isSubmitting}
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
                <Drawer.Header className="items-center">
                    <Drawer.Title className="flex min-w-0 items-center gap-2 text-lg font-semibold">
                        <span className="truncate">
                            {settings
                                ? t('codeEditors.drawer.title', {
                                      editor: settings.integration.displayName,
                                  })
                                : t('codeEditors.drawer.fallbackTitle')}
                        </span>
                        {settings?.integration.capabilities.dotnet && (
                            <span className="badge badge-sm badge-outline shrink-0 font-normal">
                                .NET {t('codeEditors.drawer.dotnet.supported')}
                            </span>
                        )}
                    </Drawer.Title>
                    <Drawer.CloseButton
                        className="btn-sm"
                        disabled={isSubmitting}
                    />
                </Drawer.Header>

                {settings && form && (
                    <form
                        className="flex min-h-0 flex-1 flex-col"
                        onSubmit={(event) => void handleSubmit(event)}
                    >
                        <Drawer.Body className="flex flex-col gap-[12px] text-base">
                            {formError && (
                                <div
                                    className="alert alert-error alert-soft"
                                    role="alert"
                                >
                                    {formError}
                                </div>
                            )}

                            <section className="flex flex-col gap-[12px]">
                                <label
                                    htmlFor="codeEditorIntegrationEnabled"
                                    className="flex min-h-8 items-center justify-between gap-6"
                                >
                                    <span>
                                        {t(
                                            'codeEditors.drawer.integration.enabled',
                                        )}
                                    </span>
                                    <Switch
                                        id="codeEditorIntegrationEnabled"
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
                                </label>

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
                                                className="btn btn-sm btn-ghost text-base"
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
                                {pathError && (
                                    <p className="text-error" role="alert">
                                        {pathError}
                                    </p>
                                )}
                            </section>

                            <ContentDivider />

                            <section className="flex flex-col gap-[12px]">
                                <div className="flex flex-col gap-[4px]">
                                    <h3 className="font-semibold">
                                        {t(
                                            'codeEditors.drawer.textEditor.title',
                                        )}
                                    </h3>
                                    <p className="text-base-content/75">
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
                                            className="btn btn-sm btn-ghost text-base"
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
                                    disabled={isSubmitting}
                                    onChange={(execFlags) =>
                                        updateForm({ execFlags })
                                    }
                                />
                            </section>
                        </Drawer.Body>

                        <Drawer.Footer>
                            <button
                                type="button"
                                className="btn btn-ghost text-base"
                                onClick={() => handleDrawerOpenChange(false)}
                                disabled={isSubmitting}
                            >
                                {t('codeEditors.actions.cancel')}
                            </button>
                            <button
                                type="submit"
                                className="btn btn-primary text-base"
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
