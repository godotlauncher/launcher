import type {
    CodeEditorId,
    CodeEditorIntegrationSettings,
} from '@shared/contracts';
import { Check, CodeXml } from 'lucide-react';
import type React from 'react';
import { useTranslation } from 'react-i18next';
import { CodeEditorIntegrationIcon } from '../../components/code-editor-integration-icon.component';
import { WindowsSymlinkSetting } from '../../components/settings/windows-symlink-setting.component';
import { HelpTooltip } from '../../components/ui/help-tooltip.component';
import { OverlayTitle } from '../../components/ui/overlay-title.component';
import { PathField } from '../../components/ui/path-field.component';
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

    return (
        <div className="flex max-w-3xl flex-col gap-5">
            <div className="flex flex-col gap-2">
                <OverlayTitle
                    as="h1"
                    data-testid="onboarding-step-heading"
                    className="text-[20px] font-semibold"
                >
                    {t('welcome:onboarding.setup.title')}
                </OverlayTitle>
                <p>{t('welcome:onboarding.setup.description')}</p>
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
                            <span className="badge badge-ghost">
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
                <div className="p-4">
                    <WindowsSymlinkSetting
                        value={windowsSymlinksEnabled}
                        onChange={(enabled) => {
                            onWindowsSymlinksChange(enabled);
                            return true;
                        }}
                        disabled={pending}
                        showDivider={false}
                    />
                </div>
            ) : (
                <PlatformStorageNotice platform={platform} />
            )}

            <div className="flex flex-col gap-2">
                <fieldset
                    disabled={pending || integrationsLoading}
                    className="flex flex-col gap-1"
                >
                    <legend className="mb-2">
                        <span className="inline-flex items-center gap-2">
                            {t('welcome:onboarding.setup.codeEditor')}
                            <HelpTooltip
                                help={t(
                                    'welcome:onboarding.setup.codeEditorHelp',
                                )}
                            />
                        </span>
                    </legend>
                    {[
                        {
                            id: null,
                            name: t('welcome:onboarding.setup.noCodeEditor'),
                            disabled: false,
                            status: null,
                        },
                        ...integrations.map(
                            ({ integration, installation, enabled }) => ({
                                id: integration.id,
                                name: integration.displayName,
                                disabled: !installation || !enabled,
                                status: !installation
                                    ? t('settings:codeEditors.status.missing')
                                    : !enabled
                                      ? t(
                                            'settings:codeEditors.status.disabled',
                                        )
                                      : t(
                                            'settings:codeEditors.status.available',
                                        ),
                            }),
                        ),
                    ].map((option) => (
                        <label
                            key={option.id ?? 'none'}
                            className="flex items-center gap-3 rounded-md bg-base-content/2 px-3 py-2 hover:bg-base-content/5 has-[:checked]:bg-primary/10 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-primary has-[:disabled]:opacity-50"
                        >
                            <input
                                type="radio"
                                name="onboarding-code-editor"
                                value={option.id ?? 'none'}
                                className="peer sr-only"
                                disabled={option.disabled}
                                checked={selectedCodeEditorId === option.id}
                                onChange={() => onCodeEditorChange(option.id)}
                            />
                            {option.id ? (
                                <CodeEditorIntegrationIcon
                                    integrationId={option.id}
                                    className="size-5 shrink-0"
                                />
                            ) : (
                                <CodeXml
                                    size={20}
                                    className="shrink-0 text-base-content/60"
                                    aria-hidden="true"
                                />
                            )}
                            <span className="min-w-0 flex-1 truncate">
                                {option.name}
                            </span>
                            {option.status && (
                                <span className="shrink-0 text-sm text-base-content/60">
                                    {option.status}
                                </span>
                            )}
                            <Check
                                size={18}
                                className="invisible shrink-0 text-primary peer-checked:visible"
                                aria-hidden="true"
                            />
                        </label>
                    ))}
                </fieldset>

                {integrationsLoading && (
                    <div className="flex items-center gap-2" role="status">
                        <span
                            className="loading loading-spinner loading-xs"
                            aria-hidden="true"
                        />
                        {t('welcome:onboarding.setup.detectingCodeEditors')}
                    </div>
                )}
                {!integrationsLoading && integrationsLoadFailed && (
                    <p className="text-warning" role="status">
                        {t(
                            'welcome:onboarding.setup.codeEditorDetectionFailed',
                        )}
                    </p>
                )}
            </div>
        </div>
    );
};
