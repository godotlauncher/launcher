import type { JsonDbDocument } from '../types/document.types.js';

type AnyDoc = Record<string, unknown>;
type FieldKey<T extends object> = keyof JsonDbDocument<T>;
type FieldValue<T extends object, K extends FieldKey<T>> = JsonDbDocument<T>[K];

interface BaseFieldCondition<T extends object, K extends FieldKey<T>> {
    field: K;
}

export interface EqCondition<
    T extends object,
    K extends FieldKey<T> = FieldKey<T>,
> extends BaseFieldCondition<T, K> {
    kind: 'eq';
    value: FieldValue<T, K>;
}

export interface NeqCondition<
    T extends object,
    K extends FieldKey<T> = FieldKey<T>,
> extends BaseFieldCondition<T, K> {
    kind: 'neq';
    value: FieldValue<T, K>;
}

export interface GtCondition<
    T extends object,
    K extends FieldKey<T> = FieldKey<T>,
> extends BaseFieldCondition<T, K> {
    kind: 'gt';
    value: FieldValue<T, K>;
}

export interface GteCondition<
    T extends object,
    K extends FieldKey<T> = FieldKey<T>,
> extends BaseFieldCondition<T, K> {
    kind: 'gte';
    value: FieldValue<T, K>;
}

export interface LtCondition<
    T extends object,
    K extends FieldKey<T> = FieldKey<T>,
> extends BaseFieldCondition<T, K> {
    kind: 'lt';
    value: FieldValue<T, K>;
}

export interface LteCondition<
    T extends object,
    K extends FieldKey<T> = FieldKey<T>,
> extends BaseFieldCondition<T, K> {
    kind: 'lte';
    value: FieldValue<T, K>;
}

export interface ExistsCondition<
    T extends object,
    K extends FieldKey<T> = FieldKey<T>,
> extends BaseFieldCondition<T, K> {
    kind: 'exists';
    exists: boolean;
}

export interface IsNullCondition<
    T extends object,
    K extends FieldKey<T> = FieldKey<T>,
> extends BaseFieldCondition<T, K> {
    kind: 'isNull';
}

export interface InCondition<
    T extends object,
    K extends FieldKey<T> = FieldKey<T>,
> extends BaseFieldCondition<T, K> {
    kind: 'in';
    values: Array<FieldValue<T, K>>;
}

export interface NinCondition<
    T extends object,
    K extends FieldKey<T> = FieldKey<T>,
> extends BaseFieldCondition<T, K> {
    kind: 'nin';
    values: Array<FieldValue<T, K>>;
}

export type FieldCondition<T extends object> =
    | EqCondition<T>
    | NeqCondition<T>
    | GtCondition<T>
    | GteCondition<T>
    | LtCondition<T>
    | LteCondition<T>
    | ExistsCondition<T>
    | IsNullCondition<T>
    | InCondition<T>
    | NinCondition<T>;

export interface AndCondition<T extends object> {
    kind: 'and';
    conditions: Condition<T>[];
}

export interface OrCondition<T extends object> {
    kind: 'or';
    conditions: Condition<T>[];
}

export interface NotCondition<T extends object> {
    kind: 'not';
    condition: Condition<T>;
}

export type Condition<T extends object> =
    | FieldCondition<T>
    | AndCondition<T>
    | OrCondition<T>
    | NotCondition<T>;

export const eq = <
    T extends object = AnyDoc,
    K extends FieldKey<T> = FieldKey<T>,
>(
    field: K,
    value: FieldValue<T, K>,
): EqCondition<T, K> => ({
    kind: 'eq',
    field,
    value,
});

export const neq = <
    T extends object = AnyDoc,
    K extends FieldKey<T> = FieldKey<T>,
>(
    field: K,
    value: FieldValue<T, K>,
): NeqCondition<T, K> => ({
    kind: 'neq',
    field,
    value,
});

export const gt = <
    T extends object = AnyDoc,
    K extends FieldKey<T> = FieldKey<T>,
>(
    field: K,
    value: FieldValue<T, K>,
): GtCondition<T, K> => ({
    kind: 'gt',
    field,
    value,
});

export const gte = <
    T extends object = AnyDoc,
    K extends FieldKey<T> = FieldKey<T>,
>(
    field: K,
    value: FieldValue<T, K>,
): GteCondition<T, K> => ({
    kind: 'gte',
    field,
    value,
});

export const lt = <
    T extends object = AnyDoc,
    K extends FieldKey<T> = FieldKey<T>,
>(
    field: K,
    value: FieldValue<T, K>,
): LtCondition<T, K> => ({
    kind: 'lt',
    field,
    value,
});

export const lte = <
    T extends object = AnyDoc,
    K extends FieldKey<T> = FieldKey<T>,
>(
    field: K,
    value: FieldValue<T, K>,
): LteCondition<T, K> => ({
    kind: 'lte',
    field,
    value,
});

export const exists = <
    T extends object = AnyDoc,
    K extends FieldKey<T> = FieldKey<T>,
>(
    field: K,
    existsFlag = true,
): ExistsCondition<T, K> => ({
    kind: 'exists',
    field,
    exists: existsFlag,
});

