import { Copy } from 'lucide-react';
import type React from 'react';
import { useTranslation } from 'react-i18next';
import { Tooltip } from '../../../../components/ui/tooltip.component';

type GeneratedManifestPreviewProps = {
    manifestJson: string;
};

/**
 * Presents the generated manifest with a compact, labelled copy action.
 * @param props - JSON content generated from the form.
 */
export const GeneratedManifestPreview: React.FC<
    GeneratedManifestPreviewProps
> = ({ manifestJson }) => {
    const { t } = useTranslation('common');
    return (
        <div className="flex min-h-0 min-w-0 flex-col rounded-box bg-base-200/50 overflow-hidden">
            <div className="flex shrink-0 items-center justify-between gap-2 px-3 py-2">
                <h3 className="font-semibold">JSON</h3>
                <div className="flex min-w-0 items-center gap-2">
                    <code
                        className="truncate text-sm text-base-content/60"
                        title="godotlauncher-editor-manifest.json"
                    >
                        godotlauncher-editor-manifest.json
                    </code>
                    <Tooltip tip={t('buttons.copy')} placement="top">
                        <button
                            type="button"
                            className="btn btn-sm btn-ghost btn-square"
                            aria-label={t('buttons.copy')}
                            onClick={() =>
                                void navigator.clipboard.writeText(manifestJson)
                            }
                        >
                            <Copy size={16} aria-hidden="true" />
                        </button>
                    </Tooltip>
                </div>
            </div>
            <pre className="min-h-0 flex-1 overflow-auto p-3 text-sm font-mono">
                <code>{manifestJson}</code>
            </pre>
        </div>
    );
};
