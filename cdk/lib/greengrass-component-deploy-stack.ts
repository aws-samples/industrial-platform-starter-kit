import { StackProps, Stack } from "aws-cdk-lib";
import { Construct } from "constructs";
import { IBucket } from "aws-cdk-lib/aws-s3";
import {
  Components,
  GreengrassComponentDeploy,
} from "./constructs/greengrass-component-deploy";

interface OpcConfigProps {
  opcComponentName: string;
  opcComponentVersion: string;
  opcDestinationBucketName: string;
}

interface FileConfigProps {
  fileComponentName: string;
  fileComponentVersion: string;
  fileSourceDirectoryName: string;
  fileDestinationBucketName: string;
}

interface RdbConfigProps {
  rdbComponentName: string;
  rdbComponentVersion: string;
  sourceHost: string;
  sourcePort: number;
  sourceUser: string;
  sourcePassword: string;
  sourceDatabase: string;
  exportInterval: number;
  destinationBucketName: string;
}
interface GreengrassComponentDeployStackProps extends StackProps {
  thingName: string;
  deploymentName: string;
  opcConfig: OpcConfigProps;
  fileConfig: FileConfigProps;
  rdbConfig: RdbConfigProps;
}

export class GreengrassComponentDeployStack extends Stack {
  constructor(
    scope: Construct,
    id: string,
    props: GreengrassComponentDeployStackProps
  ) {
    super(scope, id, props);

    const components: Components[] = [
      {
        componentName: "aws.greengrass.Cli",
        componentVersion: "2.11.1",
        merge: {},
      },
      {
        componentName: "aws.greengrass.Nucleus",
        componentVersion: "2.11.2",
        merge: {},
      },
      {
        componentName: "aws.iot.SiteWiseEdgeCollectorOpcua",
        componentVersion: "2.4.0",
        merge: {},
      },
      // OPC UA Archiver
      {
        componentName: props.opcConfig.opcComponentName,
        componentVersion: props.opcConfig.opcComponentVersion,
        merge: {
          Bucket: props.opcConfig.opcDestinationBucketName,
        },
      },
      // File Watcher
      {
        componentName: props.fileConfig.fileComponentName,
        componentVersion: props.fileConfig.fileComponentVersion,
        merge: {
          Bucket: props.fileConfig.fileDestinationBucketName,
          TargetDir: props.fileConfig.fileSourceDirectoryName,
        },
      },
      // RDB Archiver
      {
        componentName: props.rdbConfig.rdbComponentName,
        componentVersion: props.rdbConfig.rdbComponentVersion,
        merge: {
          DstBucketName: props.rdbConfig.destinationBucketName,
          SrcHost: props.rdbConfig.sourceHost,
          SrcPort: props.rdbConfig.sourcePort,
          SrcUser: props.rdbConfig.sourceUser,
          SrcPassword: props.rdbConfig.sourcePassword,
          SrcDatabase: props.rdbConfig.sourceDatabase,
          RunIntervalSec: props.rdbConfig.exportInterval,
        },
      },
    ];

    const deploy = new GreengrassComponentDeploy(
      this,
      "GreengrassComponentDeploy",
      {
        thingName: props.thingName,
        deploymentName: props.deploymentName,
        components: components,
      }
    );
  }
}
