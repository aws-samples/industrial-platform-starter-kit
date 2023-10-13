import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";

export interface NetworkProps {}

export class Network extends Construct {
  readonly vpc: ec2.IVpc;
  constructor(scope: Construct, id: string, props: NetworkProps) {
    super(scope, id);

    const vpc = new ec2.Vpc(this, "Vpc");

    this.vpc = vpc;
  }
}
