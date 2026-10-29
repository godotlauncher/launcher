import { Sparkles, Terminal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { StatusBadge } from '../ui/status-badge.component';
import { SettingsPanel } from './settings-panel.component';

/** Shows the planned launcher CLI without offering an unavailable setup action. */
export function LauncherCliPreview() {
    const { t } = useTranslation('installs');
    return (
        <section aria-label={t('launcherCli.title')}>
            <SettingsPanel
                icon={Terminal}
                title={t('launcherCli.title')}
                description={t('launcherCli.description')}
                action={
                    <StatusBadge
                        tone="info"
                        className="h-auto gap-1.5 rounded-full border border-info/25 px-2.5 py-1 text-xs font-semibold whitespace-nowrap"
                    >
                        <Sparkles size={13} aria-hidden="true" />
                        {t('launcherCli.comingSoon')}
                    </StatusBadge>
                }
            />
        </section>
    );
}
