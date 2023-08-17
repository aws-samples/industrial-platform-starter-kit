import os

import awswrangler as wr
import boto3
import pandas as pd

TARGET_BUCKET = os.environ.get("TARGET_BUCKET")

s3_client = boto3.client("s3")


def transform(df: pd.DataFrame) -> pd.DataFrame:
    """Transform json object."""
    #######################
    # Write your own code to transform the input data (pandas.DataFrame).
    # At this sample, we just return the same data.
    #######################
    return df


def handler(event, context):
    for record in event["Records"]:
        # Get S3 bucket name and object key name
        bucket_name = record["s3"]["bucket"]["name"]
        object_key = record["s3"]["object"]["key"]

        print(f"[DEBUG] bucket_name: {bucket_name}")
        print(f"[DEBUG] object_key: {object_key}")

        df = wr.s3.read_csv(path=[f"s3://{bucket_name}/{object_key}"])

        print(f"[DEBUG] source data:")
        print(df.head())

        df_transformed = transform(df)

        print(f"[DEBUG] transformed data:")
        print(df_transformed.head())

        # Save transformed data to S3 bucket as same object key name
        print(f"[DEBUG] writing to s3 bucket...")
        wr.s3.to_csv(
            df=df_transformed, path=f"s3://{TARGET_BUCKET}/{object_key}", index=False
        )

        print("[DEBUG] successfully saved.")
