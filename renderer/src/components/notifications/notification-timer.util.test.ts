import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    getNotificationDuration,
    NotificationTimer,
} from './notification-timer.util';

describe('notification timeout', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('dismisses once after the default three seconds of visible time', () => {
        const expire = vi.fn();
        const timer = new NotificationTimer(getNotificationDuration(), expire);
        timer.resume();
        vi.advanceTimersByTime(2999);
        expect(expire).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1);
        expect(expire).toHaveBeenCalledOnce();
        timer.resume();
        vi.advanceTimersByTime(3000);
        expect(expire).toHaveBeenCalledOnce();
    });

    it('preserves remaining time across repeated pauses and resumes', () => {
        const expire = vi.fn();
        const timer = new NotificationTimer(6000, expire);
        timer.resume();
        vi.advanceTimersByTime(2000);
        timer.pause();
        vi.advanceTimersByTime(20000);
        timer.pause();
        timer.resume();
        timer.resume();
        vi.advanceTimersByTime(3999);
        expect(expire).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1);
        expect(expire).toHaveBeenCalledOnce();
    });

    it('cancels a removed notification without affecting a replacement', () => {
        const oldExpire = vi.fn();
        const nextExpire = vi.fn();
        const old = new NotificationTimer(6000, oldExpire);
        old.resume();
        vi.advanceTimersByTime(5000);
        old.dispose();
        old.resume();
        const next = new NotificationTimer(6000, nextExpire);
        next.resume();
        vi.advanceTimersByTime(1000);
        expect(oldExpire).not.toHaveBeenCalled();
        expect(nextExpire).not.toHaveBeenCalled();
        vi.advanceTimersByTime(5000);
        expect(nextExpire).toHaveBeenCalledOnce();
    });

    it('accepts a caller-supplied timeout', () => {
        const expire = vi.fn();
        const timer = new NotificationTimer(1000, expire);
        timer.resume();
        vi.advanceTimersByTime(1000);
        expect(expire).toHaveBeenCalledOnce();
    });

    it.each([undefined, 0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
        'uses the default for unsupported duration %s',
        (duration) => {
            expect(getNotificationDuration(duration)).toBe(3000);
        },
    );
});
