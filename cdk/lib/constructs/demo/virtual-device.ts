import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as s3 from "aws-cdk-lib/aws-s3";
import { RemovalPolicy } from "aws-cdk-lib";
import * as path from "path";
import { Network } from "../network";

export interface VirtualDeviceProps {
  installPolicy: iam.Policy;
  network: Network;
}

export class VirtualDevice extends Construct {
  readonly instance: ec2.IInstance;
  constructor(scope: Construct, id: string, props: VirtualDeviceProps) {
    super(scope, id);

    const vpc = props.network.vpc;

    // Create s3 bucket to upload python script for dummy server
    const bucket = new s3.Bucket(this, "OpcuaDummyServerBucket", {
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      enforceSSL: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });

    new s3deploy.BucketDeployment(this, "DeployScript", {
      sources: [
        s3deploy.Source.asset(path.join(__dirname, "../../../../opc_dummy")),
      ],
      destinationBucket: bucket,
    });

    const role = new iam.Role(this, "Role", {
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
    });
    role.attachInlinePolicy(props.installPolicy);
    role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMManagedInstanceCore")
    );
    bucket.grantRead(role);

    const userData = ec2.UserData.forLinux();
    // Userdata log can be refered at: /var/log/cloud-init-output.log
    userData.addCommands(
      // ----------------------
      // Setup Greengrass
      // ----------------------
      "cd /home/ssm-user",
      // Install dependencies including Java
      // NOTE: embulk requires Java 8 (Oct 2023)
      "sudo yum install -y java-1.8.0-amazon-corretto nodejs tree python3-pip",
      // Setup Greengrass user
      "sudo adduser --system ggc_user",
      "sudo groupadd --system ggc_group",
      // Make queue directory
      // NOTE: Make sure that `TargetDir` in file-watcher merge setting is same as this directory
      "sudo mkdir -p /home/ggc_user/data",
      "sudo chown -R ggc_user:ggc_user /home/ggc_user",
      // "echo 'export PATH=$PATH:/home/ggc_user/.local/bin' >> ~/.bashrc",
      // Install greengrass package
      // See: https://docs.aws.amazon.com/greengrass/v2/developerguide/manual-installation.html#download-greengrass-core-v2
      "curl -s https://d2s8p88vqu9w66.cloudfront.net/releases/greengrass-nucleus-latest.zip > greengrass-nucleus-latest.zip",
      "unzip greengrass-nucleus-latest.zip -d GreengrassInstaller && rm greengrass-nucleus-latest.zip",
      "java -jar ./GreengrassInstaller/lib/Greengrass.jar --version",
      // Add permission
      // See: https://docs.aws.amazon.com/greengrass/v2/developerguide/troubleshooting.html#greengrass-cloud-issues
      `echo "root    ALL=(ALL:ALL) ALL" | sudo tee -a /etc/sudoers`,

      // ----------------------
      // Setup OPC UA client
      // ----------------------
      // Install opcua client
      `echo install opcua commander`,
      "npm i -g opcua-commander",

      // ----------------------
      // Setup OPC UA server
      // ----------------------
      // Download scripts from S3
      `aws s3 cp s3://${bucket.bucketName}/main.py main.py`,
      `aws s3 cp s3://${bucket.bucketName}/opcua.service opcua.service`,

      "sudo mkdir /usr/bin/opcua",
      "sudo mv main.py /usr/bin/opcua",
      "sudo mv opcua.service /etc/systemd/system/opcua.service",

      // Install opcua package
      `echo install opcua package`,
      "pip3 install opcua==0.98.13",

      // Run opcua dummy server
      "sudo systemctl daemon-reload",
      "sudo systemctl enable opcua",
      "sudo systemctl restart opcua",
      "sudo systemctl status opcua"
    );
    const instance = new ec2.Instance(this, "Instance", {
      vpc,
      vpcSubnets: vpc.selectSubnets({ subnetType: ec2.SubnetType.PUBLIC }),
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T2,
        ec2.InstanceSize.LARGE
      ),
      machineImage: ec2.MachineImage.latestAmazonLinux2023(),
      userData: userData,
      role: role,
    });

    this.instance = instance;
  }
}
