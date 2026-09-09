import { Rows2, Rows4 } from 'lucide-react';
import type { KeyboardEvent } from 'react';
import { useRef } from 'react';
import { Tooltip } from '../../../components/ui/tooltip.component';
import type { ProjectViewMode } from '../project-view.types';

type ProjectViewToggleProps = {
    mode: ProjectViewMode;
    onChange: (mode: ProjectViewMode) => void;
    cardsLabel: string;
    listLabel: string;
    disabled?: boolean;
};

/**
 * Selects the project presentation with pointer or arrow-key navigation.
 * @param props - Selected mode, translated labels and preference save state.
 */
export function ProjectViewToggle({
    mode,
    onChange,
    cardsLabel,
    listLabel,
    disabled = false,
}: ProjectViewToggleProps) {
    const cardsRef = useRef<HTMLButtonElement>(null);
    const listRef = useRef<HTMLButtonElement>(null);
    /**
     * Moves focus and selects a view with the standard horizontal tab keys.
     * @param event - Keyboard input on either view tab.
     */
    const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
        if (disabled) return;
        let next: ProjectViewMode;
        if (event.key === 'Home') next = 'list';
        else if (event.key === 'End') next = 'cards';
        else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight')
            next = mode === 'cards' ? 'list' : 'cards';
        else return;
        event.preventDefault();
        (next === 'cards' ? cardsRef : listRef).current?.focus();
        onChange(next);
    };
    return (
        <div
            role="tablist"
            aria-label={`${listLabel} / ${cardsLabel}`}
            className="tabs tabs-box tabs-sm shrink-0"
        >
            <button
                ref={listRef}
                type="button"
                role="tab"
                data-testid="tabProjectList"
                aria-label={listLabel}
                aria-selected={mode === 'list'}
                aria-disabled={disabled}
                tabIndex={mode === 'list' ? 0 : -1}
                className={`tab ${mode === 'list' ? 'tab-active' : ''}`}
                onKeyDown={handleKeyDown}
                onClick={() => {
                    if (!disabled) onChange('list');
                }}
            >
                <Tooltip
                    tip={listLabel}
                    placement="top"
                    className="h-full w-full items-center justify-center"
                >
                    <Rows4 size={16} aria-hidden="true" />
                </Tooltip>
            </button>
            <button
                ref={cardsRef}
                type="button"
                role="tab"
                data-testid="tabProjectCards"
                aria-label={cardsLabel}
                aria-selected={mode === 'cards'}
                aria-disabled={disabled}
                tabIndex={mode === 'cards' ? 0 : -1}
                className={`tab ${mode === 'cards' ? 'tab-active' : ''}`}
                onKeyDown={handleKeyDown}
                onClick={() => {
                    if (!disabled) onChange('cards');
                }}
            >
                <Tooltip
                    tip={cardsLabel}
                    placement="top"
                    className="h-full w-full items-center justify-center"
                >
                    <Rows2 size={16} aria-hidden="true" />
                </Tooltip>
            </button>
        </div>
    );
}
