import { useEffect, useState } from 'react';

export const GitToolSettings: React.FC = () => {

    const [tool, setTool] = useState<InstalledTool | undefined>();

    const checkGit = async () => {
        const tools = await window.electron.getInstalledTools();
        const git = tools.find(tool => tool.name === 'Git');
        setTool(git);
    };

    useEffect(() => {
        checkGit();
    }, []);


    return (
        <div className="flex flex-col gap-4">
            <div>
                <h2 data-testid="startupSettingsHeader" className="font-bold">Git</h2>
                <p data-testid="startupSettingsSubHeader" className="text-sm">Git is a distributed version control system for managing code changes and collaboration.</p>
            </div>
            <div className="flex flex-col w-fullitems-start justify-center gap-0 ">

                <div className="flex flex-row items-center p-4 bg-base-200 rounded-lg">
                    <table className="">
                        <tbody>
                            <tr className="h-10">
                                <td className="flex-1 pr-2">Installed:</td>
                                <td className="px-4 ">{tool ? '✅' : '❌'}</td>
                            </tr>
                            <tr className="h-10">
                                <td className="flex-1 pr-2">Version:</td>
                                <td className="px-4 ">{tool?.version}</td>
                            </tr>

                        </tbody>
                    </table>

                </div>
            </div>
        </div>
    );
};