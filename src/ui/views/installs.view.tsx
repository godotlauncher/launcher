import { CircleX, EllipsisVertical, TriangleAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useRelease } from '../hooks/useRelease';
import { sortReleases } from '../releaseStoring.utils';
import { InstallEditorSubView } from './subViews/installEditor.subview';

type ReleaseActionDependencies = {
    checkAllReleasesValid: () => Promise<void>;
    removeRelease: (release: InstalledRelease) => Promise<void>;
};

export const createReleaseActions = (dependencies: ReleaseActionDependencies) => ({
    retry: async () => {
        await dependencies.checkAllReleasesValid();
    },
    remove: async (release: InstalledRelease) => {
        await dependencies.removeRelease(release);
    },
});

export const InstallsView: React.FC = () => {
    const { t } = useTranslation(['installs', 'common']);
    const [textSearch, setTextSearch] = useState<string>('');
    const [installOpen, setInstallOpen] = useState<boolean>(false);

    const { installedReleases, downloadingReleases, showReleaseMenu, checkAllReleasesValid, removeRelease } = useRelease();

    const onOpenReleaseMoreOptions = (e: React.MouseEvent, release: InstalledRelease) => {
        e.stopPropagation();
        showReleaseMenu(release);
    };

    const getFilteredRows = () => {
        // merge downloading and installed releases for proper display
        const all = installedReleases.concat(downloadingReleases.map(r =>
            ({
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
                valid: true
            })));

        if (textSearch === '') return all.sort(sortReleases);
        const selection = all.filter(row => row.version.toLowerCase().includes(textSearch.toLowerCase()));
        return selection.sort(sortReleases);
    };

    const releaseActions = useMemo(
        () => createReleaseActions({ checkAllReleasesValid, removeRelease }),
        [checkAllReleasesValid, removeRelease]
    );

    return (
        <>
            <div className="flex flex-col h-full w-full overflow-auto p-1">
                <div className="flex flex-col gap-2 w-full">
                    <div className="flex flex-row justify-between">
                        <h1 data-testid="installsTitle" className="text-2xl">{t('title')}</h1>
                        <div className="flex gap-2">
                            <button data-testid="btnInstallEditor" className="btn btn-primary" onClick={() => setInstallOpen(true)}>{t('buttons.install')}</button>
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
                        {textSearch.length > 0 &&
                            <button
                                tabIndex={-1}
                                onClick={() => setTextSearch('')}
                                className="absolute right-4 w-6 h-6"><CircleX /></button>
                        }
                    </div>
                </div>
                <div className="divider m-0"></div>

                {
                    (installedReleases.length < 1 && downloadingReleases.length < 1)
                        ? (
                            <div className="text-warning flex gap-2">
                                <TriangleAlert className="stroke-warning" />
                                <Trans
                                    ns="installs"
                                    i18nKey="messages.noReleasesCta"
                                    components={{ Link: <a onClick={() => setInstallOpen(true)} className="underline cursor-pointer" /> }}
                                />
                            </div>
                        )
                        : (
                            <div className="overflow-auto h-full">
                                <table className="table table-sm">
                                    <thead className="sticky top-0 bg-base-200">
                                        <tr >
                                            <th>{t('table.name')}</th>
                                            <th></th>
                                        </tr>
                                    </thead>

                                    <tbody className="overflow-y-auto">
                                        {
                                            getFilteredRows().map((row, index) => (
                                                <tr key={index} className="even:bg-base-100 hover:bg-base-content/10">
                                                    <td >
                                                        <div className="flex flex-col gap-1">
                                                            <div className="flex flex-row gap-2 flex-wrap items-center">
                                                                {row.version}
                                                                {row.mono && <span className="badge">{t('badges.dotNet')}</span>}
                                                                {row.prerelease && <span className="badge badge-secondary">{t('badges.prerelease')}</span>}
                                                                {row.valid === false && (
                                                                    <span className="badge badge-warning gap-1 text-xs items-center">
                                                                        <TriangleAlert className="w-3 h-3" />
                                                                        {t('status.unavailable')}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className="text-xs text-base-content/50 flex flex-col gap-1">
                                                                {row.valid === false ? (
                                                                    <>
                                                                        <span>{t('messages.unavailableHint')}</span>
                                                                        <div className="flex flex-row flex-wrap gap-2">
                                                                            <button className="btn btn-ghost btn-xs" onClick={releaseActions.retry}>
                                                                                {t('buttons.retry', { ns: 'common' })}
                                                                            </button>
                                                                            <button className="btn btn-ghost btn-xs" onClick={() => releaseActions.remove(row)}>
                                                                                {t('buttons.uninstall')}
                                                                            </button>
                                                                        </div>
                                                                    </>
                                                                ) : (
                                                                    row.install_path || <div className="flex flex-row gap-2 items-center">
                                                                        <div className="loading loading-ring loading-sm"></div>
                                                                        {t('status.installing')}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="flex flex-row justify-end">

                                                        {
                                                            row.install_path && row.valid !== false &&
                                                            <button
                                                                onClick={(e) => onOpenReleaseMoreOptions(e, row)}
                                                                className="select-none outline-none relative flex items-center justify-center w-10 h-10 hover:bg-base-content/20 rounded-lg"                        >
                                                                <EllipsisVertical />
                                                            </button >
                                                        }
                                                    </td>
                                                </tr>
                                            ))
                                        }
                                    </tbody>
                                </table>
                            </div>
                        )}

            </div >
            {
                installOpen &&
                <InstallEditorSubView onClose={() => setInstallOpen(false)} />
            }
        </>
    );
};
