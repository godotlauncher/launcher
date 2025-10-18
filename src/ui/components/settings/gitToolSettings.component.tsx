import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

export const GitToolSettings: React.FC = () => {
    const { t } = useTranslation('settings');
    const [tool, setTool] = useState<InstalledTool | undefined>();

    const checkGit = useCallback(async () => {
        const tools = await window.electron.getInstalledTools();
        const git = tools.find(tool => tool.name === 'Git');
        setTool(git);
    }, []);

    useEffect(() => {
        // Initial data fetching on mount
        // eslint-disable-next-line react-hooks/set-state-in-effect
        checkGit();
    }, [checkGit]);


    return (
        <div className="flex flex-col gap-4">
            <div>
                <h2 data-testid="startupSettingsHeader" className="font-bold">{t('tools.git.title')}</h2>
                <p data-testid="startupSettingsSubHeader" className="text-sm">{t('tools.git.description')}</p>
            </div>
            <div className="flex flex-col w-fullitems-start justify-center gap-0 ">

                <div className="flex flex-row items-center p-4 bg-base-200 rounded-lg">
                    <table className="">
                        <tbody>
                            <tr className="h-10">
                                <td className="flex-1 pr-2">{t('tools.git.installed')}</td>
                                <td className="px-4 ">{tool ? '✅' : '❌'}</td>
                            </tr>
                            <tr className="h-10">
                                <td className="flex-1 pr-2">{t('tools.git.version')}</td>
                                <td className="px-4 ">{tool?.version}</td>
                            </tr>

                        </tbody>
                    </table>

                </div>
            </div>
        </div>
    );
};