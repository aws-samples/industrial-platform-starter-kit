import os
import time
import typing
from datetime import datetime, timedelta

import boto3

DATABASE = os.environ.get("DATABASE")
SOURCE_TABLE = os.environ.get("SOURCE_TABLE")
TARGET_TABLE = os.environ.get("TARGET_TABLE")
WORKGROUP_NAME = os.environ.get("WORKGROUP_NAME")
LIMIT_WRITE_PARTITIONS = 100

athena = boto3.client("athena")


def run_athena_query(query: str, database: str, workgroup: str):
    """Run athena query."""
    query_execution = athena.start_query_execution(
        QueryString=query,
        QueryExecutionContext={"Database": database},
        WorkGroup=workgroup,
    )
    execution_id = query_execution["QueryExecutionId"]
    print(f"[DEBUG] query_execution_id: {execution_id}")

    # Wait until query completed
    while True:
        query_execution = athena.get_query_execution(QueryExecutionId=execution_id)
        status = query_execution["QueryExecution"]["Status"]["State"]
        print(f"[DEBUG] status: {status}")
        if status == "SUCCEEDED":
            break
        elif status == "FAILED":
            reason = query_execution["QueryExecution"]["Status"]["StateChangeReason"]
            print(f"[ERROR] query failed.")
            raise Exception(reason)
        else:
            time.sleep(1)

    query_result = athena.get_query_results(
        QueryExecutionId=execution_id,
    )
    print(f"[DEBUG] query_result: {query_result}")
    print(f"[INFO] Query {execution_id} finished with status: {status}")

    return query_result


def build_insert_query(datehour: str, tags: typing.List):
    """Build insert query."""
    # NOTE: Athena partition is only available for ascii printable characters.
    # To avoid this issue, convert to url encoded string.

    query_string = f"""
    INSERT INTO {DATABASE}.{TARGET_TABLE}
    SELECT 
        propertyvalue.value AS value,
        date_add('millisecond',propertyvalue.timestamp.offsetinnanos / 1000000,from_unixtime(propertyvalue.timestamp.timeinSeconds)) as timestamp,
        datehour, REPLACE(URL_ENCODE(REPLACE(propertyalias, '/', '_')), '_', '/') AS url_encoded_tag
    FROM "{SOURCE_TABLE}" CROSS JOIN UNNEST(propertyvalues) AS t(propertyvalue)
    WHERE datehour='{datehour}' AND propertyalias in ('{"', '".join(tags)}')
    """
    return query_string


def handler(event, context):
    print(event)
    tags = event["tags"]
    datehour = event["datehour"]

    q = build_insert_query(datehour, tags)
    print(f"[DEBUG] query string: {q}")
    result = run_athena_query(q, DATABASE, WORKGROUP_NAME)
