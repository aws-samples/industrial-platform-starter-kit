import { Construct } from "constructs";
import * as quicksight from "aws-cdk-lib/aws-quicksight";
import { Stack } from "aws-cdk-lib";

export enum TagType {
  INT = "integervalue",
  DOUBLE = "doublevalue",
  STRING = "stringvalue",
  BOOLEAN = "booleanvalue",
}

export interface QuicksightDatasetOpcProps {
  quicksightUserName: string;
  dataSourceArn: string;
  dataSetName: string;
  databaseName: string;
  tableName: string;
  timezoneOffset: number;
  tagName: string;
  tagType: TagType;
}

export class QuicksightDatasetOpc extends Construct {
  public readonly datasetId: string;
  public readonly datasetArn: string;

  constructor(scope: Construct, id: string, props: QuicksightDatasetOpcProps) {
    super(scope, id);

    const query = `SELECT
    "value"."${props.tagType}"
    ,"timestamp"  + interval '${props.timezoneOffset}' hour as "timestamp"
    , datehour
    , tag
FROM "${props.databaseName}"."${props.tableName}"
WHERE datehour BETWEEN
date_format(at_timezone(<<$start>>, INTERVAL '-${props.timezoneOffset}' HOUR), '%Y/%m/%d/%H')
    AND date_format(at_timezone(<<$end>>, INTERVAL '-${props.timezoneOffset}' HOUR), '%Y/%m/%d/%H')
  AND tag IN ('${props.tagName}')
  AND timestamp BETWEEN
  at_timezone(<<$start>>, INTERVAL '-${props.timezoneOffset}' HOUR)
      AND at_timezone(<<$end>>, INTERVAL '-${props.timezoneOffset}' HOUR)
ORDER BY timestamp`;

    let valueColumn;
    switch (props.tagType) {
      case TagType.INT:
        valueColumn = {
          name: "integervalue",
          type: "INTEGER",
        };
        break;
      case TagType.DOUBLE:
        valueColumn = {
          name: "doublevalue",
          type: "DECIMAL",
        };
        break;
      case TagType.STRING:
        valueColumn = {
          name: "stringvalue",
          type: "STRING",
        };
        break;
      case TagType.BOOLEAN:
        valueColumn = {
          name: "booleanvalue",
          type: "BOOLEAN",
        };
        break;
    }

    const dataSet = new quicksight.CfnDataSet(this, "DataSet", {
      awsAccountId: Stack.of(this).account,
      dataSetId: props.dataSetName,
      name: props.dataSetName,
      physicalTableMap: {
        [id]: {
          customSql: {
            dataSourceArn: props.dataSourceArn,
            name: id,
            sqlQuery: query,
            columns: [
              valueColumn,
              {
                name: "timestamp",
                type: "DATETIME",
              },
              {
                name: "datehour",
                type: "STRING",
              },
              {
                name: "tag",
                type: "STRING",
              },
            ],
          },
        },
      },
      logicalTableMap: {
        quickSightAthenaDataSetPhysicalTableMap: {
          alias: id,
          dataTransforms: [
            {
              projectOperation: {
                projectedColumns: [
                  props.tagType,
                  "timestamp",
                  "datehour",
                  "tag",
                ],
              },
            },
          ],
          source: {
            physicalTableId: id,
          },
        },
      },
      datasetParameters: [
        {
          dateTimeDatasetParameter: {
            id: "start",
            name: "start",
            valueType: "SINGLE_VALUED",
            timeGranularity: "HOUR",
            defaultValues: {
              staticValues: ["2023-08-15T00:00:00Z"],
            },
          },
        },
        {
          dateTimeDatasetParameter: {
            id: "end",
            name: "end",
            valueType: "SINGLE_VALUED",
            timeGranularity: "HOUR",
            defaultValues: {
              staticValues: ["2023-08-15T23:59:00Z"],
            },
          },
        },
      ],
      importMode: "DIRECT_QUERY",
      permissions: [
        {
          principal: `arn:aws:quicksight:${Stack.of(this).region}:${
            Stack.of(this).account
          }:user/default/${props.quicksightUserName}`,
          actions: [
            "quicksight:PassDataSet",
            "quicksight:DescribeIngestion",
            "quicksight:CreateIngestion",
            "quicksight:UpdateDataSet",
            "quicksight:DeleteDataSet",
            "quicksight:DescribeDataSet",
            "quicksight:CancelIngestion",
            "quicksight:DescribeDataSetPermissions",
            "quicksight:ListIngestions",
            "quicksight:UpdateDataSetPermissions",
          ],
        },
      ],
    });

    this.datasetId = props.dataSetName;
    this.datasetArn = dataSet.attrArn;
  }
}
