#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { IndustrialDataPlatformStack } from "../lib/industrial-data-platform-stack";
import { GreengrassComponentDeployStack } from "../lib/greengrass-component-deploy-stack";
import { QuicksightStack } from "../lib/quicksight-stack";

const app = new cdk.App();
const thingName = app.node.tryGetContext("thingName");
const opcuaEndpointUri = app.node.tryGetContext("opcuaEndpointUri");
const sourceDir = app.node.tryGetContext("sourceDir");
const quicksightUserName = app.node.tryGetContext("quicksightUserName");

const platformStack = new IndustrialDataPlatformStack(
  app,
  "IndustrialDataPlatformStack",
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
    // If you want to see the behavior of embulk on greengrass, set this flag to true.
    provisionDummyDatabase: true,
  }
);

const SOURCE_HOST = app.node.tryGetContext("rdbHost");
const SOURCE_PORT = app.node.tryGetContext("rdbPort");
const SOURCE_USER = app.node.tryGetContext("rdbUser");
const SOURCE_PASSWORD = app.node.tryGetContext("rdbPassword");
const SOURCE_DATABASE = app.node.tryGetContext("rdbDatabase");
const RDB_EXPORT_INTERVAL_SEC = app.node.tryGetContext("rdbExportIntervalSec");

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
    opcConfig: {
      opcComponentName: platformStack.opcArchiver.componentName,
      opcComponentVersion: platformStack.opcArchiver.componentVersion,
      opcDestinationBucketName: platformStack.storage.opcRawBucket.bucketName,
    },
    fileConfig: {
      fileComponentName: platformStack.fileWatcher.componentName,
      fileComponentVersion: platformStack.fileWatcher.componentVersion,
      fileSourceDirectoryName: sourceDir,
      fileDestinationBucketName: platformStack.storage.fileRawBucket.bucketName,
    },
    rdbConfig: {
      rdbComponentName: platformStack.rdbExporter.componentName,
      rdbComponentVersion: platformStack.rdbExporter.componentVersion,
      sourceHost: SOURCE_HOST,
      sourcePort: SOURCE_PORT,
      sourceUser: SOURCE_USER,
      sourcePassword: SOURCE_PASSWORD,
      sourceDatabase: SOURCE_DATABASE,
      destinationBucketName: platformStack.storage.rdbArchiveBucket.bucketName,
      exportInterval: RDB_EXPORT_INTERVAL_SEC,
    },
  }
);

deployStack.addDependency(platformStack);

// NOTE: This stack is only for testing purpose.
// The argument `provisionVirtualDevice` for `IndustrialDataPlatformStack` as true is required.
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
