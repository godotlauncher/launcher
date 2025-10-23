import {
    CircleX,
    EllipsisVertical,
    TriangleAlert,
    TriangleAlertIcon,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useAlerts } from '../hooks/useAlerts';
import { useRelease } from '../hooks/useRelease';
import { sortReleases } from '../releaseStoring.utils';
import { InstallEditorSubView } from './subViews/installEditor.subview';

type ReleaseActionDependencies = {
    checkAllReleasesValid: () => Promise<InstalledRelease[]>;
    removeRelease: (release: InstalledRelease) => Promise<void>;
};

export const createReleaseActions = (
    dependencies: ReleaseActionDependencies
) => ({
    retry: async () => dependencies.checkAllReleasesValid(),
    remove: async (release: InstalledRelease) => {
        await dependencies.removeRelease(release);
    },
});

export const InstallsView: React.FC = () => {
    const { t } = useTranslation(['installs', 'common']);
    const [textSearch, setTextSearch] = useState<string>('');
    const [installOpen, setInstallOpen] = useState<boolean>(false);

    const { addAlert } = useAlerts();
    const {
        installedReleases,
        downloadingReleases,
        showReleaseMenu,
        checkAllReleasesValid,
        removeRelease,
        loading: releasesLoading,
    } = useRelease();

    const onOpenReleaseMoreOptions = (
        e: React.MouseEvent,
        release: InstalledRelease
    ) => {
        e.stopPropagation();
        showReleaseMenu(release);
    };

    const getFilteredRows = () => {
        // merge downloading and installed releases for proper display
        const all = installedReleases.concat(
            downloadingReleases.map((r) => ({
                version: r.version,
                version_number: -1,
                install_path: '',
                mono: r.mono,
                platform: '',
                arch: '',
                editor_path: '',
                prerelease: r.prerelease,
                config_version: 5,
                published_at: r.published_at,
                valid: true,
            }))
        );

        if (textSearch === '') return all.sort(sortReleases);
        const selection = all.filter((row) =>
            row.version.toLowerCase().includes(textSearch.toLowerCase())
        );
        return selection.sort(sortReleases);
    };

    const releaseActions = useMemo(
        () => createReleaseActions({ checkAllReleasesValid, removeRelease }),
        [checkAllReleasesValid, removeRelease]
    );

    const handleRetry = async (release: InstalledRelease) => {
        addAlert(t('common:info'), t('messages.revalidating'));
        try {
            const releases = await releaseActions.retry();
            const refreshedRelease = releases.find(
                (candidate) =>
                    candidate.version === release.version &&
                    candidate.mono === release.mono
            );

            if (refreshedRelease?.valid) {
                addAlert(
                    t('common:success'),
                    t('messages.revalidatedRelease', {
                        version: release.version,
                    })
                );
                return;
            }

            const rawPath =
                refreshedRelease?.editor_path ||
                refreshedRelease?.install_path ||
                release.editor_path ||
                release.install_path;

            const candidatePath = rawPath
                ? (rawPath.endsWith('/')
                    ? rawPath
                    : rawPath.substring(0, rawPath.lastIndexOf('/') + 1)) ||
                  rawPath
                : undefined;

            if (candidatePath) {
                addAlert(
                    t('common:warning'),
                    <span className="flex flex-col gap-2">
                        <span>
                            {t('messages.revalidationStillMissing', {
                                version: release.version,
                                path: rawPath,
                            })}
                        </span>
                        <span className="flex flex-row gap-2">
                            <button
                                className="btn btn-xs btn-outline"
                                onClick={async () => {
                                    await navigator.clipboard.writeText(
                                        candidatePath
                                    );
                                }}
                            >
                                {t('buttons.copyPath', { ns: 'common' })}
                            </button>
                            <button
                                className="btn btn-xs btn-outline"
                                onClick={() =>
                                    window.electron.openShellFolder(
                                        candidatePath
                                    )
                                }
                            >
                                {t('buttons.openPath', { ns: 'common' })}
                            </button>
                        </span>
                    </span>,
                    <TriangleAlertIcon className="inline w-4 h-4 text-warning" />
                );
            } else {
                addAlert(
                    t('common:warning'),
                    t('messages.revalidationStillMissingNoPath', {
                        version: release.version,
                    }),
                    <TriangleAlertIcon className="inline w-4 h-4 text-warning" />
                );
            }
        } catch (error) {
            addAlert(
                t('common:error'),
                t('messages.revalidationFailed'),
                <TriangleAlertIcon className="inline w-4 h-4 text-error" />
            );
            console.error(error);
        }
    };

    const handleRemove = async (release: InstalledRelease) => {
        if (releasesLoading) {
            return;
        }
        await releaseActions.remove(release);
    };

    return (
        <>
            <div className="flex flex-col h-full w-full overflow-auto p-1">
                <div className="flex flex-col gap-2 w-full">
                    <div className="flex flex-row justify-between">
                        <h1 data-testid="installsTitle" className="text-2xl">
                            {t('title')}
                        </h1>
                        <div className="flex gap-2">
                            <button
                                data-testid="btnInstallEditor"
                                className="btn btn-primary"
                                onClick={() => setInstallOpen(true)}
                            >
                                {t('buttons.install')}
                            </button>
                        </div>
                    </div>
                    <div className="flex flex-row justify-end my-2 items-center">
                        <input
                            type="text"
                            placeholder={t('search.placeholder')}
                            className="input input-bordered w-full max-w-xs"
                            onChange={(e) => setTextSearch(e.target.value)}
                            value={textSearch}
                        />
                        {textSearch.length > 0 && (
                            <button
                                tabIndex={-1}
                                onClick={() => setTextSearch('')}
                                className="absolute right-4 w-6 h-6"
                            >
                                <CircleX />
                            </button>
                        )}
                    </div>
                </div>
                <div className="divider m-0"></div>

                {installedReleases.length < 1 &&
                downloadingReleases.length < 1 ? (
                        <div className="text-warning flex gap-2">
                            <TriangleAlert className="stroke-warning" />
                            <Trans
                                ns="installs"
                                i18nKey="messages.noReleasesCta"
                                components={{
                                    Link: (
                                        <a
                                            onClick={() => setInstallOpen(true)}
                                            className="underline cursor-pointer"
                                        />
                                    ),
                                }}
                            />
                        </div>
                    ) : (
                        <div className="overflow-auto h-full">
                            <table className="table table-sm">
                                <thead className="sticky top-0 bg-base-200">
                                    <tr>
                                        <th>{t('table.name')}</th>
                                        <th></th>
                                    </tr>
                                </thead>

                                <tbody className="overflow-y-auto">
                                    {getFilteredRows().map((row, index) => (
                                        <tr
                                            key={index}
                                            className="even:bg-base-100 hover:bg-base-content/10"
                                        >
                                            <td>
                                                <div className="flex flex-col gap-1">
                                                    <div className="flex flex-row gap-2 flex-wrap items-center">
                                                        {row.valid === false && (
                                                            <TriangleAlert className="w-4 h-4 text-warning" />
                                                        )}
                                                        {row.version}
                                                        {row.mono && (
                                                            <span className="badge">
                                                                {t('badges.dotNet')}
                                                            </span>
                                                        )}
                                                        {row.prerelease && (
                                                            <span className="badge badge-secondary">
                                                                {t(
                                                                    'badges.prerelease'
                                                                )}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="text-xs text-base-content/50 flex flex-col gap-1">
                                                        {row.valid === false ? (
                                                            <>
                                                                <span>
                                                                    {t(
                                                                        'messages.unavailableHint'
                                                                    )}
                                                                </span>
                                                                <div className="flex flex-row flex-wrap gap-2">
                                                                    <button
                                                                        className="btn btn-ghost btn-xs flex items-center gap-2"
                                                                        onClick={() =>
                                                                            handleRetry(
                                                                                row
                                                                            )
                                                                        }
                                                                        disabled={
                                                                            releasesLoading
                                                                        }
                                                                    >
                                                                        {releasesLoading && (
                                                                            <span className="loading loading-spinner loading-xs"></span>
                                                                        )}
                                                                        {t(
                                                                            'buttons.retry',
                                                                            {
                                                                                ns: 'common',
                                                                            }
                                                                        )}
                                                                    </button>
                                                                    <button
                                                                        className="btn btn-ghost btn-xs"
                                                                        onClick={() =>
                                                                            handleRemove(
                                                                                row
                                                                            )
                                                                        }
                                                                        disabled={
                                                                            releasesLoading
                                                                        }
                                                                    >
                                                                        {t(
                                                                            'buttons.uninstall'
                                                                        )}
                                                                    </button>
                                                                </div>
                                                            </>
                                                        ) : (
                                                            row.install_path || (
                                                                <div className="flex flex-row gap-2 items-center">
                                                                    <div className="loading loading-ring loading-sm"></div>
                                                                    {t(
                                                                        'status.installing'
                                                                    )}
                                                                </div>
                                                            )
                                                        )}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="flex flex-row justify-end">
                                                {row.install_path &&
                                                row.valid !== false && (
                                                    <button
                                                        onClick={(e) =>
                                                            onOpenReleaseMoreOptions(
                                                                e,
                                                                row
                                                            )
                                                        }
                                                        className="select-none outline-none relative flex items-center justify-center w-10 h-10 hover:bg-base-content/20 rounded-lg"
                                                    >
                                                        <EllipsisVertical />
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
            </div>
            {installOpen && (
                <InstallEditorSubView onClose={() => setInstallOpen(false)} />
            )}
        </>
    );
};
