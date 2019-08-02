'use strict';

const AWSXRay = require('aws-xray-sdk')
const https = AWSXRay.captureHTTPs(require('https'))
// AWSXRay.enableManualMode() // not needed - SDK defaults to automatic mode

const { Client } = AWSXRay.capturePostgres(require('pg'))

function getPlanets(callback) {
  https.get('https://api.nasa.gov/planetary/apod?api_key=DEMO_KEY', (response) => {
    let data = ''

    response.on('data', (chunk) => {
      data += chunk
    })

    response.on('end', () => {
      callback(null, { message: JSON.parse(data).explanation })
    })
  }).on('error', (error) => {
    callback(error)
  })
}

function getTraceId(traceHeader) {
  if (!traceHeader) { return }

  const tokens = traceHeader.split(';').filter(Boolean)

  let result = {}
  for (const token of tokens) {
    const [ key, value ] = token.split('=')
    result[key.toLowerCase()] = value
  }

  return result
}

function migrate(client, callback) {
  console.log('IN MIGRATE FUNC')
  client.query(`CREATE TABLE syllables(
    syllables VARCHAR PRIMARY KEY,
    word VARCHAR NOT NULL,
    votes INTEGER NOT NULL
  )`, callback)
}

// INSERT INTO syllables
//     (word, syllables, votes) VALUES
//     ('inflammatory', 'in*flam*ma*to*ry', 0)
//     ON CONFLICT ON CONSTRAINT syllables_syllables_key
//     DO UPDATE SET votes = syllables.votes + 1 WHERE syllables.syllables = 'in*flam*ma*to*ry'
function insert(client, entry, callback) {
  console.log('IN INSERT FUNC')
  client.query(`INSERT INTO syllables
    (word, syllables, votes) VALUES
    ('${entry.word}', '${entry.syllables}', 0)
    ON CONFLICT ON CONSTRAINT syllables_pkey
    DO UPDATE SET votes = syllables.votes + 1 WHERE syllables.syllables = '${entry.syllables}'`, callback)
}

function read(client, word, callback) {
  console.log('IN READ FUNC')
  client.query(`SELECT * FROM syllables`, callback) //  WHERE word = '${word}'
}

module.exports.index = function (event, context, callback) {
  return getPlanets(callback)

  const topSegment = getTraceId(process.env._X_AMZN_TRACE_ID)
  if (!topSegment) {
    console.error('no x-ray trace header set on process.env._X_AMZN_TRACE_ID')
    return
  }

  const postgresSegment = new AWSXRay.Segment('postgres-query', topSegment.root, topSegment.parent) // needed if you're not instrumenting express
  AWSXRay.setSegment(postgresSegment)

  console.log(
    '\nPOSTGRES_URL:',
    process.env.POSTGRES_URL,

    '\nPOSTGRES_PORT:',
    process.env.POSTGRES_PORT,

    '\nPOSTGRES_USER:',
    process.env.POSTGRES_USER,

    '\nPOSTGRES_PASSWORD:',
    process.env.POSTGRES_PASSWORD,

    '\nPOSTGRES_DATABASE:',
    process.env.POSTGRES_DATABASE
  )

  const client = new Client({
    host: process.env.POSTGRES_URL,
    port: process.env.POSTGRES_PORT,
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.POSTGRES_DATABASE
  })

  function done(error, results) {
    console.log('error:', error)
    console.log('results:', results)

    client.end()
    postgresSegment.close()

    if (error) {
      callback(error)
    }
    
    if (results) {
      callback(null, results)
    }
  }

  console.log('calling client.connect')
  client.connect(error => {
    console.log('in client.connect')
    if (error) {
      console.log('error:', error)
      return callback(error)
    }

    console.log('past error check')
    console.log('event:', event)

    if (event.mode === 'migrate') {
      console.log('in migrate')
      migrate(client, done)
    } else if (event.mode === 'insert' && event.word && event.syllables) {
      console.log('in insert')
      insert(client, { word: event.word, syllables: event.syllables }, done)
    } else if (event.mode === 'read' && event.word) {
      console.log('in read')
      read(client, event.word, done)
    } else {
      console.log('invalid mode:', event.mode)
      callback(null)
      return
    }
  })
}
