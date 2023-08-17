import { Construct } from "constructs";
import * as quicksight from "aws-cdk-lib/aws-quicksight";
import { Stack } from "aws-cdk-lib";

export interface QuicksightDatasetFileProps {
  quicksightUserName: string;
  dataSourceArn: string;
  dataSetName: string;
  databaseName: string;
  tableName: string;
}

export class QuicksightDatasetFile extends Construct {
  constructor(scope: Construct, id: string, props: QuicksightDatasetFileProps) {
    super(scope, id);

    const query = `select * from "${props.databaseName}"."${props.tableName}" where date=date_format(<<$date>>, '%Y/%m/%d')`;

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
              {
                name: "batchid",
                type: "STRING",
              },
              {
                name: "productname",
                type: "STRING",
              },
              {
                name: "starttime",
                type: "STRING",
              },
              {
                name: "endtime",
                type: "STRING",
              },
              {
                name: "date",
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
                  "batchid",
                  "productname",
                  "starttime",
                  "endtime",
                  "date",
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
            id: "date",
            name: "date",
            valueType: "SINGLE_VALUED",
            timeGranularity: "DAY",
            defaultValues: {
              staticValues: ["2023-08-15T00:00:00Z"],
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
  }
}
