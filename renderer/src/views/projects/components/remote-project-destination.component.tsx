import type { TFunction } from 'i18next';
import type { RefObject } from 'react';
import { PathField } from '../../../components/ui/pathField.component';

type RemoteProjectDestinationProps = {
    repositoryDisplay: string;
    parentDirectory: string;
    defaultParentDirectory: string;
    destinationDisplay: string;
    pathSuffixDisplay: string;
    showUseDefaultPath: boolean;
    selectingFolder: boolean;
    inputRef: RefObject<HTMLInputElement | null>;
    t: TFunction;
    onParentDirectoryChange: (value: string) => void;
    onChooseParentDirectory: () => void;
    onStartImport: () => void;
};

/**
 * Renders the clone destination review for a remote repository.
 *
 * @param props - Controlled destination state and actions.
 * @returns Remote project destination content.
 */
export function RemoteProjectDestination({
    repositoryDisplay,
    parentDirectory,
    defaultParentDirectory,
    destinationDisplay,
    pathSuffixDisplay,
    showUseDefaultPath,
    selectingFolder,
    inputRef,
    t,
    onParentDirectoryChange,
    onChooseParentDirectory,
    onStartImport,
}: RemoteProjectDestinationProps) {
    return (
        <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
                <span className="font-medium">
                    {t('addProject.remote.destination.repository')}
                </span>
                <span
                    className="min-h-12 truncate rounded-box border border-base-300 bg-base-200 px-4 py-3 font-medium text-base-content"
                    title={repositoryDisplay}
                >
                    {repositoryDisplay}
                </span>
            </div>
            <PathField
                id="inputRemoteProjectPath"
                label={t('addProject.remote.destination.cloneTo')}
                labelAction={
                    showUseDefaultPath ? (
                        <button
                            type="button"
                            data-testid="btnUseDefaultRemoteProjectPath"
                            className="btn btn-ghost btn-xs h-6 min-h-6 px-2 text-xs text-primary"
                            onClick={() =>
                                onParentDirectoryChange(defaultParentDirectory)
                            }
                        >
                            {t('addProject.remote.destination.useDefault')}
                        </button>
                    ) : undefined
                }
                inputRef={inputRef}
                testId="inputRemoteProjectPath"
                value={parentDirectory}
                title={destinationDisplay}
                suffix={pathSuffixDisplay}
                suffixTestId="remoteProjectPathSuffix"
                onChange={onParentDirectoryChange}
                onKeyDown={(event) => {
                    if (
                        event.key !== 'Enter' ||
                        event.repeat ||
                        event.nativeEvent.isComposing
                    )
                        return;
                    event.preventDefault();
                    onStartImport();
                }}
                onSelect={onChooseParentDirectory}
                browseKind="directory"
                browseTestId="btnSelectRemoteProjectFolder"
                browseLabel={t('addProject.remote.destination.chooseParent')}
                browseDisabled={selectingFolder}
            />
        </div>
    );
}

type RemoteProjectDestinationFooterProps = {
    canStart: boolean;
    t: TFunction;
    onBack: () => void;
    onCancel: () => void;
    onStartImport: () => void;
};

/**
 * Renders destination navigation and clone actions.
 *
 * @param props - Destination availability and actions.
 * @returns Destination footer actions.
 */
export function RemoteProjectDestinationFooter({
    canStart,
    t,
    onBack,
    onCancel,
    onStartImport,
}: RemoteProjectDestinationFooterProps) {
    return (
        <div className="flex w-full items-center justify-between gap-4">
            <button type="button" className="btn btn-ghost" onClick={onBack}>
                {t('common:buttons.back')}
            </button>
            <div className="flex items-center gap-3">
                <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={onCancel}
                >
                    {t('common:buttons.cancel')}
                </button>
                <button
                    type="button"
                    className="btn btn-primary"
                    disabled={!canStart}
                    onClick={onStartImport}
                >
                    {t('addProject.remote.actions.clone')}
                </button>
            </div>
        </div>
    );
}
