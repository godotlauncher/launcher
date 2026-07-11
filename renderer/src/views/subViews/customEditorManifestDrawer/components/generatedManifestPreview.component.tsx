import { Copy } from 'lucide-react';
import type React from 'react';

type GeneratedManifestPreviewProps = {
    manifestJson: string;
};

export const GeneratedManifestPreview: React.FC<
    GeneratedManifestPreviewProps
> = ({ manifestJson }) => (
    <div className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-box border border-base-300 bg-base-200/50">
        <div className="flex shrink-0 items-center justify-between border-b border-base-300 px-3 py-2">
            <span className="text-xs font-bold uppercase text-base-content/60">
                JSON
            </span>
            <div className="flex items-center gap-2">
                <code className="text-[11px] text-base-content/50">
                    godotlauncher-editor-manifest.json
                </code>
                <button
                    type="button"
                    className="btn btn-ghost btn-square btn-xs"
                    aria-label="Copy generated JSON"
                    onClick={() =>
                        void navigator.clipboard.writeText(manifestJson)
                    }
                >
                    <Copy size={14} aria-hidden="true" />
                </button>
            </div>
        </div>
        <pre className="min-h-0 flex-1 overflow-auto p-3 text-[11px] leading-5">
            <code>{manifestJson}</code>
        </pre>
    </div>
);
