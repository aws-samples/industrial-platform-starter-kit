#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { IndustialDataPlatformStack } from "../lib/industrial-data-platform-stack";
import { GreengrassComponentDeployStack } from "../lib/greengrass-component-deploy-stack";
import { QuicksightStack } from "../lib/quicksight-stack";

const app = new cdk.App();
const thingName = app.node.tryGetContext("thingName");
const opcuaEndpointUri = app.node.tryGetContext("opcuaEndpointUri");
const sourceDir = app.node.tryGetContext("sourceDir");
const quicksightUserName = app.node.tryGetContext("quicksightUserName");

const platformStack = new IndustialDataPlatformStack(
  app,
  "IndustialDataPlatformStack",
  {
    env: {
      account: process.env.CDK_DEFAULT_ACCOUNT,
      region: process.env.CDK_DEFAULT_REGION,
    },
    thingName: thingName,
    opcuaEndpointUri: opcuaEndpointUri,
    // If you want to provision a virtual device, set this flag to true.
    // NOTE: this flag is only for testing purpose.
    provisionVirtualDevice: true,
  }
);

// Deploy Greengrass components.
// NOTE: This stack must be deployed after device setup completed.
const deployStack = new GreengrassComponentDeployStack(
  app,
  "GreengrassComponentDeployStack",
  {
    env: {
      account: process.env.CDK_DEFAULT_ACCOUNT,
      region: process.env.CDK_DEFAULT_REGION,
    },
    thingName: thingName,
    deploymentName: "Deployment for IndustrialDataPlatformGateway",
    opcComponentName: platformStack.opcArchiver.componentName,
    opcComponentVersion: platformStack.opcArchiver.componentVersion,
    opcDestinationBucketName: platformStack.storage.opcRawBucket.bucketName,
    fileComponentName: platformStack.fileWatcher.componentName,
    fileComponentVersion: platformStack.fileWatcher.componentVersion,
    fileSourceDirectoryName: sourceDir,
    fileDestinationBucketName: platformStack.storage.fileRawBucket.bucketName,
  }
);

deployStack.addDependency(platformStack);

// NOTE: This stack is only for testing purpose.
// The argument `provisionVirtualDevice` for `IndustialDataPlatformStack` as true is required.
const quicksightStack = new QuicksightStack(app, "QuicksightStack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  quicksightUserName: quicksightUserName,
  dataSourceName: "IndustrialPlatformDataSource",
  databaseName: platformStack.datacatalog.database.databaseName,
  opcTableName: platformStack.datacatalog.opcProcessedTable.tableName,
  fileTableName: platformStack.datacatalog.fileProcessedTable.tableName,
});
quicksightStack.addDependency(platformStack);
