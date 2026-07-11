import { BadgePlus } from 'lucide-react';
import type React from 'react';

type CustomEditorManifestDropOverlayProps = {
    supported: boolean;
    t: (key: string) => string;
};

export const CustomEditorManifestDropOverlay: React.FC<
    CustomEditorManifestDropOverlayProps
> = ({ supported, t }) => (
    <div
        className={`absolute inset-0 z-30 border-4 border-dashed flex items-center justify-center pointer-events-none ${
            supported
                ? 'bg-primary/20 border-primary'
                : 'bg-error/20 border-error'
        }`}
    >
        <div className="bg-base-100 p-8 rounded-lg shadow-xl max-w-lg text-center flex flex-col gap-3">
            <BadgePlus
                className={`w-10 h-10 mx-auto ${
                    supported ? 'text-primary' : 'text-error'
                }`}
            />
            <p
                className={`text-2xl font-bold ${
                    supported ? 'text-primary' : 'text-error'
                }`}
            >
                {supported
                    ? t('customEditor.drop.title')
                    : t('customEditor.drop.unsupportedTitle')}
            </p>
            <p className="text-sm text-base-content/70">
                {t('customEditor.drop.helperPrefix')}{' '}
                <code className="font-mono bg-base-300 px-2 rounded text-warning">
                    godotlauncher-editor-manifest.json
                </code>{' '}
                {t('customEditor.drop.helperSuffix')}
            </p>
        </div>
    </div>
);
