import { Folder, X } from "lucide-react";
import { MouseEvent, useEffect, useState } from 'react';
import { usePreferences } from '../../hooks/usePreferences';

export const VSCodeToolSettings: React.FC = () => {

    const [dialogOpen, setDialogOpen] = useState<boolean>(false);
    const [tool, setTool] = useState<InstalledTool | undefined>();

    const { preferences, updatePreferences } = usePreferences();

    const checkVSCode = async () => {
        const tools = await window.electron.getInstalledTools();
        const vscode = tools.find(tool => tool.name === 'VSCode');
        setTool(vscode);
    };

    const clearCustomPath = async (e: MouseEvent) => {
        e.preventDefault();
        if (preferences) {
            await updatePreferences({ vs_code_path: '' });
        }
    };

    const selectVsCodePath = async (currentPath: string) => {
        setDialogOpen(true);
        const result = await window.electron.openFileDialog(currentPath, 'Select Visual Studio Code Executable', [{ name: 'All Files', extensions: ['*'] }]);
        if (!result.canceled) {
            if (preferences) {
                await updatePreferences({ vs_code_path: result.filePaths[0] });
            }
        }
        setDialogOpen(false);
    };

    useEffect(() => {
        checkVSCode();
    }, []);

    useEffect(() => {
        checkVSCode();
    }, [preferences]);

    return (
        <>
            {
                dialogOpen &&
                <div className="absolute inset-0 z-10 w-full h-full bg-black/80 flex flex-col items-center justify-center">
                    <p className="loading loading-infinity"></p><p>Waiting for dialog...</p>
                </div>
            }
            <div className="flex flex-col gap-4">
                <div>
                    <h2 data-testid="startupSettingsHeader" className="font-bold">Visual Studio Code</h2>
                    <p data-testid="startupSettingsSubHeader" className="text-sm">A fast, extensible code editor with GDScript and .NET support for Godot.</p>
                </div>
                <div className="flex flex-col flex-shrink items-start justify-center gap-4 ">
                    {(!tool || (tool?.path?.length || 0) === 0) && (

                        <div className="alert flex flex-col items-start alert-warning bg-warning/50">
                            <h2 className="font-bold text-lg">Visual Studio Code not Detected!</h2>
                            <p>Godot Launcher is only able to automatically detect VS Code if it was installed in the PATH. You can instead specify the path to the vs code executable below</p>
                        </div>
                    )}
                    <div className="flex flex-col w-full gap-4 relative">
                        {
                            preferences?.vs_code_path && preferences?.vs_code_path.length > 0 &&
                            <span className="tooltip tooltip-left absolute right-2 top-2" data-tip="Clear Custom Path">
                                <button onClick={(e) => clearCustomPath(e)} className="flex btn btn-xs ">
                                    <X className="fill-base-content w-4 h-4" />
                                </button>
                            </span>
                        }
                        <button
                            data-testid="btnSelectInstallDir"
                            className="flex flex-row p-2 gap-2 bg-base-content/10 rounded-md items-center"
                            onClick={() => selectVsCodePath(preferences?.vs_code_path || tool?.path || '')}
                        >
                            <div className="flex flex-col flex-1 items-start">
                                <div className="flex flex-row items-center justify-start gap-2 text-sm text-base-content/50 w-full">
                                    <Folder className="fill-base-content/50 self-start stroke-none" />
                                    <p className="flex  flex-grow flex-1">Visual Studio Code Path to Executable {(preferences?.vs_code_path?.length || 0) === 0 && (tool?.path != null && tool.path.length > 0) ? '(autodetected)' : ''}</p>

                                </div>
                                <div className="pl-0"> {preferences?.vs_code_path || <span className="text-base-content/50"> {preferences?.vs_code_path || tool?.path || 'no path set'} </span>}</div>
                            </div>

                        </button>
                        <div className="flex flex-row items-center p-4 bg-base-200 rounded-lg">
                            <table className="">
                                <tbody>
                                    <tr className="h-10">
                                        <td className="flex-1 pr-2">Installed:</td>
                                        <td className="px-4 ">{tool?.path && tool.path.length > 0 ? '✅' : '❌'}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                    </div>
                </div>
            </div>
        </>);
};