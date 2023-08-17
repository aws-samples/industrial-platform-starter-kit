import { Stack, IResolvable } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as greengrass from "aws-cdk-lib/aws-greengrassv2";

type IComponentsType =
  | {
      [key: string]:
        | greengrass.CfnDeployment.ComponentDeploymentSpecificationProperty
        | IResolvable;
    }
  | IResolvable;

type MergeSettings = {
  [key: string]: any;
};

export interface Components {
  componentName: string;
  componentVersion: string;
  merge?: MergeSettings;
}

export interface GreengrassComponentDeployProps {
  thingName: string;
  deploymentName?: string;
  components: Components[];
}

export class GreengrassComponentDeploy extends Construct {
  constructor(
    scope: Construct,
    id: string,
    props: GreengrassComponentDeployProps
  ) {
    super(scope, id);

    const targetArn = `arn:aws:iot:${Stack.of(this).region}:${
      Stack.of(this).account
    }:thing/${props.thingName}`;
    const deploymentName =
      props.deploymentName === undefined
        ? `Deployment for ${props.thingName}`
        : props.deploymentName;
    const deployComponents: IComponentsType = {};

    // Create component deploy settings
    for (const component of props.components) {
      deployComponents[component.componentName] = {
        componentVersion: component.componentVersion,
        configurationUpdate: {
          merge: JSON.stringify(component.merge),
        },
        runWith: {},
      };
    }

    const cfnDeploy = new greengrass.CfnDeployment(
      this,
      "ComponentDeployment",
      {
        targetArn: targetArn,
        deploymentName: deploymentName,
        deploymentPolicies: {
          componentUpdatePolicy: {
            action: "NOTIFY_COMPONENTS",
            timeoutInSeconds: 60,
          },
          configurationValidationPolicy: {},
          failureHandlingPolicy: "DO_NOTHING",
        },
        components: deployComponents,
      }
    );
  }
}
