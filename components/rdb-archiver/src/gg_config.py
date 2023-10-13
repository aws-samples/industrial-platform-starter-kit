# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

import logging
import os

from awsiot.greengrasscoreipc.clientv2 import GreengrassCoreIPCClientV2
from cerberus import Validator

logger = logging.getLogger()

CONFIG_LOG_LEVEL = "LogLevel"
CONFIG_RUN_INTERVAL_SEC = "RunIntervalSec"


class GGConfig:
    def __init__(self):
        config_schema = {
            CONFIG_RUN_INTERVAL_SEC: {"type": "integer", "default": 3600},
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
    def run_interval_sec(self) -> int:
        return self._config[CONFIG_RUN_INTERVAL_SEC]

    @property
    def log_level(self) -> str:
        return self._config[CONFIG_LOG_LEVEL]
