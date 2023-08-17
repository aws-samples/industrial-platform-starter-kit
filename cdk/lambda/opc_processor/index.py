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
    # NOTE: Some properties contains `$`, which is not supported in Athena query.
    # To resolve this, replace `$` with `_`.
    query_string = f"""
    INSERT INTO {DATABASE}.{TARGET_TABLE}
    SELECT 
        propertyvalue.value AS value,
        date_add('millisecond',propertyvalue.timestamp.offsetinnanos / 1000000,from_unixtime(propertyvalue.timestamp.timeinSeconds)) as timestamp,
        datehour, replace(propertyalias, '$', '_') AS tag
    FROM "{SOURCE_TABLE}" CROSS JOIN UNNEST(propertyvalues) AS t(propertyvalue)
    WHERE datehour='{datehour}' AND propertyalias in ('{"', '".join(tags)}')
    """
    return query_string


def handler(event, context):
    if event.get("datehour"):
        # For debugging
        datehour = event["datehour"]
    else:
        # NOTE: Handle 1 hour before data
        now = datetime.now() - timedelta(hours=1)
        year = str(now.year)
        month = str(now.month).zfill(2)
        day = str(now.day).zfill(2)
        hour = str(now.hour).zfill(2)
        datehour = f"{year}/{month}/{day}/{hour}"
    print(f"[DEBUG] datehour: {datehour}")

    # NOTE: Adding partitions is limited to 100 partitions at a time, so get all tags first and insert them in 100 tag increments
    # See: https://docs.aws.amazon.com/ja_jp/athena/latest/ug/ctas-insert-into.html
    tag_query = f"""
    SELECT DISTINCT(propertyalias)
    FROM "{SOURCE_TABLE}"
    WHERE datehour='{datehour}'
    """
    print(f"[DEBUG] query string: {tag_query}")
    result = run_athena_query(tag_query, DATABASE, WORKGROUP_NAME)

    # The first element is column name so skip it
    rows = result["ResultSet"]["Rows"][1:]
    data = [r["Data"] for r in rows]
    tags = [d[0]["VarCharValue"] for d in data]
    print(f"[DEBUG] tags: {tags}")

    # Split tags into 100 tags per query
    split_tags = [
        tags[i : i + LIMIT_WRITE_PARTITIONS]
        for i in range(0, len(tags), LIMIT_WRITE_PARTITIONS)
    ]
    for st in split_tags:
        q = build_insert_query(datehour, st)
        print(f"[DEBUG] query string: {q}")
        result = run_athena_query(q, DATABASE, WORKGROUP_NAME)
