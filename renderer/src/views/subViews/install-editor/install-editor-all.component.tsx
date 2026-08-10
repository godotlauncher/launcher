import type { ReleaseSummary } from '@shared/contracts';
import type React from 'react';
import { useTranslation } from 'react-i18next';
import { InstallEditorVariantAction } from './install-editor-variant-action.component.tsx';

type InstallEditorAllProps = {
    releases: ReleaseSummary[];
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
    releases,
    onInstall,
    onReinstall,
}) => {
    const { t } = useTranslation('installEditor');

    return (
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
                                            {release.published_at.split('T')[0]}
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
    );
};
