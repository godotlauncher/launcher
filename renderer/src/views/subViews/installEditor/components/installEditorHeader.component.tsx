import { X } from 'lucide-react';
import type React from 'react';
import { SearchField } from '../../../../components/ui/searchField.component';

type InstallEditorHeaderProps = {
    title: string;
    installLocation?: string;
    searchPlaceholder: string;
    searchValue: string;
    onSearchChange: (value: string) => void;
    onClose: () => void;
};

export const InstallEditorHeader: React.FC<InstallEditorHeaderProps> = ({
    title,
    installLocation,
    searchPlaceholder,
    searchValue,
    onSearchChange,
    onClose,
}) => (
    <>
        <div className="flex flex-col gap-2 w-full">
            <div className="flex flex-row justify-between items-start">
                <div className="flex flex-col gap-1">
                    <h1 data-testid="settingsTitle" className="text-2xl">
                        {title}
                    </h1>
                    <p className="badge text-base-content/50">
                        {installLocation}
                    </p>
                </div>
                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={onClose}
                        data-testid="btnCloseInstallEditor"
                    >
                        <X />
                    </button>
                </div>
            </div>
        </div>
        <div className="flex flex-row justify-end my-2 pr-1 items-center">
            <SearchField
                placeholder={searchPlaceholder}
                value={searchValue}
                onChange={onSearchChange}
            />
        </div>
    </>
);
