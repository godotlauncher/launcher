import { ChevronDown } from 'lucide-react';
import type React from 'react';
import type { MouseEventHandler } from 'react';
import { CopyBadge } from '../../../components/ui/copy-badge.component';
import { SearchField } from '../../../components/ui/search-field.component';

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
 * Renders the installs heading, aligned location badge and optional list controls.
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
    <div className="flex w-full shrink-0 flex-col gap-3">
        <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
                <h1
                    data-testid="installsTitle"
                    className="pl-3 text-[20px] font-semibold"
                >
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
                <div className="flex shrink-0 items-center gap-2">
                    <button
                        type="button"
                        data-testid="btnAddCustomEngineMenu"
                        className="btn btn-ghost text-base"
                        aria-haspopup="dialog"
                        aria-expanded={customEditorMenuOpen}
                        onClick={onOpenCustomEditorMenu}
                    >
                        {addCustomEditorLabel}
                        <ChevronDown size={16} aria-hidden="true" />
                    </button>
                    <button
                        type="button"
                        data-testid="btnInstallEditor"
                        className="btn btn-primary text-base"
                        onClick={onInstall}
                    >
                        {installLabel}
                    </button>
                </div>
            )}
        </div>
        {showControls && (
            <div className="flex items-center justify-end">
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
