# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

import gzip
import logging
import logging.handlers
import os
import re
import shutil
import time
from typing import Any

from stream.opc_stream import OPCStream
from stream.s3_stream import S3ExportStream
from util.gg_config import GGConfig
from util.shadow import ShadowController
from watchdog.events import FileMovedEvent, PatternMatchingEventHandler
from watchdog.observers.polling import PollingObserver

OPC_SEQUENCE_SHADOW_NAME = "opc_latest_sequence_number"
OPC_LOGGER_NAME = "opc-logger"
OPC_NEXT_SEQUENCE_PROP_NAME = "next_sequence_number"

STREAM_READ_MAX_SIZE = 5000  # Maximum size to be read from the stream at one time (as long as the size is large enough to avoid data retention)

logger = logging.getLogger("opc-archiver-component-logger")


class OpcStreamHandler:
    """Class that reads OPC stream and writes to file

    SiteWiseCollectorからAppendされたStreamを読み取りファイルとして書き込む
    """

    def __init__(
        self, config: GGConfig, opc_stream: OPCStream, s3_stream: S3ExportStream
    ):
        """
        Parameters
        ----------
        config: GGConfig
        opc_stream: OPCStream
        s3_stream: S3ExportStream
        """
        self._config = config
        self._stream = opc_stream

        try:
            os.makedirs(self._config.opc_log_dir)
        except FileExistsError as e:
            pass

        # Create monitoring handler for OPC log files (OPC messages every minute that are compressed and sent)
        file_event_handler = FileWatchHandler(
            config, s3_stream, self.save_next_sequence_number
        )
        self._observer = PollingObserver()
        self._observer.schedule(file_event_handler, config.opc_log_dir, recursive=False)
        self._observer.start()

        opc_log_path = f"{self._config.opc_log_dir}{self._config.opc_log_name}"

        self._opc_logger = logging.getLogger(OPC_LOGGER_NAME)
        self._opc_logger.setLevel(logging.INFO)
        opc_handler = logging.handlers.TimedRotatingFileHandler(
            opc_log_path,
            encoding="utf-8",
            when="M",
            interval=self._config.opc_log_interval_min,
            backupCount=0,
        )
        opc_handler.setLevel(logging.INFO)
        self._opc_logger.addHandler(opc_handler)

        self._shadow = ShadowController(OPC_SEQUENCE_SHADOW_NAME)
        shadow_payload = self._shadow.get_thing_shadow_request()
        self._next_sequence_number = shadow_payload.get(OPC_NEXT_SEQUENCE_PROP_NAME, 0)

        logger.info(
            f"sequence number of the opc stream to start checking {self._next_sequence_number}"
        )

    def start(self) -> None:
        """Reads OPC data from a stream and writes it to a file"""
        try:
            while True:
                messages = self._stream.read_messages(
                    self._next_sequence_number, STREAM_READ_MAX_SIZE
                )

                if len(messages) > 0:
                    for message in messages:
                        self._opc_logger.info(message.payload.decode("utf-8"))

                    self._next_sequence_number = messages[-1].sequence_number + 1

                    logger.debug(
                        f"sizeof stream messages: {len(messages)}, last sequence number: {self._next_sequence_number}"
                    )

                time.sleep(0.1)
        finally:
            self.save_next_sequence_number()

    def save_next_sequence_number(self) -> None:
        """Store the next sequence number in the shadow"""
        self._shadow.update_thing_shadow_request(
            {OPC_NEXT_SEQUENCE_PROP_NAME: self._next_sequence_number}
        )


LOG_ARCHIVE_PATTERN = ".*-*-*_*-*"


class FileWatchHandler(PatternMatchingEventHandler):
    """
    Handler class to receive new or modified files
    """

    def __init__(
        self, config: GGConfig, stream: S3ExportStream, sequence_save_callback: Any
    ):
        super(FileWatchHandler, self).__init__(
            patterns=[config.opc_log_name + LOG_ARCHIVE_PATTERN]
        )
        self._sequence_save_callback = sequence_save_callback
        self._config = config
        self._stream = stream
        try:
            os.makedirs(self._config.opc_archive_dir)
        except FileExistsError as e:
            pass

    def on_moved(self, event: FileMovedEvent) -> None:
        """
        Logger renamed and rotated file (callback)

        Parameters
        ----------
        event: FileMovedEvent
        """
        self._sequence_save_callback()

        basename = os.path.basename(event.dest_path)
        if not basename.startswith(".") and not event.is_directory:
            logger.debug(f"file moved: {event}")
            archive_file = f"{self._config.opc_archive_dir}{basename}.gz"
            archive_file_created = False
            with open(event.dest_path, "rb") as f_in:
                with gzip.open(archive_file, "wb") as f_out:
                    shutil.copyfileobj(f_in, f_out)
                    archive_file_created = True

        if archive_file_created:
            self.append_file(archive_file)
            os.remove(event.dest_path)

        super().on_moved(event)

    def append_file(self, path: str) -> None:
        """
        Add files to Stream Manager for S3 export

        Parameters
        ----------
        path: str
            File paths to be added to the stream
        """
        key = self.create_key(path)

        self._stream.append_message(path, key)

    def create_key(self, path) -> str:
        """Create key when put to S3

        Key with `! {timestamp:YYYYY}/! {timestamp:MM}/! {timestamp:dd}/! {timestamp:HH}`,
        Stream Manager will automatically replace it with the date and time it was sent,
        but this case we want to use the date and time the log was generated,
        not the date and time it was sent. So use the date and time in the file name.

        Parameters
        ----------
        path: str
            File path to be added to the stream.

        Returns
        -------
        Returns str
            Key for S3 export
        """
        filename = os.path.basename(path)

        key_prefix = self._config.bucket_prefix

        if key_prefix:
            matched_strings = re.findall(
                ".+\.([0-9]{4})-([0-9]{2})-([0-9]{2})_([0-9]{2})-([0-9]{2})\.gz",
                filename,
            )
            if len(matched_strings) == 1 and len(matched_strings[0]) == 5:
                key_prefix = (
                    key_prefix.replace("!{timestamp:YYYY}", matched_strings[0][0])
                    .replace("!{timestamp:MM}", matched_strings[0][1])
                    .replace("!{timestamp:dd}", matched_strings[0][2])
                    .replace("!{timestamp:HH}", matched_strings[0][3])
                )

            return f"{key_prefix}/{os.path.basename(path)}"
        else:
            return filename
