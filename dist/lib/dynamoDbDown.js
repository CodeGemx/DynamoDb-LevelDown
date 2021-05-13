var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { AbstractLevelDOWN } from 'abstract-leveldown';
import supports from 'level-supports';
import { DynamoDbIterator } from './iterator';
import { DynamoDbAsync } from './dynamoDbAsync';
import * as DynamoTypes from './types';
import { isBuffer } from './utils';
import { S3Async } from './s3Async';
import { DynamoS3 } from './dynamoS3';
const manifest = {
    bufferKeys: true,
    snapshots: true,
    permanence: true,
    seek: true,
    clear: true,
    status: true,
    createIfMissing: true,
    errorIfExists: true,
    deferredOpen: true,
    openCallback: true,
    promises: true,
    streams: true,
    encodings: true
};
const globalStore = {};
export class DynamoDbDown extends AbstractLevelDOWN {
    constructor(dynamoDb, location, options) {
        var _a, _b;
        super(location);
        this.supports = supports(manifest);
        const billingMode = (options === null || options === void 0 ? void 0 : options.billingMode) || DynamoTypes.BillingMode.PAY_PER_REQUEST;
        const useConsistency = (options === null || options === void 0 ? void 0 : options.useConsistency) === true;
        const tableHash = location.split('$');
        this.tableName = tableHash[0];
        this.hashKey = tableHash[1] || '!';
        this.s3AttachmentDefs = ((_a = options === null || options === void 0 ? void 0 : options.s3) === null || _a === void 0 ? void 0 : _a.attachments) || [];
        this.s3Async = new S3Async((_b = options === null || options === void 0 ? void 0 : options.s3) === null || _b === void 0 ? void 0 : _b.client, this.tableName);
        this.dynamoDbAsync = new DynamoDbAsync(dynamoDb, this.tableName, this.hashKey, useConsistency, billingMode);
    }
    static factory(dynamoDb, options) {
        const func = function (location) {
            globalStore[location] = globalStore[location] || new DynamoDbDown(dynamoDb, location, options);
            return globalStore[location];
        };
        func.destroy = function (location, cb) {
            return __awaiter(this, void 0, void 0, function* () {
                const store = globalStore[location];
                if (!store)
                    return cb(new Error('NotFound'));
                try {
                    yield store.deleteTable();
                    Reflect.deleteProperty(globalStore, location);
                    return cb(undefined);
                }
                catch (e) {
                    if (e && e.code === 'ResourceNotFoundException') {
                        Reflect.deleteProperty(globalStore, location);
                        return cb(undefined);
                    }
                    return cb(e);
                }
            });
        };
        return func;
    }
    _close(cb) {
        return __awaiter(this, void 0, void 0, function* () {
            cb(undefined);
        });
    }
    _open(options, cb) {
        return __awaiter(this, void 0, void 0, function* () {
            const dynamoOptions = options.dynamoOptions || {};
            try {
                let { dynamoTableExists, s3BucketExists } = yield Promise.all([
                    this.dynamoDbAsync.tableExists(),
                    this.s3Async.bucketExists()
                ]).then(r => ({ dynamoTableExists: r.shift(), s3BucketExists: r.shift() }));
                if (options.createIfMissing !== false) {
                    const results = yield Promise.all([
                        dynamoTableExists
                            ? Promise.resolve(true)
                            : this.dynamoDbAsync.createTable(dynamoOptions.ProvisionedThroughput),
                        s3BucketExists ? Promise.resolve(true) : this.s3Async.createBucket()
                    ]).then(r => ({ dynamoTableExists: r.shift(), s3BucketExists: r.shift() }));
                    dynamoTableExists = results.dynamoTableExists;
                    s3BucketExists = results.s3BucketExists;
                }
                if ((dynamoTableExists || s3BucketExists) && options.errorIfExists === true) {
                    throw new Error('Underlying storage already exists!');
                }
                if ((!dynamoTableExists || !s3BucketExists) && options.createIfMissing === false) {
                    throw new Error('Underlying storage does not exist!');
                }
                cb(undefined);
            }
            catch (e) {
                cb(e);
            }
        });
    }
    _put(key, value, options, cb) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const newValues = yield DynamoS3.syncS3([{ key, value }], this.dynamoDbAsync, this.s3Async, this.s3AttachmentDefs);
                yield this.dynamoDbAsync.put(key, newValues[0]);
                cb(undefined);
            }
            catch (e) {
                cb(e);
            }
        });
    }
    _get(key, options, cb) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                let output = yield this.dynamoDbAsync.get(key);
                output = yield DynamoS3.maybeRestore(key, output, this.s3Async, this.s3AttachmentDefs);
                const asBuffer = options.asBuffer !== false;
                if (asBuffer) {
                    output = isBuffer(output) ? output : Buffer.from(String(output));
                }
                cb(undefined, output);
            }
            catch (e) {
                cb(e, undefined);
            }
        });
    }
    _del(key, options, cb) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                yield DynamoS3.maybeDelete([key], this.dynamoDbAsync, this.s3Async);
                yield this.dynamoDbAsync.delete(key);
                cb(undefined);
            }
            catch (e) {
                cb(e);
            }
        });
    }
    _batch(array, options, cb) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const ops = array.reduce((p, c) => ({
                    puts: c.type === 'put' ? p.puts.concat(c) : p.puts,
                    dels: c.type === 'del' ? p.dels.concat(c) : p.dels
                }), { puts: new Array(), dels: new Array() });
                const delKeys = ops.dels.map(d => d.key);
                yield Promise.all([
                    DynamoS3.maybeDelete(delKeys, this.dynamoDbAsync, this.s3Async),
                    DynamoS3.syncS3(ops.puts, this.dynamoDbAsync, this.s3Async, this.s3AttachmentDefs)
                ]);
                yield this.dynamoDbAsync.batch(ops.puts.concat(ops.dels));
                cb(undefined);
            }
            catch (e) {
                cb(e);
            }
        });
    }
    _iterator(options) {
        return new DynamoDbIterator(this, this.dynamoDbAsync, this.hashKey, options);
    }
    deleteTable() {
        return __awaiter(this, void 0, void 0, function* () {
            return Promise.all([this.dynamoDbAsync.deleteTable(), this.s3Async.deleteBucket()]).then(r => r[0] && r[1]);
        });
    }
}
/* istanbul ignore next */
(function (DynamoDbDown) {
    DynamoDbDown.Types = DynamoTypes;
})(DynamoDbDown || (DynamoDbDown = {}));
//# sourceMappingURL=dynamoDbDown.js.map