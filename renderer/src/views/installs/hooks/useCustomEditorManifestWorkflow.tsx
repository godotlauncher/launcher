import type { RegisterCustomEngineResult } from '@shared/contracts';
import { CheckCircle2, TriangleAlertIcon } from 'lucide-react';
import type React from 'react';
import { appBridge } from '../../../bridge.ts';

type Translate = (key: string, options?: Record<string, unknown>) => string;

type UseCustomEditorManifestWorkflowArgs = {
    t: Translate;
    selectingCustomEditorManifest: boolean;
    setSelectingCustomEditorManifest: (selecting: boolean) => void;
    addAlert: (
        title: string,
        message: React.ReactNode,
        icon?: React.ReactNode,
    ) => void;
    addConfirm: (
        title: string,
        content: React.ReactNode,
        onOk: () => boolean | Promise<boolean | undefined>,
        onCancel?: () => boolean | Promise<boolean | undefined>,
        icon?: React.ReactNode,
    ) => void;
    registerCustomEngine: (
        manifestPath: string,
        options?: { replaceExisting?: boolean },
    ) => Promise<RegisterCustomEngineResult>;
};

export function useCustomEditorManifestWorkflow({
    t,
    selectingCustomEditorManifest,
    setSelectingCustomEditorManifest,
    addAlert,
    addConfirm,
    registerCustomEngine,
}: UseCustomEditorManifestWorkflowArgs) {
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
                addAlert(
                    t('common:success'),
                    t('messages.registeredCustomEditor', {
                        name:
                            result.release?.name ??
                            result.release?.version ??
                            '',
                    }),
                    <CheckCircle2 className="text-success" />,
                );
                options.onSuccess?.();
                return true;
            }

            if (result.duplicate && !replaceExisting) {
                addConfirm(
                    t('customEditor.replace.title'),
                    <div className="flex flex-col gap-3">
                        <p>{t('customEditor.replace.message')}</p>
                        <div className="bg-base-200 rounded-md p-3 flex flex-col gap-1">
                            <span className="text-xs uppercase tracking-wide text-base-content/50">
                                {t('customEditor.replace.versionLabel')}
                            </span>
                            <code className="font-mono text-warning">
                                {result.duplicate.version}
                            </code>
                        </div>
                        <p>{t('customEditor.replace.detail')}</p>
                    </div>,
                    () => {
                        void registerManifest(manifestPath, true, options);
                        return true;
                    },
                    undefined,
                    <TriangleAlertIcon className="inline w-4 h-4 text-warning" />,
                );
                return false;
            }

            addAlert(
                t('common:error'),
                result.error ?? t('messages.registerCustomEditorFailed'),
                <TriangleAlertIcon className="inline text-error" />,
            );
            return false;
        } catch (error) {
            addAlert(
                t('common:error'),
                (error as Error).message,
                <TriangleAlertIcon className="inline text-error" />,
            );
            return false;
        }
    };

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
