import type { ElectronRendererApi } from '@shared';

declare global {
    interface Window {
        electron: ElectronRendererApi;
    }
}
