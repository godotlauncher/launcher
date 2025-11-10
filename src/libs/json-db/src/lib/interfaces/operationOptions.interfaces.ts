import type { Condition } from '../query/conditions.js';
import type { JsonDbDocument } from '../types/index.js';

export interface FindOptions<T extends object> {
    where?: Condition<T>;
    sort?: Partial<Record<keyof JsonDbDocument<T>, 1 | -1>>; // 1 for asc, -1 for desc
    projection?: Partial<Record<keyof JsonDbDocument<T>, boolean>>;
}

export interface UpdateOptions<T extends object> {
    where: Condition<T>;
    update: Partial<JsonDbDocument<T>>;
}

export interface FindAndModifyOptions<T extends object>
    extends UpdateOptions<T> {
    returnNew?: boolean;
}

export interface DeleteOptions<T extends object> {
    where: Condition<T>;
}
