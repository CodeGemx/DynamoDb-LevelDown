var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import through2 from 'through2';
import { AbstractIterator } from 'abstract-leveldown';
import { isBuffer, withoutKeys, castToBuffer, dataFromItem, rangeKeyFrom, keyConditionsFor, createRangeKeyCondition } from './utils';
const EVENT_END = 'end';
const EVENT_ERROR = 'error';
const EVENT_PUSHED = 'pushed';
const EVENT_READABLE = 'readable';
export class DynamoDbIterator extends AbstractIterator {
    constructor(db, dynamoDb, hashKey, options) {
        super(db);
        this.dynamoDb = dynamoDb;
        this.hashKey = hashKey;
        this.options = options;
        this.endEmitted = false;
        this.isOutOfRange = false;
        this.seekTarget = undefined;
        this.keyAsBuffer = !!options && options.keyAsBuffer !== false;
        this.valueAsBuffer = !!options && options.valueAsBuffer !== false;
        this.results = this.createReadStream(this.options);
        this.results.once(EVENT_END, () => {
            this.endEmitted = true;
        });
    }
    _next(cb) {
        return __awaiter(this, void 0, void 0, function* () {
            const onEnd = () => {
                this.results.removeListener(EVENT_READABLE, onReadable);
                cb(undefined, undefined, undefined);
            };
            const onReadable = () => {
                this.results.removeListener(EVENT_END, onEnd);
                this._next(cb);
            };
            const onError = (e) => {
                this.results.removeListener(EVENT_END, onEnd);
                this.results.removeListener(EVENT_READABLE, onReadable);
                cb(e, undefined, undefined);
            };
            this.results.once(EVENT_ERROR, onError);
            yield this.maybeSeek();
            if (this.isOutOfRange) {
                this.results.removeListener(EVENT_ERROR, onError);
                return cb(undefined, undefined, undefined);
            }
            const streamObject = this.readStream();
            this.results.removeListener(EVENT_ERROR, onError);
            if (!streamObject) {
                if (this.endEmitted) {
                    return cb(undefined, undefined, undefined);
                }
                else {
                    this.results.once(EVENT_END, onEnd);
                    this.results.once(EVENT_READABLE, onReadable);
                    return;
                }
            }
            else {
                let key = streamObject.key;
                let value = streamObject.value;
                // FIXME: This could be better.
                key = this.keyAsBuffer ? castToBuffer(key) : key;
                value = this.valueAsBuffer ? castToBuffer(value) : value;
                cb(undefined, key, value);
            }
        });
    }
    _seek(target) {
        this.isOutOfRange = false;
        this.seekTarget = !!target && isBuffer(target) ? target.toString() : target;
    }
    peekNextKey() {
        return __awaiter(this, void 0, void 0, function* () {
            const onPushNext = (next, resolve) => {
                this.results.removeListener(EVENT_END, onEnd);
                resolve(next);
            };
            const onEnd = (resolve) => {
                this.results.removeListener(EVENT_PUSHED, onPushNext);
                resolve(undefined);
            };
            const next = yield new Promise((resolve, reject) => {
                const next = this.readStream();
                if (next) {
                    this.results.unshift(next);
                    return resolve(next);
                }
                else {
                    this.results.once(EVENT_PUSHED, (next) => onPushNext(next, resolve));
                    this.results.once(EVENT_END, () => onEnd(resolve));
                }
            });
            return (next || {}).key;
        });
    }
    readStream() {
        return this.results.read();
    }
    getOptionsRange() {
        const options = this.options;
        const reversed = options.reverse === true;
        const start = reversed ? options.end : options.start;
        const end = reversed ? options.start : options.end;
        return {
            low: options.gt || options.gte || start,
            high: options.lt || options.lte || end,
            inclusiveLow: !options.gt,
            inclusiveHigh: !options.lt,
        };
    }
    isInRange(target) {
        const { high, low, inclusiveLow, inclusiveHigh } = this.getOptionsRange();
        const inRange = (!low || (inclusiveLow && target >= low) || target > low) &&
            (!high || (inclusiveHigh && target <= high) || target < high);
        return inRange;
    }
    outOfRange() {
        this.isOutOfRange = true;
    }
    maybeSeek() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.seekTarget)
                return;
            if (!this.isInRange(this.seekTarget))
                return this.outOfRange();
            let nextKey, couldBeHere;
            const seekKey = this.seekTarget;
            const isReverse = this.options.reverse === true;
            do {
                nextKey = yield this.peekNextKey();
                if (!nextKey)
                    return;
                couldBeHere = isReverse ? nextKey <= seekKey || nextKey < seekKey : nextKey >= seekKey || nextKey > seekKey;
                if (!couldBeHere)
                    this.readStream();
            } while (!!nextKey && !couldBeHere);
            this.seekTarget = undefined;
        });
    }
    createReadStream(opts) {
        let returnCount = 0;
        let keysOnly = opts.keys && !opts.values;
        const isFinished = () => {
            return !!opts.limit && opts.limit > 0 && returnCount > opts.limit;
        };
        const pushNext = (stream, output) => {
            stream.push(output);
            stream.emit(EVENT_PUSHED, output);
        };
        const stream = through2.obj(function (data, enc, cb) {
            return __awaiter(this, void 0, void 0, function* () {
                returnCount += 1;
                const rangeKey = rangeKeyFrom(data);
                pushNext(this, { key: rangeKey, value: keysOnly ? rangeKey : withoutKeys(data.value) });
                if (isFinished()) {
                    this.emit(EVENT_END);
                }
                cb();
            });
        });
        const onData = (err, data) => {
            if (err || !data || !data.Items) {
                (err || {}).code === 'ResourceNotFoundException' ? stream.end() : stream.emit(EVENT_ERROR, err);
                return stream;
            }
            data.Items.forEach((item) => {
                const rangeKey = rangeKeyFrom(item);
                const filtered = (opts.gt && !(rangeKey > opts.gt)) || (opts.lt && !(rangeKey < opts.lt));
                if (!filtered) {
                    stream.write(item);
                }
            });
            opts.lastKey = data.LastEvaluatedKey;
            if (opts.lastKey && !isFinished()) {
                this.getDataRange(opts, onData);
            }
            else {
                stream.end();
            }
        };
        if (opts.limit === 0) {
            stream.end();
        }
        else {
            this.getDataRange(opts, onData);
        }
        return stream;
    }
    getDataRange(options, cb) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            const opts = Object.assign({}, options);
            if (opts.gte) {
                if (opts.reverse) {
                    opts.end = opts.gte;
                }
                else {
                    opts.start = opts.gte;
                }
            }
            if (opts.lte) {
                if (opts.reverse) {
                    opts.start = opts.lte;
                }
                else {
                    opts.end = opts.lte;
                }
            }
            if (opts.gte > opts.lte && !opts.reverse)
                return cb(undefined, { Items: [] });
            const rangeCondition = createRangeKeyCondition(opts);
            const params = {
                KeyConditions: keyConditionsFor(this.hashKey, rangeCondition),
                Limit: opts.limit && opts.limit >= 0 ? opts.limit : undefined,
                ScanIndexForward: !opts.reverse,
                ExclusiveStartKey: opts.lastKey,
            };
            try {
                const records = yield this.dynamoDb.query(params);
                (_a = records.Items) === null || _a === void 0 ? void 0 : _a.forEach((item) => (item.value = dataFromItem(item)));
                cb(undefined, records);
            }
            catch (err) {
                cb(err);
            }
        });
    }
}
//# sourceMappingURL=iterator.js.map