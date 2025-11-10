import type {
    DeleteManyResult,
    DeleteOneResult,
    DeleteOptions,
    FindAndModifyOptions,
    FindOptions,
    InsertManyResult,
    InsertOneResult,
    UpdateManyResult,
    UpdateOneResult,
    UpdateOptions,
} from '../interfaces/index.js';
import type { JsonDbDocument } from '../types/index.js';

export interface IJsonCollection<T extends object> {
    // Define methods and properties for the JSON collection interface here

    findMany(options: FindOptions<T>): Promise<JsonDbDocument<T>[]>;
    findOne(options: FindOptions<T>): Promise<JsonDbDocument<T> | null>;

    insertOne(
        doc: Omit<JsonDbDocument<T>, '_id'> &
            Partial<Pick<JsonDbDocument<T>, '_id'>>,
    ): Promise<InsertOneResult>;

    insertMany(
        docs: (Omit<JsonDbDocument<T>, '_id'> &
            Partial<Pick<JsonDbDocument<T>, '_id'>>)[],
    ): Promise<InsertManyResult>;

    updateOne(options: UpdateOptions<T>): Promise<UpdateOneResult>;

    updateMany(options: UpdateOptions<T>): Promise<UpdateManyResult>;

    findOneAndUpdate(
        options: FindAndModifyOptions<T>,
    ): Promise<JsonDbDocument<T> | null>;

    findManyAndUpdate(
        options: FindAndModifyOptions<T>,
    ): Promise<JsonDbDocument<T>[]>;

    findOneAndDelete(
        options: DeleteOptions<T>,
    ): Promise<JsonDbDocument<T> | null>;

    findManyAndDelete(options: DeleteOptions<T>): Promise<JsonDbDocument<T>[]>;

    deleteOne(options: DeleteOptions<T>): Promise<DeleteOneResult>;

    deleteMany(options: DeleteOptions<T>): Promise<DeleteManyResult>;
}
