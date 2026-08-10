import type { ReleaseSummary } from '@shared/contracts';
import type React from 'react';
import { useTranslation } from 'react-i18next';
import { SearchField } from '../../../components/ui/searchField.component.tsx';
import type { InstallEditorChannel } from './install-editor.model.ts';
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
 * Renders all matching releases in a compact table.
 *
 * @param props - The matching releases and install actions.
 * @returns The complete catalog table.
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
    const { t } = useTranslation('installEditor');

    return (
        <div className="flex min-h-0 flex-col gap-2">
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
                <div className="flex min-h-32 items-center justify-center text-base-content/70">
                    {emptyLabel}
                </div>
            ) : (
                <div className="min-h-0 overflow-auto rounded-box border border-base-300">
                    <table className="table table-pin-rows table-sm">
                        <thead className="bg-base-200 text-xs">
                            <tr>
                                <th>{t('table.headers.version')}</th>
                                <th className="text-right">
                                    {t('table.headers.download')}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {releases.map((release) => (
                                <tr key={release.version}>
                                    <td>
                                        <div className="flex min-w-0 flex-col">
                                            <span className="font-medium">
                                                {release.version}
                                            </span>
                                            {release.published_at && (
                                                <span className="text-xs text-base-content/60">
                                                    {
                                                        release.published_at.split(
                                                            'T',
                                                        )[0]
                                                    }
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td>
                                        <div className="flex flex-wrap justify-end gap-2">
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
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};
