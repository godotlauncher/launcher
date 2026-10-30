import { ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { COMMUNITY_DISCORD_URL } from '../app.constants';
import { ContentDivider } from '../components/ui/content-divider.component';
import { useAppNavigation } from '../hooks/app-navigation.hook';

/** Renders the placeholder for future Extensions functionality. */
export function ExtensionsView() {
    const { t } = useTranslation('common');
    const { openExternalLink } = useAppNavigation();

    return (
        <div className="flex h-full min-h-0 w-full flex-col gap-2 p-1 text-base">
            <header className="flex shrink-0 items-center gap-2">
                <h1 className="pl-3 text-[20px] font-semibold">
                    {t('app.navigation.extensions')}
                </h1>
            </header>
            <ContentDivider />
            <p className="px-3">{t('app.extensions.comingSoon')}</p>
            <p className="px-3">
                {t('app.extensions.discuss')}{' '}
                <button
                    type="button"
                    data-external-link=""
                    className="link link-primary inline-flex items-center gap-1"
                    onClick={() => openExternalLink(COMMUNITY_DISCORD_URL)}
                >
                    {t('app.extensions.joinDiscord')}
                    <ExternalLink size={14} aria-hidden="true" />
                </button>
            </p>
        </div>
    );
}
