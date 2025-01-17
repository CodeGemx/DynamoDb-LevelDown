import through2 from 'through2';
import { DynamoDB } from 'aws-sdk';
import { Transform } from 'stream';
import { AbstractIterator, ErrorKeyValueCallback } from 'abstract-leveldown';

import { DynamoDbDown } from './dynamoDbDown.js';
import { DynamoDbAsync } from './dynamoDbAsync.js';
import { IteratorOptions, SimpleItem } from './types.js';
import {
  isBuffer,
  withoutKeys,
  castToBuffer,
  dataFromItem,
  rangeKeyFrom,
  keyConditionsFor,
  createRangeKeyCondition
} from './utils.js';

const EVENT_END = 'end';
const EVENT_ERROR = 'error';
const EVENT_PUSHED = 'pushed';
const EVENT_READABLE = 'readable';

export class DynamoDbIterator extends AbstractIterator {
  private results: Transform;
  private seekTarget?: string;
  private keyAsBuffer: boolean;
  private isOutOfRange: boolean;
  private valueAsBuffer: boolean;
  private endEmitted: boolean = false;

  constructor(
    db: DynamoDbDown,
    private dynamoDb: DynamoDbAsync,
    private hashKey: string,
    private options: IteratorOptions
  ) {
    super(db);

    this.isOutOfRange = false;
    this.seekTarget = undefined;
    this.keyAsBuffer = !!options && options.keyAsBuffer !== false;
    this.valueAsBuffer = !!options && options.valueAsBuffer !== false;
    this.results = this.createReadStream(this.options);
    this.results.once(EVENT_END, () => {
      this.endEmitted = true;
    });
  }

  async _next(cb: ErrorKeyValueCallback<any, any>) {
    const onEnd = () => {
      this.results.removeListener(EVENT_READABLE, onReadable);
      cb(undefined, undefined, undefined);
    };

    const onReadable = () => {
      this.results.removeListener(EVENT_END, onEnd);
      this._next(cb);
    };

    const onError = (e: Error) => {
      this.results.removeListener(EVENT_END, onEnd);
      this.results.removeListener(EVENT_READABLE, onReadable);
      cb(e, undefined, undefined);
    };
    this.results.once(EVENT_ERROR, onError);

    await this.maybeSeek();
    if (this.isOutOfRange) {
      this.results.removeListener(EVENT_ERROR, onError);
      return cb(undefined, undefined, undefined);
    }

    const streamObject = this.readStream();
    this.results.removeListener(EVENT_ERROR, onError);

    if (!streamObject) {
      if (this.endEmitted) {
        return cb(undefined, undefined, undefined);
      } else {
        this.results.once(EVENT_END, onEnd);
        this.results.once(EVENT_READABLE, onReadable);
        return;
      }
    } else {
      let key: any = streamObject.key;
      let value: any = streamObject.value;

      // FIXME: This could be better.
      key = this.keyAsBuffer ? castToBuffer(key) : key;
      value = this.valueAsBuffer ? castToBuffer(value) : value;

      cb(undefined, key, value);
    }
  }

  _seek(target: any) {
    this.isOutOfRange = false;
    this.seekTarget = !!target && isBuffer(target) ? target.toString() : target;
  }

  private async peekNextKey(): Promise<string | undefined> {
    const onPushNext = (next: SimpleItem, resolve: (value?: SimpleItem) => void) => {
      this.results.removeListener(EVENT_END, onEnd);
      resolve(next);
    };
    const onEnd = (resolve: (value?: SimpleItem) => void) => {
      this.results.removeListener(EVENT_PUSHED, onPushNext);
      resolve(undefined);
    };
    const next = await new Promise<SimpleItem | undefined>((resolve, reject) => {
      const next = this.readStream();
      if (next) {
        this.results.unshift(next);
        return resolve(next);
      } else {
        this.results.once(EVENT_PUSHED, (next: SimpleItem) => onPushNext(next, resolve));
        this.results.once(EVENT_END, () => onEnd(resolve));
      }
    });
    return (next || {}).key;
  }

  private readStream(): SimpleItem {
    return this.results.read() as SimpleItem;
  }

  private getOptionsRange() {
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

  private isInRange(target: any) {
    const { high, low, inclusiveLow, inclusiveHigh } = this.getOptionsRange();
    const inRange =
      (!low || (inclusiveLow && target >= low) || target > low) &&
      (!high || (inclusiveHigh && target <= high) || target < high);
    return inRange;
  }

  private outOfRange() {
    this.isOutOfRange = true;
  }

  private async maybeSeek() {
    if (!this.seekTarget) return;
    if (!this.isInRange(this.seekTarget)) return this.outOfRange();

    let nextKey, couldBeHere;
    const seekKey = this.seekTarget;
    const isReverse = this.options.reverse === true;
    do {
      nextKey = await this.peekNextKey();
      if (!nextKey) return;

      couldBeHere = isReverse ? nextKey <= seekKey || nextKey < seekKey : nextKey >= seekKey || nextKey > seekKey;
      if (!couldBeHere) this.readStream();
    } while (!!nextKey && !couldBeHere);
    this.seekTarget = undefined;
  }

  private createReadStream(opts: IteratorOptions): Transform {
    let returnCount = 0;
    let keysOnly = opts.keys && !opts.values;

    const isFinished = () => {
      return !!opts.limit && opts.limit > 0 && returnCount > opts.limit;
    };

    const pushNext = (stream: Transform, output: SimpleItem) => {
      stream.push(output);
      stream.emit(EVENT_PUSHED, output);
    };

    const stream = through2.obj(async function (data, enc, cb) {
      returnCount += 1;
      const rangeKey = rangeKeyFrom(data);
      pushNext(this, { key: rangeKey, value: keysOnly ? rangeKey : withoutKeys(data.value) });
      if (isFinished()) {
        this.emit(EVENT_END);
      }

      cb();
    });

    const onData = (err: any, data?: DynamoDB.QueryOutput) => {
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
      } else {
        stream.end();
      }
    };

    if (opts.limit === 0) {
      stream.end();
    } else {
      this.getDataRange(opts, onData);
    }

    return stream;
  }

  private async getDataRange(
    options: IteratorOptions,
    cb: (error: any, data?: DynamoDB.QueryOutput) => void
  ): Promise<void> {
    const opts = { ...options };
    if (opts.gte) {
      if (opts.reverse) {
        opts.end = opts.gte;
      } else {
        opts.start = opts.gte;
      }
    }

    if (opts.lte) {
      if (opts.reverse) {
        opts.start = opts.lte;
      } else {
        opts.end = opts.lte;
      }
    }

    if (opts.gte > opts.lte && !opts.reverse) return cb(undefined, { Items: [] });

    const rangeCondition = createRangeKeyCondition(opts);
    const params = {
      KeyConditions: keyConditionsFor(this.hashKey, rangeCondition),
      Limit: opts.limit && opts.limit >= 0 ? opts.limit : undefined,
      ScanIndexForward: !opts.reverse,
      ExclusiveStartKey: opts.lastKey,
    };

    try {
      const records = await this.dynamoDb.query(params);
      records.Items?.forEach((item) => (item.value = dataFromItem(item)));
      cb(undefined, records);
    } catch (err) {
      cb(err);
    }
  }
}
