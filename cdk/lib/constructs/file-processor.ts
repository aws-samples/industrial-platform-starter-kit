import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as python from "@aws-cdk/aws-lambda-python-alpha";
import * as s3n from "aws-cdk-lib/aws-s3-notifications";
import * as path from "path";
import { Duration } from "aws-cdk-lib";

export enum FileType {
  CSV = "csv",
  JSON = "json",
}

export interface FileProcessorProps {
  sourceBucket: s3.IBucket;
  targetBucket: s3.IBucket;
  fileType: FileType;
}

export class FileProcessor extends Construct {
  constructor(scope: Construct, id: string, props: FileProcessorProps) {
    super(scope, id);

    let handler: lambda.IFunction;
    const handlerDirectory = path.join(
      __dirname,
      `../../lambda/file_processor/${props.fileType}`
    );
    switch (props.fileType) {
      case FileType.CSV:
        handler = new lambda.DockerImageFunction(this, "Handler", {
          code: lambda.DockerImageCode.fromImageAsset(handlerDirectory),
          environment: {
            TARGET_BUCKET: props.targetBucket.bucketName,
          },
          timeout: Duration.minutes(1),
        });
        break;
      case FileType.JSON:
        handler = new python.PythonFunction(this, "Handler", {
          entry: handlerDirectory,
          runtime: lambda.Runtime.PYTHON_3_11,
          environment: {
            TARGET_BUCKET: props.targetBucket.bucketName,
          },
          timeout: Duration.minutes(1),
        });
      default:
        throw new Error(`Unsupported fileType: ${props.fileType}`);
    }

    // Trigger Lambda when a file is uploaded to the source bucket
    props.sourceBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(handler)
    );

    props.sourceBucket.grantRead(handler);
    props.targetBucket.grantWrite(handler);
  }
}
