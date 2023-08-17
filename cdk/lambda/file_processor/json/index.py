import json
import os

import boto3

TARGET_BUCKET = os.environ.get("TARGET_BUCKET")
s3_client = boto3.client("s3")


def transform(data: dict) -> dict:
    """Transform json object."""
    #######################
    # Write your own code to transform the input data.
    # At this sample, we just return the same data.
    #######################
    return data


def handler(event, context):
    for record in event["Records"]:
        # Get S3 bucket name and object key name
        bucket_name = record["s3"]["bucket"]["name"]
        object_key = record["s3"]["object"]["key"]

        print(f"[DEBUG] bucket_name: {bucket_name}")
        print(f"[DEBUG] object_key: {object_key}")

        response = s3_client.get_object(Bucket=bucket_name, Key=object_key)
        file_content = response["Body"].read().decode("utf-8")
        data = json.loads(file_content)

        print(f"[DEBUG] source data: {data}")

        data_transformed = transform(data)

        print(f"[DEBUG] transformed data: {data_transformed}")

        # Save transformed data to S3 bucket as same object key name
        print(f"[DEBUG] writing to s3 bucket...")
        s3_client.put_object(
            Bucket=TARGET_BUCKET,
            Key=object_key,
            Body=json.dumps(data_transformed).encode("utf-8"),
        )
        print(f"[DEBUG] done.")

        print("[DEBUG] successfully saved.")
