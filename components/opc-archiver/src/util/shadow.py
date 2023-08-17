# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

import json
import os
from typing import Any

from awsiot.greengrasscoreipc.clientv2 import GreengrassCoreIPCClientV2
from awsiot.greengrasscoreipc.model import ResourceNotFoundError


class ShadowController:
    """
    Utility class for reading and writing device shadows.
    In this case, it is used to persist the read position of the stream
    """

    def __init__(self, shadow_name: str):
        self._shadow_name = shadow_name
        self._thing_name = os.environ.get("AWS_IOT_THING_NAME")
        self._ipc_client = GreengrassCoreIPCClientV2()

    def get_thing_shadow_request(self):
        """Get read position from shadow"""
        try:
            result = self._ipc_client.get_thing_shadow(
                thing_name=self._thing_name, shadow_name=self._shadow_name
            )
            return (
                json.loads(result.payload.decode("utf-8"))
                .get("state", {})
                .get("reported", {})
            )

        except ResourceNotFoundError as e:
            # No problem if shadow is not yet available
            return {}
        except Exception as e:
            raise e

    def update_thing_shadow_request(self, payload: dict) -> Any:
        """Update shadow and save loading position"""
        shadow = {"state": {"reported": payload}}

        result = self._ipc_client.update_thing_shadow(
            thing_name=self._thing_name,
            shadow_name=self._shadow_name,
            payload=json.dumps(shadow),
        )

        return json.loads(result.payload.decode("utf-8"))
