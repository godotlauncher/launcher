import { ChevronDown } from 'lucide-react';
import type React from 'react';
import type { MouseEventHandler } from 'react';
import { CopyBadge } from '../../../components/ui/copyBadge.component';
import { SearchField } from '../../../components/ui/searchField.component';

type InstallsHeaderProps = {
    title: string;
    installLocation?: string;
    searchPlaceholder: string;
    searchValue: string;
    onSearchChange: (value: string) => void;
    addCustomEditorLabel: string;
    customEditorMenuOpen: boolean;
    installLabel: string;
    copyPathLabel: string;
    copiedLabel: string;
    showControls?: boolean;
    onOpenCustomEditorMenu: MouseEventHandler<HTMLButtonElement>;
    onInstall: () => void;
};

/**
 * Renders the installs title, location, and optional list controls.
 *
 * @param props - Header content, control visibility, and actions.
 * @returns The installs header.
 */
export const InstallsHeader: React.FC<InstallsHeaderProps> = ({
    title,
    installLocation,
    searchPlaceholder,
    searchValue,
    onSearchChange,
    addCustomEditorLabel,
    customEditorMenuOpen,
    installLabel,
    copyPathLabel,
    copiedLabel,
    showControls = true,
    onOpenCustomEditorMenu,
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
            {showControls && (
                <div className="flex gap-2">
                    <button
                        type="button"
                        data-testid="btnAddCustomEngineMenu"
                        className="btn btn-neutral"
                        aria-haspopup="dialog"
                        aria-expanded={customEditorMenuOpen}
                        onClick={onOpenCustomEditorMenu}
                    >
                        {addCustomEditorLabel}
                        <ChevronDown size={14} aria-hidden="true" />
                    </button>
                    <button
                        type="button"
                        data-testid="btnInstallEditor"
                        className="btn btn-primary"
                        onClick={onInstall}
                    >
                        {installLabel}
                    </button>
                </div>
            )}
        </div>
        {showControls && (
            <div className="flex flex-row justify-end my-2 items-center">
                <SearchField
                    placeholder={searchPlaceholder}
                    value={searchValue}
                    onChange={onSearchChange}
                    focusOnMount
                    data-testid="inputInstallSearch"
                />
            </div>
        )}
    </div>
);
