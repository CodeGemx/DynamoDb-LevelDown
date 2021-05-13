import { isBuffer } from './utils';
/* @internal */
export const serialize = (value) => getTransformerOrThrow(value).toDb(value);
/* @internal */
export const deserialize = (value) => getTransformerOrThrow(value).fromDb(value);
const getTransformerOrThrow = (value) => {
    const transformer = TRANSFORMERS.find((transformer) => transformer.for(value));
    if (!transformer)
        throw new Error(`Transformer not available for '${typeof value}'`);
    return transformer;
};
const toBase64 = (value) => Buffer.from(value).toString('base64');
const dbotName = (value) => Object.keys(value || {}).shift();
const ctorName = (value) => value.constructor.name;
const transformReduce = (value, transformer) => {
    const acc = {};
    for (const key in value) {
        acc[key] = transformer(value[key]);
    }
    return acc;
};
const transformMapFrom = (value) => {
    const result = [];
    for (const typedItem of value) {
        const item = deserialize(typedItem);
        result.push(item);
    }
    return result;
};
const transformMapTo = (value) => {
    return value.map((item) => serialize(item));
};
const TRANSFORMER_SPECIALS = {
    NaN: toBase64(Number.NaN.toString()),
    EmptyString: toBase64('EMPTY_STRING'),
    EmptyBuffer: toBase64('EMPTY_BUFFER'),
};
const TRANSFORMERS = [
    {
        for: (value) => value === null || value === undefined || dbotName(value) === 'NULL',
        toDb: () => ({ NULL: true }),
        fromDb: () => undefined,
    },
    {
        // NaN - Not a number support
        for: (value) => Number.isNaN(value) || (dbotName(value) === 'B' && String(value.B) === TRANSFORMER_SPECIALS.NaN),
        toDb: () => ({ B: TRANSFORMER_SPECIALS.NaN }),
        fromDb: () => Number.NaN,
    },
    {
        // Buffer(0) - Empty buffer support
        for: (value) => (isBuffer(value) && value.length === 0) ||
            (dbotName(value) === 'B' && String(value.B) === TRANSFORMER_SPECIALS.EmptyBuffer),
        toDb: () => ({ B: TRANSFORMER_SPECIALS.EmptyBuffer }),
        fromDb: () => Buffer.alloc(0),
    },
    {
        // String(0) - Empty string support
        for: (value) => (ctorName(value) === 'String' && value.trim() === '') ||
            (dbotName(value) === 'B' && String(value.B) === TRANSFORMER_SPECIALS.EmptyString),
        toDb: () => ({ B: TRANSFORMER_SPECIALS.EmptyString }),
        fromDb: () => '',
    },
    {
        for: (value) => ctorName(value) === 'String' || dbotName(value) === 'S',
        toDb: (value) => ({ S: value }),
        fromDb: (value) => value.S,
    },
    {
        for: (value) => ctorName(value) === 'Boolean' || dbotName(value) === 'BOOL',
        toDb: (value) => ({ BOOL: value }),
        fromDb: (value) => value.BOOL,
    },
    {
        for: (value) => ctorName(value) === 'Number' || dbotName(value) === 'N',
        toDb: (value) => ({ N: String(value) }),
        fromDb: (value) => Number(value.N),
    },
    {
        for: (value) => isBuffer(value) || ctorName(value) === 'Buffer' || dbotName(value) === 'B',
        toDb: (value) => ({ B: value }),
        fromDb: (value) => Buffer.from(value.B),
    },
    {
        for: (value) => ctorName(value) === 'Array' || dbotName(value) === 'L',
        toDb: (value) => ({ L: transformMapTo(value) }),
        fromDb: (value) => transformMapFrom(value.L),
    },
    {
        for: (value) => ctorName(value) === 'Object' || dbotName(value) === 'M',
        toDb: (value) => ({ M: transformReduce(value, serialize) }),
        fromDb: (value) => transformReduce(value.M, deserialize),
    },
];
//# sourceMappingURL=serialize.js.map