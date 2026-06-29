import clsx from 'clsx';
import { CircleHelp } from 'lucide-react';
import type React from 'react';

type Translate = (key: string) => string;

type CreateProjectToolOptionsSectionProps = {
    t: Translate;
    loadingTools: boolean;
    gitAvailable: boolean;
    vsCodeAvailable: boolean;
    withGit: boolean;
    withVSCode: boolean;
    onWithGitChange: (enabled: boolean) => void;
    onWithVSCodeChange: (enabled: boolean) => void;
    onVSCodeHelp: () => void;
};

export const CreateProjectToolOptionsSection: React.FC<
    CreateProjectToolOptionsSectionProps
> = ({
    t,
    loadingTools,
    gitAvailable,
    vsCodeAvailable,
    withGit,
    withVSCode,
    onWithGitChange,
    onWithVSCodeChange,
    onVSCodeHelp,
}) => (
    <div className="flex-1">
        <div className="flex flex-col gap-2">
            <h2 className="text-md flex items-center gap-4">
                {t('otherSettings.title')}{' '}
                {loadingTools && (
                    <span className="loading loading-dots loading-xs"></span>
                )}
            </h2>

            <div
                className={clsx('flex flex-col gap-4 p-4 ', {
                    invisible: loadingTools,
                })}
            >
                <label className="flex cursor-pointer gap-2 items-center">
                    <input
                        type="checkbox"
                        className="checkbox"
                        disabled={!gitAvailable}
                        checked={withGit}
                        onChange={(event) =>
                            onWithGitChange(event.target.checked)
                        }
                    />
                    <span className="">{t('otherSettings.initGit')}</span>
                </label>
                {!gitAvailable && (
                    <span className="text-sm text-warning">
                        {t('otherSettings.gitNotInstalled')}
                    </span>
                )}

                <div className="divider m-0"></div>

                <label className="flex cursor-pointer gap-2 items-center">
                    <input
                        type="checkbox"
                        className="checkbox"
                        disabled={!vsCodeAvailable}
                        checked={withVSCode}
                        onChange={(event) =>
                            onWithVSCodeChange(event.target.checked)
                        }
                    />
                    <span className="">{t('otherSettings.setupVSCode')}</span>
                </label>
                {!vsCodeAvailable && (
                    <span>
                        {' '}
                        <button
                            type="button"
                            className="text-sm text-warning items-center flex flex-row gap-2"
                            onClick={onVSCodeHelp}
                        >
                            <CircleHelp className="stroke-warning" />
                            {t('otherSettings.vscodeNotInstalled')}
                        </button>
                    </span>
                )}
            </div>
        </div>
    </div>
);
