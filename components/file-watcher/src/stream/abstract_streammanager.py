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

logger = logging.getLogger()


class AbstractStreamManager:
    """Base class for StreamManager use class"""

    def __init__(self, stream_name: str, clear_stream: bool = False):
        """
        :param stream_name: Name of the stream to create.
        :param bool clear_stream: Whether or not to delete the existing stream at runtime.
            (If a stream is deleted, all data currently stored in the queue will be deleted.)
        """
        self._stream_name = stream_name
        self._clear_stream = clear_stream
        self._stream_created = False
        self._client = StreamManagerClient()
        self._newest_seq_num = None

        self.create_stream()

    def delete_stream(self, name: str = None):
        """Deleting an existing stream

        :param str name: Stream name to be deleted
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

    def create_stream(self):
        # Delete Stream Manager stream
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

    def append_message(self, data: bytes):
        """Adding a message to the stream

        :param bytes data: data to be added to the stream
        """
        if not self._stream_created:
            raise Exception("The stream has not been created")

        logger.debug("Message appended to Stream(%s)." % self._stream_name)

        # See: https://aws.github.io/aws-greengrass-core-sdk-python/_apidoc/greengrasssdk.stream_manager.streammanagerclient.html?highlight=append_message#greengrasssdk.stream_manager.streammanagerclient.StreamManagerClient.append_message
        self._client.append_message(self._stream_name, data)

    def read_latest_messages(self, size) -> List[Message]:
        """Retrieves the specified size of messages from behind the stored messages.

        Returns `None` if the latest message of the specified size has not been stored.

        :param int size: Number of messages to retrieve.
        """
        latest_seq_num = self.get_latest_sequence_number()
        if latest_seq_num == self._newest_seq_num:
            return None

        start_seq_num = (latest_seq_num + 1) - size

        if start_seq_num >= 0:
            try:
                msgs = self._client.read_messages(
                    self._stream_name,
                    ReadMessagesOptions(
                        desired_start_sequence_number=start_seq_num,
                        min_message_count=size,
                        max_message_count=size,
                    ),
                )
                self._newest_seq_num = msgs[-1].sequence_number
                return msgs
            except NotEnoughMessagesException as e:
                return None
            except Exception as e:
                logger.error(e)
                return None
        else:
            return None

    def get_latest_sequence_number(self) -> int:
        """Get the latest message sequence number
        :return: sequence number
        :rtype: int
        """
        try:
            newest_seq_num = self._client.describe_message_stream(
                self._stream_name
            ).storage_status.newest_sequence_number
            return newest_seq_num
        except Exception as e:
            raise e
