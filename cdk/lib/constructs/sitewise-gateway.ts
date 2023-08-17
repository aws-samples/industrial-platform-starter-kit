import { Construct } from "constructs";
import * as iotsitewise from "aws-cdk-lib/aws-iotsitewise";

export interface SitewiseGatewayProps {
  gatewayName: string;
  coreDeviceThingName: string;
  endpointUri: string;
}

const CAPABILITY_NAMESPACE = "iotsitewise:opcuacollector:2";
// NOTE: must same as OpcStreamName on opc-archiver/recipe.yaml
const OPC_STREAM_NAME = "opc_archiver_stream";

export class SitewiseGateway extends Construct {
  constructor(scope: Construct, id: string, props: SitewiseGatewayProps) {
    super(scope, id);

    const opcUaConfiguration = {
      sources: [
        // OPC UA server data source configuration
        {
          name: "SampleOpcServer",
          endpoint: {
            certificateTrust: {
              type: "TrustAny",
            },
            endpointUri: props.endpointUri,
            securityPolicy: "NONE",
            messageSecurityMode: "NONE",
            identityProvider: {
              type: "Anonymous",
            },
            nodeFilterRules: [
              {
                action: "INCLUDE",
                definition: {
                  type: "OpcUaRootPath",
                  rootPath: "/",
                },
              },
            ],
          },
          measurementDataStreamPrefix: "",
          destination: {
            type: "StreamManager",
            streamName: OPC_STREAM_NAME,
            streamBufferSize: 4,
          },
        },
      ],
    };

    const gateway = new iotsitewise.CfnGateway(this, "Gateway", {
      gatewayName: props.gatewayName,
      gatewayPlatform: {
        greengrassV2: {
          coreDeviceThingName: props.coreDeviceThingName,
        },
      },
      gatewayCapabilitySummaries: [
        {
          capabilityNamespace: CAPABILITY_NAMESPACE,
          capabilityConfiguration: JSON.stringify(opcUaConfiguration),
        },
      ],
    });
  }
}
