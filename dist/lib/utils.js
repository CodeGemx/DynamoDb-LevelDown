import { Keys, } from './types';
import { deserialize } from './serialize';
import { cloneDeep } from 'lodash';
const createS3Pointer = (key) => ({ _s3key: key });
const buildKeyPath = (parent, current) => [parent, current].filter((v) => !!v && v.length > 0).join('/');
/* @internal */
export function promiseS3Body(input) {
    if (!!input.Body)
        return input.Body;
    else
        return Buffer.alloc(0);
}
/* @internal */
export function extractAttachments(key, value, definitions) {
    if (!!value && isPlainObject(value) && definitions.length > 0) {
        const clone = cloneObject(value);
        const result = [];
        const flattened = [{ key, keyPath: key, value: clone, parent: clone }];
        do {
            const entry = flattened.shift();
            const isMatch = result.length !==
                result.push(...definitions
                    .filter((d) => d.match.test(entry.keyPath))
                    .map((def) => {
                    entry.parent[entry.key] = createS3Pointer(entry.keyPath);
                    return {
                        key: entry.keyPath,
                        data: castToBuffer(entry.value[def.dataKey], def.dataEncoding),
                        contentType: entry.value[def.contentTypeKey],
                    };
                }));
            const relevant = Object.keys(entry.value).filter((k) => isMatch === false && !!entry.value[k] && isPlainObject(entry.value[k]));
            flattened.push(...relevant.map((k) => ({
                key: k,
                parent: entry.value,
                value: entry.value[k],
                keyPath: buildKeyPath(entry.keyPath, k),
            })));
        } while (flattened.length > 0);
        return { newValue: clone, attachments: result };
    }
    return { newValue: value, attachments: [] };
}
/* @internal */
export function extractS3Pointers(key, value) {
    if (!!value && isPlainObject(value)) {
        let result = {};
        const flattened = [{ key, keyPath: key, value }];
        do {
            const entry = flattened.shift();
            const relevant = Object.keys(entry.value).filter((k) => !!entry.value[k] && isPlainObject(entry.value[k]));
            result = relevant
                .filter((k) => entry.value[k].hasOwnProperty(Keys.S3_KEY))
                .reduce((result, key) => (Object.assign(Object.assign({}, result), { [buildKeyPath(entry.keyPath, key)]: entry.value[key] })), result);
            flattened.push(...relevant
                .filter((k) => !entry.value[k].hasOwnProperty(Keys.S3_KEY))
                .map((key) => ({ key, keyPath: buildKeyPath(entry.keyPath, key), value: entry.value[key] })));
        } while (flattened.length > 0);
        return result;
    }
    return {};
}
/* @internal */
export function restoreAttachments(value, pointers, attachments, definitions) {
    if (!value || !pointers || !attachments)
        return value;
    const newValue = cloneObject(value);
    return Object.keys(pointers)
        .map((keyPath) => definitions
        .filter((d) => d.match.test(keyPath))
        .map((definition) => {
        keyPath
            .split('/')
            .slice(1)
            .reduce((p, c, i, a) => {
            p[c] =
                i === a.length - 1
                    ? {
                        [definition.contentTypeKey]: attachments[p[c]._s3key].ContentType,
                        [definition.dataKey]: promiseS3Body(attachments[p[c]._s3key]).toString(definition.dataEncoding),
                    }
                    : p[c];
            return p[c];
        }, newValue);
        return newValue;
    })
        .reduce((p) => p, newValue))
        .reduce((p) => p, newValue);
}
/* @internal */
export function cloneObject(obj) {
    return cloneDeep(obj);
}
/* @internal */
export function withoutKeys(item) {
    if (!item)
        return item;
    const newItem = cloneObject(item);
    const delProps = [Keys.HASH_KEY, Keys.RANGE_KEY];
    if (isPlainObject(newItem)) {
        delProps.forEach((k) => {
            Reflect.set(newItem, k, undefined);
            Reflect.deleteProperty(newItem, k);
        });
    }
    return newItem;
}
/* @internal */
export function keyConditionsFor(hashKey, rangeCondition) {
    return {
        [Keys.HASH_KEY]: {
            ComparisonOperator: 'EQ',
            AttributeValueList: [{ S: hashKey }],
        },
        [Keys.RANGE_KEY]: rangeCondition,
    };
}
/* @internal */
export function dataFromItem(item) {
    const deserialized = deserialize({ M: item });
    return deserialized[Keys.DATA_KEY];
}
/* @internal */
export function rangeKeyFrom(item) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    const rangeKey = ((_a = item === null || item === void 0 ? void 0 : item[Keys.RANGE_KEY]) === null || _a === void 0 ? void 0 : _a.S) || ((_c = (_b = item === null || item === void 0 ? void 0 : item.Key) === null || _b === void 0 ? void 0 : _b[Keys.RANGE_KEY]) === null || _c === void 0 ? void 0 : _c.S) || ((_f = (_e = (_d = item === null || item === void 0 ? void 0 : item.PutRequest) === null || _d === void 0 ? void 0 : _d.Item) === null || _e === void 0 ? void 0 : _e[Keys.RANGE_KEY]) === null || _f === void 0 ? void 0 : _f.S) || ((_j = (_h = (_g = item === null || item === void 0 ? void 0 : item.DeleteRequest) === null || _g === void 0 ? void 0 : _g.Key) === null || _h === void 0 ? void 0 : _h[Keys.RANGE_KEY]) === null || _j === void 0 ? void 0 : _j.S);
    if (!rangeKey)
        throw new Error(`No range key available from '${typeof item}'`);
    return rangeKey;
}
/* @internal */
export function createRangeKeyCondition(opts) {
    const defaultStart = '\u0000';
    const defaultEnd = '\xff\xff\xff\xff\xff\xff\xff\xff';
    let result;
    if (opts.gt && opts.lt) {
        result = {
            ComparisonOperator: 'BETWEEN',
            AttributeValueList: [{ S: opts.gt }, { S: opts.lt }],
        };
    }
    else if (opts.lt) {
        result = {
            ComparisonOperator: 'LT',
            AttributeValueList: [{ S: opts.lt }],
        };
    }
    else if (opts.gt) {
        result = {
            ComparisonOperator: 'GT',
            AttributeValueList: [{ S: opts.gt }],
        };
    }
    else if (!opts.start && !opts.end) {
        result = {
            ComparisonOperator: 'BETWEEN',
            AttributeValueList: [{ S: defaultStart }, { S: defaultEnd }],
        };
    }
    else if (!opts.end) {
        const op = opts.reverse ? 'LE' : 'GE';
        result = {
            ComparisonOperator: op,
            AttributeValueList: [{ S: opts.start }],
        };
    }
    else if (!opts.start) {
        const op = opts.reverse ? 'GE' : 'LE';
        result = {
            ComparisonOperator: op,
            AttributeValueList: [{ S: opts.end }],
        };
    }
    else if (opts.reverse) {
        result = {
            ComparisonOperator: 'BETWEEN',
            AttributeValueList: [{ S: opts.end }, { S: opts.start }],
        };
    }
    else {
        result = {
            ComparisonOperator: 'BETWEEN',
            AttributeValueList: [{ S: opts.start }, { S: opts.end }],
        };
    }
    return result;
}
/* @internal */
export function isBuffer(object) {
    if (!object || typeof object !== 'object')
        return false;
    return Buffer.isBuffer(object) || (object.type === 'Buffer' && Array.isArray(object.data));
}
/* @internal */
export function castToBuffer(object, encoding) {
    let result;
    if (object instanceof Buffer)
        result = object;
    else if (object instanceof Array)
        result = Buffer.from(object);
    else if (typeof object === 'string')
        result = Buffer.from(object, encoding);
    else if (typeof object === 'boolean') {
        const b = Buffer.alloc(1);
        b.writeUInt8(object === true ? 1 : 0, 0);
        result = b;
    }
    else if (typeof object === 'number') {
        const b = Buffer.alloc(8);
        b.writeFloatBE(object, 0);
        result = b;
    }
    else if (isPlainObject(object))
        result = Buffer.from(JSON.stringify(object));
    else if (object === null || object === undefined)
        result = Buffer.alloc(0);
    else
        throw new Error('The object is not supported for conversion to buffer');
    return result;
}
/* @internal */
export function isPlainObject(object) {
    return typeof object === 'object' && object !== null && !Array.isArray(object) && !Buffer.isBuffer(object);
}
//# sourceMappingURL=utils.js.map