# syllables demo

these are the things you need in `serverless.yml`:

```
provider:
  tracing: true # enable X-Ray tracing
  iamRoleStatements: # add X-Ray permissions
    - Effect: "Allow"
      Action:
        - "xray:PutTraceSegments"
        - "xray:PutTelemetryRecords"
      Resource:
        - "*"
  environment:
    AWS_XRAY_DEBUG_MODE: true
    NSOLID_LICENSE_KEY: <enter your N|Solid license key here!>
  layers:
    - arn:aws:lambda:${self:custom.region}:800406105498:layer:nsolid-node-10:10
...
    # TODO: see if you can collapse this into the `provider` section!
    InsertLambdaFunction: # this corresponds to the name of the handler (`handler.insert` in this example)
      Properties:
        TracingConfig:
          Mode: Active # enable X-Ray tracing
```

you also need a little boilerplate in your javascript to ensure that you are working with the correct root trace id:

TODO: before we ship, turn this into something we publish on npm, under an open-source license? MIT?
```
const AWSXRay = require('aws-xray-sdk')

// parse the root trace id
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

// return the root trace id or leave an error in the logs
function initTracing () {
  const topSegment = parseTraceHeader(process.env._X_AMZN_TRACE_ID)
  if (!topSegment) {
    console.error('no x-ray trace header set on process.env._X_AMZN_TRACE_ID')
    return
  }

  return topSegment
}
```

finally, here's how to use the above to instrument a handler:
```
// instrument any services you need traces for here
const https = AWSXRay.captureHTTPs(require('https'))
const { Client } = AWSXRay.capturePostgres(require('pg'))

// TODO: make certain this is absolutely necessary to set the top segment
function createPostgresSegment (topSegment) {
  const postgresSegment = new AWSXRay.Segment('postgres-query', topSegment.root, topSegment.parent)
  AWSXRay.setSegment(postgresSegment)
  return postgresSegment
}

module.exports.insert = async (event, context) => {
  const { word, syllable } = event.queryStringParameters
  const example = 'curl -X PUT http://localhost:3000/insert?word=fragile&syllable=frag*ile'
  if (!word) { return missingParam('word', example) }
  if (!syllable) { return missingParam('syllable', example) }

  let postgresSegment
  let client
  let result
  try {
    postgresSegment = createPostgresSegment(initTracing())
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
```

## run locally:
`sls offline start -r us-west-2 --providededRuntime=nodejs10.x` # you'd think this would work, but it doesn't :(

`sls offline start -r us-west-2` # I can get this running if I set `runtime: nodejs10.x`

`curl -X POST -H "x-api-key: <api key>" http://localhost:3000/migrate`

<!--
## test against prod via your personal AWS account (requires feature flag)

### set up a role that gives NodeSource read-only access to your X-Ray traces
1. Navigate to the IAM dashboard in the AWS console.
2. Using the sidebar on the left, you should see `Dashboard`, `Groups`, `Users`, `Roles`, `...`. Select `Roles`.
3. Click `Create role`.
4. Under the `Select type of trusted entity` heading, select `Another AWS account (belonging to you or 3rd party)`
5. You should see `Specify accounts that can use this role`, and an empty `Account ID` input. Enter `800406105498` (this is NodeSource's AWS account identifier.) NB: do not check either of the options (`Require external ID`, `Require MFA`). Finally, click the `Next: Permissions` in the lower-right corner of the browser window.
6. In the search box next to the `Filter policies` dropdown, type `xray`. Next, check the `AWSXrayReadOnlyAccess` policy. Finally, click `Next: Tags` in the lower-right corner of the browser window.
7. Add tags if you want them. Finally, click `Next: Review` in the lower-right corner of the browser window.
8. Enter a `Role name` and `Role description`. Finally, click `Create role` in the lower-right corner of the browser window.
9. You should be back to the `Roles` tab in the IAM dashboard. Find the role created in the last step, and click on the role name. This should take you to the role summary. Copy the `Role ARN` and paste it into the NodeSource for AWS Lambda settings panel.

### deploy
  serverless deploy --verbose --profile personal --region us-west-2

### test the lambda
  serverless invoke --function hello
-->