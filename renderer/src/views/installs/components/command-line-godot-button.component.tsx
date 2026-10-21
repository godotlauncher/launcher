import { Terminal } from 'lucide-react';
import { Tooltip } from '../../../components/ui/tooltip.component';

/**
 * Selects or clears the terminal default and shows its current operation.
 * @param props - Confirmed selection, pending state, availability and localised labels.
 */
export function CommandLineGodotButton({
    selected,
    pending,
    disabled,
    onSelect,
    t,
}: {
    selected: boolean;
    pending: boolean;
    disabled: boolean;
    onSelect: () => void;
    t: (key: string) => string;
}) {
    return (
        <Tooltip
            placement="top"
            tip={
                selected ? (
                    <div className="flex flex-col gap-1">
                        <span>{t('commandLine.remove')}</span>
                        <span>{t('commandLine.tooltip')}</span>
                    </div>
                ) : (
                    t('commandLine.use')
                )
            }
        >
            <button
                type="button"
                className={`btn btn-sm btn-ghost btn-square shrink-0 ${selected ? 'text-primary bg-primary/10 hover:bg-primary/20' : 'text-base-content/60'}`}
                aria-label={t('commandLine.title')}
                aria-pressed={selected}
                aria-busy={pending}
                disabled={disabled}
                onClick={onSelect}
            >
                {pending ? (
                    <span
                        className="loading loading-spinner loading-xs"
                        aria-hidden="true"
                    />
                ) : (
                    <Terminal size={16} aria-hidden="true" />
                )}
            </button>
        </Tooltip>
    );
}
