# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

import logging
import os

from awsiot.greengrasscoreipc.clientv2 import GreengrassCoreIPCClientV2
from cerberus import Validator

logger = logging.getLogger()

CONFIG_LOG_LEVEL = "LogLevel"
CONFIG_TARGET_DIR = "TargetDir"
CONFIG_FILE_PATTERN = "FilePattern"
CONFIG_S3_BUCKET = "Bucket"
CONFIG_BUCKET_KEY_PREFIX = "BucketPrefix"
CONFIG_DELETE_MV_FILES = "DeleteMovedFiles"
CONFIG_CHECK_INTERVAL_SEC = "CheckIntervalSec"


class GGConfig:
    def __init__(self):
        config_schema = {
            CONFIG_TARGET_DIR: {"type": "string", "required": True},
            CONFIG_FILE_PATTERN: {"type": "string", "default": "*"},
            CONFIG_S3_BUCKET: {"type": "string", "required": True},
            CONFIG_BUCKET_KEY_PREFIX: {"type": "string"},
            CONFIG_DELETE_MV_FILES: {"type": "boolean", "default": True},
            CONFIG_CHECK_INTERVAL_SEC: {"type": "integer", "default": 0},
            CONFIG_LOG_LEVEL: {
                "type": "string",
                "default": "info",
                "allowed": ["debug", "info", "warn", "error", "critical"],
            },
        }
        self._config = self.component_configration()

        self._validator = Validator(config_schema, allow_unknown=True)
        self._config = self._validator.normalized(self._config)

        if not self._validator.validate(self._config):
            raise Exception(f"Configuration validate error: {self._validator.errors}")

    def component_configration(self):
        """
        Get the ComponentConfiguration specified in the Recipe
        """
        ipc_client = GreengrassCoreIPCClientV2()

        res = ipc_client.get_configuration()
        return res.value

    def print_config(self):
        logger.info(f"Configuraton: {self._config}")

    @property
    def target_dir(self) -> str:
        return os.path.abspath(self._config[CONFIG_TARGET_DIR])

    @property
    def file_pattern(self) -> str:
        return self._config[CONFIG_FILE_PATTERN]

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
    def check_interval_sec(self) -> int:
        return self._config[CONFIG_CHECK_INTERVAL_SEC]

    @property
    def log_level(self) -> str:
        return self._config[CONFIG_LOG_LEVEL]
