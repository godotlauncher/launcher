import type React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
    createDrawerCloseButtonClickHandler,
    Drawer,
    focusDrawerElement,
    shouldCloseDrawerOnBackdropClick,
    shouldCloseDrawerOnEscape,
    shouldTrapDrawerFocus,
} from './drawer.component';

const noop = () => {};

describe('Drawer', () => {
    it('does not render when closed', () => {
        const html = renderToStaticMarkup(
            <Drawer open={false} onOpenChange={noop} ariaLabel="Closed drawer">
                <Drawer.Body>Hidden content</Drawer.Body>
            </Drawer>,
        );

        expect(html).toBe('');
    });

    it('renders only supplied slots', () => {
        const html = renderToStaticMarkup(
            <Drawer open onOpenChange={noop} ariaLabel="Body only drawer">
                <Drawer.Body>Body content</Drawer.Body>
            </Drawer>,
        );

        expect(html).toContain('Body content');
        expect(html).not.toContain('<header');
        expect(html).not.toContain('<footer');
    });

    it('renders compound title, body, footer, and close button slots', () => {
        const html = renderToStaticMarkup(
            <Drawer open onOpenChange={noop}>
                <Drawer.Header>
                    <Drawer.Title>Project details</Drawer.Title>
                    <Drawer.CloseButton />
                </Drawer.Header>
                <Drawer.Body>Project content</Drawer.Body>
                <Drawer.Footer>
                    <button type="button" className="btn btn-primary">
                        Save
                    </button>
                </Drawer.Footer>
            </Drawer>,
        );

        expect(html).toContain('<header');
        expect(html).toContain('Project details');
        expect(html).toContain('Project content');
        expect(html).toContain('<footer');
        expect(html).toContain('aria-label="Close drawer"');
    });

    it.each(['left', 'right', 'top', 'bottom'] as const)(
        'renders %s side state attributes',
        (side) => {
            const html = renderToStaticMarkup(
                <Drawer open onOpenChange={noop} side={side} ariaLabel={side}>
                    <Drawer.Body>{side}</Drawer.Body>
                </Drawer>,
            );

            expect(html).toContain('data-state="open"');
            expect(html).toContain(`data-side="${side}"`);
        },
    );

    it('renders dialog accessibility attributes from a title slot', () => {
        const html = renderToStaticMarkup(
            <Drawer open onOpenChange={noop}>
                <Drawer.Header>
                    <Drawer.Title>Project details</Drawer.Title>
                </Drawer.Header>
            </Drawer>,
        );

        expect(html).toContain('role="dialog"');
        expect(html).toContain('aria-modal="true"');
        expect(html).toContain('aria-labelledby=');
        expect(html).toContain('data-state="open"');
    });

    it('renders dialog accessibility attributes from an aria label', () => {
        const html = renderToStaticMarkup(
            <Drawer open onOpenChange={noop} ariaLabel="Project details">
                <Drawer.Body>Project content</Drawer.Body>
            </Drawer>,
        );

        expect(html).toContain('role="dialog"');
        expect(html).toContain('aria-modal="true"');
        expect(html).toContain('aria-label="Project details"');
        expect(html).toContain('data-state="open"');
    });

    it('detects backdrop clicks that should close the drawer', () => {
        const backdrop = {} as EventTarget;
        const panel = {} as EventTarget;

        expect(
            shouldCloseDrawerOnBackdropClick({
                target: backdrop,
                currentTarget: backdrop,
            }),
        ).toBe(true);
        expect(
            shouldCloseDrawerOnBackdropClick({
                target: panel,
                currentTarget: backdrop,
            }),
        ).toBe(false);
        expect(
            shouldCloseDrawerOnBackdropClick(
                {
                    target: backdrop,
                    currentTarget: backdrop,
                },
                false,
            ),
        ).toBe(false);
    });

    it('detects Escape key events that should close the drawer', () => {
        expect(shouldCloseDrawerOnEscape({ key: 'Escape' })).toBe(true);
        expect(shouldCloseDrawerOnEscape({ key: 'Enter' })).toBe(false);
        expect(shouldCloseDrawerOnEscape({ key: 'Escape' }, false)).toBe(false);
        expect(
            shouldCloseDrawerOnEscape({
                key: 'Escape',
                defaultPrevented: true,
            }),
        ).toBe(false);
        expect(
            shouldCloseDrawerOnEscape(
                { key: 'Escape' },
                { hasOpenPopover: true },
            ),
        ).toBe(false);
    });

    it('suspends focus trapping while an app-level modal is open', () => {
        expect(shouldTrapDrawerFocus({ key: 'Tab' })).toBe(true);
        expect(shouldTrapDrawerFocus({ key: 'Tab' }, false)).toBe(false);
        expect(shouldTrapDrawerFocus({ key: 'Escape' })).toBe(false);
        expect(
            shouldTrapDrawerFocus({ key: 'Tab', defaultPrevented: true }),
        ).toBe(false);
    });

    it('creates a close button handler that closes unless the click is prevented', () => {
        const close = vi.fn();
        const onClick = vi.fn();
        const closeButtonClickHandler = createDrawerCloseButtonClickHandler(
            close,
            onClick,
        );

        closeButtonClickHandler?.({
            defaultPrevented: false,
        } as React.MouseEvent<HTMLButtonElement>);

        expect(onClick).toHaveBeenCalledTimes(1);
        expect(close).toHaveBeenCalledTimes(1);

        closeButtonClickHandler?.({
            defaultPrevented: true,
        } as React.MouseEvent<HTMLButtonElement>);

        expect(onClick).toHaveBeenCalledTimes(2);
        expect(close).toHaveBeenCalledTimes(1);
    });

    it('focuses drawer elements without moving the page', () => {
        const focus = vi.fn();
        const element = { focus } as unknown as HTMLElement;

        focusDrawerElement(element);

        expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    });
});
