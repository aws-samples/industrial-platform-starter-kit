import { Construct } from "constructs";
import { GdkPublish, GdkPublishProps } from "./gdk-publish";
import { Annotations } from "aws-cdk-lib";

export enum JavaVersion {
  CORRETTO8 = "corretto8",
  CORRETTO11 = "corretto11",
  CORRETTO17 = "corretto17",
}

export interface JavaGdkPublishProps extends GdkPublishProps {
  /**
   * Java version used in CodeBuild project.
   * @default corretto17
   */
  readonly javaVersion?: JavaVersion;
}

export class JavaGdkPublish extends GdkPublish {
  constructor(scope: Construct, id: string, props: JavaGdkPublishProps) {
    const { javaVersion = "corretto17" } = props;
    let buildImage = "aws/codebuild/standard:5.0";
    // ref: https://docs.aws.amazon.com/codebuild/latest/userguide/available-runtimes.html#linux-runtimes
    switch (javaVersion) {
      case "corretto8":
      case "corretto11":
        buildImage = "aws/codebuild/standard:5.0";
        break;
      case "corretto17":
        buildImage = "aws/codebuild/standard:7.0";
        break;
      default:
        Annotations.of(scope).addError(
          `Unsupported Java version: ${props.javaVersion}`
        );
    }

    super(scope, id, {
      ...props,
      buildImage: buildImage,
      runtimeVersions: { java: javaVersion },
    });
  }
}
