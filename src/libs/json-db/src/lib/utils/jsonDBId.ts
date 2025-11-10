import { randomBytes } from 'node:crypto';

const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;
const COUNTER_MAX = 0xffffff;

/**
 * Generates 12-byte IDs that mirror the MongoDB ObjectId layout:
 * 4-byte timestamp, 5-byte process unique random value, 3-byte counter.
 * Reference: https://www.mongodb.com/resources/products/fundamentals/generating-globally-unique-identifiers-for-use-with-mongodb
 */
export class JsonDBId {
    private static counter = JsonDBId.randomCounter();
    private static readonly processUnique = JsonDBId.createProcessUniqueValue();
    private readonly id: string;

    constructor(jsonDBId?: string) {
        if (jsonDBId) {
            this.id = JsonDBId.validate(jsonDBId);
        } else {
            this.id = JsonDBId.generateId();
        }
    }

    private static validate(id: string): string {
        if (!OBJECT_ID_PATTERN.test(id)) {
            throw new Error(`Invalid ID format: ${id}`);
        }

        return id.toLowerCase();
    }

    private static randomCounter(): number {
        return Math.floor(Math.random() * (COUNTER_MAX + 1));
    }

    private static nextCounter(): number {
        JsonDBId.counter = (JsonDBId.counter + 1) & COUNTER_MAX;
        return JsonDBId.counter;
    }

    private static createProcessUniqueValue(): Buffer {
        const buffer = Buffer.alloc(5);
        randomBytes(3).copy(buffer, 0);

        const pid =
            typeof process !== 'undefined'
                ? process.pid & 0xffff
                : Math.floor(Math.random() * 0xffff);

        buffer.writeUInt16BE(pid, 3);
        return buffer;
    }

    toString(): string {
        return this.id;
    }

    static fromString(id: string): JsonDBId {
        return new JsonDBId(id);
    }

    static generateId(): string {
        const buffer = Buffer.alloc(12);
        const timestamp = Math.floor(Date.now() / 1000);

        buffer.writeUInt32BE(timestamp, 0);
        JsonDBId.processUnique.copy(buffer, 4);

        const counter = JsonDBId.nextCounter();
        buffer.writeUIntBE(counter, 9, 3);

        return buffer.toString('hex');
    }
}
