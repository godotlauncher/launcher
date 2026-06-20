import type { InstalledRelease } from '@shared';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRelease } from '../hooks/useRelease';
import { InstallEditorSubView } from '../views/subViews/installEditor.subview';
import { CloseButton } from './closeButton.component';
import { getSelectableInstalledReleaseRows } from './selectInstalledRelease/selectInstalledRelease.model';
import { SelectInstalledReleaseTable } from './selectInstalledRelease/selectInstalledReleaseTable.component';

type InstalledReleaseSelectorProps = {
    title: string;
    currentRelease: InstalledRelease;
    onReleaseSelected: (selected: InstalledRelease) => void;
    onClose: () => void;
};

export const InstalledReleaseSelector: React.FC<
    InstalledReleaseSelectorProps
> = ({ title, currentRelease, onReleaseSelected, onClose }) => {
    const { t } = useTranslation('common');
    const [selectedRelease, setSelectedRelease] =
        useState<InstalledRelease | null>(currentRelease);
    const [showInstallEditor, setShowInstallEditor] = useState<boolean>(false);
    const { installedReleases, downloadingReleases } = useRelease();

    useEffect(() => {
        if (currentRelease.valid === false) {
            setSelectedRelease(null);
        } else {
            setSelectedRelease(currentRelease);
        }
    }, [currentRelease]);

    const filteredReleases = useMemo(
        () =>
            getSelectableInstalledReleaseRows(
                installedReleases,
                downloadingReleases,
                currentRelease,
            ),
        [installedReleases, downloadingReleases, currentRelease],
    );

    return (
        <div className="absolute inset-0 z-20">
            {showInstallEditor && (
                <div className="absolute z-30 inset-0">
                    <InstallEditorSubView
                        onClose={() => setShowInstallEditor(false)}
                    />
                </div>
            )}
            <div className="bg-black/80 w-full h-full">
                <div className="mx-10 mb-10 bg-base-100 p-4 rounded-md flex flex-col">
                    <div className="w-full flex flex-row items-center justify-between">
                        <div>
                            <h1 className="font-bold">{title}</h1>
                            <p className="text-base-content/50 text-sm">
                                {t('selectRelease.description')}
                            </p>
                        </div>
                        <CloseButton onClick={onClose} />
                    </div>
                    <div className="divider"></div>
                    <div className="flex flex-col gap-4">
                        <SelectInstalledReleaseTable
                            rows={filteredReleases}
                            currentRelease={currentRelease}
                            selectedRelease={selectedRelease}
                            t={t}
                            onSelectedReleaseChange={setSelectedRelease}
                            onInstallReleasesClick={() =>
                                setShowInstallEditor(true)
                            }
                        />
                        <div className="flex flex-row justify-end w-full">
                            <button
                                type="button"
                                data-testid="buttonSelectRelease"
                                disabled={!selectedRelease}
                                className="btn btn-primary"
                                onClick={() =>
                                    selectedRelease &&
                                    onReleaseSelected(selectedRelease)
                                }
                            >
                                {t('buttons.select')}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
