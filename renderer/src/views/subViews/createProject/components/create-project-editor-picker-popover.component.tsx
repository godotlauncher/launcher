import type {
    InstalledRelease,
    ReleaseInstallProgress,
} from '@shared/contracts';
import clsx from 'clsx';
import type React from 'react';
import { useTranslation } from 'react-i18next';
import { SearchField } from '../../../../components/ui/searchField.component';
import type {
    CreateProjectCatalogueVariant,
    CreateProjectEditorSelection,
    CreateProjectReleaseRow,
} from '../createProject.model';
import { getCreateProjectReleaseKey } from '../createProject.model';
import { CreateProjectEditorOption } from './create-project-editor-option.component';

export type CreateProjectEditorPickerTab = 'installed' | 'catalogue';
export type CreateProjectEditorPickerChannel = 'stable' | 'prerelease';

type CreateProjectEditorPickerPopoverProps = {
    id: string;
    labelledBy: string;
    popoverRef: React.RefObject<HTMLDivElement | null>;
    style: React.CSSProperties;
    open: boolean;
    tab: CreateProjectEditorPickerTab;
    channel: CreateProjectEditorPickerChannel;
    search: string;
    installedRows: CreateProjectReleaseRow[];
    installedReleases: InstalledRelease[];
    catalogueVariants: CreateProjectCatalogueVariant[];
    releaseInstallProgress: ReleaseInstallProgress[];
    loading: boolean;
    selection: CreateProjectEditorSelection | null;
    onTabChange: (tab: CreateProjectEditorPickerTab) => void;
    onChannelChange: (channel: CreateProjectEditorPickerChannel) => void;
    onSearchChange: (search: string) => void;
    onSelectionChange: (selection: CreateProjectEditorSelection) => void;
    onCancelInstall: (jobId: string) => void;
    onKeyDown: React.KeyboardEventHandler<HTMLDivElement>;
    registerInstalledOption: (
        key: string,
        element: HTMLButtonElement | null,
    ) => void;
};

/**
 * Renders the rich editor selection controls inside an anchored popover.
 *
 * @param props - Picker state, editor collections, and interaction callbacks.
 * @returns The native popover panel for Create Project editor selection.
 */
export const CreateProjectEditorPickerPopover: React.FC<
    CreateProjectEditorPickerPopoverProps
