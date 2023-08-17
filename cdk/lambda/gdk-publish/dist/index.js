"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// index.ts
var gdk_publish_exports = {};
__export(gdk_publish_exports, {
  handler: () => handler
});
module.exports = __toCommonJS(gdk_publish_exports);
var import_client_codebuild = require("@aws-sdk/client-codebuild");
var import_client_greengrassv2 = require("@aws-sdk/client-greengrassv2");
var cb = new import_client_codebuild.CodeBuildClient({});
var gg = new import_client_greengrassv2.GreengrassV2Client({});
var handler = async (event, context) => {
  console.log(JSON.stringify(event));
  const props = event.ResourceProperties;
  try {
    if (event.RequestType == "Create" || event.RequestType == "Update") {
      const build = await cb.send(
        new import_client_codebuild.StartBuildCommand({
          projectName: props.codeBuildProjectName,
          environmentVariablesOverride: [
            {
              name: "assetUrl",
              value: `s3://${props.sourceBucketName}/${props.sourceObjectKey}`
            },
            {
              name: "extractPath",
              value: props.extractPath
            },
            {
              name: "projectName",
              value: props.codeBuildProjectName
            },
            {
              name: "responseURL",
              value: event.ResponseURL
            },
            {
              name: "stackId",
              value: event.StackId
            },
            {
              name: "requestId",
              value: event.RequestId
            },
            {
              name: "logicalResourceId",
              value: event.LogicalResourceId
            },
            {
              name: "componentName",
              value: props.componentName
            },
            ...Object.entries(props.environment ?? {}).map(([name, value]) => ({
              name,
              value
            }))
          ]
        })
      );
    } else {
      const arn = event.PhysicalResourceId;
      await sendStatus("SUCCESS", event, context, arn);
    }
  } catch (e) {
    console.log(e);
    const err = e;
    await sendStatus("FAILED", event, context, "", err.message);
  }
};
var sendStatus = async (status, event, context, latestArn, reason) => {
  const componentVersion = latestArn.split(":")[8];
  const responseBody = JSON.stringify({
    Status: status,
    Reason: reason ?? "See the details in CloudWatch Log Stream: " + context.logStreamName,
    PhysicalResourceId: latestArn,
    StackId: event.StackId,
    RequestId: event.RequestId,
    LogicalResourceId: event.LogicalResourceId,
    NoEcho: false,
    Data: {
      componentVersion
    }
  });
  await fetch(event.ResponseURL, {
    method: "PUT",
    body: responseBody,
    headers: {
      "Content-Type": "",
      "Content-Length": responseBody.length.toString()
    }
  });
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handler
});
