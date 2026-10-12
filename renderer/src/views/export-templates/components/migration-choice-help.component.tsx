import type { TemplateMigrationDecision } from '@shared/contracts';
import { Info } from 'lucide-react';
import { useCallback, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { OverlayTitle } from '../../../components/ui/overlay-title.component';
import { Popover } from '../../../components/ui/popover.component';
import { migrationVersionName } from '../template-migration-choice.util';
import { MigrationChoiceInformation } from './migration-choice-information.component';

/** Supplies the current choice's explanation to the shared anchored panel.
 * @param props - Current option, project label and exact affected versions.
 */
export function MigrationChoiceHelp({
    choice,
    projectName,
    setIds,
}: {
    choice: TemplateMigrationDecision;
    projectName: string;
    setIds: string[];
}) {
    const { t } = useTranslation('exportTemplates');
    const id = useId();
    const trigger = useRef<HTMLButtonElement>(null);
    const title = useRef<HTMLHeadingElement>(null);
    const [open, setOpen] = useState(false);
    /** Keeps explanation panels above the host wizard's actions. */
    const getBoundary = useCallback(
        () => ({
            bottom:
                trigger.current
                    ?.closest('dialog')
                    ?.querySelector('footer')
                    ?.getBoundingClientRect().top ?? window.innerHeight,
        }),
        [],
    );
    return (
        <>
            <button
                ref={trigger}
                type="button"
                className="btn btn-ghost btn-circle btn-sm shrink-0"
                aria-label={t('wizardMigration.explain', {
                    choice: t(`wizardMigration.choices.${choice}`),
                    project: projectName,
                })}
                aria-haspopup="dialog"
                aria-expanded={open}
                aria-controls={id}
                onClick={() => setOpen(!open)}
            >
                <Info size={18} aria-hidden="true" />
            </button>
            <Popover
                id={id}
                open={open}
                onOpenChange={setOpen}
                triggerRef={trigger}
                initialFocusRef={title}
                ariaLabelledBy={`${id}-title`}
                placement="left"
                getBoundary={getBoundary}
                className="w-[28rem]"
                header={
                    <OverlayTitle
                        ref={title}
                        id={`${id}-title`}
                        className="text-base font-semibold"
                    >
                        {projectName}
                    </OverlayTitle>
                }
            >
                <p className="my-2 text-base-content/65">
                    {t('wizardMigration.scope', {
                        versions: setIds.map(migrationVersionName).join(', '),
                    })}
                </p>
                <MigrationChoiceInformation choice={choice} />
            </Popover>
        </>
    );
}
