import { describe, expect, it, vi } from 'vitest';
import { createNotificationsStore } from './notification.store';

describe('notification ownership', () => {
    it('preserves newer feedback when an earlier operation finishes, even after that feedback is dismissed', () => {
        const store = createNotificationsStore();
        const startedAt = store.getNotificationRevision();
        const newer = store.showNotification({ title: 'Group order saved' });
        expect(
            store.showNotificationIfUnchanged(startedAt, {
                title: 'New status cleared',
            }),
        ).toBeNull();
        store.dismissNotification(newer);
        expect(
            store.showNotificationIfUnchanged(startedAt, {
                title: 'Could not clear New status',
            }),
        ).toBeNull();
        expect(store.getSnapshot()).toBeNull();
        const current = store.getNotificationRevision();
        expect(
            store.showNotificationIfUnchanged(current, {
                title: 'Settings saved',
            }),
        ).not.toBeNull();
        expect(store.getSnapshot()?.title).toBe('Settings saved');
    });

    it('keeps a newer notification when an earlier async action completes', async () => {
        const store = createNotificationsStore();
        const first = store.showNotification({ title: 'Order saved' });
        let finish: () => void = () => {};
        const pending = new Promise<void>((resolve) => {
            finish = resolve;
        });
        const action = pending.then(() =>
            store.replaceNotification(first, { title: 'Order restored' }),
        );
        const latest = store.showNotification({ title: 'Download complete' });
        finish();
        expect(await action).toBeNull();
        store.dismissNotification(first);
        expect(store.getSnapshot()).toMatchObject({
            id: latest,
            title: 'Download complete',
        });
    });

    it('gives an owned action result a fresh identity and ignores its old dismissal', () => {
        const store = createNotificationsStore();
        const first = store.showNotification({ title: 'Order saved' });
        const replacement = store.replaceNotification(first, {
            title: 'Order restored',
        });
        expect(replacement).not.toBe(first);
        store.dismissNotification(first);
        expect(store.getSnapshot()?.title).toBe('Order restored');
        if (replacement === null)
            throw new Error('Expected an owned replacement');
        store.dismissNotification(replacement);
        expect(store.getSnapshot()).toBeNull();
    });

    it('does not resurrect a manually dismissed notification when its action completes', () => {
        const store = createNotificationsStore();
        const id = store.showNotification({ title: 'Order saved' });
        store.dismissNotification(id);
        expect(
            store.replaceNotification(id, { title: 'Order restored' }),
        ).toBeNull();
        expect(store.getSnapshot()).toBeNull();
    });

    it('notifies active subscribers and keeps separate viewports independent', () => {
        const first = createNotificationsStore();
        const second = createNotificationsStore();
        const listener = vi.fn();
        const unsubscribe = first.subscribe(listener);
        first.showNotification({ title: 'Settings saved' });
        expect(listener).toHaveBeenCalledOnce();
        expect(second.getSnapshot()).toBeNull();
        unsubscribe();
        first.showNotification({ title: 'Another update' });
        expect(listener).toHaveBeenCalledOnce();
    });
});
