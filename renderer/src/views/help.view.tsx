import { ExternalLink, MessageCircleQuestion } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import IconDiscord from '../assets/icons/Discord-Symbol-Blurple.svg';
import {
    COMMUNITY_DISCORD_URL,
    COMMUNITY_PAGE_URL,
    GODOT_DOCS_URL,
    GODOT_PAGE_URL,
    LAUNCHER_CONTRIBUTE_URL,
    LAUNCHER_DOCS_URL,
    LAUNCHER_GITHUB_ISSUES_URL,
    LAUNCHER_GITHUB_PROPOSALS_URL,
    LAUNCHER_PAGE_URL,
    LAUNCHER_THIRD_PARTY_RAW_URL,
} from '../constants';
import { useApp } from '../hooks/useApp';
import { useAppNavigation } from '../hooks/useAppNavigation';

export const HelpVIew: React.FC = () => {
    const { t } = useTranslation('help');

    const { openExternalLink } = useAppNavigation();
    const { appVersion } = useApp();

    const openChangeLog = () => {
        const url = `https://github.com/godotlauncher/launcher/blob/v${appVersion}/CHANGELOG.md`;
        openExternalLink(url);
    };

    return (
        <div className="flex flex-col h-full w-full p-1">
            <div className="flex flex-col gap-2 w-full">
                <div className="flex flex-row items-center gap-2">
                    <MessageCircleQuestion className="w-7 h-7" />
                    <h1 data-testid="helpTitle" className="text-2xl">
                        {t('title')}
                    </h1>
                    <div className="flex flex-1 gap-2 justify-end">
                        <button
                            type="button"
                            onClick={() =>
                                open(
                                    LAUNCHER_THIRD_PARTY_RAW_URL,
                                    '_blank',
                                    'noopener,menubar=no,resizable=yes,scrollbars=yes,status=no,titlebar=no,toolbar=no,nodeIntegration=no',
                                )
                            }
                            className="btn btn-link btn-sm gap-1"
                            aria-label="Third-party copyright notices"
                        >
                            {t('thirdPartyNotices')}
                            <ExternalLink className="h-4" />
                        </button>
                    </div>
                </div>
            </div>
            <div className="divider m-0 my-2"></div>

            <div className="flex flex-col gap-0 flex-1">
                {/* Scrollable Content */}
                <div className="flex flex-col py-4 flex-1 max-h-full border border-base-300 border-t-0 bg-base-100 rounded-box overflow-hidden">
                    <div className="flex-1 overflow-y-auto px-6">
                        <div className="flex flex-col h-0 gap-4">
                            <div className="flex flex-row gap-0">
                                <div className="flex flex-col flex-1 gap-2">
                                    <h1 className="flex gap-1 items-baseline text-xl">
                                        {t('launcher.title')}
                                        <button
                                            type="button"
                                            onClick={() => openChangeLog()}
                                            className="btn-link flex-row items-center text-sm m-0 p-0 flex gap-1"
                                        >
                                            {t('launcher.changelog')}
                                            <ExternalLink className="h-4 w-4 m-0 p-0" />
                                        </button>
                                    </h1>
                                    <ul className="flex flex-col gap-0">
                                        <li>
                                            <h3 className="font-bold">
                                                {t('launcher.homePage')}
                                            </h3>
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    openExternalLink(
                                                        LAUNCHER_PAGE_URL,
                                                    )
                                                }
                                                className="btn btn-link gap-1"
                                            >
                                                {LAUNCHER_PAGE_URL}
                                                <ExternalLink className="h-4 w-4 m-0 p-0" />
                                            </button>
                                        </li>
                                        <li>
                                            <h3 className="font-bold">
                                                {t('launcher.docs')}
                                            </h3>
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    openExternalLink(
                                                        LAUNCHER_DOCS_URL,
                                                    )
                                                }
                                                className="btn btn-link gap-1"
                                            >
                                                {LAUNCHER_DOCS_URL}
                                                <ExternalLink className="h-4 w-4 m-0 p-0" />
                                            </button>
                                        </li>
                                    </ul>
                                </div>
                                <div className="flex flex-col flex-1 gap-2">
                                    <h1 className="text-xl">
                                        {t('godot.title')}
                                    </h1>
                                    <ul className="flex flex-col gap-0">
                                        <li>
                                            <h3 className="font-bold">
                                                {t('godot.engine')}
                                            </h3>
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    openExternalLink(
                                                        GODOT_PAGE_URL,
                                                    )
                                                }
                                                className="btn btn-link gap-1"
                                            >
                                                {GODOT_PAGE_URL}
                                                <ExternalLink className="h-4 w-4 m-0 p-0" />
                                            </button>
                                        </li>
                                        <li>
                                            <h3 className="font-bold">
                                                {t('godot.docs')}
                                            </h3>
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    openExternalLink(
                                                        GODOT_DOCS_URL,
                                                    )
                                                }
                                                className="btn btn-link gap-1"
                                            >
                                                {GODOT_DOCS_URL}
                                                <ExternalLink className="h-4 w-4 m-0 p-0" />
                                            </button>
                                        </li>
                                    </ul>
                                </div>
                            </div>
                            <div className="flex flex-1">
                                <div className="flex flex-col flex-1 gap-2">
                                    <h1 className="text-xl flex flex-row items-baseline gap-1">
                                        {t('community.title')}
                                        <button
                                            type="button"
                                            onClick={() =>
                                                openExternalLink(
                                                    COMMUNITY_PAGE_URL,
                                                )
                                            }
                                            className="btn-link flex-row items-center text-sm m-0 p-0 flex gap-1"
                                        >
                                            {t('community.learnMore')}
                                            <ExternalLink className="h-4 w-4 m-0 p-0" />
                                        </button>
                                    </h1>
                                    <ul className="flex flex-row items-center justify-start px-4">
                                        <li>
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    openExternalLink(
                                                        COMMUNITY_DISCORD_URL,
                                                    )
                                                }
                                                className="p-2"
                                            >
                                                <img
                                                    src={IconDiscord}
                                                    className="w-6 h-6"
                                                    alt="Discord"
                                                />
                                            </button>
                                        </li>
                                    </ul>
                                </div>
                            </div>
                            <div className="flex flex-1">
                                <div className="flex flex-col flex-1 gap-2">
                                    <h1 className="text-xl flex flex-row items-baseline gap-1">
                                        {t('contribute.title')}{' '}
                                        <button
                                            type="button"
                                            onClick={() =>
                                                openExternalLink(
                                                    LAUNCHER_CONTRIBUTE_URL,
                                                )
                                            }
                                            className="btn-link flex-row items-center text-sm m-0 p-0 flex gap-1"
                                        >
                                            {t('contribute.learnMore')}
                                            <ExternalLink className="h-4 w-4 m-0 p-0" />
                                        </button>
                                    </h1>
                                    <p>{t('contribute.description')}</p>
                                    <ul className="flex gap-2">
                                        <li>
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    openExternalLink(
                                                        LAUNCHER_GITHUB_ISSUES_URL,
                                                    )
                                                }
                                                className="btn btn-link gap-1"
                                            >
                                                {t('contribute.reportBug')}
                                                <ExternalLink className="h-4 w-4 m-0 p-0" />
                                            </button>
                                        </li>
                                        <li>
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    openExternalLink(
                                                        LAUNCHER_GITHUB_PROPOSALS_URL,
                                                    )
                                                }
                                                className="btn btn-link gap-1"
                                            >
                                                {t('contribute.suggestion')}
                                                <ExternalLink className="h-4 w-4 m-0 p-0" />
                                            </button>
                                        </li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
