import type { ReleaseSummary } from '@shared/contracts';
import type React from 'react';
import { EditorVersionGroup } from '../../../components/editor-version-group.component.tsx';
import { SearchField } from '../../../components/ui/searchField.component.tsx';
import { groupEditorsByBaseVersion } from '../../../editor-version-group.model.ts';
import { type InstallEditorChannel } from './install-editor.model.ts';
import { InstallEditorVariantAction } from './install-editor-variant-action.component.tsx';

type InstallEditorAllProps = {
    channel: InstallEditorChannel;
    releases: ReleaseSummary[];
    search: string;
    searchPlaceholder: string;
    emptyLabel: string;
    onSearchChange: (search: string) => void;
    onInstall: (release: ReleaseSummary, mono: boolean) => Promise<void>;
    onReinstall: (release: ReleaseSummary, mono: boolean) => Promise<void>;
};

/**
 * Renders all matching releases in compact version groups.
 *
 * @param props - The matching releases and install actions.
 * @returns The complete grouped catalog.
 */
export const InstallEditorAll: React.FC<InstallEditorAllProps> = ({
    channel,
    releases,
    search,
    searchPlaceholder,
    emptyLabel,
    onSearchChange,
    onInstall,
    onReinstall,
}) => {
    const releaseGroups = groupEditorsByBaseVersion(releases);

    return (
        <div className="flex h-full min-h-0 flex-col gap-2">
            <div className="flex shrink-0 justify-end">
                <SearchField
                    key={channel}
                    placeholder={searchPlaceholder}
                    value={search}
                    onChange={onSearchChange}
                    focusOnMount
                    className="max-w-sm"
                    inputClassName=""
                    data-testid="inputInstallSearch"
                />
            </div>

            {releases.length === 0 ? (
                <div className="flex min-h-0 flex-1 items-center justify-center text-base-content/70">
                    {emptyLabel}
                </div>
            ) : (
                <div
                    className="flex min-h-0 flex-1 flex-col overflow-auto pr-1"
                    data-testid="installEditorAllList"
                >
                    {releaseGroups.map((group) => (
                        <EditorVersionGroup
                            key={group.baseVersion}
                            title={group.baseVersion ?? ''}
                            count={group.items.length}
                            headingLevel="h3"
                        >
                            {group.items.map((release) => (
                                <ReleaseRow
                                    key={release.version}
                                    release={release}
                                    onInstall={onInstall}
                                    onReinstall={onReinstall}
                                />
                            ))}
                        </EditorVersionGroup>
                    ))}
                </div>
            )}
        </div>
    );
};

type ReleaseRowProps = {
    release: ReleaseSummary;
    onInstall: (release: ReleaseSummary, mono: boolean) => Promise<void>;
    onReinstall: (release: ReleaseSummary, mono: boolean) => Promise<void>;
};

/**
 * Renders one thin release card in an All version group.
 *
 * @param props - The release and its install actions.
 * @returns One borderless release card.
 */
const ReleaseRow: React.FC<ReleaseRowProps> = ({
    release,
    onInstall,
    onReinstall,
}) => (
    <article className="flex min-h-14 flex-col items-stretch gap-3 rounded-box px-3 py-2 hover:bg-base-200/65 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 flex-col items-start">
            <span className="truncate text-lg font-semibold leading-tight text-base-content">
                {release.version}
            </span>
            {release.published_at && (
                <span className="text-xs text-base-content/50">
                    {release.published_at.split('T')[0]}
                </span>
            )}
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            <InstallEditorVariantAction
                release={release}
                mono={false}
                onInstall={onInstall}
                onReinstall={onReinstall}
            />
            <InstallEditorVariantAction
                release={release}
                mono
                onInstall={onInstall}
                onReinstall={onReinstall}
            />
        </div>
    </article>
);
