import { ChevronDown } from 'lucide-react';
import type React from 'react';
import { SearchField } from '../../../components/ui/searchField.component';

type InstallsHeaderProps = {
    title: string;
    searchPlaceholder: string;
    searchValue: string;
    onSearchChange: (value: string) => void;
    addCustomEditorLabel: string;
    selectManifestLabel: string;
    createManifestLabel: string;
    installLabel: string;
    onSelectManifest: () => void;
    onCreateManifest: () => void;
    onInstall: () => void;
};

export const InstallsHeader: React.FC<InstallsHeaderProps> = ({
    title,
    searchPlaceholder,
    searchValue,
    onSearchChange,
    addCustomEditorLabel,
    selectManifestLabel,
    createManifestLabel,
    installLabel,
    onSelectManifest,
    onCreateManifest,
    onInstall,
}) => (
    <div className="flex flex-col gap-2 w-full">
        <div className="flex flex-row justify-between">
            <h1 data-testid="installsTitle" className="text-2xl">
                {title}
            </h1>
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
