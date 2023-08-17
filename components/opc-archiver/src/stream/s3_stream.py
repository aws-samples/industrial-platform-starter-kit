# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

import logging
import os
import platform
import time
from threading import Thread

from stream.abstract_streammanager import AbstractStreamManager
from stream_manager import (
    ExportDefinition,
    MessageStreamDefinition,
    NotEnoughMessagesException,
    ReadMessagesOptions,
    S3ExportTaskDefinition,
    S3ExportTaskExecutorConfig,
    Status,
    StatusConfig,
    StatusLevel,
    StatusMessage,
    StrategyOnFull,
    StreamManagerClient,
    StreamManagerException,
)
from stream_manager.util import Util
from util.shadow import ShadowController

logger = logging.getLogger("opc-archiver-component-logger")

TIMEOUT = 10
UPLOAD_MAX_RETRY_COUNT = 3
UPLOAD_CHECK_INTERVAL = 3

FILE_SEQUENCE_SHADOW_NAME = "file_upload_sequence_number"
FILE_SEQUENCE_PROP_NAME = "next_sequence_number"


class UploadCheckThread(Thread):
    """
    StreamManager periodically checks and deletes files uploaded to S3
    """

    def __init__(
        self,
        stream_name: str,
        status_stream_name: str,
        clear_stream: bool,
        delete_moved_file: bool,
        retry_count: int = UPLOAD_MAX_RETRY_COUNT,
    ):
        """
        Parameters
        ----------
        stream_name: str
            Stream name for S3 export
        status_stream_name: str
            StreamManager stream name to save S3 export status
        clear_stream: bool
            Whether or not to clear existing streams at runtime.
            (Deleting a stream will delete all data currently stored in the queue)
        delete_moved_file: bool
            Whether or not to delete exported files
        retry_count: int
            Number of retries in case of export errors
        """
        Thread.__init__(self)

        self._file_url_separator = ":///" if platform.system() == "Windows" else ":"
        self.stream_name = stream_name
        self.status_stream_name = status_stream_name
        self._shadow = ShadowController(FILE_SEQUENCE_SHADOW_NAME)
        self.client = StreamManagerClient()
        self.delete_moved_file = delete_moved_file
        self.retry_max_count = retry_count
        self.setDaemon(True)

        shadow_payload = self._shadow.get_thing_shadow_request()

        if shadow_payload is None or clear_stream is True:
            self._next_sequence_number = 0
        else:
            self._next_sequence_number = shadow_payload.get(FILE_SEQUENCE_PROP_NAME, 0)

        logger.info(
            f"sequence number of the file upload stream to start checking {self._next_sequence_number}"
        )

    def run(self):
        """
        Periodically retrieve S3 file transfer status from StreamManager and delete files if in `Success` state
        """
        while True:
            try:
                messages = self.client.read_messages(
                    self.status_stream_name,
                    ReadMessagesOptions(
                        desired_start_sequence_number=self._next_sequence_number,
                        read_timeout_millis=1000,
                    ),
                )

                for message in messages:
                    status_message = Util.deserialize_json_bytes_to_obj(
                        message.payload, StatusMessage
                    )
                    logger.debug(status_message)

                    target_file = status_message.status_context.s3_export_task_definition.input_url.split(
                        self._file_url_separator
                    )[
                        1
                    ]

                    if status_message.status == Status.Success:
                        logger.debug(
                            f"Successfully uploaded file at path: {target_file} to S3."
                        )
                        self._next_sequence_number = (
                            status_message.status_context.sequence_number + 1
                        )
                        try:
                            if self.delete_moved_file:
                                os.remove(target_file)
                        except FileNotFoundError as e:
                            logger.warning(e)

                    elif status_message.status == Status.InProgress:
                        logger.debug("File upload is in Progress.")
                        self._next_sequence_number = (
                            status_message.status_context.sequence_number + 1
                        )
                    elif status_message.status == Status.Failure:
                        s3_export_task_definition = (
                            status_message.status_context.s3_export_task_definition
                        )
                        user_metadata = s3_export_task_definition.user_metadata
                        retry_count = int(
                            0 if not user_metadata else user_metadata.get("retry", 0)
                        )
                        if retry_count > self.retry_max_count:
                            logger.error(
                                f"{target_file} has been sent to S3 more than the max number of times.: {status_message.message}"
                            )
                        else:
                            logger.warn(
                                f"Unable to upload file at path {target_file} to S3. Message: {status_message.message}"
                            )
                            retry_task_definition = S3ExportTaskDefinition(
                                input_url=s3_export_task_definition.input_url,
                                bucket=s3_export_task_definition.bucket,
                                key=s3_export_task_definition.key,
                                user_metadata={"retry": retry_count + 1},
                            )
                            data = Util.validate_and_serialize_to_json_bytes(
                                retry_task_definition
                            )
                            self.client.append_message(self.stream_name, data)

                        self._next_sequence_number = (
                            status_message.status_context.sequence_number + 1
                        )
                    elif status_message.status == Status.Canceled:
                        logger.error(
                            f"{target_file} has been cancelled to be sent to S3. Message: {status_message.message}"
                        )

                        self._next_sequence_number = (
                            status_message.status_context.sequence_number + 1
                        )

                    # Persist next_sequence_number
                    self._shadow.update_thing_shadow_request(
                        {FILE_SEQUENCE_PROP_NAME: self._next_sequence_number}
                    )

                time.sleep(UPLOAD_CHECK_INTERVAL)
            except NotEnoughMessagesException as e:
                time.sleep(UPLOAD_CHECK_INTERVAL)
                continue
            except StreamManagerException as e:
                logger.exception(e)
                time.sleep(UPLOAD_CHECK_INTERVAL)
            except Exception as e:
                logger.exception(e)
                time.sleep(UPLOAD_CHECK_INTERVAL)


