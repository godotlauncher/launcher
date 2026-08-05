import * as fs from 'node:fs';
import { applyEdits, modify, type ParseError, parse } from 'jsonc-parser';

export type JSONObject = Record<string, unknown>;

export type JSONCConfig<T extends JSONObject> = {
    parsed: T | null;
    raw: string | null;
    recoveredFiles: string[];
};

export function isJSONObject(value: unknown): value is JSONObject {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function jsonValuesEqual(left: unknown, right: unknown): boolean {
    return JSON.stringify(left) === JSON.stringify(right);
}

export async function readJSONCConfig<T extends JSONObject>(
    filePath: string,
    validator: (value: unknown) => value is T,
    onInvalid: (parseErrorCount: number) => void,
): Promise<JSONCConfig<T>> {
    if (!fs.existsSync(filePath)) {
        return { parsed: null, raw: null, recoveredFiles: [] };
    }

    const raw = await fs.promises.readFile(filePath, 'utf-8');
    const errors: ParseError[] = [];
    const parsed = parse(raw, errors, {
        allowTrailingComma: true,
        disallowComments: false,
    });

    if (errors.length === 0 && validator(parsed)) {
        return { parsed, raw, recoveredFiles: [] };
    }

    onInvalid(errors.length);
    const backupPath = `${filePath}.${Date.now()}.bad`;
    await fs.promises.rename(filePath, backupPath);
    return { parsed: null, raw: null, recoveredFiles: [backupPath] };
}

export function setJSONCValue(
    text: string,
    keyPath: (string | number)[],
    value: unknown,
): string {
    return applyEdits(
        text,
        modify(text, keyPath, value, {
            formattingOptions: {
                insertSpaces: true,
                tabSize: 4,
                eol: '\n',
            },
        }),
    );
}

export function insertJSONCValues(
    text: string,
    keyPath: (string | number)[],
    startIndex: number,
    values: unknown[],
): string {
    return values.reduce<string>(
        (updatedText, value, index) =>
            applyEdits(
                updatedText,
                modify(updatedText, [...keyPath, startIndex + index], value, {
                    formattingOptions: {
                        insertSpaces: true,
                        tabSize: 4,
                        eol: '\n',
                    },
                    isArrayInsertion: true,
                }),
            ),
        text,
    );
}
