import argparse
import logging
import os
import random
import time

from opcua import Server, ua

ROOT_NODE = os.environ.get("ROOT_NODE", "root")

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)
handler = logging.StreamHandler()
handler.setFormatter(
    logging.Formatter("[%(levelname)8s] %(filename)s(%(lineno)s) %(message)s")
)
logger.addHandler(handler)


# Valid types: int, float, string, bool
nodes = {
    ROOT_NODE: {
        "tag1": [int, 0, 1, 100],
        "tag2": [float, 10.0, -2, 2],
        "tag3": [str, ["good", "bad", "nice"]],
        "tag4": [bool],
    }
}

DEFAULT_INTERVAL = 1
DEFAULT_OPC_ENDPOINT = "opc.tcp://0.0.0.0:52250"

values = []


def update():
    """Update OPC value at random"""
    for v in values:
        if v[1][0] == int:
            new_val = int(random.randint(v[1][2], v[1][3]))
        elif v[1][0] == float:
            # Random walk
            new_val = float(v[0].get_value() + random.uniform(v[1][2], v[1][3]))
        elif v[1][0] == str:
            new_val = str(random.choice(v[1][1]))
        elif v[1][0] == bool:
            new_val = bool(random.getrandbits(1))
        else:
            raise ValueError("Invalid value update")

        v[0].set_value(new_val)


def create_variable(idx, node, key, val, prev):
    """Create OPC value"""
    if val[0] == int:
        # IoT Sitewise supports only Int32 (Aug 2023)
        # Ref: https://docs.aws.amazon.com/iot-sitewise/latest/userguide/measurements.html#define-measurements-console
        variable = node.add_variable(idx, key, int(val[1]), ua.VariantType.Int32)
    elif val[0] == float:
        variable = node.add_variable(idx, key, float(val[1]), ua.VariantType.Double)
    elif val[0] == str:
        variable = node.add_variable(
            idx, key, str(random.choice(val[1])), ua.VariantType.String
        )
    elif val[0] == bool:
        variable = node.add_variable(
            idx, key, bool(random.getrandbits(1)), ua.VariantType.Boolean
        )
    else:
        raise ValueError("Invalid type")

    logger.debug("{}: {}".format(prev, val))
    variable.set_writable()
    values.append((variable, val))


def create_node(idx, node, key, val, tag=""):
    """Create OPC Node tree"""
    if type(val) == list:
        create_variable(idx, node, key, val, tag)
    elif type(val) == dict:
        if key is None:
            new_node = node
        else:
            new_node = node.add_object(idx, key)
        for k, v in val.items():
            create_node(idx, new_node, k, v, tag + "/" + k)


if __name__ == "__main__":
    try:
        parser = argparse.ArgumentParser()
        parser.add_argument(
            "--endpoint", default=DEFAULT_OPC_ENDPOINT, help="OPC Server endpoint uri"
        )
        parser.add_argument(
            "--interval",
            type=int,
            default=DEFAULT_INTERVAL,
            help="Value update interval",
        )
        parser.add_argument(
            "-l",
            "--log-level",
            choices=["info", "warn", "error", "debug"],
            default="info",
            help="LogLevel (info / warn / error / debug)",
        )

        args = parser.parse_args()

        if args.log_level == "info":
            logger.setLevel(logging.INFO)
        elif args.log_level == "warn":
            logger.setLevel(logging.WARN)
        elif args.log_level == "error":
            logger.setLevel(logging.ERROR)
        elif args.log_level == "debug":
            logger.setLevel(logging.DEBUG)

        logger.info("args: {}".format(args))

        server = Server()
        server.set_endpoint(args.endpoint)
        uri = "http://examples.freeopcua.github.io"
        idx = server.register_namespace(uri)

        objects_node = server.get_objects_node()
        create_node(idx, objects_node, None, nodes)

        logger.info("Start OPC-UA Server")
        server.start()

        while True:
            time.sleep(args.interval)
            update()

    except Exception as e:
        logger.exception(e)
    except (KeyboardInterrupt, SystemExit):
        logger.info(
            "Exits the component because it received a system termination signal."
        )
