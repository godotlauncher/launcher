import type { TerminalSelection, TerminalSummary } from '@shared/contracts';
import logger from 'electron-log';
import { RotateCw, TriangleAlert } from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Drawer } from '../../components/ui/drawer/drawer.component';
import { Switch } from '../../components/ui/switch.component';
import { useAlerts } from '../../hooks/alerts.hook';
import { terminalBridge } from '../../renderer.bridge';

type TerminalToolSettingsDrawerProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSummaryChanged: () => Promise<void>;
};

/**
 * Displays terminal settings with disabled state separate from availability.
 * @param props - Drawer visibility and settings refresh callbacks.
 */
export const TerminalToolSettingsDrawer: React.FC<
    TerminalToolSettingsDrawerProps
> = ({ open, onOpenChange, onSummaryChanged }) => {
    const { t } = useTranslation(['settings', 'common']);
    const { addCustomConfirm } = useAlerts();
    const [summary, setSummary] = useState<TerminalSummary | null>(null);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const generationRef = useRef(0);
    const onSummaryChangedRef = useRef(onSummaryChanged);
    useEffect(() => {
        onSummaryChangedRef.current = onSummaryChanged;
    }, [onSummaryChanged]);

    const load = useCallback(
        async (rescan = false) => {
            const generation = ++generationRef.current;
            setLoading(true);
            setError(null);
            try {
                const next = await (rescan
                    ? terminalBridge.rescan()
                    : terminalBridge.getSummary());
                if (generation === generationRef.current) {
                    setSummary(next);
                    if (rescan) await onSummaryChangedRef.current();
                }
            } catch {
                logger.error('Failed to load terminal settings');
                if (generation === generationRef.current) {
                    setError(t('tools.terminal.errors.load'));
                }
            } finally {
                if (generation === generationRef.current) setLoading(false);
            }
        },
        [t],
    );

    useEffect(() => {
        if (open) void load();
        else {
            generationRef.current += 1;
            setSummary(null);
            setError(null);
            setLoading(false);
            setSaving(false);
        }
        return () => {
            generationRef.current += 1;
        };
    }, [load, open]);

    /**
     * Applies a settings change while discarding superseded responses.
     * @param action - Narrow terminal settings operation.
     */
    const update = async (action: () => Promise<TerminalSummary>) => {
        if (loading || saving || !summary) return;
        const generation = ++generationRef.current;
        setSaving(true);
        setError(null);
        try {
            const next = await action();
            if (generation !== generationRef.current) return;
            setSummary(next);
            await onSummaryChanged();
        } catch {
            logger.error('Failed to update terminal settings');
            if (generation === generationRef.current) {
                setError(t('tools.terminal.errors.save'));
            }
        } finally {
            if (generation === generationRef.current) setSaving(false);
        }
    };

    /** Confirms removal of unsupported terminal preferences before recovering defaults. */
    const confirmReset = () => {
        addCustomConfirm(
            t('tools.terminal.reset.title'),
            t('tools.terminal.reset.message'),
            [
                {
                    isCancel: true,
                    typeClass: 'btn-ghost',
                    text: t('common:buttons.cancel'),
                },
                {
                    typeClass: 'btn-warning',
                    text: t('tools.terminal.reset.confirm'),
                    onClick: () => {
                        void update(() => terminalBridge.resetConfiguration());
                        return true;
                    },
                },
            ],
            undefined,
            'warning',
        );
    };

    const selected = summary?.selection ?? 'automatic';
    const resolved = summary?.targets.find(
        (target) => target.id === summary?.resolvedTargetId,
    );

    return (
        <Drawer
            open={open}
            onOpenChange={onOpenChange}
            side="right"
            ariaLabel={t('tools.terminal.drawer.title')}
            width={560}
            panelClassName="max-w-[100vw]"
        >
            <Drawer.Header className="items-center">
                <Drawer.Title className="text-lg font-semibold">
                    {t('tools.terminal.drawer.title')}
                </Drawer.Title>
                <Drawer.CloseButton className="btn-sm" disabled={saving} />
            </Drawer.Header>
            <Drawer.Body className="flex flex-col gap-4 text-base">
                {loading && !summary && (
                    <p role="status">{t('tools.terminal.loading')}</p>
                )}
                {error && (
                    <p className="text-error" role="alert">
                        {error}
                    </p>
                )}
                {summary && !summary.configurationValid && (
                    <div
                        className="alert alert-warning alert-soft flex flex-row items-start gap-2 text-base text-[color:var(--color-warning-readable)]"
                        role="alert"
                    >
                        <TriangleAlert
                            className="size-5 shrink-0"
                            aria-hidden="true"
                        />
                        <div className="flex flex-col items-start gap-3">
                            <p>
                                {t(
                                    'tools.terminal.errors.invalidConfiguration',
                                )}
                            </p>
                            <button
                                type="button"
                                className="btn btn-sm btn-warning"
                                disabled={loading || saving}
                                onClick={confirmReset}
                            >
                                {t('tools.terminal.reset.button')}
                            </button>
                        </div>
                    </div>
                )}
                {summary && (
                    <>
                        <label
                            className="flex items-center justify-between gap-6"
                            htmlFor="terminalEnabled"
                        >
                            <span>{t('tools.terminal.enabled')}</span>
                            <Switch
                                id="terminalEnabled"
                                checked={summary.enabled}
                                disabled={loading || saving}
                                onChange={(event) =>
                                    void update(() =>
                                        terminalBridge.setEnabled(
                                            event.currentTarget.checked,
                                        ),
                                    )
                                }
                            />
                        </label>
                        <section className="flex flex-col gap-3">
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <h3 className="font-semibold">
                                        {t('tools.terminal.selection.title')}
                                    </h3>
                                    <p className="text-base-content/75">
                                        {!summary.enabled
                                            ? t('tools.status.disabled')
                                            : !summary.configurationValid
                                              ? null
                                              : resolved
                                                ? t(
                                                      'tools.terminal.selection.resolved',
                                                      {
                                                          terminal:
                                                              resolved.displayName,
                                                      },
                                                  )
                                                : t(
                                                      'tools.terminal.selection.unavailable',
                                                  )}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    className="btn btn-sm btn-ghost shrink-0 text-base"
                                    disabled={
                                        loading ||
                                        saving ||
                                        !summary.configurationValid
                                    }
                                    onClick={() => void load(true)}
                                >
                                    {loading ? (
                                        <span className="loading loading-spinner loading-xs" />
                                    ) : (
                                        <RotateCw
                                            size={15}
                                            aria-hidden="true"
                                        />
                                    )}
                                    {loading
                                        ? t('tools.actions.scanning')
                                        : t('tools.actions.rescan')}
                                </button>
                            </div>
                            <label className="flex items-center gap-3">
                                <input
                                    type="radio"
                                    name="terminal-selection"
                                    checked={selected === 'automatic'}
                                    disabled={
                                        loading ||
                                        saving ||
                                        !summary.configurationValid
                                    }
                                    onChange={() =>
                                        void update(() =>
                                            terminalBridge.selectTarget(
                                                'automatic',
                                            ),
                                        )
                                    }
                                />
                                <span>
                                    {t('tools.terminal.selection.automatic')}
                                </span>
                            </label>
                            {summary.targets.map((target) => (
                                <label
                                    key={target.id}
                                    className="flex items-center gap-3"
                                >
                                    <input
                                        type="radio"
                                        name="terminal-selection"
                                        checked={selected === target.id}
                                        disabled={
                                            loading ||
                                            saving ||
                                            !summary.configurationValid
                                        }
                                        onChange={() =>
                                            void update(() =>
                                                terminalBridge.selectTarget(
                                                    target.id as TerminalSelection,
                                                ),
                                            )
                                        }
                                    />
                                    <span>{target.displayName}</span>
                                    <span className="text-sm text-base-content/75">
                                        {target.executablePath}
                                    </span>
                                </label>
                            ))}
                            {summary.enabled &&
                                summary.configurationValid &&
                                selected !== 'automatic' &&
                                !summary.targets.some(
                                    (target) => target.id === selected,
                                ) && (
                                    <p role="alert" className="text-warning">
                                        {t(
                                            'tools.terminal.selection.unavailableSelection',
                                            { terminal: selected },
                                        )}
                                    </p>
                                )}
                        </section>
                    </>
                )}
            </Drawer.Body>
        </Drawer>
    );
};
