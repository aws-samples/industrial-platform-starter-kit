import json
import os
import time
import typing
import urllib.parse
import uuid
from datetime import datetime, timedelta

import boto3

DATABASE = os.environ.get("DATABASE")
SOURCE_TABLE = os.environ.get("SOURCE_TABLE")
WORKGROUP_NAME = os.environ.get("WORKGROUP_NAME")
TEMP_BUCKET = os.environ.get("TEMP_BUCKET")
LIMIT_WRITE_PARTITIONS = 100

athena = boto3.client("athena")
s3 = boto3.client("s3")


def upload_to_s3(data, bucket, key):
    s3.put_object(Bucket=bucket, Key=key, Body=json.dumps(data))


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

    query_result_paginator = athena.get_paginator("get_query_results")
    query_result_iterator = query_result_paginator.paginate(
        QueryExecutionId=execution_id, PaginationConfig={"PageSize": 1000}
    )
    query_result = [
        data["VarCharValue"]
        for page in query_result_iterator
        for row in page["ResultSet"]["Rows"][1:]
        for data in row["Data"]
    ]

    print(f"[DEBUG] number of rows: {len(query_result)}")
    print(f"[DEBUG] query_result: {query_result}")
    print(f"[INFO] Query {execution_id} finished with status: {status}")

    return query_result


def handler(event, context):
    print(f"[DEBUG] event: {event}")
    if event.get("datehour"):
        datehour = event["datehour"]
    else:
        now = datetime.now() - timedelta(hours=1)
        year = str(now.year)
        month = str(now.month).zfill(2)
        day = str(now.day).zfill(2)
        hour = str(now.hour).zfill(2)
        datehour = f"{year}/{month}/{day}/{hour}"

    tag_query = f"""
    SELECT DISTINCT(propertyalias)
    FROM "{SOURCE_TABLE}"
    WHERE datehour='{datehour}'
    """
    result = run_athena_query(tag_query, DATABASE, WORKGROUP_NAME)

    tag_chunks = [
        result[i : i + LIMIT_WRITE_PARTITIONS]
        for i in range(0, len(result), LIMIT_WRITE_PARTITIONS)
    ]

    s3_keys = []
    for chunk in tag_chunks:
        unique_id = uuid.uuid4()
        s3_key = f"{datehour}/{unique_id}.json"
        upload_to_s3(chunk, TEMP_BUCKET, s3_key)
        s3_keys.append(s3_key)

    return {"s3Keys": s3_keys, "datehour": datehour}

    # # NOTE: Athena insert query is limited to 100 partitions.
    # # To avoid this issue, split tag list to chunks and then pass to map state of state machine.
    # tag_chunks = [
    #     result[i : i + LIMIT_WRITE_PARTITIONS]
    #     for i in range(0, len(result), LIMIT_WRITE_PARTITIONS)
    # ]

    # return {"tagChunks": tag_chunks, "datehour": datehour}
