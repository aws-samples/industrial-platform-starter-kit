import { Construct } from "constructs";
import * as athena from "aws-cdk-lib/aws-athena";
import * as s3 from "aws-cdk-lib/aws-s3";
import { RemovalPolicy, Stack } from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";

export interface AthenaWorkgroupProps {
  name: string;
  description?: string;
  /**
   * Ref: https://docs.aws.amazon.com/ja_jp/athena/latest/ug/workgroups-setting-control-limits-cloudwatch.html
   */
  bytesScannedCutoffPerQuery?: number;
}

export class AthenaWorkgroup extends Construct {
  public readonly workgroupName: string;
  public readonly outputBucket: s3.IBucket;
  public readonly workgroupArn: string;

  constructor(scope: Construct, id: string, props: AthenaWorkgroupProps) {
    super(scope, id);

    // Bucket for Athena query results
    const bucket = new s3.Bucket(this, "ResultBucket", {
      autoDeleteObjects: true,
      removalPolicy: RemovalPolicy.DESTROY,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });
    const wg = new athena.CfnWorkGroup(this, "Wg", {
      name: props.name,
      description: props.description,
      recursiveDeleteOption: true,
      workGroupConfiguration: {
        bytesScannedCutoffPerQuery: props.bytesScannedCutoffPerQuery,
        resultConfiguration: {
          outputLocation: `s3://${bucket.bucketName}`,
        },
      },
    });

    this.workgroupName = wg.name;
    this.outputBucket = bucket;
    this.workgroupArn = `arn:aws:athena:*:${Stack.of(this).account}:workgroup/${
      wg.name
    }`;
  }
}
