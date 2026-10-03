import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';
import { type ReactNode, useRef } from 'react';

type VerticalTabMenuItem<Tab extends string> = {
    value: Tab;
    label: string;
    icon: LucideIcon;
    id?: string;
    panelId?: string;
    testId?: string;
    trailing?: ReactNode;
};

type VerticalTabMenuProps<Tab extends string> = {
    ariaLabel: string;
    items: readonly VerticalTabMenuItem<Tab>[];
    activeTab: Tab;
    onActiveTabChange: (tab: Tab) => void;
};

/** Renders a compact vertical tab menu with local keyboard focus management.
 * @param props - Labelled tabs, optional indicators and controlled selection.
 */
export function VerticalTabMenu<Tab extends string>({
    ariaLabel,
    items,
    activeTab,
    onActiveTabChange,
}: VerticalTabMenuProps<Tab>) {
    const buttons = useRef(new Map<Tab, HTMLButtonElement>());

    return (
        <div
            role="tablist"
            aria-orientation="vertical"
            aria-label={ariaLabel}
            className="flex w-shell-settings-sidebar shrink-0 flex-col gap-1 overflow-y-auto border-r border-base-content/10 p-3"
        >
            {items.map((item, index) => {
                const Icon = item.icon;
                return (
                    <button
                        key={item.value}
                        ref={(button) => {
                            if (button) buttons.current.set(item.value, button);
                            else buttons.current.delete(item.value);
                        }}
                        id={item.id}
                        type="button"
                        role="tab"
                        data-testid={item.testId}
                        aria-selected={activeTab === item.value}
                        aria-controls={item.panelId}
                        tabIndex={activeTab === item.value ? 0 : -1}
                        onClick={() => onActiveTabChange(item.value)}
                        onKeyDown={(event) => {
                            const nextIndex =
                                event.key === 'ArrowDown'
                                    ? (index + 1) % items.length
                                    : event.key === 'ArrowUp'
                                      ? (index - 1 + items.length) %
                                        items.length
                                      : event.key === 'Home'
                                        ? 0
                                        : event.key === 'End'
                                          ? items.length - 1
                                          : undefined;
                            if (nextIndex === undefined) return;
                            event.preventDefault();
                            const next = items[nextIndex].value;
                            onActiveTabChange(next);
                            buttons.current.get(next)?.focus();
                        }}
                        className={clsx(
                            'flex shrink-0 items-center gap-3 rounded-md px-3 py-2 text-left text-base hover:bg-base-content/5',
                            activeTab === item.value &&
                                'bg-primary/10 text-primary font-semibold',
                        )}
                    >
                        <Icon className="size-4 shrink-0" aria-hidden="true" />
                        <span className="min-w-0 flex-1">{item.label}</span>
                        {item.trailing}
                    </button>
                );
            })}
        </div>
    );
}
