# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

import logging

from opc_stream_archiver import OpcStreamHandler
from stream.opc_stream import OPCStream
from stream.s3_stream import S3ExportStream
from util.gg_config import GGConfig

logger = logging.getLogger("opc-archiver-component-logger")
logger.setLevel(logging.INFO)
handler = logging.StreamHandler()
handler.setFormatter(
    logging.Formatter("[%(levelname)8s] %(filename)s(%(lineno)s) %(message)s")
)
logger.addHandler(handler)


def main():
    try:
        config = GGConfig()
        logger.setLevel(logging._nameToLevel[config.log_level.upper()])

        s3_stream = S3ExportStream(f"{config.opc_stream_name}_s3_export", config.bucket)

        opc_stream = OPCStream(config.opc_stream_name)

        opc_archiver = OpcStreamHandler(config, opc_stream, s3_stream)

        opc_archiver.start()

    except Exception as e:
        logger.exception(e)
        raise e


if __name__ == "__main__":
    main()
