import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as quicksight from "aws-cdk-lib/aws-quicksight";
import {
  QuicksightDatasetOpc,
  TagType,
} from "./constructs/demo/quicksight-dataset-opc";
import { QuicksightDatasetFile } from "./constructs/demo/quicksight-dataset-file";

interface QuicksightStackProps extends cdk.StackProps {
  quicksightUserName: string;
  dataSourceName: string;
  databaseName: string;
  opcTableName: string;
  fileTableName: string;
}

export class QuicksightStack extends cdk.Stack {
  /**
   * Quicksight Demo Stack
   * NOTE: This stack requires dummy OPC-UA server. Be sure that virtual device is running.
   */
  constructor(scope: Construct, id: string, props: QuicksightStackProps) {
    super(scope, id, props);

    const dataSource = new quicksight.CfnDataSource(this, "DataSource", {
      awsAccountId: cdk.Stack.of(this).account,
      dataSourceId: props.dataSourceName,
      name: props.dataSourceName,
      type: "ATHENA",
      dataSourceParameters: {
        athenaParameters: {
          workGroup: "primary",
        },
      },
    });

    // Dataset for tag2 (double value)
    const datasetTag2 = new QuicksightDatasetOpc(this, "DatasetTag2", {
      quicksightUserName: props.quicksightUserName,
      dataSourceArn: dataSource.attrArn,
      dataSetName: "DatasetTag2",
      databaseName: props.databaseName,
      tableName: props.opcTableName,
      // NOTE: This is for JST
      timezoneOffset: 9,
      tagName: "/root/tag2",
      tagType: TagType.DOUBLE,
    });

    // Dataset for production file
    const datasetFile = new QuicksightDatasetFile(this, "DatasetFile", {
      quicksightUserName: props.quicksightUserName,
      dataSourceArn: dataSource.attrArn,
      dataSetName: "DatasetProductionRecord",
      databaseName: props.databaseName,
      tableName: props.fileTableName,
    });
  }
}
