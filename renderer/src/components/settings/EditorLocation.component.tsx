import { useTranslation } from 'react-i18next';
import { SettingsLocationSelector } from './settings-location-selector.component';

/** Renders the editor installs location preference. */
export const EditorsLocation: React.FC = () => {
    const { t } = useTranslation('settings');

    return (
        <SettingsLocationSelector
            preferenceKey="install_location"
            title={t('behavior.editorsLocation.title')}
            description={t('behavior.editorsLocation.description')}
            fieldLabel={t('behavior.editorsLocation.installLocation')}
            browseLabel={t('codeEditors.drawer.path.browse')}
            waitingMessage={t('behavior.editorsLocation.waitingForDialog')}
            dialogTitle="Select Install Directory"
            headerTestId="editorInstallLocationHeader"
            descriptionTestId="editoInstallLocationSubHeader"
            pathTestId="editorInstallLocationPath"
            browseTestId="btnSelectInstallDir"
        />
    );
};
