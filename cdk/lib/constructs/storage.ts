import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3";
import { Duration, RemovalPolicy } from "aws-cdk-lib";

export interface StorageProps {}

export class Storage extends Construct {
  public readonly opcRawBucket: s3.IBucket;
  public readonly opcProcessedBucket: s3.IBucket;
  public readonly fileRawBucket: s3.IBucket;
  public readonly fileProcessedBucket: s3.IBucket;

  constructor(scope: Construct, id: string, props?: StorageProps) {
    super(scope, id);

    // Define lifecycle rule for opc data bucket.
    // Ref: https://aws.amazon.com/s3/storage-classes/
    const opcLifecycleRule: s3.LifecycleRule = {
      enabled: true,
      transitions: [
        {
          storageClass: s3.StorageClass.INFREQUENT_ACCESS,
          transitionAfter: Duration.days(30 * 3),
        },
        {
          storageClass: s3.StorageClass.GLACIER_INSTANT_RETRIEVAL,
          transitionAfter: Duration.days(365),
        },
        {
          storageClass: s3.StorageClass.DEEP_ARCHIVE,
          transitionAfter: Duration.days(365 * 20),
        },
      ],
    };

    const opcRawBucket = new s3.Bucket(this, "opcRawBucket", {
      autoDeleteObjects: true,
      removalPolicy: RemovalPolicy.DESTROY,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      lifecycleRules: [opcLifecycleRule],
    });

    const opcProcessedBucket = new s3.Bucket(this, "opcProcessedBucket", {
      autoDeleteObjects: true,
      removalPolicy: RemovalPolicy.DESTROY,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      lifecycleRules: [opcLifecycleRule],
    });

    const fileRawBucket = new s3.Bucket(this, "fileRawBucket", {
      autoDeleteObjects: true,
      removalPolicy: RemovalPolicy.DESTROY,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });

    const fileProcessedBucket = new s3.Bucket(this, "fileProcessedBucket", {
      autoDeleteObjects: true,
      removalPolicy: RemovalPolicy.DESTROY,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });

    this.opcRawBucket = opcRawBucket;
    this.opcProcessedBucket = opcProcessedBucket;
    this.fileRawBucket = fileRawBucket;
    this.fileProcessedBucket = fileProcessedBucket;
  }
}
