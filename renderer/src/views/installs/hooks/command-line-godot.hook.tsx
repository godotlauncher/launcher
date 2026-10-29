import type {
    CommandLineGodotSelection,
    InstalledRelease,
} from '@shared/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useAlerts } from '../../../hooks/alerts.hook';
import { editorInstallsBridge } from '../../../renderer.bridge';
import { CommandLineGodotConfirm } from '../components/command-line-godot-confirm.component';
import { getReleaseActionKey } from '../installs-view.model';

/**
 * Shares confirmed terminal selection and recoverable operation state between install actions.
 * @param installed - Current authoritative installed-editor list.
 */
export function useCommandLineGodot(installed: InstalledRelease[]) {
    const { t } = useTranslation(['installs', 'common']);
    const { addAlert, addCustomConfirm } = useAlerts();
    const [selection, setSelection] =
        useState<CommandLineGodotSelection | null>(null);
    const [loading, setLoading] = useState(true);
    const [loaded, setLoaded] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [status, setStatus] = useState('');
    const [pendingKey, setPendingKey] = useState<string | null>(null);
    const pending = useRef(false);
    const confirming = useRef(false);
    const generation = useRef(0);

    /** Refreshes the shared selection without superseding an in-flight mutation. */
    const refresh = useCallback(async () => {
        if (pending.current) return;
        const request = ++generation.current;
        setLoading(true);
        setError(null);
        setStatus('');
        try {
            const state = await editorInstallsBridge.getCommandLineGodot();
            if (request !== generation.current) return;
            setSelection(state.selection);
            setLoaded(true);
        } catch (cause) {
            if (request !== generation.current) return;
            setLoaded(false);
            setError(cause instanceof Error ? cause.message : String(cause));
        } finally {
            if (request === generation.current) setLoading(false);
        }
    }, []);

    // biome-ignore lint/correctness/useExhaustiveDependencies: Installed-editor lifecycle changes require an authoritative refresh.
    useEffect(() => {
        void refresh();
        return () => {
            generation.current++;
        };
    }, [installed, refresh]);

    /**
     * Applies a terminal selection and keeps failures distinguishable from success.
     * @param release - Editor to target, or null to remove the owned command.
     */
    const change = async (
        release: InstalledRelease | null,
    ): Promise<boolean> => {
        if (pending.current) return false;
        pending.current = true;
        generation.current++;
        setLoading(false);
        setError(null);
        setStatus('');
        setPendingKey(
            release
                ? getReleaseActionKey(release)
                : selection
                  ? getReleaseActionKey(selection)
                  : null,
        );
        try {
            const result = await editorInstallsBridge.setCommandLineGodot(
                release
                    ? { version: release.version, mono: release.mono }
                    : null,
            );
            setSelection(result.selection);
            setLoaded(true);
            setStatus(
                release
                    ? t('settings.selected', {
                          name: release.name ?? release.version,
                      })
                    : t('commandLine.cleared'),
            );
            const message = release
                ? result.pathChanged
                    ? t('commandLine.enabled', {
                          name: release.name ?? release.version,
                      })
                    : null
                : t('commandLine.cleared');
            if (message || result.conflict)
                addAlert(
                    t('commandLine.title'),
                    <div className="flex flex-col gap-3">
                        {message && <p>{message}</p>}
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
        } catch (cause) {
            const message =
                cause instanceof Error ? cause.message : String(cause);
            try {
                const state = await editorInstallsBridge.getCommandLineGodot();
                setSelection(state.selection);
                setLoaded(true);
            } catch {
                setLoaded(false);
            }
            setError(message);
            addAlert(t('common:error'), message, undefined, 'error');
        } finally {
            pending.current = false;
            setPendingKey(null);
        }
        return true;
    };

    /**
     * Selects or clears the editor, acknowledging normal preferences before initial setup.
     * @param release - Editor selected from either terminal control.
     */
    const select = (release: InstalledRelease) => {
        if (loading || !loaded || pending.current || confirming.current) return;
        const selected =
            selection?.version === release.version &&
            selection.mono === release.mono;
        if (!selected && release.valid === false) return;
        if (selected) {
            void change(null);
            return;
        }
        if (selection) {
            void change(release);
            return;
        }
        confirming.current = true;
        const trigger =
            document.activeElement instanceof HTMLElement
                ? document.activeElement
                : null;
        addCustomConfirm(
            t('commandLine.setupTitle'),
            (renderLayout, close) => (
                <CommandLineGodotConfirm
                    message={
                        <Trans
                            t={t}
                            i18nKey="commandLine.explanation"
                            values={{
                                name:
                                    release.name ??
                                    `Godot ${release.version}${release.mono ? ' .NET' : ''}`,
                            }}
                            components={{
                                code: (
                                    <code className="rounded bg-base-300 px-1 font-mono" />
                                ),
                            }}
                        />
                    }
                    okLabel={t('commandLine.setupConfirm')}
                    cancelLabel={t('common:buttons.cancel')}
                    onConfirm={() => change(release)}
                    renderLayout={renderLayout}
                    close={() => {
                        confirming.current = false;
                        close();
                        window.requestAnimationFrame(() => {
                            if (
                                trigger?.isConnected &&
                                !trigger.matches(':disabled')
                            )
                                trigger.focus({ preventScroll: true });
                        });
                    }}
                />
            ),
            [],
        );
    };
    return {
        selection,
        defaultKey: selection ? getReleaseActionKey(selection) : null,
        pendingKey,
        busy: loading || !loaded || pendingKey !== null,
        loading,
        loaded,
        error,
        status,
        refresh,
        select,
    };
}
