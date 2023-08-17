# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

import logging
from abc import abstractmethod
from typing import List

from stream_manager import (
    NotEnoughMessagesException,
    ReadMessagesOptions,
    ResourceNotFoundException,
    StreamManagerClient,
)
from stream_manager.data import Message

logger = logging.getLogger("opc-archiver-component-logger")


class AbstractStreamManager:
    """Base class for StreamManager use class"""

    def __init__(self, stream_name: str, clear_stream: bool = False):
        """
        Parameters
        ----------
        stream_name: str
            Name of the stream to create
        clear_stream: bool
            Whether or not to clear an existing stream at runtime.
            (If a stream is deleted, all data currently in the queue will be deleted.)
        """
        self._stream_name = stream_name
        self._clear_stream = clear_stream
        self._stream_created = False
        self._client = StreamManagerClient()
        self._newest_seq_num = None

        self.create_stream()

    def delete_stream(self, name: str = None) -> None:
        """Delete an existing stream

        Parameters
        ----------
        name: str
            Name of the stream to be deleted
        """
        try:
            target = self._stream_name if name is None else name
            self._client.delete_message_stream(stream_name=target)
            logger.info("StreamManager message stream (%s) deleted." % target)
        except ResourceNotFoundException:
            pass

    @abstractmethod
    def get_stream_definition(self):
        pass

    def create_stream(self) -> None:
        if self._clear_stream:
            self.delete_stream()

        stream_definition = self.get_stream_definition()

        streams = self._client.list_streams()

        if self._stream_name in streams:
            try:
                self._client.update_message_stream(stream_definition)
                logger.info(
                    "StreamManager message stream (%s) updated." % self._stream_name
                )
            except Exception as e:
                logger.error(e)
                return
        else:
            try:
                self._client.create_message_stream(stream_definition)
                logger.info(
                    "StreamManager message stream (%s) created." % self._stream_name
                )
            except Exception as e:
                logger.error(e)
                return

        self._stream_created = True

    def append_message(self, data: bytes) -> None:
        if not self._stream_created:
            raise Exception("The stream has not been created")

        logger.debug("Message appended to Stream(%s)." % self._stream_name)

        # See: https://aws.github.io/aws-greengrass-core-sdk-python/_apidoc/greengrasssdk.stream_manager.streammanagerclient.html?highlight=append_message#greengrasssdk.stream_manager.streammanagerclient.StreamManagerClient.append_message
        self._client.append_message(self._stream_name, data)

    def read_messages(self, sequence_number: int, max: int = None) -> List[Message]:
        """Obtains data after the specified sequence number from stored messages

        Returns an empty array if there is no message stored

        Parameters
        ----------
        sequence_number: int
            Sequence number to retrieve
        max: int
            Maximum number of messages to retrieve (all if not specified)

        Returns
        -------
        List[Message]
            Message array
        """
        try:
            msgs = self._client.read_messages(
                self._stream_name,
                ReadMessagesOptions(
                    desired_start_sequence_number=sequence_number, max_message_count=max
                ),
            )

            return msgs
        except NotEnoughMessagesException as e:
            return []
        except Exception as e:
            logger.error(e)
            return []

    def get_latest_sequence_number(self) -> int:
        """Get the latest message sequence number
        Returns
        -------
        int
            Sequence number
        """
        try:
            newest_seq_num = self._client.describe_message_stream(
                self._stream_name
            ).storage_status.newest_sequence_number
            return newest_seq_num
        except Exception as e:
            raise e
