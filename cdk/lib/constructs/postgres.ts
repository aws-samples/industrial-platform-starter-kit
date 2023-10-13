import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as rds from "aws-cdk-lib/aws-rds";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";
import { CfnOutput, RemovalPolicy, Token } from "aws-cdk-lib";
import { Network } from "./network";

export interface PostgresProps {
  network: Network;
}

export class Postgres extends Construct {
  readonly instance: rds.IDatabaseInstance;
  readonly secret: secretsmanager.ISecret;
  readonly hostname: string;
  readonly port: number;
  readonly databaseName: string;
  private readonly securityGroup: ec2.ISecurityGroup;

  constructor(scope: Construct, id: string, props: PostgresProps) {
    super(scope, id);

    const DATABASE_NAME = "prototype";

    const secret = new secretsmanager.Secret(this, "Secret", {
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: "root" }),
        generateStringKey: "password",
        excludePunctuation: true,
      },
    });

    const securityGroup = new ec2.SecurityGroup(this, `SecurityGroup`, {
      vpc: props.network.vpc,
    });

    const subnetGroup = new rds.SubnetGroup(this, `SubnetGroup`, {
      vpc: props.network.vpc,
      description: "Subnet group for Dummy RDS instance.",
      removalPolicy: RemovalPolicy.DESTROY,
      vpcSubnets: props.network.vpc.selectSubnets({
        subnetType: ec2.SubnetType.PUBLIC,
      }),
    });

    const parameterGroup = new rds.ParameterGroup(this, "ParameterGroup", {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_15_3,
      }),
      parameters: {
        // NOTE: Postgres 15 force SSL by default, so overwrite here.
        // Please follow security policy in your organization.
        "rds.force_ssl": "0",
      },
    });

    const dbInstance = new rds.DatabaseInstance(this, `Cluster`, {
      engine: rds.DatabaseInstanceEngine.POSTGRES,
      parameterGroup,
      vpc: props.network.vpc,
      subnetGroup,
      allocatedStorage: 30,
      allowMajorVersionUpgrade: false,
      autoMinorVersionUpgrade: true,
      databaseName: DATABASE_NAME,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.SMALL
      ),
      multiAz: false,
      removalPolicy: RemovalPolicy.DESTROY,
      publiclyAccessible: false,
      storageEncrypted: true,
      credentials: {
        username: secret
          .secretValueFromJson("username")
          .unsafeUnwrap()
          .toString(),
        password: secret.secretValueFromJson("password"),
      },
      securityGroups: [securityGroup],
    });

    this.instance = dbInstance;
    this.secret = secret;
    this.securityGroup = securityGroup;
    this.hostname = dbInstance.instanceEndpoint.hostname;
    this.port = dbInstance.instanceEndpoint.port;
    this.databaseName = DATABASE_NAME;

    new CfnOutput(this, "Hostname", {
      value: this.hostname,
    });
    new CfnOutput(this, "Port", {
      value: Token.asString(this.port),
    });
  }

  allowInboundAccess(peer: ec2.IPeer) {
    this.securityGroup.addIngressRule(peer, ec2.Port.tcp(this.port));
  }
}
