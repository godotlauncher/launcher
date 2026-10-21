import type {
    CommandLineGodotSelection,
    InstalledRelease,
} from '@shared/contracts';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAlerts } from '../../../hooks/alerts.hook';
import { editorInstallsBridge } from '../../../renderer.bridge';
import { getReleaseActionKey } from '../installs-view.model';

/**
 * Keeps the terminal default in sync with installed-editor lifecycle changes.
 * @param installed - Current authoritative installed-editor list.
 */
export function useCommandLineGodot(installed: InstalledRelease[]) {
    const { t } = useTranslation(['installs', 'common']);
    const { addAlert, addConfirm } = useAlerts();
    const [selection, setSelection] =
        useState<CommandLineGodotSelection | null>(null);
    const [busy, setBusy] = useState(true);
    const pending = useRef(false);
    const reportLoadError = useEffectEvent((error: unknown) =>
        addAlert(t('common:error'), String(error)),
    );
    // biome-ignore lint/correctness/useExhaustiveDependencies: Installed-editor changes trigger an authoritative selection refresh.
    useEffect(() => {
        let cancelled = false;
        setBusy(true);
        editorInstallsBridge
            .getCommandLineGodot()
            .then((state) => {
                if (!cancelled) {
                    setSelection(state.selection);
                    setBusy(false);
                }
            })
            .catch((error: unknown) => {
                if (!cancelled) reportLoadError(error);
            });
        return () => {
            cancelled = true;
        };
    }, [installed]);

    /**
     * Changes the command after setup acknowledgement, reporting conflicts plainly.
     * @param release - Editor to target, or null to remove the wrapper.
     */
    const change = async (
        release: InstalledRelease | null,
    ): Promise<boolean> => {
        if (pending.current) return false;
        pending.current = true;
        setBusy(true);
        try {
            const result = await editorInstallsBridge.setCommandLineGodot(
                release
                    ? { version: release.version, mono: release.mono }
                    : null,
            );
            setSelection(result.selection);
            const message = release
                ? t('commandLine.enabled', {
                      name: release.name ?? release.version,
                  })
                : t('commandLine.cleared');
            addAlert(
                t('commandLine.title'),
                <div className="flex flex-col gap-3">
                    <p>{message}</p>
                    {result.conflict && (
                        <p>
                            {t('commandLine.conflict', {
                                command: result.conflict,
                            })}
                        </p>
                    )}
                </div>,
                undefined,
                result.conflict ? 'warning' : undefined,
            );
        } catch (error) {
            addAlert(
                t('common:error'),
                error instanceof Error ? error.message : String(error),
                undefined,
                'error',
            );
        } finally {
            pending.current = false;
            setBusy(false);
        }
        return true;
    };

    /**
     * Shows the editor-preferences explanation for initial setup.
     * @param release - Editor whose menu action was selected.
     */
    const select = (release: InstalledRelease) => {
        if (busy) return;
        if (
            selection?.version === release.version &&
            selection.mono === release.mono
        ) {
            void change(null);
        } else if (selection) {
            void change(release);
        } else {
            addConfirm(
                t('commandLine.use'),
                <p className="whitespace-pre-line">
                    {t('commandLine.explanation')}
                </p>,
                () => change(release),
            );
        }
    };
    return {
        defaultKey: selection ? getReleaseActionKey(selection) : null,
        busy,
        select,
    };
}
