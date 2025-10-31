import { useTranslation } from 'react-i18next';

type GitToolSettingsProps = {
    tool?: CachedTool;
};

export const GitToolSettings: React.FC<GitToolSettingsProps> = ({ tool }) => {
    const { t } = useTranslation('settings');

    const status = tool
        ? tool.verified
            ? {
                label: t('tools.status.available'),
                appearance: 'badge-success',
            }
            : {
                label: t('tools.status.invalid'),
                appearance: 'badge-warning',
            }
        : {
            label: t('tools.status.missing'),
            appearance: 'badge-error',
        };

    const version =
        tool?.version && tool.version.trim().length > 0
            ? tool.version
            : t('tools.status.unknown');

    return (
        <div className="flex flex-col gap-4">
            <div>
                <h2 data-testid="startupSettingsHeader" className="font-bold">
                    {t('tools.git.title')}
                </h2>
                <p data-testid="startupSettingsSubHeader" className="text-sm">
                    {t('tools.git.description')}
                </p>
            </div>
            <div className="flex flex-col items-start justify-center gap-0">
                <div className="flex flex-row items-center p-4 bg-base-200 rounded-lg w-full max-w-xl">
                    <table>
                        <tbody>
                            <tr className="h-10">
                                <td className="flex-1 pr-2">
                                    {t('tools.git.installed')}
                                </td>
                                <td className="px-4">
                                    <span
                                        className={`badge badge-sm ${status.appearance}`}
                                    >
                                        {status.label}
                                    </span>
                                </td>
                            </tr>
                            <tr className="h-10">
                                <td className="flex-1 pr-2">
                                    {t('tools.git.version')}
                                </td>
                                <td className="px-4">{version}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};