> = ({
    id,
    labelledBy,
    popoverRef,
    style,
    open,
    tab,
    channel,
    search,
    installedRows,
    installedReleases,
    catalogueVariants,
    releaseInstallProgress,
    loading,
    selection,
    onTabChange,
    onChannelChange,
    onSearchChange,
    onSelectionChange,
    onCancelInstall,
    onKeyDown,
    registerInstalledOption,
}) => {
    const { t } = useTranslation(['createProject', 'installEditor']);
    const labels = {
        standard: t('editorPicker.standard'),
        dotNet: t('project.dotNetBadge'),
        prerelease: t('project.prereleaseBadge'),
        custom: t('editorPicker.custom'),
        installed: t('editorPicker.installed'),
        selected: t('editorPicker.selected'),
        unavailable: t('editorPicker.unavailable'),
        downloadRequired: t('editorPicker.downloadRequired'),
    };

    return (
        <div
            ref={popoverRef}
            id={id}
            popover="auto"
            role="dialog"
            aria-modal="false"
            aria-labelledby={labelledBy}
            data-testid="createProjectEditorPickerPopover"
            onKeyDown={onKeyDown}
            className="fixed inset-auto m-0 w-[min(34rem,calc(100vw-2rem))] rounded-box border border-base-300 bg-base-100 p-3 shadow-xl backdrop:bg-transparent"
            style={style}
        >
            <div className="flex min-h-0 flex-col gap-3">
                <div
                    role="tablist"
                    className="tabs tabs-box tabs-sm self-start"
                >
                    <button
                        type="button"
                        role="tab"
                        data-testid="tabCreateProjectInstalledEditors"
                        aria-selected={tab === 'installed'}
                        className={clsx('tab', {
                            'tab-active': tab === 'installed',
                        })}
                        onClick={() => onTabChange('installed')}
                    >
                        {t('editorPicker.installed')}
                    </button>
                    <button
                        type="button"
                        role="tab"
                        data-testid="tabCreateProjectBrowseEditors"
                        aria-selected={tab === 'catalogue'}
                        className={clsx('tab', {
                            'tab-active': tab === 'catalogue',
                        })}
                        onClick={() => onTabChange('catalogue')}
                    >
                        {t('editorPicker.browse')}
                    </button>
                </div>

                {tab === 'installed' ? (
                    <div
                        role="listbox"
                        aria-labelledby={labelledBy}
                        className="max-h-80 space-y-1 overflow-y-auto overscroll-contain"
                    >
                        {installedRows.length === 0 ? (
                            <p className="py-4 text-center text-sm text-base-content/60">
                                {t('editorPicker.noInstalled')}
                            </p>
                        ) : (
                            installedRows.map((release) => {
                                const key = getCreateProjectReleaseKey(release);

                                return (
                                    <CreateProjectEditorOption
                                        key={key}
                                        kind="installed"
                                        release={release}
                                        optionKey={key}
                                        selected={
                                            selection?.source === 'installed' &&
                                            selection.key === key
                                        }
                                        labels={labels}
                                        buttonRef={(element) =>
                                            registerInstalledOption(
                                                key,
                                                element,
                                            )
                                        }
                                        onSelect={() =>
                                            onSelectionChange({
                                                source: 'installed',
                                                key,
                                                release,
                                            })
                                        }
                                    />
                                );
                            })
                        )}
                    </div>
                ) : (
                    <div className="flex min-h-0 flex-col gap-3">
                        <div className="flex flex-wrap items-center gap-2">
                            <SearchField
                                id="inputCreateProjectEditorSearch"
                                data-testid="inputCreateProjectEditorSearch"
                                value={search}
                                onChange={onSearchChange}
                                placeholder={t('editorPicker.search')}
                                clearLabel={t('editorPicker.clearSearch')}
                                className="min-w-48 flex-1 max-w-none"
                                focusOnMount={open}
                                compact
                            />
                            <div
                                role="tablist"
                                className="tabs tabs-box tabs-sm"
                                aria-label={t('editorPicker.channel')}
                            >
                                <button
                                    type="button"
                                    role="tab"
                                    data-testid="tabCreateProjectStableEditors"
                                    aria-selected={channel === 'stable'}
                                    className={clsx('tab', {
                                        'tab-active': channel === 'stable',
                                    })}
                                    onClick={() => onChannelChange('stable')}
                                >
                                    {t('editorPicker.stable')}
                                </button>
                                <button
                                    type="button"
                                    role="tab"
                                    data-testid="tabCreateProjectPrereleaseEditors"
                                    aria-selected={channel === 'prerelease'}
                                    className={clsx('tab', {
                                        'tab-active': channel === 'prerelease',
                                    })}
                                    onClick={() =>
                                        onChannelChange('prerelease')
                                    }
                                >
                                    {t('editorPicker.prereleases')}
                                </button>
                            </div>
                        </div>

                        <div
                            role="listbox"
                            aria-labelledby={labelledBy}
                            data-testid="createProjectEditorCatalogueList"
                            className="max-h-80 space-y-1 overflow-y-auto overscroll-contain"
                        >
                            {loading && catalogueVariants.length === 0 ? (
                                <p
                                    className="py-4 text-center text-sm text-base-content/60"
                                    role="status"
                                >
                                    {t('editorPicker.loading')}
                                </p>
                            ) : catalogueVariants.length === 0 ? (
                                <p className="py-4 text-center text-sm text-base-content/60">
                                    {t('editorPicker.noMatches')}
                                </p>
                            ) : (
                                catalogueVariants.map((variant) => {
                                    const installedRelease =
                                        installedReleases.find(
                                            (candidate) =>
                                                candidate.version ===
                                                    variant.release.version &&
                                                candidate.mono ===
                                                    variant.mono &&
                                                candidate.valid !== false &&
                                                Boolean(candidate.editor_path),
                                        );
                                    const progress =
                                        releaseInstallProgress.find(
                                            (candidate) =>
                                                candidate.version ===
                                                    variant.release.version &&
                                                candidate.mono === variant.mono,
                                        );

                                    return (
                                        <CreateProjectEditorOption
                                            key={variant.key}
                                            kind="catalogue"
                                            release={variant.release}
                                            mono={variant.mono}
                                            optionKey={variant.key}
                                            selected={
                                                selection?.source ===
                                                    'catalogue' &&
                                                selection.key === variant.key
                                            }
                                            installedRelease={installedRelease}
                                            progress={progress}
                                            labels={labels}
                                            onSelect={() =>
                                                onSelectionChange({
                                                    source: 'catalogue',
                                                    key: variant.key,
                                                    release: variant.release,
                                                    mono: variant.mono,
                                                    installedRelease,
                                                })
                                            }
                                            onCancelInstall={onCancelInstall}
                                        />
                                    );
                                })
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
