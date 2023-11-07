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
import * as python from "@aws-cdk/aws-lambda-python-alpha";

import {
  PythonGdkPublish,
  PythonVersion,
} from "./constructs/gdk-publish/python-gdk-publish";
import { Policy, PolicyStatement } from "aws-cdk-lib/aws-iam";
import { GdkPublish } from "./constructs/gdk-publish/gdk-publish";
import { SitewiseGateway } from "./constructs/sitewise-gateway";
import { VirtualDevice } from "./constructs/demo/virtual-device";
import { Schedule } from "aws-cdk-lib/aws-events";
import { Network } from "./constructs/network";
import { Postgres } from "./constructs/demo/postgres";
import {
  JavaGdkPublish,
  JavaVersion,
} from "./constructs/gdk-publish/java-gdk-publish";
import { Runtime } from "aws-cdk-lib/aws-lambda";

interface IndustrialDataPlatformStackProps extends cdk.StackProps {
  gatewayNames: string[];
  opcuaEndpointUri: string;
  provisionVirtualDevice?: boolean;
  provisionDummyDatabase?: boolean;
}

export class IndustrialDataPlatformStack extends cdk.Stack {
  public readonly opcArchiver: GdkPublish;
  public readonly fileWatcher: GdkPublish;
  public readonly rdbExporter: GdkPublish;
  public readonly storage: Storage;
  public readonly datacatalog: Datacatalog;

  constructor(
    scope: Construct,
    id: string,
    props: IndustrialDataPlatformStackProps
  ) {
    super(scope, id, props);

    const storage = new Storage(this, "Storage");
    const datacatalog = new Datacatalog(this, "Datacatalog", {
      storage: storage,
    });

    {
      /**
       * Edge related resources
       */
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

      // Register OpcArchiver component
      const opcArchiver = new PythonGdkPublish(this, "OpcArchiver", {
        componentBucket: componentBucket,
        asset: { path: path.join(__dirname, "../../components/opc-archiver") },
        pythonVersion: PythonVersion.PYTHON_3_9,
      });

      // Register FileWatcher component
      const fileWatcher = new PythonGdkPublish(this, "FileWatcher", {
        componentBucket: componentBucket,
        asset: { path: path.join(__dirname, "../../components/file-watcher") },
        pythonVersion: PythonVersion.PYTHON_3_9,
      });

      // Register RdbExporter component
      const rdbExporter = new JavaGdkPublish(this, "RdbExporter", {
        componentBucket: componentBucket,
        asset: { path: path.join(__dirname, "../../components/rdb-exporter") },
        javaVersion: JavaVersion.CORRETTO8,
      });

      const bootstrap = new GreengrassBootstrap(this, "GreengrassBootstrap", {
        componentBuckets: [componentBucket],
        gatewayNames: props.gatewayNames,
      });

      props.gatewayNames.forEach((gatewayName) => {
        new SitewiseGateway(this, `SitewiseGateway-${gatewayName}`, {
          gatewayName: gatewayName,
          coreDeviceThingName: gatewayName,
          endpointUri: props.opcuaEndpointUri,
        });
      });

      // Allow greengrass core device to send to IoT SiteWise
      bootstrap.addToTesRolePolicy(
        new PolicyStatement({
          actions: ["iotsitewise:BatchPutAssetPropertyValue"],
          resources: ["*"],
        })
      );
      // Allow greengrass device to send to buckets
      storage.opcRawBucket.grantWrite(bootstrap.tesRole);
      storage.fileRawBucket.grantWrite(bootstrap.tesRole);
      storage.rdbArchiveBucket.grantReadWrite(bootstrap.tesRole);

      this.opcArchiver = opcArchiver;
      this.fileWatcher = fileWatcher;
      this.rdbExporter = rdbExporter;

      // Provision virtual resources
      let network;
      let virtualDevices: VirtualDevice[] = [];
      if (props.provisionVirtualDevice || props.provisionDummyDatabase) {
        network = new Network(this, "Network", {});
      }

      if (props.provisionVirtualDevice) {
        // create virtual device
        const virtualDevices = props.gatewayNames.map((gatewayName) => {
          return new VirtualDevice(this, `VirtualDevice-${gatewayName}`, {
            deviceName: gatewayName,
            installPolicy: bootstrap.installPolicy,
            network: network!,
          });
        });
      }

      if (props.provisionDummyDatabase) {
        const database = new Postgres(this, "DummyDatabase", {
          network: network!,
        });
        // Ingest dummy data to database using Lambda
        const ingestor = new python.PythonFunction(this, "DummyDataIngestor", {
          entry: path.join(__dirname, "../lambda/dummy_data_ingestor"),
          vpc: network!.vpc,
          runtime: Runtime.PYTHON_3_11,
          timeout: cdk.Duration.minutes(1),
          environment: {
            DB_NAME: database.databaseName,
            DB_USER: database.secret
              .secretValueFromJson("username")
              .unsafeUnwrap()
              .toString(),
            DB_PASSWORD: database.secret
              .secretValueFromJson("password")
              .unsafeUnwrap()
              .toString(),
            DB_HOST: database.hostname,
            DB_PORT: database.port.toString(),
          },
        });

        if (props.provisionVirtualDevice) {
          virtualDevices.forEach((virtualDevice) => {
            virtualDevice?.instance.connections!.securityGroups.forEach(
              (securityGroup) => {
                database.allowInboundAccess(securityGroup);
              }
            );
          });
        }

        ingestor.connections.securityGroups.forEach((securityGroup) => {
          database.allowInboundAccess(securityGroup);
        });
      }
    }

    {
      /**
       * Cloud related resources
       */
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
