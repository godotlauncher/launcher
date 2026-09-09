import { FilePlus2, TriangleAlert } from 'lucide-react';
import type React from 'react';

type CustomEditorManifestDropOverlayProps = {
    supported: boolean;
    t: (key: string) => string;
};

/**
 * Shows theme-aware manifest drop feedback over the installs content.
 * @param props - File support state and localised labels.
 */
export const CustomEditorManifestDropOverlay: React.FC<
    CustomEditorManifestDropOverlayProps
> = ({ supported, t }) => (
    <div
        className="absolute inset-0 z-30 flex items-center justify-center bg-base-100/60 pointer-events-none"
        role="status"
    >
        <div
            className={`rounded-box p-6 max-w-lg text-center text-base flex flex-col gap-3 ${supported ? 'bg-base-200' : 'bg-warning/10 text-warning-content dark:text-warning'}`}
        >
            {supported ? (
                <FilePlus2
                    className="size-8 mx-auto text-base-content/75"
                    aria-hidden="true"
                />
            ) : (
                <TriangleAlert className="size-8 mx-auto" aria-hidden="true" />
            )}
            <h2 className="text-lg font-semibold">
                {supported
                    ? t('customEditor.drop.title')
                    : t('customEditor.drop.unsupportedTitle')}
            </h2>
            <p className="text-base-content/75">
                {t('customEditor.drop.helperPrefix')}{' '}
                <code className="font-mono text-sm break-all">
                    godotlauncher-editor-manifest.json
                </code>{' '}
                {t('customEditor.drop.helperSuffix')}
            </p>
        </div>
    </div>
);
