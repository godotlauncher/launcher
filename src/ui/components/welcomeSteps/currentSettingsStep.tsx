import { useEffect, useState } from 'react';
import { usePreferences } from '../../hooks/usePreferences';

type CurrentSettingsStepProps = {
    onSkip: () => void;
};

export const CurrentSettingsStep: React.FC<CurrentSettingsStepProps> = ({ onSkip }) => {

    const [loading, setLoading] = useState<boolean>(true);
    const { preferences } = usePreferences();

    useEffect(() => {
        if (preferences) {
            setLoading(false);
        }
    }, [preferences]);

    const getPostLaunchText = (action: UserPreferences['post_launch_action']) => {
        switch (action) {
        case 'none':
            return 'Nothing';
        case 'minimize':
            return 'Minimize';
        case 'close_to_tray':
            return 'Close to system tray';
        default:
            return 'Nothing';
        }
    };
    return (
        <div className="flex flex-col gap-2 text-sm">
            {/* Default settings */}
            {loading && <p className="loading loading-spinner w-6"></p>}
            {!loading && (
                <>
                    <p className="font-bold">Default Settings:</p>
                    <div className="bg-base-200 p-4 rounded-lg flex flex-row justify-between items-start ">

                        <table className="">
                            <tbody>
                                <tr className="h-8">
                                    <td className="flex-1">Projects Location:</td>
                                    <td className="pl-4">{preferences?.projects_location}</td>
                                </tr>
                                <tr className="h-8">
                                    <td className="flex-1">Godot Install Location:</td>
                                    <td className="pl-4">{preferences?.install_location}</td>
                                </tr>
                                <tr className="h-8">

                                    <td className="flex-1">Action After Launching a Project:</td>
                                    <td className="pl-4">{getPostLaunchText(preferences?.post_launch_action || 'close_to_tray')}</td>
                                </tr>
                                <tr className="h-8">

                                    <td className="flex-1">Auto Check for Updates:</td>
                                    <td className="pl-4">{preferences?.auto_check_updates ? 'Yes' : 'No'}</td>
                                </tr>

                                <tr className="h-8">
                                    <td className="flex-1">Auto Start When Computer Starts:</td>
                                    <td className="pl-4">{preferences?.auto_start ? 'Yes' : 'No'}</td>
                                </tr>

                                {
                                    preferences?.auto_start &&
                                    <tr>
                                        <td className="flex-1">Auto Start Type:</td>
                                        <td className="pl-4">{preferences?.start_in_tray ? 'System Tray' : 'Normal Window'}</td>
                                    </tr>
                                }

                            </tbody>

                        </table>
                        <button onClick={onSkip} className="btn btn-ghost">Skip, Use Defaults</button>
                    </div>

                </>
            )
            }



        </div>





    );
};
