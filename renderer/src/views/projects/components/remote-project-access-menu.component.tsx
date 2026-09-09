import type { AppIntegrationSummary } from '@shared/contracts';
import { ChevronDown, ExternalLink, Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    ActionMenu,
    type ActionMenuAnchorRect,
    type ActionMenuItem,
    getActionMenuAnchorRect,
} from '../../../components/ui/action-menu.component';
import { useAppIntegrations } from '../../../hooks/app-integrations.hook';

/**
 * Opens account access actions without leaving the repository picker.
 * @param props - Connection creation and repository reload callbacks.
 */
export function RemoteProjectAccessMenu({
    onAdd,
    onRefresh,
}: {
    onAdd: () => void;
    onRefresh: () => Promise<void>;
}) {
    const { t } = useTranslation(['settings', 'projects', 'common']);
    const { listIntegrations, manageAccess, refresh } = useAppIntegrations();
    const [anchor, setAnchor] = useState<ActionMenuAnchorRect | null>(null);
    const [integration, setIntegration] =
        useState<AppIntegrationSummary | null>(null);
    const [busy, setBusy] = useState(false);
    const [failed, setFailed] = useState(false);
    const pending = useRef(false);
    const alive = useRef(true);

    useEffect(() => {
        alive.current = true;
        return () => {
            alive.current = false;
            pending.current = false;
        };
    }, []);

    useEffect(() => {
        /** Reloads permissions once after returning from the browser. */
        const handleFocus = async () => {
            if (!pending.current) return;
            pending.current = false;
            setBusy(true);
            try {
                const result = await refresh('github');
                if (!alive.current) return;
                if (!result.ok) {
                    setFailed(true);
                    return;
                }
                setIntegration(result.integration);
                await onRefresh();
            } catch {
                if (alive.current) setFailed(true);
            } finally {
                if (alive.current) setBusy(false);
            }
        };
        window.addEventListener('focus', handleFocus);
        return () => window.removeEventListener('focus', handleFocus);
    }, [refresh, onRefresh]);

    /** Opens the selected provider-owned permissions page.
     * @param connectionId - Local connection identifier.
     * @param targetId - Renderer-safe access target identifier.
     */
    const openAccess = async (connectionId: string, targetId: string) => {
        setFailed(false);
        setBusy(true);
        pending.current = true;
        try {
            const result = await manageAccess('github', connectionId, targetId);
            if (!alive.current) return;
            if (!result.ok) {
                pending.current = false;
                setFailed(true);
            }
        } catch {
            pending.current = false;
            if (alive.current) setFailed(true);
        } finally {
            if (alive.current) setBusy(false);
        }
    };
    const external = (
        <ExternalLink
            size={16}
            className="shrink-0 opacity-50"
            aria-hidden="true"
        />
    );
    const targets: ActionMenuItem[] = (integration?.connections ?? []).flatMap(
        (connection) =>
            connection.accessTargets.map((target) => ({
                key: `${connection.id}:${target.id}`,
                label: target.login,
                trailingIcon: external,
                disabled: target.availability === 'unavailable',
                onSelect: () => openAccess(connection.id, target.id),
            })),
    );
    return (
        <div className="flex flex-col gap-2">
            <button
                type="button"
                className="btn btn-ghost text-base"
                disabled={busy}
                aria-haspopup="menu"
                aria-expanded={anchor !== null}
                onClick={async (event) => {
                    const rect = getActionMenuAnchorRect(event.currentTarget);
                    setBusy(true);
                    setFailed(false);
                    try {
                        const integrations = await listIntegrations();
                        if (!alive.current) return;
                        setIntegration(
                            integrations.find((item) => item.id === 'github') ??
                                null,
                        );
                        setAnchor(rect);
                    } catch {
                        if (alive.current) setFailed(true);
                    } finally {
                        if (alive.current) setBusy(false);
                    }
                }}
            >
                {t('projects:addProject.remote.github.manageConnections')}
                <ChevronDown size={16} aria-hidden="true" />
            </button>
            {failed && (
                <p role="alert" className="text-base text-error">
                    {t('connections.errors.generic')}
                </p>
            )}
            <ActionMenu
                open={anchor !== null}
                anchorRect={anchor}
                onClose={() => setAnchor(null)}
                ariaLabel={t(
                    'projects:addProject.remote.github.manageConnections',
                )}
                items={[
                    {
                        key: 'add',
                        label: t('connections.flow.addAccount'),
                        icon: <Plus size={16} aria-hidden="true" />,
                        trailingIcon: external,
                        onSelect: onAdd,
                    },
                    ...(targets.length
                        ? [
                              { type: 'separator' as const, key: 'divider' },
                              ...targets,
                          ]
                        : []),
                ]}
            />
        </div>
    );
}
