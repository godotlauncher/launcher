import { Ellipsis, Terminal } from 'lucide-react';
import { useState } from 'react';
import {
    ActionMenu,
    type ActionMenuAnchorRect,
    getActionMenuAnchorRect,
} from '../../../components/ui/action-menu.component';

/**
 * Offers one command-line action without replacing existing editor buttons.
 * @param props - Current selection, availability and localised labels.
 */
export function CommandLineGodotMenu({
    selected,
    disabled,
    onSelect,
    t,
}: {
    selected: boolean;
    disabled: boolean;
    onSelect: () => void;
    t: (key: string) => string;
}) {
    const [anchor, setAnchor] = useState<ActionMenuAnchorRect | null>(null);
    return (
        <>
            <button
                type="button"
                className="btn btn-sm btn-ghost btn-square shrink-0"
                aria-label={t('commandLine.actions')}
                aria-haspopup="dialog"
                aria-expanded={anchor !== null}
                disabled={disabled && !selected}
                onClick={(event) =>
                    setAnchor(getActionMenuAnchorRect(event.currentTarget))
                }
            >
                <Ellipsis size={16} aria-hidden="true" />
            </button>
            <ActionMenu
                open={anchor !== null}
                anchorRect={anchor}
                ariaLabel={t('commandLine.actions')}
                onClose={() => setAnchor(null)}
                items={[
                    {
                        key: 'command-line-godot',
                        icon: <Terminal size={16} aria-hidden="true" />,
                        label: t(
                            selected ? 'commandLine.remove' : 'commandLine.use',
                        ),
                        disabled,
                        onSelect,
                    },
                ]}
            />
        </>
    );
}
