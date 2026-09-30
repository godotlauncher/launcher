import { List, Rows2, Rows4 } from 'lucide-react';
import type { KeyboardEvent } from 'react';
import { useRef } from 'react';
import { Tooltip } from '../../../components/ui/tooltip.component';
import type { ProjectViewMode } from '../project-view.types';

type ProjectViewToggleProps = {
    mode: ProjectViewMode;
    onChange: (mode: ProjectViewMode) => void;
    cardsLabel: string;
    listLabel: string;
    compactLabel: string;
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
    compactLabel,
    disabled = false,
}: ProjectViewToggleProps) {
    const cardsRef = useRef<HTMLButtonElement>(null);
    const denseRef = useRef<HTMLButtonElement>(null);
    const compactRef = useRef<HTMLButtonElement>(null);
    const modes: ProjectViewMode[] = ['dense', 'list', 'cards'];
    /**
     * Moves focus and selects a view with the standard horizontal tab keys.
     * @param event - Keyboard input on a view tab.
     */
    const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
        if (disabled) return;
        let next: ProjectViewMode;
        if (event.key === 'Home') next = 'dense';
        else if (event.key === 'End') next = 'cards';
        else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            const direction = event.key === 'ArrowRight' ? 1 : -1;
            next =
                modes[
                    (modes.indexOf(mode) + direction + modes.length) %
                        modes.length
                ];
        } else return;
        event.preventDefault();
        (next === 'cards'
            ? cardsRef
            : next === 'dense'
              ? denseRef
              : compactRef
        ).current?.focus();
        onChange(next);
    };
    return (
        <div
            role="tablist"
            aria-label={`${listLabel} / ${compactLabel} / ${cardsLabel}`}
            className="tabs tabs-box tabs-sm shrink-0"
        >
            <Tooltip
                tip={listLabel}
                placement="top"
                delay={1000}
                className={`tab p-0 ${mode === 'dense' ? 'tab-active' : ''}`}
            >
                <button
                    ref={denseRef}
                    type="button"
                    role="tab"
                    data-testid="tabProjectDenseList"
                    aria-label={listLabel}
                    aria-selected={mode === 'dense'}
                    aria-disabled={disabled}
                    tabIndex={mode === 'dense' ? 0 : -1}
                    className="flex h-full min-w-8 items-center justify-center rounded-[inherit] px-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    onKeyDown={handleKeyDown}
                    onClick={() => {
                        if (!disabled) onChange('dense');
                    }}
                >
                    <List size={16} aria-hidden="true" />
                </button>
            </Tooltip>
            <Tooltip
                tip={compactLabel}
                placement="top"
                delay={1000}
                className={`tab p-0 ${mode === 'list' ? 'tab-active' : ''}`}
            >
                <button
                    ref={compactRef}
                    type="button"
                    role="tab"
                    data-testid="tabProjectList"
                    aria-label={compactLabel}
                    aria-selected={mode === 'list'}
                    aria-disabled={disabled}
                    tabIndex={mode === 'list' ? 0 : -1}
                    className="flex h-full min-w-8 items-center justify-center rounded-[inherit] px-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    onKeyDown={handleKeyDown}
                    onClick={() => {
                        if (!disabled) onChange('list');
                    }}
                >
                    <Rows4 size={16} aria-hidden="true" />
                </button>
            </Tooltip>
            <Tooltip
                tip={cardsLabel}
                placement="top"
                delay={1000}
                className={`tab p-0 ${mode === 'cards' ? 'tab-active' : ''}`}
            >
                <button
                    ref={cardsRef}
                    type="button"
                    role="tab"
                    data-testid="tabProjectCards"
                    aria-label={cardsLabel}
                    aria-selected={mode === 'cards'}
                    aria-disabled={disabled}
                    tabIndex={mode === 'cards' ? 0 : -1}
                    className="flex h-full min-w-8 items-center justify-center rounded-[inherit] px-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    onKeyDown={handleKeyDown}
                    onClick={() => {
                        if (!disabled) onChange('cards');
                    }}
                >
                    <Rows2 size={16} aria-hidden="true" />
                </button>
            </Tooltip>
        </div>
    );
}