class S3ExportStream(AbstractStreamManager):
    """Stream Manager stream operations with Export settings to S3"""

    def __init__(
        self,
        stream_name: str,
        bucket: str,
        clear_stream: bool = False,
        delete_moved_file: bool = True,
        retry_count: int = UPLOAD_MAX_RETRY_COUNT,
    ):
        """
        Parameters
        ----------
        stream_name: str
            Name of the stream to create
        bucket: str
            S3 bucket to export to
        clear_stream: bool
            Whether or not to clear existing streams at runtime.
            (Deleting a stream will delete all data currently in the queue)
        delete_moved_file: bool
            Whether or not to delete files already exported to S3
        retry_count: int
            Number of retries in case of export errors
        """
        self.status_stream_name = stream_name + "_status"
        self.bucket = bucket
        self._file_url_prefix = (
            "file:///" if platform.system() == "Windows" else "file:"
        )
        super(S3ExportStream, self).__init__(stream_name, clear_stream)

        # Create thread for deleting uploaded files
        self.upload_check_thread = UploadCheckThread(
            stream_name,
            self.status_stream_name,
            clear_stream,
            delete_moved_file,
            retry_count,
        )
        self.upload_check_thread.start()

    def get_stream_definition(self) -> MessageStreamDefinition:
        """Get the definition of the S3 upload stream

        Returns
        -------
        MessageStreamDefinition
        """
        try:
            if self._clear_stream:
                self.delete_stream(self.status_stream_name)

            self._client.create_message_stream(
                MessageStreamDefinition(
                    name=self.status_stream_name,
                    strategy_on_full=StrategyOnFull.OverwriteOldestData,
                )
            )
        except Exception as e:
            # If stream already exists
            logger.warning(e)

        exports = ExportDefinition(
            s3_task_executor=[
                S3ExportTaskExecutorConfig(
                    identifier="S3TaskExecutor" + self._stream_name,
                    # Optional. Add an export status stream to add statuses for all S3 upload tasks.
                    status_config=StatusConfig(
                        status_level=StatusLevel.INFO,
                        status_stream_name=self.status_stream_name,
                    ),
                )
            ]
        )

        stream_definition = MessageStreamDefinition(
            name=self._stream_name,
            strategy_on_full=StrategyOnFull.OverwriteOldestData,
            export_definition=exports,
        )

        return stream_definition

    def append_message(self, local_file: str, key: str) -> None:
        """Add a file to the stream to be uploaded to S3

        Parameters
        ----------
        local_file: str
            Local file path to upload to S3
        key: str
            Upload destination key
        """
        logger.debug("append %s to s3 export stream: %s" % (local_file, key))

        filepath = os.path.abspath(local_file)
        s3_export_task_definition = S3ExportTaskDefinition(
            input_url=self._file_url_prefix + filepath, bucket=self.bucket, key=key
        )

        data = Util.validate_and_serialize_to_json_bytes(s3_export_task_definition)

        super(S3ExportStream, self).append_message(data)
