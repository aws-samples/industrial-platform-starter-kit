# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

import logging

from stream.abstract_streammanager import AbstractStreamManager
from stream_manager import MessageStreamDefinition, StrategyOnFull

logger = logging.getLogger("opc-archiver-component-logger")

DEFAULT_STREAM_MAX_SIZE = 256 * 1024 * 1024


class OPCStream(AbstractStreamManager):
    """Stream Manager stream operations for OPC data"""

    def __init__(
        self,
        stream_name: str,
        clear_stream: bool = False,
        stream_max_size: int = DEFAULT_STREAM_MAX_SIZE,
    ):
        """
        Parameters
        ----------
        stream_name: str
            Name of the stream to create
        clear_stream: bool
            Whether or not to clear an existing stream at runtime.
            (If a stream is deleted, all data currently stored in the queue will be deleted.)
        stream_max_size: int
            Maximum size of the stream (in bytes)
        """
        self._stream_max_size = stream_max_size

        super(OPCStream, self).__init__(stream_name, clear_stream)

    def get_stream_definition(self) -> MessageStreamDefinition:
        """Returns stream definition information

        Returns
        -------
        MessageStreamDefinition
            Stream Definition
        """
        exports = None

        stream_definition = MessageStreamDefinition(
            name=self._stream_name,
            max_size=self._stream_max_size,
            strategy_on_full=StrategyOnFull.OverwriteOldestData,
            export_definition=exports,
        )

        return stream_definition
