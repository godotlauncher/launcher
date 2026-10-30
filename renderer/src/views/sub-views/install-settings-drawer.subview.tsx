import type { InstalledRelease } from '@shared/contracts';
import { Terminal } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { SettingsPanel } from '../../components/settings/settings-panel.component';
import { Drawer } from '../../components/ui/drawer/drawer.component';
import { Switch } from '../../components/ui/switch.component';
import { VerticalTabMenu } from '../../components/ui/vertical-tab-menu.component';
import { useAlerts } from '../../hooks/alerts.hook';
import {
    CommandLineAliasPanel,
    suggestAlias,
} from '../installs/components/command-line-alias-panel.component';
import type { useCommandLineAliases } from '../installs/hooks/command-line-aliases.hook';
import type { useCommandLineGodot } from '../installs/hooks/command-line-godot.hook';
import { getReleaseActionKey } from '../installs/installs-view.model';

type InstallSettingsDrawerProps = {
    release: InstalledRelease | null;
    installed: InstalledRelease[];
    commandLine: ReturnType<typeof useCommandLineGodot>;
    aliasState: ReturnType<typeof useCommandLineAliases>;
    covered?: boolean;
    isBusy: (release: InstalledRelease) => boolean;
    onOpenChange: (open: boolean) => void;
};

/**
 * Shows immediate terminal-default settings for one identified installed editor.
 * @param props - Selected editor, shared command state and drawer interactions.
 */
