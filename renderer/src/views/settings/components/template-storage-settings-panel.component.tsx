import { Fragment, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { SettingsSection } from '../../../components/settings/settings-section.component';
import { ContentDivider } from '../../../components/ui/content-divider.component';
import { PathField } from '../../../components/ui/path-field.component';
import {
    storageErrorKey,
    useTemplateStorage,
} from '../../export-templates/hooks/template-storage.hook';
import { SettingsPanelSection } from './settings-panel-section.component';

/** Uses familiar platform names in the default-location note.
 * @param platform - Platform identifier returned by Electron.
 */
function platformLabel(platform: string): string {
    return (
        (
            { darwin: 'macOS', win32: 'Windows', linux: 'Linux' } as Record<
                string,
                string
            >
        )[platform] ?? platform
    );
}

/** Presents official and imported template paths using the standard Settings fields.
 * @param props - Whether the Export Templates settings page is visible.
 */
export function TemplateStorageSettingsPanel({ active }: { active: boolean }) {
    const { t } = useTranslation('exportTemplates');
    const {
        settings,
        loadError,
        busy,
        watch,
        refresh,
        choose,
        returnToDefault,
        recover,
    } = useTemplateStorage();
    useEffect(() => {
        watch(active);
        return () => watch(false);
    }, [active, watch]);

    return (
        <SettingsPanelSection
            active={active}
            className="text-base [overflow-wrap:anywhere]"
        >
            {!settings && !loadError && (
                <p role="status">{t('storage.loading')}</p>
            )}
            {loadError && (
                <div role="alert" className="flex items-center gap-3">
                    <p className="text-error">{t('storage.loadError')}</p>
                    <button
                        type="button"
                        className="btn btn-ghost text-base"
                        onClick={() => void refresh()}
                    >
                        {t('storage.retry')}
                    </button>
                </div>
            )}
            {settings?.locations.map((location, index) => (
                <Fragment key={location.kind}>
                    {index > 0 && <ContentDivider />}
                    <div data-testid={`templateStorage-${location.kind}`}>
                        <SettingsSection
                            title={t(`storage.${location.kind}`)}
                            description={
                                location.kind === 'official'
                                    ? t('storage.platformNote', {
                                          platform: platformLabel(
                                              settings.platform,
                                          ),
                                          path: settings.defaultGodotPath,
                                      })
                                    : t('storage.importedNote')
                            }
                        >
                            {location.kind === 'official' && (
                                <p className="text-base-content/75">
                                    {t('storage.launcherNote')}
                                </p>
                            )}
                            {location.kind === 'official' &&
                                location.storagePath !==
                                    location.defaultPath && (
                                    <button
                                        type="button"
                                        className="btn btn-ghost self-start text-base"
                                        data-testid="templateStorageReturnDefault"
                                        disabled={
                                            busy ||
                                            settings.recoveryRequired ||
                                            location.status === 'unavailable' ||
                                            location.status === 'attention'
                                        }
                                        onClick={() =>
                                            void returnToDefault(location)
                                        }
                                    >
                                        {t('storage.moveBackToDefault')}
                                    </button>
                                )}
                            <PathField
                                id={`templateStoragePath-${location.kind}`}
                                testId={`templateStoragePath-${location.kind}`}
                                label={t('storage.currentPath')}
                                value={location.storagePath}
                                title={location.storagePath}
                                readOnly
                                onChange={() => undefined}
                                onSelect={() => void choose(location)}
                                browseKind="directory"
                                browseText={t('storage.move')}
                                browseLabel={t('storage.move')}
                                browseTestId={`templateStorageMove-${location.kind}`}
                                browseDisabled={
                                    busy ||
                                    settings.recoveryRequired ||
                                    location.status === 'unavailable' ||
                                    location.status === 'attention'
                                }
                            />
                            {location.issue && (
                                <p role="status" className="text-error">
                                    {t(storageErrorKey(location.issue))}
                                </p>
                            )}
                        </SettingsSection>
                    </div>
                </Fragment>
            ))}
            {settings?.recoveryRequired && (
                <div role="alert" className="flex flex-col items-start gap-3">
                    <p>{t('storage.errors.recovery')}</p>
                    <button
                        type="button"
                        className="btn btn-warning text-base"
                        disabled={busy}
                        onClick={() => void recover()}
                    >
                        {t('storage.recover')}
                    </button>
                </div>
            )}
        </SettingsPanelSection>
    );
}
