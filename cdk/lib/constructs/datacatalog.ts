import { Construct } from "constructs";
import * as glue from "@aws-cdk/aws-glue-alpha";
import { aws_glue } from "aws-cdk-lib";
import { Storage } from "./storage";

export interface DatacatalogProps {
  storage: Storage;
}

export class Datacatalog extends Construct {
  public readonly database: glue.IDatabase;
  public readonly opcRawTable: glue.ITable;
  public readonly opcProcessedTable: glue.ITable;
  public readonly fileRawTable: glue.ITable;
  public readonly fileProcessedTable: glue.ITable;

  constructor(scope: Construct, id: string, props: DatacatalogProps) {
    super(scope, id);

    const IndustrialPlatformDatabase = new glue.Database(
      this,
      "IndustrialPlatformDatabase",
      {
        databaseName: "industrial_platform",
      }
    );

    // Glue table to store data from greengrass.
    const opcRawTable = new glue.Table(this, "OpcRawTable", {
      database: IndustrialPlatformDatabase,
      bucket: props.storage.opcRawBucket,
      tableName: "opc_raw",
      partitionKeys: [
        {
          name: "datehour",
          type: glue.Schema.STRING,
        },
      ],
      columns: [
        {
          name: "propertyalias",
          type: glue.Schema.STRING,
        },
        {
          name: "propertyvalues",
          type: glue.Schema.array(
            glue.Schema.struct([
              {
                name: "value",
                type: glue.Schema.struct([
                  {
                    name: "integervalue",
                    type: glue.Schema.INTEGER,
                  },
                  {
                    name: "doublevalue",
                    type: glue.Schema.DOUBLE,
                  },
                  {
                    name: "stringvalue",
                    type: glue.Schema.STRING,
                  },
                  {
                    name: "booleanvalue",
                    type: glue.Schema.BOOLEAN,
                  },
                ]),
              },
              {
                name: "timestamp",
                type: glue.Schema.struct([
                  {
                    name: "timeinseconds",
                    type: glue.Schema.DOUBLE,
                  },
                  {
                    name: "offsetinnanos",
                    type: glue.Schema.INTEGER,
                  },
                ]),
              },
              { name: "quality", type: glue.Schema.STRING },
            ])
          ),
        },
      ],
      dataFormat: glue.DataFormat.JSON,
      compressed: true,
    });
    // Add partition projection using escape hatch
    // Ref: https://docs.aws.amazon.com/cdk/v2/guide/cfn_layer.html
    const cfnopcRawTable = opcRawTable.node.defaultChild as aws_glue.CfnTable;
    cfnopcRawTable.addPropertyOverride("TableInput.Parameters", {
      "projection.enabled": true,
      "projection.datehour.type": "date",
      "projection.datehour.range": "2023/01/01/00,NOW",
      "projection.datehour.format": "yyyy/MM/dd/HH",
      "projection.datehour.interval": 1,
      "projection.datehour.interval.unit": "HOURS",
      "storage.location.template":
        `s3://${props.storage.opcRawBucket.bucketName}/` + "${datehour}/",
    });

    // Glue table for processed opc data.
    const opcProcessedTable = new glue.Table(this, "OpcProcessedTable", {
      database: IndustrialPlatformDatabase,
      bucket: props.storage.opcProcessedBucket,
      tableName: "opc_processed",
      partitionKeys: [
        {
          name: "datehour",
          type: glue.Schema.STRING,
        },
        {
          name: "tag",
          type: glue.Schema.STRING,
        },
      ],
      columns: [
        {
          name: "value",
          type: glue.Schema.struct([
            {
              name: "integervalue",
              type: glue.Schema.INTEGER,
            },
            {
              name: "doublevalue",
              type: glue.Schema.DOUBLE,
            },
            {
              name: "stringvalue",
              type: glue.Schema.STRING,
            },
            {
              name: "booleanvalue",
              type: glue.Schema.BOOLEAN,
            },
          ]),
        },
        {
          name: "timestamp",
          type: glue.Schema.TIMESTAMP,
        },
      ],
      dataFormat: glue.DataFormat.PARQUET,
      compressed: true,
    });
    const cfnopcProcessedTable = opcProcessedTable.node
      .defaultChild as aws_glue.CfnTable;
    cfnopcProcessedTable.addPropertyOverride("TableInput.Parameters", {
      "projection.enabled": true,
      "projection.datehour.type": "date",
      "projection.datehour.range": "2023/01/01/00,NOW",
      "projection.datehour.format": "yyyy/MM/dd/HH",
      "projection.datehour.interval": 1,
      "projection.datehour.interval.unit": "HOURS",
      "projection.tag.type": "injected",
      "storage.location.template":
        `s3://${props.storage.opcProcessedBucket.bucketName}/` +
        "${tag}/${datehour}/",
    });

    // Define glue table to store file data.
    // In this example, we assume the file is from inspector with csv format.
    const productionTable = new glue.Table(this, "ProductionTable", {
      database: IndustrialPlatformDatabase,
      tableName: "production",
      partitionKeys: [
        {
          name: "date",
          type: glue.Schema.STRING,
        },
      ],
      columns: [
        { name: "BatchID", type: glue.Schema.STRING },
        { name: "ProductName", type: glue.Schema.STRING },
        { name: "StartTime", type: glue.Schema.STRING },
        { name: "EndTime", type: glue.Schema.STRING },
      ],
      dataFormat: glue.DataFormat.CSV,
      // dataFormat: glue.DataFormat.JSON,
      compressed: false,
      bucket: props.storage.fileProcessedBucket,
    });
    const cfnProductionTable = productionTable.node
      .defaultChild as aws_glue.CfnTable;
    cfnProductionTable.addPropertyOverride("TableInput.Parameters", {
      "skip.header.line.count": "1", // ignore header column
      "projection.enabled": true,
      "projection.date.type": "date",
      "projection.date.range": "2023/01/01,NOW",
      "projection.date.format": "yyyy/MM/dd",
      "projection.date.interval": 1,
      "projection.date.interval.unit": "DAYS",
      "storage.location.template":
        `s3://${props.storage.fileProcessedBucket.bucketName}/` + "${date}/",
    });

    // Define glue table to store rdb data.
    // NOTE: This is example implementation for dummy database table.
    // Please edit to match your database table schema.
    const gradeMasterTable = new glue.Table(this, "GradeMasterTable", {
      database: IndustrialPlatformDatabase,
      tableName: "grade_master",
      columns: [
        { name: "grade_id", type: glue.Schema.STRING },
        { name: "grade_name", type: glue.Schema.STRING },
      ],
      dataFormat: glue.DataFormat.CSV,
      compressed: false,
      bucket: props.storage.rdbArchiveBucket,
      s3Prefix: "prototype/GradeMaster/",
    });
    const cfnGradeMasterTable = gradeMasterTable.node
      .defaultChild as aws_glue.CfnTable;
    cfnGradeMasterTable.addPropertyOverride("TableInput.Parameters", {
      "skip.header.line.count": "1", // ignore header column
      "projection.enabled": true,
      "storage.location.template": `s3://${props.storage.rdbArchiveBucket.bucketName}/prototype/GradeMaster/`,
    });

    const batchProductionRecordTable = new glue.Table(
      this,
      "BatchProductionRecordTable",
      {
        database: IndustrialPlatformDatabase,
        tableName: "batch_production_record",
        columns: [
          { name: "batch_id", type: glue.Schema.STRING },
          { name: "grade_id", type: glue.Schema.STRING },
          { name: "production_number", type: glue.Schema.INTEGER },
          { name: "production_timestamp", type: glue.Schema.STRING },
        ],
        partitionKeys: [
          {
            name: "date",
            type: glue.Schema.STRING,
          },
        ],
        dataFormat: glue.DataFormat.CSV,
        compressed: false,
        bucket: props.storage.rdbArchiveBucket,
        s3Prefix: "prototype/BatchProductionRecord/",
      }
    );
    const cfnBatchProductionRecordTable = batchProductionRecordTable.node
      .defaultChild as aws_glue.CfnTable;
    cfnBatchProductionRecordTable.addPropertyOverride("TableInput.Parameters", {
      "skip.header.line.count": "1", // ignore header column
      "projection.enabled": true,
      "projection.date.type": "date",
      "projection.date.range": "2023/01/01,NOW",
      "projection.date.format": "yyyy/MM/dd",
      "projection.date.interval": 1,
      "projection.date.interval.unit": "DAYS",
      "storage.location.template":
        `s3://${props.storage.rdbArchiveBucket.bucketName}/prototype/BatchProductionRecord/` +
        "${date}/",
    });

    this.database = IndustrialPlatformDatabase;
    this.opcRawTable = opcRawTable;
    this.opcProcessedTable = opcProcessedTable;
    this.fileRawTable = productionTable;
    this.fileProcessedTable = productionTable;
  }
}
