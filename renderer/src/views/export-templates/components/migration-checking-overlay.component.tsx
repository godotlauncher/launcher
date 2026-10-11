import type { TemplateMigrationCheckProgress } from '@shared/contracts';
import { useTranslation } from 'react-i18next';
import { LoadingRocket } from '../../../components/loading-rocket.component';
import { formatTemplateBytes } from '../template-format.util';

/** Covers the modal during its read-only check, with project and byte progress.
 * @param props - Progress for the currently checked project, when available.
 */
export function MigrationCheckingOverlay({
    progress,
}: {
    progress?: TemplateMigrationCheckProgress;
}) {
    const { t, i18n } = useTranslation('exportTemplates');
    const ratio = progress?.totalBytes
        ? Math.min(100, (progress.completedBytes / progress.totalBytes) * 100)
        : undefined;
    return (
        <div
            className="flex h-full w-full items-center justify-center bg-base-100/80"
            role="status"
            aria-live="polite"
            aria-busy="true"
        >
            <div className="flex max-w-sm flex-col items-center gap-4 px-6 text-center">
                <LoadingRocket />
                <p className="text-base font-medium">
                    {t('wizardMigration.reviewing')}
                </p>
                {progress && (
                    <p className="text-sm text-base-content/75 break-words">
                        {progress.projectName} ({progress.projectIndex} /{' '}
                        {progress.projectCount})
                    </p>
                )}
                {ratio !== undefined && progress && (
                    <>
                        <progress
                            className="progress progress-primary w-64 max-w-full"
                            aria-label={t('wizardMigration.reviewing')}
                            value={ratio}
                            max={100}
                        />
                        <p className="text-sm text-base-content/75">
                            {formatTemplateBytes(
                                progress.completedBytes,
                                i18n.language,
                            )}{' '}
                            /{' '}
                            {formatTemplateBytes(
                                progress.totalBytes,
                                i18n.language,
                            )}
                        </p>
                    </>
                )}
            </div>
        </div>
    );
}