export const isNull = <
    T extends object = AnyDoc,
    K extends FieldKey<T> = FieldKey<T>,
>(
    field: K,
): IsNullCondition<T, K> => ({
    kind: 'isNull',
    field,
});

export const inList = <
    T extends object = AnyDoc,
    K extends FieldKey<T> = FieldKey<T>,
>(
    field: K,
    values: Array<FieldValue<T, K>>,
): InCondition<T, K> => ({
    kind: 'in',
    field,
    values,
});

export const nin = <
    T extends object = AnyDoc,
    K extends FieldKey<T> = FieldKey<T>,
>(
    field: K,
    values: Array<FieldValue<T, K>>,
): NinCondition<T, K> => ({
    kind: 'nin',
    field,
    values,
});

export const and = <T extends object = AnyDoc>(
    ...conditions: Condition<T>[]
): AndCondition<T> => ({
    kind: 'and',
    conditions,
});

export const or = <T extends object = AnyDoc>(
    ...conditions: Condition<T>[]
): OrCondition<T> => ({
    kind: 'or',
    conditions,
});

export const not = <T extends object = AnyDoc>(
    condition: Condition<T>,
): NotCondition<T> => ({
    kind: 'not',
    condition,
});

export const matchCondition = <T extends object>(
    doc: JsonDbDocument<T>,
    condition?: Condition<T>,
): boolean => {
    if (!condition) return true;
    switch (condition.kind) {
        case 'eq':
            return isEqual(doc[condition.field], condition.value);
        case 'neq':
            return !isEqual(doc[condition.field], condition.value);
        case 'gt':
            return compare(doc[condition.field], condition.value) > 0;
        case 'gte':
            return compare(doc[condition.field], condition.value) >= 0;
        case 'lt':
            return compare(doc[condition.field], condition.value) < 0;
        case 'lte':
            return compare(doc[condition.field], condition.value) <= 0;
        case 'exists': {
            const existsFlag = condition.exists;
            const hasKey = condition.field in doc;
            const value = doc[condition.field];
            const existsResult = hasKey && value !== undefined;
            return existsFlag ? existsResult : !existsResult;
        }
        case 'isNull':
            return doc[condition.field] === null;
        case 'in':
            return condition.values.some((value) =>
                isEqual(value, doc[condition.field]),
            );
        case 'nin':
            return !condition.values.some((value) =>
                isEqual(value, doc[condition.field]),
            );
        case 'and':
            return condition.conditions.every((child) =>
                matchCondition(doc, child),
            );
        case 'or':
            return condition.conditions.some((child) =>
                matchCondition(doc, child),
            );
        case 'not':
            return !matchCondition(doc, condition.condition);
        default:
            return false;
    }
};

export const extractEqualityConstraints = <T extends object>(
    condition?: Condition<T>,
): Partial<JsonDbDocument<T>> | undefined => {
    if (!condition) return undefined;
    switch (condition.kind) {
        case 'eq':
            return { [condition.field]: condition.value } as Partial<
                JsonDbDocument<T>
            >;
        case 'and': {
            let acc: Partial<JsonDbDocument<T>> | undefined;
            for (const child of condition.conditions) {
                const childConstraints = extractEqualityConstraints(child);
                if (!childConstraints) continue;
                acc = mergeEqualityMaps(acc, childConstraints);
            }
            return acc;
        }
        case 'neq':
        case 'gt':
        case 'gte':
        case 'lt':
        case 'lte':
        case 'exists':
        case 'isNull':
        case 'in':
        case 'nin':
            return undefined;
        case 'or':
        case 'not':
            return undefined;
        default:
            return undefined;
    }
};

const mergeEqualityMaps = <T extends object>(
    target: Partial<JsonDbDocument<T>> | undefined,
    source: Partial<JsonDbDocument<T>>,
): Partial<JsonDbDocument<T>> => {
    const result: Partial<JsonDbDocument<T>> = {
        ...(target ?? {}),
    } as Partial<JsonDbDocument<T>>;
    for (const [key, value] of Object.entries(source)) {
        const typedKey = key as keyof JsonDbDocument<T>;
        if (
            typedKey in result &&
            !isEqual(
                result[typedKey],
                value as JsonDbDocument<T>[keyof JsonDbDocument<T>],
            )
        ) {
            delete result[typedKey];
            continue;
        }
        if (typedKey === '_id') {
            result._id = value as JsonDbDocument<T>['_id'];
            continue;
        }
        result[typedKey] = value as JsonDbDocument<T>[typeof typedKey];
    }
    return result;
};

const compare = (a: unknown, b: unknown): number => {
    if (isEqual(a, b)) return 0;
    if (typeof a === 'number' && typeof b === 'number') {
        return a - b;
    }
    if (typeof a === 'string' && typeof b === 'string') {
        return a < b ? -1 : 1;
    }
    if (a instanceof Date && b instanceof Date) {
        return a.getTime() - b.getTime();
    }
    if (typeof a === 'bigint' && typeof b === 'bigint') {
        return a < b ? -1 : 1;
    }
    return 0;
};

const isEqual = (a: unknown, b: unknown): boolean => {
    return Object.is(a, b);
};
