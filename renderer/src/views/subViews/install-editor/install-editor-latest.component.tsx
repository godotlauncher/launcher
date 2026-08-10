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
        <div className="flex h-full min-h-0 flex-col gap-4 overflow-auto pb-2">
            <section className="flex flex-col gap-2">
                <p className="text-base font-bold text-base-content">
                    {channel === 'stable'
                        ? t('catalog.latestStableRelease')
                        : t('catalog.latestPrerelease')}
                </p>
                <ReleaseCard
                    release={featuredRelease}
                    featured
                    onInstall={onInstall}
                    onReinstall={onReinstall}
                />
            </section>

            {secondaryReleases.length > 0 && (
                <section className="flex flex-col gap-2">
                    <p className="mt-2 text-base font-bold text-base-content">
                        {t('catalog.olderReleases')}
                    </p>
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
    featured?: boolean;
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
    featured = false,
    onInstall,
    onReinstall,
}) => (
    <article
        className={
            featured
                ? 'flex flex-col items-stretch gap-4 rounded-box border border-primary bg-primary/5 px-4 py-4 sm:flex-row sm:items-center'
                : 'flex flex-col items-stretch gap-4 rounded-box border border-base-300 px-4 py-4 sm:flex-row sm:items-center'
        }
    >
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
                tone={featured ? 'primary' : 'outline'}
                onInstall={onInstall}
                onReinstall={onReinstall}
            />
            <InstallEditorVariantAction
                release={release}
                mono
                tone={featured ? 'primary' : 'outline'}
                onInstall={onInstall}
                onReinstall={onReinstall}
            />
        </div>
    </article>
);
