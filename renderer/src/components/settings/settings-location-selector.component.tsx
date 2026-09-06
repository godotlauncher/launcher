import type { UserPreferences } from '@shared/contracts';
import { useState } from 'react';
import { appBridge } from '../../bridge.ts';
import { usePreferences } from '../../hooks/usePreferences';
import { PathField } from '../ui/pathField.component';
import { WaitingForDialogOverlay } from '../waitingForDialogOverlay.component';

type LocationPreferenceKey = 'projects_location' | 'install_location';

type SettingsLocationSelectorProps = {
    preferenceKey: LocationPreferenceKey;
    title: string;
    description: string;
    fieldLabel: string;
    browseLabel: string;
    waitingMessage: string;
    dialogTitle: string;
    headerTestId: string;
    descriptionTestId: string;
    pathTestId: string;
    browseTestId: string;
};

type SelectSettingsLocationOptions = {
    currentPath: string;
    dialogTitle: string;
    setDialogOpen: (open: boolean) => void;
    openDirectoryDialog: typeof appBridge.openDirectoryDialog;
    savePath: (path: string) => Promise<void>;
};

/**
 * Selects and saves one Settings location while maintaining dialog state.
 *
 * @param options - Dialog dependencies, current path, and save callback.
 */
export async function selectSettingsLocation({
    currentPath,
    dialogTitle,
    setDialogOpen,
    openDirectoryDialog,
    savePath,
}: SelectSettingsLocationOptions): Promise<void> {
    setDialogOpen(true);
    try {
        const result = await openDirectoryDialog(currentPath, dialogTitle);
        const selectedPath = result.filePaths[0];
        if (!result.canceled && selectedPath) {
            await savePath(selectedPath);
        }
    } finally {
        setDialogOpen(false);
    }
}

/**
 * Renders a Settings location as a shared read-only path field.
 *
 * @param props - Preference, translated copy, dialog, and test configuration.
 * @returns A Settings location selector.
 */
export const SettingsLocationSelector: React.FC<
    SettingsLocationSelectorProps
> = ({
    preferenceKey,
    title,
    description,
    fieldLabel,
    browseLabel,
    waitingMessage,
    dialogTitle,
    headerTestId,
    descriptionTestId,
    pathTestId,
    browseTestId,
}) => {
    const [dialogOpen, setDialogOpen] = useState(false);
    const { preferences, savePreferences } = usePreferences();
    const currentPath = preferences?.[preferenceKey] ?? '';

    /** Opens the directory picker and saves a completed selection. */
    const selectLocation = () =>
        selectSettingsLocation({
            currentPath,
            dialogTitle,
            setDialogOpen,
            openDirectoryDialog: appBridge.openDirectoryDialog,
            savePath: async (selectedPath) => {
                if (!preferences) return;
                await savePreferences({
                    ...preferences,
                    [preferenceKey]: selectedPath,
                } as UserPreferences);
            },
        });

    return (
        <>
            {dialogOpen && <WaitingForDialogOverlay message={waitingMessage} />}
            <div className="flex min-w-0 flex-col gap-4">
                <div className="flex flex-col">
                    <h1 data-testid={headerTestId} className="font-bold">
                        {title}
                    </h1>
                    <p data-testid={descriptionTestId} className="text-sm">
                        {description}
                    </p>
                </div>
                <div className="min-w-0 max-w-full">
                    <PathField
                        id={pathTestId}
                        label={fieldLabel}
                        value={currentPath}
                        onChange={() => undefined}
                        onSelect={() => void selectLocation()}
                        title={currentPath}
                        testId={pathTestId}
                        readOnly
                        browseKind="directory"
                        browseTestId={browseTestId}
                        browseLabel={browseLabel}
                        browseText={browseLabel}
                        regularText
                    />
                </div>
            </div>
        </>
    );
};
