import { StackProps, Stack } from "aws-cdk-lib";
import { Construct } from "constructs";
import { IBucket } from "aws-cdk-lib/aws-s3";
import {
  Components,
  GreengrassComponentDeploy,
} from "./constructs/greengrass-component-deploy";

interface GreengrassComponentDeployStackProps extends StackProps {
  thingName: string;
  deploymentName: string;
  opcComponentName: string;
  opcComponentVersion: string;
  opcDestinationBucketName: string;
  fileComponentName: string;
  fileComponentVersion: string;
  fileSourceDirectoryName: string;
  fileDestinationBucketName: string;
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
        // merge: {},
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
      {
        componentName: props.opcComponentName,
        componentVersion: props.opcComponentVersion,
        merge: {
          Bucket: props.opcDestinationBucketName,
        },
      },
      {
        componentName: props.fileComponentName,
        componentVersion: props.fileComponentVersion,
        merge: {
          Bucket: props.fileDestinationBucketName,
          TargetDir: props.fileSourceDirectoryName,
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
