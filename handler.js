'use strict'

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

async function migrate(client) {
  console.log('IN MIGRATE FUNC')
  return await client.query(`CREATE TABLE syllables(
    syllables VARCHAR PRIMARY KEY,
    word VARCHAR NOT NULL,
    votes INTEGER NOT NULL
  )`)
}

// INSERT INTO syllables
//     (word, syllables, votes) VALUES
//     ('inflammatory', 'in*flam*ma*to*ry', 0)
//     ON CONFLICT ON CONSTRAINT syllables_syllables_key
//     DO UPDATE SET votes = syllables.votes + 1 WHERE syllables.syllables = 'in*flam*ma*to*ry'
async function insert(client, { word, syllables }) {
  console.log('IN INSERT FUNC')
  return await client.query(`INSERT INTO syllables
    (word, syllables, votes) VALUES
    ('${word}', '${syllables}', 0)
    ON CONFLICT ON CONSTRAINT syllables_pkey
    DO UPDATE SET votes = syllables.votes + 1 WHERE syllables.syllables = '${syllables}'`)
}

async function read(client, word) {
  console.log('IN READ FUNC')
  return await client.query(`SELECT * FROM syllables`) //  WHERE word = '${word}'
}

async function del(client, word) {
  console.log('IN DELETE FUNC')
  return await client.query(`DELETE FROM syllables WHERE word=${word}`)
}

function missingParam(name, example) {
  return {
    statusCode: 404,
    body: `missing required parameter: ${name}. example: ${example}`
  }
}

function internalError(error) {
  return {
    statusCode: 500,
    body: error.message
  }
}

function happy(body) {
  return {
    statusCode: 200,
    body: JSON.stringify(body)
  }
}

module.exports.migrate = async (event, context) => {
  console.log('in migrate')

  let postgresSegment
  let client
  let result
  try {
    postgresSegment = initTracing()
    client = initPostgres()
    const results = await migrate(client)
    result = happy({ message: { results } })
  } catch (error) {
    result = internalError(error)
  } finally {
    client.end()
    postgresSegment.close()
  }

  return result
}

module.exports.insert = async (event, context) => {
  console.log('in insert')

  const { word, syllable } = event.queryStringParameters
  const example = 'curl -X PUT http://localhost:3000/insert?word=fragile&syllable=frag*ile'
  if (!word) { return missingParam('word', example) }
  if (!syllable) { return missingParam('syllable', example) }

  let postgresSegment
  let client
  let result
  try {
    postgresSegment = initTracing()
    client = initPostgres()
    const results = await insert(client, { word, syllable })
    result = happy({ message: { results } })
  } catch (error) {
    result = internalError(error)
  } finally {
    client.end()
    postgresSegment.close()
  }

  return result
}

module.exports.read = async (event, context) => {
  console.log('in read')

  const { word } = event.queryStringParameters
  const example = 'curl -X GET http://localhost:3000/read?word=fragile'

  if (!word) { return missingParam('word', example) }

  let postgresSegment
  let client
  let result
  try {
    postgresSegment = initTracing()
    client = await initPostgres()
    const results = await read(client)
    result = happy({ message: { results } })
  } catch (error) {
    result = internalError(error)
  } finally {
    client.end()
    postgresSegment.close()
  }

  return result
}

module.exports.delete = async (event, context) => {
  console.log('in delete')

  const { word } = event.queryStringParameters
  const example = 'curl -X DELETE http://localhost:3000/delete?word=fragile'

  if (!word) { return missingParam('word', example) }

  let postgresSegment
  let client
  let result
  try {
    postgresSegment = initTracing()
    client = initPostgres()
    const results = await del(client, word)
    result = happy({ message: { results }})
  } catch (error) {
    result = internalError(error)
  } finally {
    client.end()
    postgresSegment.close()
  }

  return result
}

function initTracing () {
  const topSegment = getTraceId(process.env._X_AMZN_TRACE_ID)
  if (!topSegment) {
    console.error('no x-ray trace header set on process.env._X_AMZN_TRACE_ID')
    return
  }

  const postgresSegment = new AWSXRay.Segment('postgres-query', topSegment.root, topSegment.parent) // needed if you're not instrumenting express
  AWSXRay.setSegment(postgresSegment)

  return postgresSegment
}

async function initPostgres () {
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

  console.log('calling client.connect')
  client.connect()

  return client
}
