import type { InstalledRelease, ReleaseSummary } from '@shared';
import type React from 'react';
import { InstalledReleaseTable } from '../../../../components/installedReleasesTable';
import { InstallReleaseTable } from '../../../../components/installReleaseTable';
import type { InstallEditorTab } from '../installEditor.model';

type InstallEditorReleasePanelProps = {
    loading: boolean;
    tab: InstallEditorTab;
    availableRows: ReleaseSummary[];
    installedRows: InstalledRelease[];
    onInstall: (release: ReleaseSummary, mono: boolean) => Promise<void>;
    onReinstallAvailable: (
        release: ReleaseSummary,
        mono: boolean,
    ) => Promise<void>;
    onRetryValidation: () => Promise<void>;
    onReinstallInstalled: (release: InstalledRelease) => Promise<void>;
    onRemove: (release: InstalledRelease) => Promise<void>;
};

export const InstallEditorReleasePanel: React.FC<
    InstallEditorReleasePanelProps
> = ({
    loading,
    tab,
    availableRows,
    installedRows,
    onInstall,
    onReinstallAvailable,
    onRetryValidation,
    onReinstallInstalled,
    onRemove,
}) => (
    <div className="flex flex-col overflow-auto w-full h-full">
        {loading && <span className="loading loading-dots loading-sm"></span>}
        {!loading && (
            <div className="overflow-x-hidden overflow-y-auto">
                {tab !== 'INSTALLED' ? (
                    <InstallReleaseTable
                        releases={availableRows}
                        onInstall={onInstall}
                        onReinstall={onReinstallAvailable}
                    />
                ) : (
                    <InstalledReleaseTable
                        releases={installedRows}
                        onRetry={onRetryValidation}
                        onReinstall={onReinstallInstalled}
                        onRemove={onRemove}
                        loading={loading}
                    />
                )}
            </div>
        )}
    </div>
);
