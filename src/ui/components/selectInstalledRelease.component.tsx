import { TriangleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRelease } from '../hooks/useRelease';
import { sortReleases } from '../releaseStoring.utils';
import { InstallEditorSubView } from '../views/subViews/installEditor.subview';
import { CloseButton } from './closeButton.component';


type InstalledReleaseSelectorProps = {
    title: string;
    currentRelease: InstalledRelease;
    onReleaseSelected: (selected: InstalledRelease) => void;
    onClose: () => void;
};

export const InstalledReleaseSelector: React.FC<InstalledReleaseSelectorProps> = ({ title, currentRelease, onReleaseSelected, onClose }) => {
    const { t } = useTranslation('common');
    // const [textSearch, setTextSearch] = useState<string>("");
    const [selectedRelease, setSelectedRelease] = useState<InstalledRelease | null>(currentRelease);
    const [filteredReleases, setFilteredReleases] = useState<InstalledRelease[]>([]);
    const [showInstallEditor, setShowInstallEditor] = useState<boolean>(false);
    const { installedReleases, downloadingReleases } = useRelease();

    useEffect(() => {
        setSelectedRelease(currentRelease);
    }, [currentRelease]);

    useEffect(() => {
        setFilteredReleases(getFilteredRows());
    }, [installedReleases, downloadingReleases]);

    const getFilteredRows = () => {
        // merge downloading and installed releases for proper display
        const all = installedReleases.filter(r => parseInt(r.version_number.toString()) >= parseInt(currentRelease.version_number.toString()))
            .concat(downloadingReleases.map(r =>
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

        return all.sort(sortReleases);

    };

    return (

        <div className="absolute inset-0 z-20">
            {showInstallEditor &&
                <div className="absolute z-30 inset-0">
                    <InstallEditorSubView onClose={() => setShowInstallEditor(false)} />
                </div>
            }
            <div className="bg-black/80 w-full h-full">
                <div className="mx-10 mb-10 bg-base-100 p-4 rounded-md flex flex-col">
                    <div className="w-full flex flex-row items-center justify-between">
                        <div>
                            <h1 className="font-bold">{title}</h1>
                            <p className="text-base-content/50 text-sm">{t('selectRelease.description')}</p>
                        </div>
                        <CloseButton onClick={onClose} />
                    </div>
                    <div className="divider"></div>
                    <div className="flex flex-col gap-4">
                        <table className="table table-sm">
                            <thead className="sticky top-0 bg-base-200">
                                <tr >
                                    <th className="w-12"></th>
                                    <th>{t('selectRelease.tableHeaders.name')}</th>
                                </tr>
                            </thead>

                            <tbody className="overflow-y-auto select-none">
                                {
                                    filteredReleases.length === 0 && <tr>
                                        <td colSpan={2} className="">
                                            <div className="flex flex-row gap-2 text-warning items-center">
                                                <TriangleAlert className="stroke-warning" />
                                                {t('selectRelease.noReleases', { version: parseInt(currentRelease.version_number.toString()) })}
                                            </div>
                                            <div><button className="btn btn-link" onClick={() => setShowInstallEditor(true)}>{t('selectRelease.installReleases')}</button></div>
                                        </td>
                                    </tr>
                                }
                                {
                                    filteredReleases.length > 0 && filteredReleases.map((row, index) => {
                                        if (!row.editor_path) {
                                            return (
                                                <tr key={index} className="hover:bg-black/10 cursor-not-allowed">
                                                    <td><span className="loading loading-ring text-info p-0"></span></td>
                                                    <td >
                                                        {row.version}
                                                        {row.mono && <span className="badge badge-neutral">{t('selectRelease.badges.dotnet')}</span>}
                                                        {row.prerelease && <span className="badge badge-secondary">{t('selectRelease.badges.prerelease')}</span>}
                                                    </td>
                                                </tr>
                                            );
                                        }
                                        else {
                                            return (
                                                <tr data-testid={`rowReleaseSelect_${index}`} onClick={() => setSelectedRelease(row)} key={index}
                                                    className="even:bg-base-300 hover:bg-base-content/10 cursor-pointer">
                                                    <td className="flex flex-col items-center justify-center">
                                                        <input
                                                            data-testid={`radioReleaseSelect_${index}`}
                                                            type="radio"
                                                            name="editor-select"
                                                            className="radio radio-sm radio-info"
                                                            checked={row.version === selectedRelease?.version && row.mono === selectedRelease?.mono}
                                                            onChange={() => {
                                                                setSelectedRelease(row);
                                                            }}
                                                        />
                                                    </td>
                                                    <td >
                                                        <div className="flex flex-col gap-1 justify-start">
                                                            <div className="flex flex-row gap-2 ">
                                                                {row.version}
                                                                {row.mono && <span className="badge badge-neutral">{t('selectRelease.badges.dotnet')}</span>}
                                                                {row.prerelease && <span className="badge badge-secondary">{t('selectRelease.badges.prerelease')}</span>}
                                                            </div>
                                                        </div>
                                                    </td>

                                                </tr>
                                            );
                                        }
                                    })
                                }
                            </tbody>
                        </table >
                        <div className="flex flex-row justify-end w-full">

                            <button
                                data-testid="buttonSelectRelease"
                                disabled={!selectedRelease}
                                className="btn btn-primary"
                                onClick={() => selectedRelease && onReleaseSelected(selectedRelease)}>{t('buttons.select')}</button>
                        </div>
                    </div>
                </div>
            </div>
        </div >
    );
};