A. Clone the syllables demo

`git clone git@github.com:maxharris9/syllables.git`

B. Create an X-Ray role that allows NodeSource to access X-Ray traces on your behalf:
  1. go to IAM your AWS console
  2. select the "another AWS account"
  3. check the "require external ID" box. enter an external ID of your choosing. [THIS IS OPTIONAL, but link to the AWS docs on why you might want to do this! and update the docs to really explain this!]
  4. enter any tags you may have (not required)
  5. enter a role name and description, then create the role
  6. you will be taken back to the roles list. select the role you just created
  7. click on the "trust relationships" tab
  8. now you have both the roleArn and external ID in view.

C. Set up tracing on the NodeSource side:
  1. using another tab or window, go to the NodeSource settings panel (there are two - your org's, or your personal one)
  2. set sample frequency to <Always> [TODO: remember to PR this!] - (this way you don't have to wait to get profiles and traces!)
  3. set sample probability to 100%
  4. flip the X-Ray tracing switch on
  5. enter your roleArn and (optional) externalID

  You should see "X-Ray Credentials Accepted"

  5. navigate to the `Lambda` sub-tab (https://accounts.nodesource.com/settings/profile), and copy your N|Solid License Key
  6. paste that key into `syllables/serverless.yml`

D. Deploy the syllables demo

```
$ AWS_PROFILE=personal sls deploy
Serverless: Packaging service...
Serverless: Excluding development dependencies...
Serverless: Uploading CloudFormation file to S3...
Serverless: Uploading artifacts...
Serverless: Uploading service syllables.zip file to S3 (9.02 MB)...
Serverless: Validating template...
Serverless: Updating Stack...
Serverless: Checking Stack update progress...
............................................................................................................................................................
Serverless: Stack update finished...
Service Information
service: syllables
stage: dev
region: us-west-2
stack: syllables-dev
resources: 52
api keys:
  dev-syllables-key: 20VcZ162t07DpCQfEL2648BpiVrFyX4k2YsQAKcq
endpoints:
  POST - https://9vxewauh38.execute-api.us-west-2.amazonaws.com/dev/migrate
  PUT - https://9vxewauh38.execute-api.us-west-2.amazonaws.com/dev/insert
  GET - https://9vxewauh38.execute-api.us-west-2.amazonaws.com/dev/read
  DELETE - https://9vxewauh38.execute-api.us-west-2.amazonaws.com/dev/delete
functions:
  migrate: syllables-dev-migrate
  insert: syllables-dev-insert
  read: syllables-dev-read
  delete: syllables-dev-delete
layers:
  None
Serverless: Run the "serverless" command to setup monitoring, troubleshooting and testing.
```

0. take note of the `dev-syllables-key` returned, as well as the endpoint URLs. you'll need to retain them for the next steps.

1. initialize the database with a migration:
`curl -X POST -H "x-api-key: iG9nt5Mfbl7tYGJBAbFY12rBrv2TnKd346z2nWfo" https://u8kfv2evyf.execute-api.us-west-2.amazonaws.com/dev/migrate`
(this will generate an x-ray trace, but it's not very interesting)

2. call the `read-with-error` endpoint
`curl -X GET "https://u8kfv2evyf.execute-api.us-west-2.amazonaws.com/dev/read-with-error?word=fragile"`
navigate to the NS lambda dashboard, and click on this most recent invocation.

[TODO: add screenshot of the x-ray traces corresponding to the read-with-error invocation]

you will see a more interesting trace, with a DB connection trace that runs long. doing this also generates errors in the logs, which is probably how you got here if you're doing this in real life.

- at this point, this is where you'd fix and redeploy your code -

3. call the good insertion endpoint
`curl -X PUT "https://u8kfv2evyf.execute-api.us-west-2.amazonaws.com/dev/insert?word=fragile&syllables=frag*ile"`
(this will generate another x-ray trace)

4. now read it back:
`curl -X GET "https://u8kfv2evyf.execute-api.us-west-2.amazonaws.com/dev/read?word=fragile"`

5. you can delete entries with `curl -X DELETE -H "x-api-key: iG9nt5Mfbl7tYGJBAbFY12rBrv2TnKd346z2nWfo" "https://u8kfv2evyf.execute-api.us-west-2.amazonaws.com/dev/delete?word=fragile"`
