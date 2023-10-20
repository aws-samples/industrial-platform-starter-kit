import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { IndustrialDataPlatformStack } from "../lib/industrial-data-platform-stack";

test("SnapshotTest", () => {
  const app = new cdk.App();
  const stack = new IndustrialDataPlatformStack(app, "MyTestStack", {
    thingName: "thing",
    opcuaEndpointUri: "opc.tcp://localhost:4840",
    provisionVirtualDevice: true,
    env: {
      account: "123456789012",
      region: "ap-northeast-1",
    },
  });
  const template = Template.fromStack(stack).toJSON();

  expect(template).toMatchSnapshot();
});
