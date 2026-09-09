import { ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
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
} from '../app.constants';
import IconDiscord from '../assets/icons/discord-symbol-blurple.svg';
import { ContentDivider } from '../components/ui/content-divider.component';
import { useApp } from '../hooks/app.hook';
import { useAppNavigation } from '../hooks/app-navigation.hook';

type HelpLinkProps = {
    children: React.ReactNode;
    onClick: () => void;
    button?: boolean;
};

/**
 * Renders a consistently sized external Help link.
 * @param props - Link content, action and optional ghost-button presentation.
 */
const HelpLink: React.FC<HelpLinkProps> = ({
    children,
    onClick,
    button = false,
}) => (
    <button
        type="button"
        data-external-link=""
        onClick={onClick}
        className={
            button
                ? 'btn btn-ghost gap-2 text-base'
                : 'link link-primary inline-flex max-w-full items-center gap-1 text-left text-base'
        }
    >
        <span className="inline-flex min-w-0 items-center break-words">
            {children}
        </span>
        <ExternalLink
            size={16}
            className="shrink-0 opacity-50"
            aria-hidden="true"
        />
    </button>
);

/** Renders support resources with Settings typography and surfaces. */
export const HelpVIew: React.FC = () => {
    const { t } = useTranslation(['help', 'common']);
    const { openExternalLink } = useAppNavigation();
    const { appVersion } = useApp();

    const resourceGroups = [
        {
            title: t('launcher.title'),
            resources: [
                { label: t('launcher.homePage'), url: LAUNCHER_PAGE_URL },
                { label: t('launcher.docs'), url: LAUNCHER_DOCS_URL },
            ],
            changelog: true,
        },
        {
            title: t('godot.title'),
            resources: [
                { label: t('godot.engine'), url: GODOT_PAGE_URL },
                { label: t('godot.docs'), url: GODOT_DOCS_URL },
            ],
            changelog: false,
        },
    ];

    return (
        <div className="flex h-full min-h-0 w-full flex-col gap-2 p-1 text-base">
            <header className="flex shrink-0 items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                    <h1
                        className="pl-3 text-[20px] font-semibold"
                        data-testid="helpTitle"
                    >
                        {t('title')}
                    </h1>
                </div>
                <HelpLink
                    onClick={() => {
                        open(
                            LAUNCHER_THIRD_PARTY_RAW_URL,
                            '_blank',
                            'noopener,menubar=no,resizable=yes,scrollbars=yes,status=no,titlebar=no,toolbar=no,nodeIntegration=no',
                        );
                    }}
                >
                    {t('thirdPartyNotices')}
                </HelpLink>
            </header>
            <ContentDivider />
            <div className="min-h-0 flex-1 overflow-y-auto pr-3">
                <div className="flex flex-col gap-[24px] pb-4">
                    <div className="grid grid-cols-2 gap-4">
                        {resourceGroups.map((group) => (
                            <section
                                key={group.title}
                                className="flex min-w-0 flex-col gap-3 rounded-md bg-base-200/40 p-4"
                            >
                                <div className="flex flex-wrap items-baseline gap-3">
                                    <h2 className="text-base font-semibold">
                                        {group.title}
                                    </h2>
                                    {group.changelog && (
                                        <HelpLink
                                            onClick={() =>
                                                openExternalLink(
                                                    `https://github.com/godotlauncher/launcher/blob/v${appVersion}/CHANGELOG.md`,
                                                )
                                            }
                                        >
                                            {t('launcher.changelog')}
                                        </HelpLink>
                                    )}
                                </div>
                                <div className="flex flex-col items-start gap-3 pl-3">
                                    <ul className="flex flex-col gap-3">
                                        {group.resources.map((resource) => (
                                            <li
                                                key={resource.url}
                                                className="flex min-w-0 flex-col items-start gap-[4px]"
                                            >
                                                <p className="text-base-content/75">
                                                    {resource.label}
                                                </p>
                                                <HelpLink
                                                    onClick={() =>
                                                        openExternalLink(
                                                            resource.url,
                                                        )
                                                    }
                                                >
                                                    {resource.url}
                                                </HelpLink>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </section>
                        ))}
                    </div>
                    <section className="flex flex-col items-start gap-3 rounded-md bg-base-200/40 p-4">
                        <div className="flex w-full flex-wrap items-baseline gap-3">
                            <h2 className="text-base font-semibold">
                                {t('community.title')}
                            </h2>
                            <HelpLink
                                onClick={() =>
                                    openExternalLink(COMMUNITY_PAGE_URL)
                                }
                            >
                                {t('community.learnMore')}
                            </HelpLink>
                        </div>
                        <HelpLink
                            button
                            onClick={() =>
                                openExternalLink(COMMUNITY_DISCORD_URL)
                            }
                        >
                            <span className="inline-flex items-center gap-2">
                                <img
                                    src={IconDiscord}
                                    className="size-5 shrink-0"
                                    alt=""
                                />
                                {t('app.navigation.joinCommunity', {
                                    ns: 'common',
                                })}
                            </span>
                        </HelpLink>
                    </section>
                    <section className="flex flex-col gap-3 rounded-md bg-base-200/40 p-4">
                        <div className="flex flex-wrap items-baseline gap-3">
                            <h2 className="text-base font-semibold">
                                {t('contribute.title')}
                            </h2>
                            <HelpLink
                                onClick={() =>
                                    openExternalLink(LAUNCHER_CONTRIBUTE_URL)
                                }
                            >
                                {t('contribute.learnMore')}
                            </HelpLink>
                        </div>
                        <p className="text-base-content/75">
                            {t('contribute.description')}
                        </p>
                        <ul className="flex flex-wrap gap-x-4 gap-y-2">
                            <li>
                                <HelpLink
                                    onClick={() =>
                                        openExternalLink(
                                            LAUNCHER_GITHUB_ISSUES_URL,
                                        )
                                    }
                                >
                                    {t('contribute.reportBug')}
                                </HelpLink>
                            </li>
                            <li>
                                <HelpLink
                                    onClick={() =>
                                        openExternalLink(
                                            LAUNCHER_GITHUB_PROPOSALS_URL,
                                        )
                                    }
                                >
                                    {t('contribute.suggestion')}
                                </HelpLink>
                            </li>
                        </ul>
                    </section>
                </div>
            </div>
        </div>
    );
};
