import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { Storage } from "./constructs/storage";
import { Datacatalog } from "./constructs/datacatalog";
import { OpcProcessor } from "./constructs/opc-processor";
import { FileProcessor, FileType } from "./constructs/file-processor";
import { GreengrassBootstrap } from "./constructs/greengrass-bootstrap";
import { GdkBucket } from "./constructs/gdk-publish/gdk-bucket";
import * as path from "path";
import { BlockPublicAccess } from "aws-cdk-lib/aws-s3";

import {
  PythonGdkPublish,
  PythonVersion,
} from "./constructs/gdk-publish/python-gdk-publish";
import { Policy, PolicyStatement } from "aws-cdk-lib/aws-iam";
import { GdkPublish } from "./constructs/gdk-publish/gdk-publish";
import { SitewiseGateway } from "./constructs/sitewise-gateway";
import { VirtualDevice } from "./constructs/virtual-device";
import { Schedule } from "aws-cdk-lib/aws-events";

interface IndustialDataPlatformStackProps extends cdk.StackProps {
  thingName: string;
  opcuaEndpointUri: string;
  provisionVirtualDevice?: boolean;
}

export class IndustialDataPlatformStack extends cdk.Stack {
  public readonly opcArchiver: GdkPublish;
  public readonly fileWatcher: GdkPublish;
  public readonly installPolicy: Policy;
  public readonly storage: Storage;
  public readonly datacatalog: Datacatalog;

  constructor(
    scope: Construct,
    id: string,
    props: IndustialDataPlatformStackProps
  ) {
    super(scope, id, props);

    const storage = new Storage(this, "Storage");
    const datacatalog = new Datacatalog(this, "Datacatalog", {
      storage: storage,
    });

    {
      const componentBucket = new GdkBucket(this, "ComponentBucket", {
        gdkConfigPath: path.join(
          __dirname,
          "../../components/file-watcher/gdk-config.json"
        ),
        blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        autoDeleteObjects: true,
        enforceSSL: true,
      });

      const opcArchiver = new PythonGdkPublish(this, "OpcArchiver", {
        componentBucket: componentBucket,
        asset: { path: path.join(__dirname, "../../components/opc-archiver") },
        pythonVersion: PythonVersion.PYTHON_3_9,
      });

      const fileWatcher = new PythonGdkPublish(this, "FileWatcher", {
        componentBucket: componentBucket,
        asset: { path: path.join(__dirname, "../../components/file-watcher") },
        pythonVersion: PythonVersion.PYTHON_3_9,
      });

      const bootstrap = new GreengrassBootstrap(this, "GreengrassBootstrap", {
        componentBuckets: [componentBucket],
        thingName: props.thingName,
      });

      const sitewise = new SitewiseGateway(this, "SitewiseGateway", {
        gatewayName: "sitewise-gateway",
        coreDeviceThingName: bootstrap.thingName,
        endpointUri: props.opcuaEndpointUri,
      });

      // Allow greengrass to send to IoT SiteWise
      bootstrap.addToTesRolePolicy(
        new PolicyStatement({
          actions: ["iotsitewise:BatchPutAssetPropertyValue"],
          resources: ["*"],
        })
      );
      storage.opcRawBucket.grantWrite(bootstrap.tesRole);
      storage.fileRawBucket.grantWrite(bootstrap.tesRole);

      this.opcArchiver = opcArchiver;
      this.fileWatcher = fileWatcher;
      this.installPolicy = bootstrap.installPolicy;

      if (props.provisionVirtualDevice) {
        new VirtualDevice(this, "VirtualDevice", {
          installPolicy: bootstrap.installPolicy,
        });
      }
    }

    {
      const opcProcessor = new OpcProcessor(this, "OpcProcessor", {
        database: datacatalog.database,
        sourceTable: datacatalog.opcRawTable,
        sourceBucket: storage.opcRawBucket,
        targetTable: datacatalog.opcProcessedTable,
        targetBucket: storage.opcProcessedBucket,
        // Run every hour at the 10-minute to account for edge delays
        schedule: Schedule.cron({ minute: "10" }),
      });

      const csvFileProcessor = new FileProcessor(this, "CsvFileProcessor", {
        sourceBucket: storage.fileRawBucket,
        targetBucket: storage.fileProcessedBucket,
        fileType: FileType.CSV,
      });

      // const jsonFileProcessor = new FileProcessor(this, "JsonFileProcessor", {
      //   sourceBucket: storage.fileRawBucket,
      //   targetBucket: storage.fileProcessedBucket,
      //   fileType: FileType.JSON,
      // });
    }

    this.storage = storage;
    this.datacatalog = datacatalog;
  }
}