export function InstallSettingsDrawer({
    release,
    installed,
    commandLine,
    aliasState,
    covered = false,
    isBusy,
    onOpenChange,
}: InstallSettingsDrawerProps) {
    const { t } = useTranslation(['installs', 'common']);
    const id = useId();
    const { refresh } = commandLine;
    useEffect(() => {
        if (release) void refresh();
    }, [release, refresh]);
    const { addCustomConfirm } = useAlerts();
    const [enabled, setEnabled] = useState(false);
    const [name, setName] = useState('');
    const [editing, setEditing] = useState(false);
    const commandPanelRef = useRef<HTMLElement>(null);
    const draftSnapshot = useRef<{ target: string; savedName?: string } | null>(
        null,
    );
    const saved = aliasState.aliases.find(
        (alias) =>
            alias.version === release?.version && alias.mono === release?.mono,
    );
    const savedName = saved?.name;
    const { refresh: refreshAliases } = aliasState;
    useEffect(() => {
        if (release) void refreshAliases();
    }, [release, refreshAliases]);
    useEffect(() => {
        if (!release) return;
        const target = getReleaseActionKey(release);
        if (
            draftSnapshot.current?.target !== target ||
            draftSnapshot.current.savedName !== savedName
        ) {
            setEnabled(!!savedName);
            setName(savedName ?? suggestAlias(release.version, release.mono));
            setEditing(false);
            draftSnapshot.current = { target, savedName };
        }
    }, [release, savedName]);
    const dirty =
        aliasState.loaded &&
        (enabled !== !!saved || (editing && name !== savedName));
    /**
     * Protects an unapplied draft while allowing an accepted operation to finish after closing.
     * @param open - Requested drawer visibility.
     */
    const requestOpenChange = (open: boolean) => {
        if (open || !dirty || aliasState.pending) {
            if (!open && !aliasState.pending) setEditing(false);
            onOpenChange(open);
            return;
        }
        const field = commandPanelRef.current?.querySelector<HTMLInputElement>(
            'input:not([type="checkbox"])',
        );
        const selection = field
            ? {
                  start: field.selectionStart,
                  end: field.selectionEnd,
                  direction: field.selectionDirection,
              }
            : undefined;
        addCustomConfirm(
            t('aliases.discardTitle'),
            t('aliases.discardMessage'),
            [
                {
                    text: t('aliases.discard'),
                    typeClass: 'btn-error btn-soft',
                    onClick: () => {
                        setEnabled(!!saved);
                        setName(saved?.name ?? '');
                        setEditing(false);
                        onOpenChange(false);
                        return true;
                    },
                },
                {
                    text: t('aliases.keepEditing'),
                    typeClass: 'btn-primary',
                    isCancel: true,
                    onClick: () => {
                        window.requestAnimationFrame(() => {
                            if (!field?.isConnected || field.disabled) return;
                            field.focus({ preventScroll: true });
                            if (selection)
                                field.setSelectionRange(
                                    selection.start,
                                    selection.end,
                                    selection.direction ?? undefined,
                                );
                        });
                        return true;
                    },
                },
            ],
            undefined,
            'warning',
        );
    };
    const current = release
        ? installed.find(
              (candidate) =>
                  getReleaseActionKey(candidate) ===
                  getReleaseActionKey(release),
          )
        : undefined;
    const selected =
        !!release && commandLine.defaultKey === getReleaseActionKey(release);
    const unavailableTarget = current ?? release;
    const disabled =
        commandLine.busy ||
        aliasState.pending ||
        !current ||
        isBusy(current) ||
        (current.valid === false && !selected);
    const title = t('common:app.navigation.settings');
    return (
        <Drawer
            open={release !== null}
            onOpenChange={requestOpenChange}
            side="right"
            width={860}
            panelClassName="max-w-[100vw]"
            ariaLabel={title}
            testId="installSettingsDrawer"
            trapFocus={!covered}
            closeOnEscape={!covered}
            closeOnBackdrop={!covered}
        >
            <Drawer.Header className="items-start">
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <Drawer.Title className="text-lg font-semibold">
                        {title}
                    </Drawer.Title>
                    {release && (
                        <p className="break-words text-base-content/75">
                            {release.name ?? release.version} (
                            {release.mono ? '.NET' : t('selection.standard')})
                        </p>
                    )}
                </div>
                <Drawer.CloseButton
                    className="btn-sm"
                    aria-label={t('settings.close')}
                />
            </Drawer.Header>
            <div className="flex min-h-0 flex-1">
                <VerticalTabMenu
                    ariaLabel={title}
                    activeTab="cli"
                    onActiveTabChange={() => {}}
                    items={[
                        {
                            value: 'cli',
                            label: t('settings.commandLine'),
                            icon: Terminal,
                            id: `${id}-tab`,
                            panelId: `${id}-panel`,
                        },
                    ]}
                />
                <Drawer.Body className="flex min-w-0 flex-1 flex-col gap-4 text-base">
                    <section
                        ref={commandPanelRef}
                        role="tabpanel"
                        id={`${id}-panel`}
                        aria-labelledby={`${id}-tab`}
                        className="flex min-w-0 flex-col gap-3"
                    >
                        <h2 className="text-base font-semibold">
                            {t('settings.commandLine')}
                        </h2>
                        {(!current || current.valid === false) && (
                            <p
                                role="alert"
                                className="text-warning-content dark:text-warning"
                            >
                                {t(
                                    unavailableTarget?.source === 'custom' ||
                                        unavailableTarget?.managed_by_launcher ===
                                            false
                                        ? 'messages.unavailableCustomEditorHint'
                                        : 'messages.unavailableHintWithReinstall',
                                )}
                            </p>
                        )}
                        {commandLine.loading && (
                            <p role="status">{t('settings.loading')}</p>
                        )}
                        {commandLine.error && (
                            <div
                                role="alert"
                                className="flex flex-col items-start gap-2"
                            >
                                {!commandLine.loaded && (
                                    <p>{t('settings.loadError')}</p>
                                )}
                                <p className="break-words text-error-content dark:text-error">
                                    {commandLine.error}
                                </p>
                                <button
                                    type="button"
                                    className="btn btn-sm btn-ghost"
                                    disabled={
                                        commandLine.loading ||
                                        commandLine.pendingKey !== null
                                    }
                                    onClick={() => void refresh()}
                                >
                                    {t('common:buttons.retry')}
                                </button>
                            </div>
                        )}
                        {commandLine.loaded && (
                            <SettingsPanel
                                icon={Terminal}
                                title={t('settings.default')}
                                description={
                                    <Trans
                                        t={t}
                                        i18nKey="settings.description"
                                        components={{
                                            code: (
                                                <code className="rounded bg-base-300 px-1 font-mono" />
                                            ),
                                        }}
                                    />
                                }
                                descriptionId={`${id}-help`}
                                titleId={`${id}-label`}
                                action={
                                    <Switch
                                        id={`${id}-default`}
                                        aria-labelledby={`${id}-label`}
                                        aria-describedby={`${id}-help`}
                                        checked={selected}
                                        disabled={disabled}
                                        onChange={() => {
                                            if (current)
                                                commandLine.select(current);
                                        }}
                                    />
                                }
                            />
                        )}
                        {aliasState.loading && (
                            <p role="status">{t('settings.loading')}</p>
                        )}
                        {aliasState.error && (
                            <p
                                role="alert"
                                id={`${id}-alias-error`}
                                className="break-words text-error-content dark:text-error"
                            >
                                {aliasState.error}
                            </p>
                        )}
                        {(!aliasState.loaded ||
                            aliasState.error ||
                            saved?.state === 'unresolved') && (
                            <button
                                type="button"
                                className="btn btn-sm btn-ghost self-start"
                                disabled={
                                    aliasState.loading || aliasState.pending
                                }
                                onClick={() => void refreshAliases()}
                            >
                                {t('common:buttons.retry')}
                            </button>
                        )}
                        {aliasState.loaded && current && (
                            <CommandLineAliasPanel
                                release={current}
                                saved={saved}
                                enabled={enabled}
                                editing={editing}
                                onEdit={() => {
                                    setName(saved?.name ?? '');
                                    setEditing(true);
                                }}
                                onCancelEdit={() => {
                                    setName(saved?.name ?? '');
                                    setEditing(false);
                                }}
                                name={name}
                                disabled={
                                    commandLine.busy ||
                                    aliasState.pending ||
                                    aliasState.loading ||
                                    isBusy(current) ||
                                    (current.valid === false && !saved)
                                }
                                pending={aliasState.pending}
                                covered={covered}
                                errorId={
                                    aliasState.error
                                        ? `${id}-alias-error`
                                        : undefined
                                }
                                onEnabledChange={(value) => {
                                    if (!value && saved) {
                                        void aliasState.apply(
                                            current,
                                            null,
                                            true,
                                        );
                                        return;
                                    }
                                    setEnabled(value);
                                    if (value && !saved)
                                        setName(
                                            suggestAlias(
                                                current.version,
                                                current.mono,
                                            ),
                                        );
                                }}
                                onNameChange={setName}
                                onApply={() =>
                                    aliasState.apply(
                                        current,
                                        enabled ? name : null,
                                        !!commandLine.selection ||
                                            aliasState.aliases.some(
                                                (alias) =>
                                                    alias.state === 'active',
                                            ),
                                    )
                                }
                            />
                        )}
                        <p role="status" aria-live="polite" className="sr-only">
                            {aliasState.pending
                                ? t('aliases.pending')
                                : aliasState.status}
                        </p>
                        <p
                            role="status"
                            aria-live="polite"
                            className={
                                commandLine.pendingKey === null
                                    ? 'sr-only'
                                    : undefined
                            }
                        >
                            {commandLine.pendingKey !== null
                                ? t('settings.pending')
                                : commandLine.status}
                        </p>
                    </section>
                </Drawer.Body>
            </div>
            <Drawer.Footer>
                <button
                    type="button"
                    className="btn btn-ghost text-base"
                    onClick={() => requestOpenChange(false)}
                >
                    {t('settings.close')}
                </button>
            </Drawer.Footer>
        </Drawer>
    );
}
