import { Folder } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePreferences } from '../../hooks/usePreferences';

export const ProjectsLocation: React.FC = () => {
    const { t } = useTranslation('settings');
    const [dialogOpen, setDialogOpen] = useState<boolean>(false);
    const { preferences, savePreferences } = usePreferences();

    const selectProjectDir = async (currentPath: string) => {
        setDialogOpen(true);
        const result = await window.electron.openDirectoryDialog(
            currentPath,
            'Select Project Directory',
        );
        if (!result.canceled) {
            if (preferences) {
                await savePreferences({
                    ...preferences,
                    projects_location: result.filePaths[0],
                });
            }
        }
        setDialogOpen(false);
    };

    return (
        <>
            {dialogOpen && (
                <div className="absolute inset-0 z-10 w-full h-full bg-black/80 flex flex-col items-center justify-center">
                    <p className="loading loading-infinity"></p>
                    <p>{t('behavior.projectsLocation.waitingForDialog')}</p>
                </div>
            )}
            <div className="flex flex-col gap-4 ">
                <div className="flex flex-col">
                    <h1
                        data-testid="projectLocationHeader"
                        className="font-bold"
                    >
                        {t('behavior.projectsLocation.title')}
                    </h1>
                    <p
                        data-testid="projectLocationSubHeader"
                        className="text-sm"
                    >
                        {t('behavior.projectsLocation.description')}
                    </p>
                </div>
                <button
                    type="button"
                    data-testid="btnSelectProjectDir"
                    className="flex flex-row p-2 gap-2 bg-base-content/10 rounded-md items-center"
                    onClick={() =>
                        selectProjectDir(preferences?.projects_location || '')
                    }
                >
                    <div className="flex flex-col flex-1 items-start">
                        <div className="flex flex-row  items-center gap-2 text-sm text-base-content/50">
                            <Folder className="fill-base-content/50 self-start stroke-none" />
                            {t('behavior.projectsLocation.defaultLocation')}
                        </div>
                        <div className="pl-0">
                            {' '}
                            {preferences?.projects_location}{' '}
                        </div>
                    </div>
                </button>
            </div>
        </>
    );
};
