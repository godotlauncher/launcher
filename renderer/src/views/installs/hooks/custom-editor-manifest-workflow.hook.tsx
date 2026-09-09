import type { RegisterCustomEngineResult } from '@shared/contracts';
import type { useAlerts } from '../../../hooks/alerts.hook';
import { appBridge } from '../../../renderer.bridge.ts';
import { ReplaceCustomEditorConfirm } from '../components/replace-custom-editor-confirm.component';

type Translate = (key: string, options?: Record<string, unknown>) => string;

type UseCustomEditorManifestWorkflowArgs = {
    t: Translate;
    selectingCustomEditorManifest: boolean;
    setSelectingCustomEditorManifest: (selecting: boolean) => void;
    addAlert: ReturnType<typeof useAlerts>['addAlert'];
    addCustomConfirm: ReturnType<typeof useAlerts>['addCustomConfirm'];
    registerCustomEngine: (
        manifestPath: string,
        options?: { replaceExisting?: boolean },
    ) => Promise<RegisterCustomEngineResult>;
};

/**
 * Coordinates manifest registration and explicit replacement confirmation.
 * @param args - Registration bridge, dialog actions and localised copy.
 */
export function useCustomEditorManifestWorkflow({
    t,
    selectingCustomEditorManifest,
    setSelectingCustomEditorManifest,
    addAlert,
    addCustomConfirm,
    registerCustomEngine,
}: UseCustomEditorManifestWorkflowArgs) {
    /**
     * Reports a successful registration and notifies the owning drawer.
     * @param result - Successful registration result.
     * @param onSuccess - Optional completion action.
     */
    const reportSuccess = (
        result: RegisterCustomEngineResult,
        onSuccess?: () => void,
    ) => {
        addAlert(
            t('common:success'),
            t('messages.registeredCustomEditor', {
                name: result.release?.name ?? result.release?.version ?? '',
            }),
            undefined,
            'success',
        );
        onSuccess?.();
    };

    /**
     * Registers a manifest or asks before replacing an existing editor.
     * @param manifestPath - Selected manifest file.
     * @param replaceExisting - Whether replacement has already been approved.
     * @param options - Optional successful-registration callback.
     */
    const registerManifest = async (
        manifestPath: string,
        replaceExisting = false,
        options: { onSuccess?: () => void } = {},
    ): Promise<boolean> => {
        try {
            const result = await registerCustomEngine(manifestPath, {
                replaceExisting,
            });

            if (result.success) {
                reportSuccess(result, options.onSuccess);
                return true;
            }

            if (result.duplicate && !replaceExisting) {
                const version = result.duplicate.version;
                addCustomConfirm(
                    t('customEditor.replace.title'),
                    (renderLayout, close) => (
                        <ReplaceCustomEditorConfirm
                            renderLayout={renderLayout}
                            close={close}
                            message={t('customEditor.replace.message')}
                            detail={t('customEditor.replace.detail')}
                            version={version}
                            versionLabel={t(
                                'customEditor.replace.versionLabel',
                            )}
                            cancelLabel={t('common:buttons.cancel')}
                            replaceLabel={t('customEditor.replace.action')}
                            failureMessage={t(
                                'messages.registerCustomEditorFailed',
                            )}
                            onReplace={() =>
                                registerCustomEngine(manifestPath, {
                                    replaceExisting: true,
                                })
                            }
                            onSuccess={(replacement) =>
                                reportSuccess(replacement, options.onSuccess)
                            }
                        />
                    ),
                    [],
                    undefined,
                    'warning',
                );
                return false;
            }

            addAlert(
                t('common:error'),
                result.error?.trim() ||
                    t('messages.registerCustomEditorFailed'),
                undefined,
                'error',
            );
            return false;
        } catch (error) {
            addAlert(
                t('common:error'),
                error instanceof Error && error.message.trim()
                    ? error.message
                    : t('messages.registerCustomEditorFailed'),
                undefined,
                'error',
            );
            return false;
        }
    };

    /** Selects a manifest through the native picker and registers it. */
    const handleAddCustomEngine = async () => {
        if (selectingCustomEditorManifest) {
            return;
        }

        setSelectingCustomEditorManifest(true);
        try {
            const result = await appBridge.openFileDialog(
                '',
                t('customEditor.selectManifestTitle'),
                [
                    {
                        name: t('customEditor.manifestFilterName'),
                        extensions: ['json'],
                    },
                ],
            );

            if (result.canceled || result.filePaths.length === 0) {
                return;
            }

            await registerManifest(result.filePaths[0]);
        } finally {
            setSelectingCustomEditorManifest(false);
        }
    };

    return {
        registerManifest,
        handleAddCustomEngine,
    };
}
