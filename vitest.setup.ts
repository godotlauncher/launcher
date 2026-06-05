import { vi } from 'vitest';

const loggerMock = {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
    initialize: vi.fn(),
    transports: {
        file: { level: 'info' },
        console: { level: 'info' },
    },
};

vi.mock('electron-log/main.js', () => ({
    default: loggerMock,
}));

vi.mock('electron-log/main', () => ({
    default: loggerMock,
}));
