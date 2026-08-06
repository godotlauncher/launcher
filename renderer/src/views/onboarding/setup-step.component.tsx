import type {
    CodeEditorId,
    CodeEditorIntegrationSettings,
} from '@shared/contracts';
import type React from 'react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { CodeEditorIntegrationIcon } from '../../components/codeEditorIntegrationIcon.component';
import { WindowsSymlinkSetting } from '../../components/settings/WindowsSymlinkSetting.component';
import { PathField } from '../../components/ui/pathField.component';
import { SelectField } from '../../components/ui/selectField.component';
import { PlatformStorageNotice } from './platform-storage-notice.component';

type SetupStepProps = {
    platform: string;
    projectsLocation: string;
    editorLocation: string;
    recommendedProjectsLocation?: string;
    recommendedEditorLocation?: string;
    projectsLocationError?: string;
    editorLocationError?: string;
    integrations: CodeEditorIntegrationSettings[];
    integrationsLoading: boolean;
    integrationsLoadFailed: boolean;
    selectedCodeEditorId: CodeEditorId | null;
    windowsSymlinksEnabled: boolean;
    pending: boolean;
    onProjectsLocationChange: (value: string) => void;
    onEditorLocationChange: (value: string) => void;
    onProjectsLocationSelect: () => void;
    onEditorLocationSelect: () => void;
    onCodeEditorChange: (value: CodeEditorId | null) => void;
    onWindowsSymlinksChange: (enabled: boolean) => void;
};

export const SetupStep: React.FC<SetupStepProps> = ({
    platform,
    projectsLocation,
    editorLocation,
    recommendedProjectsLocation,
    recommendedEditorLocation,
    projectsLocationError,
    editorLocationError,
    integrations,
    integrationsLoading,
    integrationsLoadFailed,
    selectedCodeEditorId,
    windowsSymlinksEnabled,
    pending,
    onProjectsLocationChange,
    onEditorLocationChange,
    onProjectsLocationSelect,
    onEditorLocationSelect,
    onCodeEditorChange,
    onWindowsSymlinksChange,
}) => {
    const { t } = useTranslation(['welcome', 'settings', 'common']);
    const selectableIntegrations = useMemo(
        () =>
            integrations.filter(
                (integration) =>
                    integration.enabled && Boolean(integration.installation),
            ),
        [integrations],
    );
    const selectedIntegration = selectableIntegrations.find(
        (integration) => integration.integration.id === selectedCodeEditorId,
    );

    return (
        <div className="flex max-w-3xl flex-col gap-5">
            <div className="flex flex-col gap-2">
                <h1
                    data-testid="onboarding-step-heading"
                    tabIndex={-1}
                    className="text-3xl font-bold tracking-tight outline-none"
                >
                    {t('welcome:onboarding.setup.title')}
                </h1>
                <p className="text-base-content/65">
                    {t('welcome:onboarding.setup.description')}
                </p>
            </div>

            <div className="grid gap-4">
                <PathField
                    id="onboarding-projects-location"
                    label={t('settings:behavior.projectsLocation.title')}
                    labelAction={
                        projectsLocation === recommendedProjectsLocation ? (
                            <span className="badge badge-sm badge-ghost">
                                {t('welcome:onboarding.setup.recommended')}
                            </span>
                        ) : undefined
                    }
                    help={t('settings:behavior.projectsLocation.description')}
                    value={projectsLocation}
                    onChange={onProjectsLocationChange}
                    onSelect={onProjectsLocationSelect}
                    error={projectsLocationError}
                    disabled={pending}
                    browseKind="directory"
                    browseLabel={t(
                        'welcome:onboarding.setup.browseProjectsLocation',
                    )}
                    browseText={t('settings:codeEditors.drawer.path.browse')}
                />
                <PathField
                    id="onboarding-editor-location"
                    label={t('settings:behavior.editorsLocation.title')}
                    labelAction={
                        editorLocation === recommendedEditorLocation ? (
                            <span className="badge badge-sm badge-ghost">
                                {t('welcome:onboarding.setup.recommended')}
                            </span>
                        ) : undefined
                    }
                    help={t('settings:behavior.editorsLocation.description')}
                    value={editorLocation}
                    onChange={onEditorLocationChange}
                    onSelect={onEditorLocationSelect}
                    error={editorLocationError}
                    disabled={pending}
                    browseKind="directory"
                    browseLabel={t(
                        'welcome:onboarding.setup.browseEditorLocation',
                    )}
                    browseText={t('settings:codeEditors.drawer.path.browse')}
                />
            </div>

            {platform === 'win32' ? (
                <div className="rounded-box border border-primary/35 bg-primary/5 p-4">
                    <WindowsSymlinkSetting
                        value={windowsSymlinksEnabled}
                        onChange={(enabled) => {
                            onWindowsSymlinksChange(enabled);
                            return true;
                        }}
                        disabled={pending}
                        showDivider={false}
                        compact
                    />
                </div>
            ) : (
                <PlatformStorageNotice platform={platform} />
            )}

            <div className="flex flex-col gap-2">
                <SelectField
                    id="onboarding-code-editor"
                    label={t('welcome:onboarding.setup.codeEditor')}
                    help={t('welcome:onboarding.setup.codeEditorHelp')}
                    value={selectedCodeEditorId ?? 'none'}
                    onChange={(value) =>
                        onCodeEditorChange(
                            value === 'none' ? null : (value as CodeEditorId),
                        )
                    }
                    options={[
                        {
                            value: 'none',
                            label: t('welcome:onboarding.setup.noCodeEditor'),
                        },
                        ...selectableIntegrations.map((integration) => ({
                            value: integration.integration.id,
                            label: integration.integration.displayName,
                        })),
                    ]}
                    disabled={pending || integrationsLoading}
                    showSelectedCheck
                />

                {integrationsLoading && (
                    <div
                        className="flex items-center gap-2 text-sm text-base-content/65"
                        role="status"
                    >
                        <span
                            className="loading loading-spinner loading-xs"
                            aria-hidden="true"
                        />
                        {t('welcome:onboarding.setup.detectingCodeEditors')}
                    </div>
                )}
                {!integrationsLoading && integrationsLoadFailed && (
                    <p className="text-sm text-warning" role="status">
                        {t(
                            'welcome:onboarding.setup.codeEditorDetectionFailed',
                        )}
                    </p>
                )}
                {!integrationsLoading && selectedIntegration && (
                    <div className="flex items-center gap-2 text-sm text-base-content/65">
                        <CodeEditorIntegrationIcon
                            integrationId={selectedIntegration.integration.id}
                            className="size-4"
                        />
                        <span>
                            {selectedIntegration.integration.displayName}
                        </span>
                        <span className="badge badge-success badge-sm">
                            {t('welcome:onboarding.setup.detected')}
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
};
