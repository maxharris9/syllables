# nodesource-lambda-test

## prerequisites

1. `npm install -g serverless`
2. if you're testing against staging, supply your NodeSource AWS account credentials (assuming that you keep them under `[default]`)

     `serverless config credentials --provider aws --key <key> --secret <secret>`

   else if you're testing against prod, you'll need to have a separate AWS account (i.e., not your NodeSource AWS account):

     `serverless config credentials --provider aws --key <key> --secret <secret> --profile personal`

## test against staging via your NodeSource AWS account

1. `git clone git@github.com:nodesource/nodesource-lambda-test.git`
2. `cd nodesource-lambda-test/`
3. `npm install`
4. open a browser and navigate to: https://staging.accounts.nodesource.com
5. select `Personal` from the org selector dropdown in the upper-left
6. copy your N|Solid license key from: https://staging.accounts.nodesource.com/settings/profile
7. edit line 1 of `serverless.yml`, setting the service name to something unique to you, e.g.: `service: x-ray-test-max`
   edit line 35 of `serverless.yml`, setting `NSOLID_LICENSE_KEY` to the key you copied in the previous step
8. set the user and password in `handler.js` (ask in the qa meeting/channel for the username and password)
9. navigate to https://staging.accounts.nodesource.com/settings/lambda and set the X-Ray Role name to `xray-read-only` (a green checkmark should confirm the setting is saved)
10. `serverless deploy`
11. `serverless invoke --function hello`
12. navigate to https://staging.app.nodesource.com/functions, then select `x-ray-test-max` (for example - yours will be whatever you set in step 7) on the list on the left
13. you should see an invocation. click on the `View` link to get to the profile/trace viewer
14. you should see the profile and traces!
15. navigate to https://staging.accounts.nodesource.com/settings/lambda, select the X-Ray Role name string, then hit the delete key (a green checkmark should confirm the setting is saved)
16. repeat steps 11-13. in the profile viewer, you should see _just_ the CPU profile associated with this latest invocation

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