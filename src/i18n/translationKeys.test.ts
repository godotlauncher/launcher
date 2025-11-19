import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOCALES_PATH = path.join(__dirname, '..', 'locales');
const AVAILABLE_LOCALES = fs
    .readdirSync(LOCALES_PATH, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

if (AVAILABLE_LOCALES.length === 0) {
    throw new Error(`No locale directories found in ${LOCALES_PATH}`);
}

const namespaceMap: Record<string, string[]> = AVAILABLE_LOCALES.reduce(
    (acc, locale) => {
        const directory = path.join(LOCALES_PATH, locale);
        const namespaces = fs
            .readdirSync(directory)
            .filter((file) => file.endsWith('.json'))
            .map((file) => path.basename(file, '.json'))
            .sort();

        acc[locale] = namespaces;
        return acc;
    },
    {} as Record<string, string[]>,
);

const BASE_LOCALE = AVAILABLE_LOCALES[0];
const NAMESPACES = namespaceMap[BASE_LOCALE];

const localeCache = new Map<string, Map<string, any>>();

function getNamespacePath(locale: string, namespace: string): string {
    return path.join(LOCALES_PATH, locale, `${namespace}.json`);
}

function loadLocaleNamespace(locale: string, namespace: string) {
    let localeNamespaces = localeCache.get(locale);

    if (!localeNamespaces) {
        localeNamespaces = new Map();
        localeCache.set(locale, localeNamespaces);
    }

    if (!localeNamespaces.has(namespace)) {
        const filePath = getNamespacePath(locale, namespace);
        const content = fs.readFileSync(filePath, 'utf-8');
        localeNamespaces.set(namespace, JSON.parse(content));
    }

    return localeNamespaces.get(namespace);
}

function flattenKeys(obj: any, prefix = ''): string[] {
    if (typeof obj !== 'object' || obj === null) {
        return prefix ? [prefix] : [];
    }

    return Object.keys(obj).reduce((acc: string[], key) => {
        const value = obj[key];
        const fullKey = prefix ? `${prefix}.${key}` : key;

        if (
            typeof value === 'object' &&
            value !== null &&
            !Array.isArray(value)
        ) {
            return acc.concat(flattenKeys(value, fullKey));
        }

        return acc.concat(fullKey);
    }, []);
}

describe('Locales: namespace coverage', () => {
    it('should discover at least one locale directory', () => {
        expect(AVAILABLE_LOCALES.length).toBeGreaterThan(0);
    });

    AVAILABLE_LOCALES.forEach((locale) => {
        it(`should match namespace list for ${locale}`, () => {
            expect(
                namespaceMap[locale],
                `${locale} namespace set mismatch`,
            ).toEqual(NAMESPACES);
        });
    });
});

describe('Locales: JSON parsing', () => {
    AVAILABLE_LOCALES.forEach((locale) => {
        NAMESPACES.forEach((namespace) => {
            it(`should parse ${locale}/${namespace}.json`, () => {
                const filePath = getNamespacePath(locale, namespace);
                expect(
                    fs.existsSync(filePath),
                    `${locale}/${namespace}.json missing`,
                ).toBe(true);
                expect(() =>
                    loadLocaleNamespace(locale, namespace),
                ).not.toThrow();

                const content = loadLocaleNamespace(locale, namespace);
                expect(content).toBeDefined();
                expect(Object.keys(content).length).toBeGreaterThan(0);
            });
        });
    });
});

describe('Locales: key consistency', () => {
    NAMESPACES.forEach((namespace) => {
        it(`should align keys across locales for ${namespace}`, () => {
            const baseContent = loadLocaleNamespace(BASE_LOCALE, namespace);
            const baseKeys = flattenKeys(baseContent).sort();

            AVAILABLE_LOCALES.filter(
                (locale) => locale !== BASE_LOCALE,
            ).forEach((locale) => {
                const localeContent = loadLocaleNamespace(locale, namespace);
                const localeKeys = flattenKeys(localeContent).sort();

                const missingKeys = baseKeys.filter(
                    (key) => !localeKeys.includes(key),
                );
                const extraKeys = localeKeys.filter(
                    (key) => !baseKeys.includes(key),
                );

                if (missingKeys.length > 0) {
                    console.error(
                        `\n❌ ${locale}/${namespace}.json missing keys:\n${missingKeys
                            .map((key) => `  - ${key}`)
                            .join('\n')}`,
                    );
                }

                if (extraKeys.length > 0) {
                    console.error(
                        `\n⚠️  ${locale}/${namespace}.json extra keys:\n${extraKeys
                            .map((key) => `  - ${key}`)
                            .join('\n')}`,
                    );
                }

                expect(
                    missingKeys,
                    `${locale}/${namespace}.json missing keys`,
                ).toEqual([]);
                expect(
                    extraKeys,
                    `${locale}/${namespace}.json extra keys`,
                ).toEqual([]);
            });
        });
    });
});

describe('Locales: empty value guard', () => {
    AVAILABLE_LOCALES.forEach((locale) => {
        NAMESPACES.forEach((namespace) => {
            it(`should avoid empty strings in ${locale}/${namespace}.json`, () => {
                const content = loadLocaleNamespace(locale, namespace);
                const emptyKeys: string[] = [];

                function collectEmptyValues(obj: any, keyPath = '') {
                    Object.entries(obj).forEach(([key, value]) => {
                        const fullKey = keyPath ? `${keyPath}.${key}` : key;

                        if (typeof value === 'string') {
                            if (value.trim() === '') {
                                emptyKeys.push(fullKey);
                            }
                        } else if (
                            typeof value === 'object' &&
                            value !== null
                        ) {
                            collectEmptyValues(value, fullKey);
                        }
                    });
                }

                collectEmptyValues(content);

                if (emptyKeys.length > 0) {
                    console.error(
                        `\n❌ ${locale}/${namespace}.json empty values:\n${emptyKeys
                            .map((key) => `  - ${key}`)
                            .join('\n')}`,
                    );
                }

                expect(
                    emptyKeys,
                    `${locale}/${namespace}.json empty values`,
                ).toEqual([]);
            });
        });
    });
});

describe('Locales: tag balance', () => {
    AVAILABLE_LOCALES.forEach((locale) => {
        NAMESPACES.forEach((namespace) => {
            it(`should balance tags in ${locale}/${namespace}.json`, () => {
                const content = loadLocaleNamespace(locale, namespace);
                const unmatchedTags: string[] = [];

                function inspectTags(obj: any, keyPath = '') {
                    Object.entries(obj).forEach(([key, value]) => {
                        const fullKey = keyPath ? `${keyPath}.${key}` : key;

                        if (typeof value === 'string') {
                            const openTags = (
                                value.match(/<(\w+)>/g) || []
                            ).map((tag) => tag.replace(/[<>]/g, ''));
                            const closeTags = (
                                value.match(/<\/(\w+)>/g) || []
                            ).map((tag) =>
                                tag.replace(/<\//, '').replace('>', ''),
                            );
                            const selfClosing = (
                                value.match(/<(\w+)\s*\/>/g) || []
                            ).map((tag) => tag.replace(/<|\/>/g, '').trim());

                            openTags.forEach((tag) => {
                                if (
                                    !closeTags.includes(tag) &&
                                    !selfClosing.includes(tag)
                                ) {
                                    unmatchedTags.push(
                                        `${fullKey}: unmatched <${tag}>`,
                                    );
                                }
                            });

                            closeTags.forEach((tag) => {
                                if (!openTags.includes(tag)) {
                                    unmatchedTags.push(
                                        `${fullKey}: unmatched </${tag}>`,
                                    );
                                }
                            });
                        } else if (
                            typeof value === 'object' &&
                            value !== null
                        ) {
                            inspectTags(value, fullKey);
                        }
                    });
                }

                inspectTags(content);

                if (unmatchedTags.length > 0) {
                    console.error(
                        `\n❌ ${locale}/${namespace}.json unmatched tags:\n${unmatchedTags
                            .map((tag) => `  - ${tag}`)
                            .join('\n')}`,
                    );
                }

                expect(
                    unmatchedTags,
                    `${locale}/${namespace}.json unmatched tags`,
                ).toEqual([]);
            });
        });
    });
});

describe('Locales: interpolation placeholders', () => {
    function getPlaceholders(str: string): string[] {
        return (str.match(/\{\{(\w+)\}\}/g) || []).map((token) =>
            token.replace(/\{\{|\}\}/g, ''),
        );
    }

    function collectPlaceholders(
        obj: any,
        keyPath = '',
        store: Record<string, string[]> = {},
    ) {
        Object.entries(obj).forEach(([key, value]) => {
            const fullKey = keyPath ? `${keyPath}.${key}` : key;

            if (typeof value === 'string') {
                store[fullKey] = getPlaceholders(value).sort();
            } else if (typeof value === 'object' && value !== null) {
                collectPlaceholders(value, fullKey, store);
            }
        });

        return store;
    }

    NAMESPACES.forEach((namespace) => {
        it(`should align placeholders across locales for ${namespace}`, () => {
            const baseContent = loadLocaleNamespace(BASE_LOCALE, namespace);
            const basePlaceholders = collectPlaceholders(baseContent);
            const inconsistencies: string[] = [];

            AVAILABLE_LOCALES.filter(
                (locale) => locale !== BASE_LOCALE,
            ).forEach((locale) => {
                const localeContent = loadLocaleNamespace(locale, namespace);
                const localePlaceholders = collectPlaceholders(localeContent);

                Object.keys(basePlaceholders).forEach((key) => {
                    const baseTokens = basePlaceholders[key];
                    const localeTokens = localePlaceholders[key] ?? [];

                    if (
                        JSON.stringify(baseTokens) !==
                        JSON.stringify(localeTokens)
                    ) {
                        inconsistencies.push(
                            `${key}: ${BASE_LOCALE} has {{${baseTokens.join(', ')}}, ${locale} has {{${localeTokens.join(', ')}}}`,
                        );
                    }
                });
            });

            if (inconsistencies.length > 0) {
                console.error(
                    `\n❌ ${namespace} inconsistent placeholders:\n${inconsistencies
                        .map((item) => `  - ${item}`)
                        .join('\n')}`,
                );
            }

            expect(
                inconsistencies,
                `${namespace} inconsistent placeholders`,
            ).toEqual([]);
        });
    });
});
