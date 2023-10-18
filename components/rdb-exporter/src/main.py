import asyncio
import logging
import os
import re
import signal
import sys

from gg_config import GGConfig

logger = logging.getLogger("opc-archiver-component-logger")
logger.setLevel(logging.INFO)
handler = logging.StreamHandler()
handler.setFormatter(
    logging.Formatter("[%(levelname)8s] %(filename)s(%(lineno)s) %(message)s")
)
logger.addHandler(handler)


exit_event = asyncio.Event()

DECOMPRESSED_PATH = os.environ.get("DECOMPRESSED_PATH")
EMBULK_VERSION = os.environ.get("EMBULK_VERSION")
EMBULK_EXEC_PATH = os.path.join(DECOMPRESSED_PATH, f"embulk-{EMBULK_VERSION}.jar")


async def shutdown(signal):
    logger.info(f"Received exit signal {signal.name}...")
    exit_event.set()


async def embulk_task(config: GGConfig):
    conf_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "conf")
    liquid_files = [f for f in os.listdir(conf_dir) if f.endswith(".liquid")]
    for f in liquid_files:
        match = re.search(r"(.+)\.yml\.liquid", f)
        if match:
            base_name = match.group(1)
        else:
            raise ValueError("invalid file name")

        # Create cursor directory to store cursor files
        # See: https://github.com/embulk/embulk-input-jdbc/blob/master/embulk-input-jdbc/README.md#incremental-loading
        cursor_dir_path = os.path.join(conf_dir, ".cursor")
        if not os.path.exists(cursor_dir_path):
            os.makedirs(cursor_dir_path)

        process = await asyncio.create_subprocess_exec(
            "java",
            "-jar",
            EMBULK_EXEC_PATH,
            "run",
            os.path.join(conf_dir, f),
            "-c",
            os.path.join(cursor_dir_path, f"{base_name}.yml"),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await process.communicate()
        if stdout:
            logger.info(stdout.decode().strip())
        if stderr:
            logger.error(stderr.decode().strip())

    return process.returncode


async def run_task(config: GGConfig):
    while not exit_event.is_set():
        task = asyncio.create_task(embulk_task(config))

        await asyncio.sleep(config.run_interval_sec)

        while not task.done():
            logger.warning("embulk task is still running. wait another interval.")
            await asyncio.sleep(config.run_interval_sec)


async def main():
    try:
        if sys.platform != "win32":
            for s in [signal.SIGTERM, signal.SIGINT]:
                asyncio.get_running_loop().add_signal_handler(
                    s, lambda s=s: asyncio.create_task(shutdown(s))
                )
        config = GGConfig()
        logger.setLevel(logging._nameToLevel[config.log_level.upper()])

        config.print_config()

        await run_task(config)
    except Exception as e:
        logger.exception(e)
        raise e


if __name__ == "__main__":
    asyncio.run(main())
