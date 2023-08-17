# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

import logging

from awsiot.greengrasscoreipc.clientv2 import GreengrassCoreIPCClientV2
from cerberus import Validator

logger = logging.getLogger("opc-archiver-component-logger")

CONFIG_S3_BUCKET = "Bucket"
CONFIG_BUCKET_KEY_PREFIX = "BucketPrefix"
CONFIG_DELETE_MV_FILES = "DeleteMovedFiles"
CONFIG_OPC_STREAM_NAME = "OpcStreamName"
CONFIG_OPC_LOG_DIR = "OpcLogDir"
CONFIG_OPC_LOG_NAME = "OpcLogName"
CONFIG_OPC_LOG_INTERVAL_MIN = "OpcLogIntervalMin"
CONFIG_OPC_ARCHIVE_DIR = "OpcLogArchiveDir"
CONFIG_LOG_LEVEL = "LogLevel"

DEFAULT_OPC_LOG_INTERVAL_MIN = 1
DEFAULT_OPC_ARCHIVE_TEMP_DIR = "./opclogs/archive/"
DEFAULT_OPC_LOG_DIR = "./opclogs/"
DEFAULT_OPC_LOG_NAME = "opc-log"
DEFAULT_BUCKET_KEY_PREFIX = (
    "!{timestamp:YYYY}/!{timestamp:MM}/!{timestamp:dd}/!{timestamp:HH}"
)


class GGConfig:
    """
    Load the ComponentConfiguration specified in the Recipe
    """

    def __init__(self):
        config_schema = {
            CONFIG_S3_BUCKET: {"type": "string", "required": True},
            CONFIG_BUCKET_KEY_PREFIX: {
                "type": "string",
                "default": DEFAULT_BUCKET_KEY_PREFIX,
            },
            CONFIG_DELETE_MV_FILES: {"type": "boolean", "default": True},
            CONFIG_OPC_STREAM_NAME: {"type": "string", "required": True},
            CONFIG_OPC_LOG_DIR: {"type": "string", "default": DEFAULT_OPC_LOG_DIR},
            CONFIG_OPC_LOG_NAME: {"type": "string", "default": DEFAULT_OPC_LOG_NAME},
            CONFIG_OPC_LOG_INTERVAL_MIN: {
                "type": "integer",
                "default": DEFAULT_OPC_LOG_INTERVAL_MIN,
            },
            CONFIG_OPC_ARCHIVE_DIR: {
                "type": "string",
                "default": DEFAULT_OPC_ARCHIVE_TEMP_DIR,
            },
            CONFIG_LOG_LEVEL: {
                "type": "string",
                "default": "info",
                "allowed": ["debug", "info", "warn", "error", "critical"],
            },
        }
        self._config = self.component_configuration()

        self._validator = Validator(config_schema, allow_unknown=True)
        self._config = self._validator.normalized(self._config)

        if not self._validator.validate(self._config):
            raise Exception(f"Configuration validate error: {self._validator.errors}")

    def component_configuration(self):
        """
        Get the ComponentConfiguration specified in the Recipe
        """
        ipc_client = GreengrassCoreIPCClientV2()

        res = ipc_client.get_configuration()
        return res.value

    def print_config(self):
        """
        Write the read settings to the log
        """
        logger.info(f"Configuration: {self._config}")

    @property
    def bucket(self) -> str:
        return self._config[CONFIG_S3_BUCKET]

    @property
    def bucket_prefix(self) -> str:
        return self._config[CONFIG_BUCKET_KEY_PREFIX]

    @property
    def delete_moved_file(self) -> bool:
        return self._config[CONFIG_DELETE_MV_FILES]

    @property
    def opc_stream_name(self) -> str:
        return self._config[CONFIG_OPC_STREAM_NAME]

    @property
    def opc_log_dir(self) -> str:
        return self._config[CONFIG_OPC_LOG_DIR]

    @property
    def opc_log_name(self) -> str:
        return self._config[CONFIG_OPC_LOG_NAME]

    @property
    def opc_log_interval_min(self) -> int:
        return self._config[CONFIG_OPC_LOG_INTERVAL_MIN]

    @property
    def opc_archive_dir(self) -> str:
        return self._config[CONFIG_OPC_ARCHIVE_DIR]

    @property
    def log_level(self) -> str:
        return self._config[CONFIG_LOG_LEVEL]
