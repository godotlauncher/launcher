import type { CommandLineAlias, InstalledRelease } from '@shared/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useAlerts } from '../../../hooks/alerts.hook';
import { editorInstallsBridge } from '../../../renderer.bridge';
import { CommandLineGodotConfirm } from '../components/command-line-godot-confirm.component';
import { getReleaseActionKey } from '../installs-view.model';

/**
 * Keeps applied alias state outside the drawer so closing never cancels a write.
 * @param installed - Authoritative installed-editor list.
 */
export function useCommandLineAliases(installed: InstalledRelease[]) {
    const { t } = useTranslation(['installs', 'common']);
    const { addCustomConfirm, addAlert } = useAlerts();
    const [aliases, setAliases] = useState<CommandLineAlias[]>([]);
    const [loaded, setLoaded] = useState(false);
    const [loading, setLoading] = useState(true);
    const [pending, setPending] = useState(false);
    const [pendingKey, setPendingKey] = useState<string | null>(null);
    const [error, setError] = useState('');
    const [status, setStatus] = useState('');
    const writing = useRef(false);
    const generation = useRef(0);
    const confirming = useRef(false);

    /** Reads authoritative state without superseding an active write. */
    const refresh = useCallback(async () => {
        if (writing.current) return;
        const request = ++generation.current;
        setLoading(true);
        setError('');
        setStatus('');
        try {
            const state = await editorInstallsBridge.getCommandLineAliases();
            if (request !== generation.current) return;
            setAliases(state.aliases);
            setLoaded(true);
        } catch (cause) {
            if (request !== generation.current) return;
            setLoaded(false);
            setError(cause instanceof Error ? cause.message : String(cause));
        } finally {
            if (request === generation.current) setLoading(false);
        }
    }, []);
    // biome-ignore lint/correctness/useExhaustiveDependencies: Lifecycle changes require a new authoritative read.
    useEffect(() => {
        void refresh();
        return () => {
            generation.current++;
        };
    }, [installed, refresh]);

    /**
     * Applies once, then re-reads even on failure because an outcome may be partial.
     * @param release - Target registered editor.
     * @param name - New command, or null to remove.
     */
    const change = async (release: InstalledRelease, name: string | null) => {
        if (writing.current) return false;
        writing.current = true;
        generation.current++;
        setPending(true);
        setPendingKey(getReleaseActionKey(release));
        setError('');
        setStatus('');
        const previous = aliases.find(
            (alias) =>
                alias.version === release.version &&
                alias.mono === release.mono,
        );
        try {
            const state = await editorInstallsBridge.setCommandLineAlias(
                { version: release.version, mono: release.mono },
                name,
            );
            setAliases(state.aliases);
            setLoaded(true);
            setStatus(
                t(
                    name
                        ? previous && previous.name !== name
                            ? 'aliases.renamed'
                            : 'aliases.added'
                        : 'aliases.removed',
                    {
                        command: name ?? previous?.name,
                        previous: previous?.name,
                    },
                ),
            );
            if (state.pathChanged)
                addAlert(t('aliases.title'), t('aliases.pathChanged'));
            return true;
        } catch (cause) {
            try {
                const state =
                    await editorInstallsBridge.getCommandLineAliases();
                setAliases(state.aliases);
                setLoaded(true);
                if (
                    name &&
                    previous &&
                    previous.name !== name &&
                    state.aliases.some(
                        (alias) =>
                            alias.version === release.version &&
                            alias.mono === release.mono &&
                            alias.name === name &&
                            alias.state === 'active',
                    )
                ) {
                    setStatus(
                        t('aliases.renamed', {
                            previous: previous.name,
                            command: name,
                        }),
                    );
                    return true;
                }
            } catch {
                setLoaded(false);
            }
            setError(cause instanceof Error ? cause.message : String(cause));
            return false;
        } finally {
            writing.current = false;
            setPending(false);
            setPendingKey(null);
        }
    };

    /**
     * Confirms removal or acknowledges direct-editor preferences before initial creation.
     * @param release - Target registered editor.
     * @param name - New command, or null to remove.
     * @param acknowledged - Whether a default or existing alias already supplies acknowledgement.
     */
    const apply = async (
        release: InstalledRelease,
        name: string | null,
        acknowledged: boolean,
    ): Promise<boolean> => {
        if (writing.current || confirming.current || !loaded) return false;
        if (name !== null && acknowledged) return change(release, name);
        const removing = name === null;
        const saved = aliases.find(
            (alias) =>
                alias.version === release.version &&
                alias.mono === release.mono,
        );
        if (removing && saved?.state !== 'active') return false;
        confirming.current = true;
        const trigger =
            document.activeElement instanceof HTMLElement
                ? document.activeElement
                : null;
        return new Promise((resolve) => {
            let applied = false;
            addCustomConfirm(
                t(removing ? 'aliases.removeTitle' : 'aliases.setupTitle'),
                (renderLayout, close) => (
                    <CommandLineGodotConfirm
                        message={
                            <Trans
                                t={t}
                                i18nKey={
                                    removing
                                        ? 'aliases.removeExplanation'
                                        : 'aliases.explanation'
                                }
                                values={{
                                    name:
                                        release.name ??
                                        `Godot ${release.version}`,
                                    command: name ?? saved?.name,
                                }}
                                components={{
                                    code: (
                                        <code className="break-all rounded bg-base-300 px-1 font-mono" />
                                    ),
                                }}
                            />
                        }
                        okLabel={t(
                            removing
                                ? 'aliases.removeConfirm'
                                : 'aliases.apply',
                        )}
                        cancelLabel={t('common:buttons.cancel')}
                        onConfirm={async () => {
                            applied = await change(release, name);
                            // Close on failure too, so the retained draft and its error are operable.
                            return true;
                        }}
                        renderLayout={renderLayout}
                        close={() => {
                            confirming.current = false;
                            close();
                            resolve(applied);
                            window.requestAnimationFrame(() => {
                                if (
                                    trigger?.isConnected &&
                                    !trigger.matches(':disabled')
                                )
                                    trigger.focus();
                            });
                        }}
                    />
                ),
                [],
            );
        });
    };
    return {
        aliases,
        loaded,
        loading,
        pending,
        pendingKey,
        error,
        status,
        refresh,
        apply,
    };
}
