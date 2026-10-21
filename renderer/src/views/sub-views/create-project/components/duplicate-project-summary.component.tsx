import type { ProjectDetails } from '@shared/contracts';
import { ImageOff, Info } from 'lucide-react';
import type React from 'react';
import { HelpTooltip } from '../../../../components/ui/help-tooltip.component';

type DuplicateProjectSummaryProps = {
    source: ProjectDetails;
    name: string;
    destination?: string;
    editorLabel: string;
    originalUnchangedLabel?: string;
    editorNotice?: string;
};

/** Shows the source or destination recap without repeating editable fields.
 * @param props - Project icon, identity, fixed editor and optional status.
 */
export const DuplicateProjectSummary: React.FC<
    DuplicateProjectSummaryProps
> = ({
    source,
    name,
    destination,
    editorLabel,
    originalUnchangedLabel,
    editorNotice,
}) => (
    <section className="flex min-w-0 flex-col gap-3 py-3">
        <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden">
                {source.icon_path ? (
                    <img
                        src={source.icon_path}
                        alt=""
                        className="size-full object-contain"
                    />
                ) : (
                    <ImageOff size={28} aria-hidden="true" />
                )}
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex items-center gap-2">
                    <p className="min-w-0 break-words text-lg font-semibold">
                        {name}
                    </p>
                    {!destination && (
                        <HelpTooltip help={source.path} icon={Info} />
                    )}
                </div>
                {destination && (
                    <p className="break-all text-sm text-base-content/60">
                        {destination}
                    </p>
                )}
                <p
                    data-testid="duplicateEditorSummary"
                    className="text-sm text-base-content/65"
                >
                    {editorLabel}
                </p>
            </div>
            {originalUnchangedLabel && (
                <p className="hidden max-w-40 text-sm text-base-content/60 sm:block">
                    {originalUnchangedLabel}
                </p>
            )}
        </div>
        {editorNotice && (
            <p
                role="status"
                className="text-sm text-warning-content dark:text-warning"
            >
                {editorNotice}
            </p>
        )}
    </section>
);
