import type {
    CodeEditorId,
    CodeEditorIntegrationSettings,
} from '@shared/contracts';
import clsx from 'clsx';
import { CircleHelp } from 'lucide-react';
import type React from 'react';

type Translate = (key: string) => string;

type CreateProjectToolOptionsSectionProps = {
    t: Translate;
    loadingTools: boolean;
    loadingCodeEditors: boolean;
    gitAvailable: boolean;
    vsCodeAvailable: boolean;
    codeEditorSettings: CodeEditorIntegrationSettings[];
    codeEditorId: CodeEditorId | null;
    withGit: boolean;
    withVSCode: boolean;
    onWithGitChange: (enabled: boolean) => void;
    onCodeEditorIdChange: (codeEditorId: CodeEditorId | null) => void;
    onWithVSCodeChange: (enabled: boolean) => void;
    onVSCodeHelp: () => void;
};

export const CreateProjectToolOptionsSection: React.FC<
    CreateProjectToolOptionsSectionProps
> = ({
    t,
    loadingTools,
    loadingCodeEditors,
    gitAvailable,
    vsCodeAvailable,
    codeEditorSettings,
    codeEditorId,
    withGit,
    withVSCode,
    onWithGitChange,
    onWithVSCodeChange,
    onCodeEditorIdChange,
    onVSCodeHelp,
}) => (
    <div className="flex-1">
        <div className="flex flex-col gap-2">
            <h2 className="text-md flex items-center gap-4">
                {t('otherSettings.title')}{' '}
                {(loadingTools || loadingCodeEditors) && (
                    <span className="loading loading-dots loading-xs"></span>
                )}
            </h2>

            <div
                className={clsx('flex flex-col gap-4 p-4 ', {
                    invisible: loadingTools || loadingCodeEditors,
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

                <label className="flex flex-col gap-2">
                    <span>{t('otherSettings.codeEditor.label')}</span>
                    <select
                        data-testid="selectCreateProjectCodeEditor"
                        className="select select-bordered w-full"
                        disabled={loadingCodeEditors}
                        value={codeEditorId ?? ''}
                        onChange={(event) =>
                            onCodeEditorIdChange(
                                event.target.value === ''
                                    ? null
                                    : (event.target.value as CodeEditorId),
                            )
                        }
                    >
                        <option value="">
                            {t('otherSettings.codeEditor.none')}
                        </option>
                        {codeEditorSettings.map((settings) => {
                            const unavailableReason = !settings.enabled
                                ? t('otherSettings.codeEditor.disabled')
                                : settings.installation
                                  ? null
                                  : t('otherSettings.codeEditor.notFound');

                            return (
                                <option
                                    key={settings.integration.id}
                                    value={settings.integration.id}
                                    disabled={unavailableReason !== null}
                                >
                                    {`${settings.integration.displayName}${unavailableReason ? ` (${unavailableReason})` : ''}`}
                                </option>
                            );
                        })}
                    </select>
                </label>

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
