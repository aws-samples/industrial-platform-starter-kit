# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

import fnmatch
import logging
import os
import re
import time

from gg_config import GGConfig
from stream.s3_stream import S3ExportStream
from util.shadow import ShadowController
from watchdog.events import FileSystemEvent, PatternMatchingEventHandler
from watchdog.observers.polling import PollingObserver

logger = logging.getLogger()
logger.setLevel(logging.INFO)
handler = logging.StreamHandler()
handler.setFormatter(
    logging.Formatter("[%(levelname)8s] %(filename)s(%(lineno)s) %(message)s")
)
logger.addHandler(handler)


class FileStreamAppender:
    """
    Class to add files to Stream Manager
    """

    def __init__(self, config: GGConfig, stream: S3ExportStream):
        self._stream = stream
        self._config = config
        self._target_dir_len = len(config.target_dir) + 1
        self._key_prefix = config.bucket_prefix
        self._includes = r"|".join(
            [fnmatch.translate(x) for x in [self._config.file_pattern]]
        )
        self._latest_check_time = 0

    def check(self, interval: int):
        """
        Checks for file updates at specified intervals
        @param interval: int
        """
        shadow = ShadowController("latest_check_time")
        try:
            latestConfig = shadow.get_thing_shadow_request()
            if latestConfig is not None:
                self._latest_check_time = (
                    latestConfig.get("state", {})
                    .get("reported", {})
                    .get("latest_time", 0)
                )

            while True:
                self._latest_check_time = self.check_files(self._latest_check_time)
                time.sleep(interval)
        except (KeyboardInterrupt, SystemExit):
            pass
        finally:
            # Last check time is persisted in Shadow
            shadow.update_thing_shadow_request({"latest_time": self._latest_check_time})

    def check_modified(self, last_check_time: float, path: str):
        """
        Check if the file modification date is later than the last confirmation
        @param last_check_time: float
        @param path: str
        """
        return last_check_time < os.path.getmtime(path)

    def check_files(self, latest_check_time: int = 0):
        """
        Add updated files under the target directory to the Stream
        @param latest_check_time: int
        """
        check_time = time.time()
        for root, _, files in os.walk(top=self._config.target_dir):
            files = [f for f in files if re.match(self._includes, f)]
            for file in files:
                target_file = os.path.join(root, file)
                if latest_check_time == 0 or self.check_modified(target_file):
                    self.append_file(target_file)

        return check_time

    def append_file(self, path: str):
        """
        Adding files to Stream manager
        @param path: str
        """
        key = (
            path[self._target_dir_len :]
            if not self._key_prefix
            else f"{self._key_prefix}/{path[self._target_dir_len:]}"
        )
        self._stream.append_message(path, key)


class FileWatchHandler(PatternMatchingEventHandler):
    """
    Handler class to receive new or modified files
    """

    def __init__(self, config: GGConfig, stream: S3ExportStream):
        super(FileWatchHandler, self).__init__(patterns=[config.file_pattern])
        self._config = config
        self._file_appender = FileStreamAppender(config, stream)
        self._file_appender.check_files(0)

    def on_created(self, event: FileSystemEvent):
        """
        @param event: watchdog.events.FileSystemEvent
        """
        basename = os.path.basename(event.src_path)
        if not basename.startswith(".") and not event.is_directory:
            logger.info(f"file created: {event}")
            self._file_appender.append_file(event.src_path)
        return super().on_created(event)

    def on_modified(self, event):
        """
        @param event: watchdog.events.FileSystemEvent
        """
        if not self._config.delete_moved_file:
            basename = os.path.basename(event.src_path)
            if not basename.startswith(".") and not event.is_directory:
                logger.info(f"file modified: {event}")
                self._file_appender.append_file(event.src_path)

        return super().on_modified(event)


def main():
    try:
        config = GGConfig()
        logger.setLevel(logging._nameToLevel[config.log_level.upper()])

        config.print_config()

        stream = S3ExportStream(
            stream_name="com.example.file_watcher.s3",
            bucket=config.bucket,
            delete_moved_file=config.delete_moved_file,
        )

        if config.check_interval_sec == 0:
            event_handler = FileWatchHandler(config, stream)
            try:
                observer = PollingObserver()
                observer.schedule(event_handler, config.target_dir, recursive=True)
                observer.start()
                while True:
                    time.sleep(1)
            except KeyboardInterrupt:
                observer.stop()
            observer.join()
        else:
            file_appender = FileStreamAppender(config, stream)
            file_appender.check(config.check_interval_sec)

    except Exception as ex:
        logger.exception(ex)
        raise ex


if __name__ == "__main__":
    main()
