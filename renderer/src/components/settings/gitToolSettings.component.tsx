import type { ToolIntegrationSummary } from '@shared/contracts';
import { useTranslation } from 'react-i18next';

type GitToolSettingsProps = {
    tool?: ToolIntegrationSummary;
};

export const GitToolSettings: React.FC<GitToolSettingsProps> = ({ tool }) => {
    const { t } = useTranslation('settings');

    const status = tool
        ? tool.status === 'available'
            ? {
                  label: t('tools.status.available'),
                  appearance: 'badge-success',
              }
            : tool.status === 'invalid'
              ? {
                    label: t('tools.status.invalid'),
                    appearance: 'badge-warning',
                }
              : {
                    label: t('tools.status.missing'),
                    appearance: 'badge-error',
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
                <div
                    className="flex w-full flex-row items-center rounded-lg bg-base-200 p-4"
                    data-testid="gitToolCard"
                >
                    <table className="w-full">
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
