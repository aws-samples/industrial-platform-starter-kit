import { Construct } from "constructs";
import * as lambda from "@aws-cdk/aws-lambda-python-alpha";
import * as path from "path";
import { IFunction, Runtime } from "aws-cdk-lib/aws-lambda";
import * as glue from "@aws-cdk/aws-glue-alpha";
import { Duration, RemovalPolicy } from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import { AthenaWorkgroup } from "./athena-workgroup";
import * as sfn from "aws-cdk-lib/aws-stepfunctions";
import * as tasks from "aws-cdk-lib/aws-stepfunctions-tasks";
import * as s3 from "aws-cdk-lib/aws-s3";

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
  /**
   * Maximum number of concurrent executions for `INSERT INTO` operation.
   * Please also refer Athena quota.
   * Ref: https://docs.aws.amazon.com/general/latest/gr/athena.html#amazon-athena-limits
   * @default - 5
   */
  maxConcurrency?: number;
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
    const maxConcurrency = props.maxConcurrency ?? 5;

    // Bucket to store temp file to pass tag array from fetcher to processor.
    const tempBucket = new s3.Bucket(this, "TempBucket", {
      autoDeleteObjects: true,
      removalPolicy: RemovalPolicy.DESTROY,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      lifecycleRules: [
        {
          enabled: true,
          expiration: Duration.days(365),
        },
      ],
    });

    // Fetch tags inside current partition
    const tagFetcher = new lambda.PythonFunction(this, "TagFetcher", {
      entry: path.join(__dirname, "../../lambda/opc_processor/tag_fetcher/"),
      runtime: Runtime.PYTHON_3_9,
      environment: {
        DATABASE: props.database.databaseName,
        SOURCE_TABLE: props.sourceTable.tableName,
        WORKGROUP_NAME: workGroup.workgroupName,
        TEMP_BUCKET: tempBucket.bucketName,
      },
      timeout: Duration.minutes(5),
    });
    this.addAthenaPolicyToHandler({
      handler: tagFetcher,
      workGroup: workGroup,
      catalogArn: props.database.catalogArn,
      databaseArn: props.database.databaseArn,
      sourceTableArn: props.sourceTable.tableArn,
      targetTableArn: props.targetTable.tableArn,
    });
    workGroup.outputBucket.grantReadWrite(tagFetcher);
    props.sourceBucket.grantRead(tagFetcher);
    tempBucket.grantReadWrite(tagFetcher);

    // Processor to run `INSERT INTO` to target table.
    const processor = new lambda.PythonFunction(this, "Processor", {
      entry: path.join(__dirname, "../../lambda/opc_processor/processor/"),
      runtime: Runtime.PYTHON_3_9,
      environment: {
        DATABASE: props.database.databaseName,
        SOURCE_TABLE: props.sourceTable.tableName,
        TARGET_TABLE: props.targetTable.tableName,
        WORKGROUP_NAME: workGroup.workgroupName,
        TEMP_BUCKET: tempBucket.bucketName,
      },
      timeout: Duration.minutes(15),
    });
    this.addAthenaPolicyToHandler({
      handler: processor,
      workGroup: workGroup,
      catalogArn: props.database.catalogArn,
      databaseArn: props.database.databaseArn,
      sourceTableArn: props.sourceTable.tableArn,
      targetTableArn: props.targetTable.tableArn,
    });
    workGroup.outputBucket.grantReadWrite(processor);
    props.sourceBucket.grantRead(processor);
    props.targetBucket.grantWrite(processor);
    tempBucket.grantReadWrite(processor);

    const tagFetcherTask = new tasks.LambdaInvoke(this, "TagFetcherTask", {
      lambdaFunction: tagFetcher,
      outputPath: "$.Payload",
    });

    // NOTE: Athena insert query is limited to 100 partitions.
    // To avoid this issue, split tag list to chunks and then pass to map state of state machine.
    const mapState = new sfn.Map(this, "MapState", {
      itemsPath: "$.s3Keys",
      parameters: {
        "s3Key.$": "$$.Map.Item.Value",
        "datehour.$": "$.datehour",
      },
      resultPath: "$.Result",
      maxConcurrency: maxConcurrency,
    });

    const processorTask = new tasks.LambdaInvoke(this, "ProcessorTask", {
      lambdaFunction: processor,
    });
    mapState.iterator(processorTask);

    const definition = tagFetcherTask.next(mapState);
    const stateMachine = new sfn.StateMachine(this, "StateMachine", {
      definition,
    });

    // Run the lambda handler periodically
    new events.Rule(this, "ScheduleRule", {
      schedule: schedule,
      targets: [new targets.SfnStateMachine(stateMachine)],
    });
  }

  private addAthenaPolicyToHandler(props: {
    handler: IFunction;
    workGroup: AthenaWorkgroup;
    catalogArn: string;
    databaseArn: string;
    sourceTableArn: string;
    targetTableArn: string;
  }) {
    const {
      handler,
      workGroup,
      catalogArn,
      databaseArn,
      sourceTableArn,
      targetTableArn,
    } = props;
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
        resources: [catalogArn, databaseArn],
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
        resources: [catalogArn, databaseArn, sourceTableArn, targetTableArn],
      })
    );
  }
}
