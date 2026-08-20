import type { AppIntegrationSummary } from '@shared/contracts';
import { Plug } from 'lucide-react';
import type React from 'react';
import githubInvertocatBlack from '../../../assets/icons/github-invertocat-black.svg';
import githubInvertocatWhite from '../../../assets/icons/github-invertocat-white.svg';
import { useTheme } from '../../../hooks/useTheme';
import { SettingsPanelSection } from './settingsPanelSection.component';

type Translate = (key: string, options?: Record<string, unknown>) => string;

type ConnectionsSettingsPanelProps = {
    active: boolean;
    t: Translate;
    integrations: AppIntegrationSummary[];
    loading: boolean;
    loadError: boolean;
    onRetry: () => void;
    onConnect?: (integration: AppIntegrationSummary) => void;
};

/**
 * Presents registered account integrations without owning their connection flow.
 *
 * @param props - Panel state and presentation callbacks.
 * @returns The Connections settings panel.
 */
export const ConnectionsSettingsPanel: React.FC<
    ConnectionsSettingsPanelProps
> = ({ active, t, integrations, loading, loadError, onRetry, onConnect }) => {
    const { theme, systemTheme } = useTheme();
    const effectiveTheme = (theme ?? 'auto') === 'auto' ? systemTheme : theme;

    return (
        <SettingsPanelSection active={active}>
            <div>
                <h2 className="text-lg font-semibold">
                    {t('connections.title')}
                </h2>
                <p className="mt-1 text-sm text-base-content/70">
                    {t('connections.overview')}
                </p>
            </div>

            {loading && (
                <div className="flex items-center gap-2" role="status">
                    <span className="loading loading-spinner loading-sm" />
                    <span>{t('connections.loading')}</span>
                </div>
            )}

            {!loading && loadError && (
                <div
                    className="flex items-center justify-between gap-4 rounded-box border border-error/30 bg-error/10 p-4"
                    role="alert"
                >
                    <span>{t('connections.loadError')}</span>
                    <button
                        type="button"
                        className="btn btn-sm btn-ghost"
                        onClick={onRetry}
                    >
                        {t('common:buttons.retry')}
                    </button>
                </div>
            )}

            {!loading && !loadError && (
                <div className="grid gap-4">
                    {integrations.map((integration) => {
                        const github = integration.id === 'github';

                        return (
                            <section
                                key={integration.id}
                                className="rounded-box border border-base-300 bg-base-200/40 p-5"
                                data-testid={`app-integration-${integration.id}`}
                            >
                                <div className="flex items-start justify-between gap-6">
                                    <div className="flex min-w-0 gap-4">
                                        <div className="flex size-11 shrink-0 items-center justify-center rounded-box bg-base-100 shadow-sm">
                                            {github ? (
                                                <img
                                                    src={
                                                        effectiveTheme ===
                                                        'dark'
                                                            ? githubInvertocatWhite
                                                            : githubInvertocatBlack
                                                    }
                                                    className="size-10"
                                                    alt=""
                                                    aria-hidden="true"
                                                />
                                            ) : (
                                                <Plug
                                                    className="size-6"
                                                    aria-hidden="true"
                                                />
                                            )}
                                        </div>
                                        <div className="min-w-0">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <h3 className="font-semibold">
                                                    {integration.displayName}
                                                </h3>
                                                <span className="badge badge-sm badge-ghost">
                                                    {t(
                                                        'connections.status.notConnected',
                                                    )}
                                                </span>
                                            </div>
                                            <p className="mt-2 text-sm text-base-content/70">
                                                {t(
                                                    integration.id === 'github'
                                                        ? 'connections.github.description'
                                                        : 'connections.genericDescription',
                                                )}
                                            </p>
                                            {integration.id === 'github' && (
                                                <p className="mt-2 text-xs text-base-content/60">
                                                    {t(
                                                        'connections.github.accessNote',
                                                    )}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        className="btn btn-primary btn-sm shrink-0"
                                        disabled={!onConnect}
                                        onClick={() => onConnect?.(integration)}
                                    >
                                        {t('connections.actions.connect', {
                                            provider: integration.displayName,
                                        })}
                                    </button>
                                </div>
                            </section>
                        );
                    })}
                </div>
            )}
        </SettingsPanelSection>
    );
};
