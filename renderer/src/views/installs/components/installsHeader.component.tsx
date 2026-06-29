import { ChevronDown } from 'lucide-react';
import type React from 'react';
import { CopyBadge } from '../../../components/ui/copyBadge.component';
import { SearchField } from '../../../components/ui/searchField.component';

type InstallsHeaderProps = {
    title: string;
    installLocation?: string;
    searchPlaceholder: string;
    searchValue: string;
    onSearchChange: (value: string) => void;
    addCustomEditorLabel: string;
    selectManifestLabel: string;
    createManifestLabel: string;
    installLabel: string;
    copyPathLabel: string;
    copiedLabel: string;
    onSelectManifest: () => void;
    onCreateManifest: () => void;
    onInstall: () => void;
};

export const InstallsHeader: React.FC<InstallsHeaderProps> = ({
    title,
    installLocation,
    searchPlaceholder,
    searchValue,
    onSearchChange,
    addCustomEditorLabel,
    selectManifestLabel,
    createManifestLabel,
    installLabel,
    copyPathLabel,
    copiedLabel,
    onSelectManifest,
    onCreateManifest,
    onInstall,
}) => (
    <div className="flex flex-col gap-2 w-full">
        <div className="flex flex-row justify-between items-start">
            <div className="flex flex-col gap-1">
                <h1 data-testid="installsTitle" className="text-2xl">
                    {title}
                </h1>
                {installLocation && (
                    <CopyBadge
                        value={installLocation}
                        label={copyPathLabel}
                        copiedLabel={copiedLabel}
                        data-testid="btnCopyInstallLocation"
                    />
                )}
            </div>
            <div className="flex gap-2">
                <div className="dropdown dropdown-end">
                    <button
                        type="button"
                        tabIndex={0}
                        data-testid="btnAddCustomEngineMenu"
                        className="btn btn-neutral"
                    >
                        {addCustomEditorLabel}
                        <ChevronDown size={14} aria-hidden="true" />
                    </button>
                    <ul className="dropdown-content menu bg-base-300 rounded-box z-1 min-w-64 p-1 shadow-sm border border-base-100">
                        <li>
                            <button
                                type="button"
                                data-testid="btnAddCustomEngine"
                                onClick={onSelectManifest}
                            >
                                {selectManifestLabel}
                            </button>
                        </li>
                        <li>
                            <button
                                type="button"
                                data-testid="btnCreateCustomEditorManifest"
                                onClick={onCreateManifest}
                            >
                                {createManifestLabel}
                            </button>
                        </li>
                    </ul>
                </div>
                <button
                    type="button"
                    data-testid="btnInstallEditor"
                    className="btn btn-primary"
                    onClick={onInstall}
                >
                    {installLabel}
                </button>
            </div>
        </div>
        <div className="flex flex-row justify-end my-2 items-center">
            <SearchField
                placeholder={searchPlaceholder}
                value={searchValue}
                onChange={onSearchChange}
            />
        </div>
    </div>
);
