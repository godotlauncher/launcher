import { useTranslation } from 'react-i18next';
import { SettingsLocationSelector } from './settings-location-selector.component';

/** Renders the projects location preference. */
export const ProjectsLocation: React.FC = () => {
    const { t } = useTranslation('settings');

    return (
        <SettingsLocationSelector
            preferenceKey="projects_location"
            title={t('behavior.projectsLocation.title')}
            description={t('behavior.projectsLocation.description')}
            fieldLabel={t('behavior.projectsLocation.defaultLocation')}
            browseLabel={t('codeEditors.drawer.path.browse')}
            waitingMessage={t('behavior.projectsLocation.waitingForDialog')}
            dialogTitle="Select Project Directory"
            headerTestId="projectLocationHeader"
            descriptionTestId="projectLocationSubHeader"
            pathTestId="projectLocationPath"
            browseTestId="btnSelectProjectDir"
        />
    );
};
