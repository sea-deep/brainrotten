// Lambda entrypoint for the container image. aws-lambda-ric 4.x resolves the handler only from
// the _HANDLER and LAMBDA_TASK_ROOT environment variables, which Lambda sets for its own layout.
// Our code lives in /var/task/app, so pin the task root and take the handler from the image
// command (ImageConfig.Command), e.g. "apps/cloud/dist/api.handler".
import process from 'node:process';

const handler=process.argv[2];
if(handler)process.env._HANDLER=handler;
process.env.LAMBDA_TASK_ROOT='/var/task/app';
await import('/opt/runtime/node_modules/aws-lambda-ric/index.mjs');
