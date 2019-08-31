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

function parseTraceHeader(traceHeader) {
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
  return await client.query(`INSERT INTO syllables
    (word, syllables, votes) VALUES
    ('${word}', '${syllables}', 0)
    ON CONFLICT ON CONSTRAINT syllables_pkey
    DO UPDATE SET votes = syllables.votes + 1 WHERE syllables.syllables = '${syllables}'`)
}

async function readSlowly(client, word) {
  return await client.query(`SELECT * FROM syllables, pg_sleep(5) WHERE word='${word}'`)
}

async function read(client, word) {
  return await client.query(`SELECT * FROM syllables WHERE word='${word}'`)
}

async function del(client, word) {
  return await client.query(`DELETE FROM syllables WHERE word='${word}'`)
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
  // curl -X POST -H "x-api-key: <paste api key here>" http://localhost:3000/migrate
  let postgresSegment
  let client
  let result
  try {
    postgresSegment = createPostgresSegment(initTracing())
    client = await initPostgres()
    const results = await migrate(client)
    const message = `created syllables table`
    result = happy({ message })
  } catch (error) {
    result = internalError(error)
  } finally {
    client.end()
    postgresSegment.close()
  }

  return result
}

module.exports.insert = async (event, context) => {
  const { word, syllables } = event.queryStringParameters
  const example = 'curl -X PUT http://localhost:3000/insert?word=fragile&syllable=frag*ile'
  if (!word) { return missingParam('word', example) }
  if (!syllables) { return missingParam('syllables', example) }

  let postgresSegment
  let client
  let result
  try {
    postgresSegment = createPostgresSegment(initTracing())
    console.log('postgresSegment:', postgresSegment)
    client = await initPostgres()
    console.log('client:', client)
    const results = await insert(client, { word, syllables })
    const { rowCount } = results
    let message = `inserted ${word} with syllables ${syllables} into ${rowCount} row(s)`
    result = happy({ message })
  } catch (error) {
    result = internalError(error)
  } finally {
    client.end()
    postgresSegment.close()
  }

  return result
}

module.exports.read = async (event, context) => {
  const { word } = event.queryStringParameters
  const example = 'curl -X GET http://localhost:3000/read?word=fragile'

  if (!word) { return missingParam('word', example) }

  let postgresSegment
  let client
  let result
  try {
    postgresSegment = createPostgresSegment(initTracing())
    client = await initPostgres()
    const results = await read(client)
    let messages = []
    for (let row of results.rows) {
      messages.push(`word: ${row.word}, syllables: ${row.syllables} votes: ${row.votes}`)
    }
    const message = messages.length > 0 ? messages.join('\n') : `no syllables found for ${word}. add a new entry by curling the insert endpoint`
    result = happy({ message })
  } catch (error) {
    result = internalError(error)
  } finally {
    client.end()
    postgresSegment.close()
  }

  return result
}

module.exports.readWithError = async (event, context) => {
  const { word } = event.queryStringParameters
  const example = 'curl -X GET http://localhost:3000/read-with-error?word=fragile'

  if (!word) { return missingParam('word', example) }

  let postgresSegment
  let client
  let result
  try {
    postgresSegment = createPostgresSegment(initTracing())
    client = await initPostgres()
    const results = await readSlowly(client)

    if (word === 'fragile') {
      throw new Error(`explosions are only fun when you don't have to clean the mess up`)
    }

    let messages = []
    for (let row of results.rows) {
      messages.push(`word: ${row.word}, syllables: ${row.syllables} votes: ${row.votes}`)
    }
    const message = messages.length > 0 ? messages.join('\n') : `no syllables found for ${word}. add a new entry by curling the insert endpoint`
    result = happy({ message })
  } catch (error) {
    result = internalError(error)
  } finally {
    client.end()
    postgresSegment.close()
  }

  return result
}

module.exports.delete = async (event, context) => {
  const { word } = event.queryStringParameters
  const example = 'curl -X DELETE http://localhost:3000/delete?word=fragile'

  if (!word) { return missingParam('word', example) }

  let postgresSegment
  let client
  let result
  try {
    postgresSegment = createPostgresSegment(initTracing())
    client = await initPostgres()
    const results = await del(client, word)
    const { rowCount } = results
    const message = `deleted ${rowCount} from syllables table`
    result = happy({ message })
  } catch (error) {
    result = internalError(error)
  } finally {
    client.end()
    postgresSegment.close()
  }

  return result
}

/**
 * workaround for the off-by-one traceId bug found and documented by Yan Cui in
 * https://theburningmonk.com/2017/06/aws-x-ray-and-lambda-the-good-the-bad-and-the-ugly/
 */
function initTracing () {
  const topSegment = parseTraceHeader(process.env._X_AMZN_TRACE_ID)
  if (!topSegment) {
    console.error('no x-ray trace header set on process.env._X_AMZN_TRACE_ID')
    return
  }
  return topSegment
}

function createPostgresSegment (topSegment) {
  const postgresSegment = new AWSXRay.Segment('postgres-query', topSegment.root, topSegment.parent)
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
