import type { BackendModule, ReadCallback } from 'i18next';

/**
 * Custom i18next backend that fetches translations from Electron main process via IPC
 */
class IPCBackend implements BackendModule {
    type = 'backend' as const;
  
    // Store loaded translations in memory to avoid repeated IPC calls
    private cache: Map<string, Record<string, any>> = new Map();

    init() {
    // No initialization needed
    }

    async read(language: string, namespace: string, callback: ReadCallback) {
        try {
            const cacheKey = `${language}:${namespace}`;
      
            // Check cache first
            if (this.cache.has(cacheKey)) {
                const data = this.cache.get(cacheKey);
                callback(null, data);
                return;
            }

            // Fetch all translations from main process
            const allTranslations = await window.electron.i18n.getAllTranslations(language);
      
            // Cache all namespaces
            Object.keys(allTranslations).forEach(ns => {
                this.cache.set(`${language}:${ns}`, allTranslations[ns]);
            });

            const data = allTranslations[namespace];
      
            if (!data) {
                callback(new Error(`Namespace ${namespace} not found for ${language}`), false);
                return;
            }
      
            callback(null, data);
        } catch (error) {
            console.error(`Failed to load translations for ${language}/${namespace}:`, error);
            callback(error as Error, false);
        }
    }

    /**
   * Clear cache (useful when changing language)
   */
    clearCache() {
        this.cache.clear();
    }
}

export default IPCBackend;
