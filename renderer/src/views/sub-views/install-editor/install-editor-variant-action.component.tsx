import type { ReleaseSummary } from '@shared/contracts';
import clsx from 'clsx';
import { Download, HardDrive, RotateCcw } from 'lucide-react';
import type React from 'react';
import { useTranslation } from 'react-i18next';
import { ReleaseInstallProgressIndicator } from '../../../components/release-install-progress.component.tsx';
import { Tooltip } from '../../../components/ui/tooltip.component.tsx';
import { useRelease } from '../../../hooks/release.hook.tsx';

type InstallEditorVariantActionProps = {
    release: ReleaseSummary;
    mono: boolean;
    onInstall: (release: ReleaseSummary, mono: boolean) => Promise<void>;
    onReinstall: (release: ReleaseSummary, mono: boolean) => Promise<void>;
};

/**
 * Renders one stable-width editor variant action.
 *
 * @param props - The release variant, display tone, and install actions.
 * @returns One editor variant action.
 */
export const InstallEditorVariantAction: React.FC<
    InstallEditorVariantActionProps
> = ({ release, mono, onInstall, onReinstall }) => {
    const { t } = useTranslation('installEditor');
    const { cancelInstall, getInstalledRelease, getReleaseInstallProgress } =
        useRelease();
    const installedRelease = getInstalledRelease(release.version, mono);
    const progress = getReleaseInstallProgress(release.version, mono);
    const hasAsset = release.assets.some((asset) => asset.mono === mono);
    const installed = installedRelease?.valid !== false && installedRelease;
    const needsReinstall = installedRelease?.valid === false;
    const label = mono ? t('table.dotnet') : t('table.gdscript');

    let title = mono
        ? t('table.tooltips.downloadDotNet', { version: release.version })
        : t('table.tooltips.downloadGDScript', { version: release.version });
    if (!hasAsset) {
        title = t('errors.noPlatformAsset');
    } else if (progress) {
        title = t('table.tooltips.installingVariant', {
            version: release.version,
            flavor: label,
        });
    } else if (installed) {
        title = mono
            ? t('table.tooltips.installedDotNet', {
                  version: release.version,
              })
            : t('table.tooltips.installedGDScript', {
                  version: release.version,
              });
    } else if (needsReinstall) {
        title = mono
            ? t('table.tooltips.reinstallDotNet', {
                  version: release.version,
              })
            : t('table.tooltips.reinstallGDScript', {
                  version: release.version,
              });
    }

    if (progress) {
        return (
            <div
                className="flex min-h-10 w-56 items-center"
                role="status"
                aria-label={title}
                data-testid={`installProgress${release.version}${mono ? '-mono' : ''}`}
            >
                <ReleaseInstallProgressIndicator
                    progress={progress}
                    className="w-full"
                    onCancel={(jobId) => void cancelInstall(jobId)}
                />
            </div>
        );
    }

    return (
        <Tooltip placement="top" tip={title}>
            <button
                type="button"
                className={clsx('btn w-56 justify-center text-base', {
                    'btn-outline btn-primary border-primary/80 hover:bg-primary/20 hover:text-primary':
                        !installed && hasAsset,
                    'btn-soft btn-success disabled:bg-success/10 disabled:text-success-content dark:disabled:text-success disabled:border-transparent':
                        installed,
                    'btn-ghost text-base-content/50': !installed && !hasAsset,
                })}
                disabled={Boolean(installed || !hasAsset)}
                onClick={() =>
                    void (needsReinstall
                        ? onReinstall(release, mono)
                        : onInstall(release, mono))
                }
                aria-label={title}
                data-testid={`${needsReinstall ? 'btnReinstall' : 'btnDownload'}${release.version}${mono ? '-mono' : ''}`}
            >
                {installed ? (
                    <HardDrive size={16} aria-hidden="true" />
                ) : needsReinstall ? (
                    <RotateCcw size={16} aria-hidden="true" />
                ) : (
                    <Download size={16} aria-hidden="true" />
                )}
                <span className="truncate">{label}</span>
            </button>
        </Tooltip>
    );
};
