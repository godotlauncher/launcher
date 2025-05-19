import { ExternalLink, MessageCircleQuestion } from 'lucide-react';
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
    LAUNCHER_THIRD_PARTY_RAW_URL
} from '../constants';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { useApp } from '../hooks/useApp';


export const HelpVIew: React.FC = () => {

    const { openExternalLink } = useAppNavigation();
    const { appVersion } = useApp();

    const openChangeLog = () => {
        const url = `https://github.com/godotlauncher/launcher/blob/v${appVersion}/CHANGELOG.md`;
        openExternalLink(url);
    };

    return (
        <>
            <div className="flex flex-col h-full w-full p-1">
                <div className="flex flex-col gap-2 w-full">

                    <div className="flex flex-row items-center gap-2">
                        <MessageCircleQuestion className="w-7 h-7" />
                        <h1 data-testid="helpTitle" className="text-2xl">Help</h1>
                        <div className="flex flex-1 gap-2 justify-end">
                            <button
                                onClick={() => open(LAUNCHER_THIRD_PARTY_RAW_URL, '_blank', 'noopener,menubar=no,resizable=yes,scrollbars=yes,status=no,titlebar=no,toolbar=no,nodeIntegration=no')}
                                className="btn btn-link btn-sm gap-1"
                                aria-label="Third-party copyright notices"
                            >
                                Third-party Notices
                                <ExternalLink className="h-4" />
                            </button>
                        </div>
                    </div>
                </div>
                <div className="divider m-0 my-2"></div>

                <div className="flex flex-col gap-0 flex-1">

                    {/* Scrollable Content */}
                    <div className='flex flex-col py-4 flex-1 max-h-full border border-base-300 border-t-0 bg-base-100 rounded-box overflow-hidden'>
                        <div className="flex-1 overflow-y-auto px-6">
                            <div className='flex flex-col h-0 gap-4'>

                                <div className="flex flex-row gap-0">
                                    <div className="flex flex-col flex-1 gap-2">
                                        <h1 className="flex gap-1 items-baseline text-xl">Godot Launcher
                                            <button
                                                onClick={() => openChangeLog()}
                                                className="btn-link flex-row items-center text-sm m-0 p-0 flex gap-1">Change Log<ExternalLink className="h-4 w-4 m-0 p-0" />
                                            </button>
                                        </h1>
                                        <ul className="flex flex-col gap-0">
                                            <li>
                                                <h3 className="font-bold">Home Page</h3>
                                                <button onClick={() => openExternalLink(LAUNCHER_PAGE_URL)} className="btn btn-link gap-1">{LAUNCHER_PAGE_URL}<ExternalLink className="h-4 w-4 m-0 p-0" /></button>
                                            </li>
                                            <li>
                                                <h3 className="font-bold">Launcher Docs</h3>
                                                <button onClick={() => openExternalLink(LAUNCHER_DOCS_URL)} className="btn btn-link gap-1">{LAUNCHER_DOCS_URL}<ExternalLink className="h-4 w-4 m-0 p-0" /></button>
                                            </li>
                                        </ul>
                                    </div>
                                    <div className="flex flex-col flex-1 gap-2">

                                        <h1 className="text-xl">Godot Engine</h1>
                                        <ul className="flex flex-col gap-0">
                                            <li>
                                                <h3 className="font-bold">Godot Engine</h3>
                                                <button onClick={() => openExternalLink(GODOT_PAGE_URL)} className="btn btn-link gap-1">{GODOT_PAGE_URL}<ExternalLink className="h-4 w-4 m-0 p-0" /></button>
                                            </li>
                                            <li>
                                                <h3 className="font-bold">Godot Docs</h3>
                                                <button onClick={() => openExternalLink(GODOT_DOCS_URL)} className="btn btn-link gap-1" >{GODOT_DOCS_URL}<ExternalLink className="h-4 w-4 m-0 p-0" /></button>
                                            </li>
                                        </ul>
                                    </div>
                                </div>
                                <div className="flex flex-1">
                                    <div className="flex flex-col flex-1 gap-2">
                                        <h1 className="text-xl flex flex-row items-baseline gap-1">Community and Support
                                            <button
                                                onClick={() => openExternalLink(COMMUNITY_PAGE_URL)}
                                                className="btn-link flex-row items-center text-sm m-0 p-0 flex gap-1">Learn More<ExternalLink className="h-4 w-4 m-0 p-0" />
                                            </button>
                                        </h1>
                                        <ul className="flex flex-row items-center justify-start px-4">
                                            <li>
                                                <button onClick={() => openExternalLink(COMMUNITY_DISCORD_URL)} className="p-2"><img src={IconDiscord} className="w-6 h-6" alt="Discord" /></button>
                                            </li>
                                        </ul>
                                    </div>
                                </div>
                                <div className="flex flex-1">
                                    <div className="flex flex-col flex-1 gap-2">

                                        <h1 className="text-xl flex flex-row items-baseline gap-1"
                                        >How to Contribute <button
                                            onClick={() => openExternalLink(LAUNCHER_CONTRIBUTE_URL)}
                                            className="btn-link flex-row items-center text-sm m-0 p-0 flex gap-1">Learn More<ExternalLink className="h-4 w-4 m-0 p-0" />
                                            </button>
                                        </h1>
                                        <p>Report bugs or suggestions by submitting and issue on the official GitHub repository</p>
                                        <ul className="flex gap-2">
                                            <li>
                                                <button onClick={() => openExternalLink(LAUNCHER_GITHUB_ISSUES_URL)} className="btn btn-link gap-1">I think I found a bug<ExternalLink className="h-4 w-4 m-0 p-0" /></button>
                                            </li>
                                            <li>
                                                <button onClick={() => openExternalLink(LAUNCHER_GITHUB_PROPOSALS_URL)} className="btn btn-link gap-1">I have a suggestion!<ExternalLink className="h-4 w-4 m-0 p-0" /></button>
                                            </li>
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

        </>);
};
