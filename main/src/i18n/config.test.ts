import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { I18N_NAMESPACES, SUPPORTED_LOCALES } from './config.js';

describe('i18n configuration', () => {
    it('has every namespace for every configured locale directory', () => {
        const localesRoot = path.resolve(process.cwd(), 'locales');

        for (const locale of SUPPORTED_LOCALES) {
            for (const namespace of I18N_NAMESPACES) {
                expect(
                    fs.existsSync(
                        path.join(localesRoot, locale, `${namespace}.json`),
                    ),
                    `Missing ${locale}/${namespace}.json`,
                ).toBe(true);
            }
        }
    });
});
