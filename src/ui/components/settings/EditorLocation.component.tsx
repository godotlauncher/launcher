import { Folder } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePreferences } from '../../hooks/usePreferences';

export const EditorsLocation: React.FC = () => {
    const { t } = useTranslation('settings');
    const [dialogOpen, setDialogOpen] = useState<boolean>(false);
    const { preferences, savePreferences } = usePreferences();

    const selectInstallDir = async (currentPath: string) => {
        setDialogOpen(true);
        const result = await window.electron.openDirectoryDialog(
            currentPath,
            'Select Install Directory',
        );
        if (!result.canceled) {
            if (preferences) {
                await savePreferences({
                    ...preferences,
                    install_location: result.filePaths[0],
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
                    <p>{t('behavior.editorsLocation.waitingForDialog')}</p>
                </div>
            )}
            <div className="flex flex-col gap-4 ">
                <div className="flex flex-col">
                    <h1
                        data-testid="editorInstallLocationHeader"
                        className="font-bold"
                    >
                        {t('behavior.editorsLocation.title')}
                    </h1>
                    <p
                        data-testid="editoInstallLocationSubHeader"
                        className="text-sm"
                    >
                        {t('behavior.editorsLocation.description')}
                    </p>
                </div>
                <button
                    type="button"
                    data-testid="btnSelectInstallDir"
                    className="flex flex-row p-2 gap-2 bg-base-content/10 rounded-md items-center"
                    onClick={() =>
                        selectInstallDir(preferences?.install_location || '')
                    }
                >
                    <div className="flex flex-col flex-1 items-start">
                        <div className="flex flex-row  items-center gap-2 text-sm text-base-content/50">
                            <Folder className="fill-base-content/50 self-start stroke-none" />
                            {t('behavior.editorsLocation.installLocation')}
                        </div>
                        <div className="pl-0">
                            {' '}
                            {preferences?.install_location}{' '}
                        </div>
                    </div>
                </button>
            </div>
        </>
    );
};
