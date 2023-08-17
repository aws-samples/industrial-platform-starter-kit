import { Construct } from "constructs";
import * as lambda from "@aws-cdk/aws-lambda-python-alpha";
import * as path from "path";
import { IFunction, Runtime } from "aws-cdk-lib/aws-lambda";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as glue from "@aws-cdk/aws-glue-alpha";
import { Duration } from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import { AthenaWorkgroup } from "./athena-workgroup";

export interface OpcProcessorProps {
  database: glue.IDatabase;
  sourceTable: glue.ITable;
  sourceBucket: s3.IBucket;
  targetTable: glue.ITable;
  targetBucket: s3.IBucket;
  /**
   * Athena workgroup to use for the lambda handler.
   * @default - new workgroup will be created
   */
  workGroup?: AthenaWorkgroup;
  /**
   * Schedule for the lambda handler.
   * @default - rate(1 hour)
   */
  schedule?: events.Schedule;
}

export class OpcProcessor extends Construct {
  /**
   * Constructor to convert raw OPC data.
   */
  public readonly handler: IFunction;
  constructor(scope: Construct, id: string, props: OpcProcessorProps) {
    super(scope, id);

    const workGroup =
      props.workGroup ??
      new AthenaWorkgroup(this, "WorkGroup", {
        name: "opc-processor-workgroup",
      });
    const schedule =
      props.schedule ?? events.Schedule.expression("rate(1 hour)");

    const handler = new lambda.PythonFunction(this, "Handler", {
      entry: path.join(__dirname, "../../lambda/opc_processor/"),
      runtime: Runtime.PYTHON_3_9,
      environment: {
        DATABASE: props.database.databaseName,
        SOURCE_TABLE: props.sourceTable.tableName,
        TARGET_TABLE: props.targetTable.tableName,
        WORKGROUP_NAME: workGroup.workgroupName,
      },
      timeout: Duration.minutes(15),
    });
    workGroup.outputBucket.grantReadWrite(handler);
    props.sourceBucket.grantRead(handler);
    props.targetBucket.grantWrite(handler);

    handler.role?.addToPrincipalPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "athena:GetWorkGroup",
          "athena:StartQueryExecution",
          "athena:StopQueryExecution",
          "athena:GetQueryExecution",
          "athena:GetQueryResults",
          "athena:GetDataCatalog",
        ],
        resources: [workGroup.workgroupArn],
      })
    );
    handler.role?.addToPrincipalPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["glue:GetDatabase", "glue:GetDatabases"],
        resources: [props.database.catalogArn, props.database.databaseArn],
      })
    );
    handler.role?.addToPrincipalPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "glue:GetDatabase",
          "glue:GetTable",
          "glue:GetTables",
          "glue:GetPartition",
          "glue:GetPartitions",
        ],
        resources: [
          props.database.catalogArn,
          props.database.databaseArn,
          props.sourceTable.tableArn,
          props.targetTable.tableArn,
        ],
      })
    );

    // Run the lambda handler periodically
    new events.Rule(this, "ScheduleRule", {
      schedule: schedule,
      targets: [new targets.LambdaFunction(handler)],
    });

    this.handler = handler;
  }
}
