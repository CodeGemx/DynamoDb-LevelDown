'use strict'
const url                = require('url'),
      test               = require('tape'),
      dynalite           = require('dynalite'),
      levelup            = require('levelup'),
      abstractTestCommon = require('abstract-leveldown/testCommon'),
      { DynamoDB }       = require('aws-sdk'),
      DynamoDBDOWN       = require('../index'),
      dynamodbOptions    = {
        region: 'us-east-1',
        accessKeyId: 'abc',
        secretAccessKey: '123',
        paramValidation: false
      };

const startDbServer = (cb) => {
  const server = dynalite({
    createTableMs: 20,
    deleteTableMs: 20,
    updateTableMs: 20
  })

  server.listen((err) => {
    if (err) throw err;

    const address = server.address()

    const endpoint = url.format({
      protocol: 'http',
      hostname: address.address,
      port: address.port
    })

    dynamodbOptions.endpoint = endpoint

    cb(server)
  })
}

const createTestCommon = () => {
  var dbIdx = 0

  const location = () => {
    return `test-table${dbIdx++}`
  }

  const lastLocation = () => {
    return `test-table${dbIdx}`
  }

  return Object.assign({}, abstractTestCommon, {
    location,
    lastLocation
  })
}

const leveldown = location => {

  const dynamo     = new DynamoDB(dynamodbOptions),
        dynamoDown = DynamoDBDOWN(dynamo)(location);

  dynamoDown.oldOpen = dynamoDown._open
  dynamoDown._open = function (opts, cb) {
    return dynamoDown.oldOpen(Object.assign({dynamodb: dynamodbOptions}, {createIfMissing: true}), cb)
  }

  return dynamoDown
}

test('abstract-leveldown', t => {
  const testCommon = createTestCommon()
  var server

  t.test('setup', t => {
    startDbServer(newServer => {
      server = newServer
      t.end()
    })
  })

  t.test('abstract-leveldown/abstract/leveldown-test', t => {
    require('abstract-leveldown/abstract/leveldown-test').args(leveldown, t.test, testCommon)
  })

  t.test('abstract-leveldown/abstract/open-test', t => {
    require('abstract-leveldown/abstract/open-test').args(leveldown, t.test, testCommon)
    require('abstract-leveldown/abstract/open-test').open(leveldown, t.test, testCommon)
    t.end()
  })

  t.test('abstract-leveldown/abstract/del-test', t => {
    require('abstract-leveldown/abstract/del-test').all(leveldown, t.test, testCommon)
  })

  t.test('abstract-leveldown/abstract/get-test', t => {
    require('abstract-leveldown/abstract/get-test').all(leveldown, t.test, testCommon)
  })

  t.test('abstract-leveldown/abstract/put-test', t => {
    require('abstract-leveldown/abstract/put-test').all(leveldown, t.test, testCommon)
  })

  t.test('abstract-leveldown/abstract/put-get-del-test', t => {
    require('abstract-leveldown/abstract/put-get-del-test').all(leveldown, t.test, testCommon, new Buffer('testbuffer'))
  })

  t.test('abstract-leveldown/abstract/batch-test', t => {
    require('abstract-leveldown/abstract/batch-test').all(leveldown, t.test, testCommon)
  })

  t.test('abstract-leveldown/abstract/chained-batch-test', t => {
    require('abstract-leveldown/abstract/chained-batch-test').all(leveldown, t.test, testCommon)
  }
  )
  t.test('abstract-leveldown/abstract/close-test', t => {
    require('abstract-leveldown/abstract/close-test').close(leveldown, t.test, testCommon)
  })

  t.test('abstract-leveldown/abstract/iterator-test', t => {
    require('abstract-leveldown/abstract/iterator-test').all(leveldown, t.test, testCommon)
  })

  t.test('abstract-leveldown/abstract/ranges-test', t => {
    require('abstract-leveldown/abstract/ranges-test').all(leveldown, t.test, testCommon)
  })

  t.test('teardown', t => {
    server.close(() => {
      t.end()
    })
  })
})

test('levelup', t => {
  var server;
  var db;

  t.test('setup', t => {
    startDbServer(newServer => {
      server = newServer
      const dynamo = new DynamoDB(dynamodbOptions);
      db = levelup('foobase', {db: DynamoDBDOWN(dynamo)});
      t.end()
    })
  })

  t.test('put string', t => {
    db.put('name', 'LevelUP string', function (err) {
      t.notOk(err)
      db.get('name', function (err, value) {
        t.notOk(err)
        t.equal(value, 'LevelUP string')
        t.end()
      })
    })
  })

  t.test('put binary', t => {
    const buffer = new Buffer('testbuffer');
    db.put('binary', buffer, function (err) {
      t.notOk(err)
      db.get('binary', { encoding: 'binary' }, function (err, value) {
        t.notOk(err)
        t.deepEqual(value, buffer)
        t.end()
      })
    })
  })

  t.test('tearDown', t => {
    server.close(() => {
      t.end()
    })
  })
})
