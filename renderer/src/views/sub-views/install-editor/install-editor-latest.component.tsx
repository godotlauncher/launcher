import type { ReleaseSummary } from '@shared/contracts';
import type React from 'react';
import { useTranslation } from 'react-i18next';
import type { InstallEditorChannel } from './install-editor.model.ts';
import { InstallEditorVariantAction } from './install-editor-variant-action.component.tsx';

type InstallEditorLatestProps = {
    channel: InstallEditorChannel;
    releases: ReleaseSummary[];
    onInstall: (release: ReleaseSummary, mono: boolean) => Promise<void>;
    onReinstall: (release: ReleaseSummary, mono: boolean) => Promise<void>;
};

/**
 * Renders the featured and secondary releases in the Latest view.
 *
 * @param props - The selected channel, releases, and install actions.
 * @returns The Latest catalog view.
 */
export const InstallEditorLatest: React.FC<InstallEditorLatestProps> = ({
    channel,
    releases,
    onInstall,
    onReinstall,
}) => {
    const { t } = useTranslation('installEditor');
    const featuredRelease = releases[0];
    const secondaryReleases = releases.slice(1);

    if (!featuredRelease) {
        return null;
    }

    return (
        <div className="flex h-full min-h-0 flex-col gap-4 overflow-auto pb-2 pr-3">
            <section className="flex flex-col gap-2">
                <h3 className="text-base font-semibold">
                    {channel === 'stable'
                        ? t('catalog.latestStableRelease')
                        : t('catalog.latestPrerelease')}
                </h3>
                <ReleaseCard
                    release={featuredRelease}
                    onInstall={onInstall}
                    onReinstall={onReinstall}
                />
            </section>

            {secondaryReleases.length > 0 && (
                <section className="flex flex-col gap-2">
                    <h3 className="text-base font-semibold">
                        {t('catalog.olderReleases')}
                    </h3>
                    {secondaryReleases.map((release) => (
                        <ReleaseCard
                            key={release.version}
                            release={release}
                            onInstall={onInstall}
                            onReinstall={onReinstall}
                        />
                    ))}
                </section>
            )}
        </div>
    );
};

type ReleaseCardProps = {
    release: ReleaseSummary;
    onInstall: (release: ReleaseSummary, mono: boolean) => Promise<void>;
    onReinstall: (release: ReleaseSummary, mono: boolean) => Promise<void>;
};

/**
 * Renders one release card with both editor variants.
 *
 * @param props - The release, display tone, and install actions.
 * @returns One editor release card.
 */
const ReleaseCard: React.FC<ReleaseCardProps> = ({
    release,
    onInstall,
    onReinstall,
}) => (
    <article
        className={
            'flex min-h-14 flex-col items-stretch gap-3 px-3 py-3 hover:bg-base-content/5 sm:flex-row sm:items-center'
        }
    >
        <div className="flex min-w-0 flex-1 flex-col items-start">
            <span className="truncate font-semibold">{release.version}</span>
            {release.published_at && (
                <span className="text-sm text-base-content/60">
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
