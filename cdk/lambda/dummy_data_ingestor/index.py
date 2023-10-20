import datetime
import json
import os

import psycopg2
from psycopg2 import sql
from ulid import ULID


def handler(event, context):
    # Connection details
    dbname = os.environ["DB_NAME"]
    user = os.environ["DB_USER"]
    password = os.environ["DB_PASSWORD"]
    host = os.environ["DB_HOST"]
    port = os.environ["DB_PORT"]

    connection = psycopg2.connect(
        dbname=dbname, user=user, password=password, host=host, port=port
    )
    cursor = connection.cursor()

    # NOTE: Upper postgres version 14, encryption method of password is changed to SCRAM-SHA-256.
    # Currently Embulk plugin not support SCRAM-SHA-256, so we need to use MD5.
    # See: https://aws.amazon.com/jp/blogs/database/scram-authentication-in-rds-for-postgresql-13/
    cursor.execute("CREATE EXTENSION IF NOT EXISTS rds_tools;")
    cursor.execute("SET password_encryption='md5';")
    cursor.execute(sql.SQL("ALTER role root WITH password %s;"), [password])

    # Create Grade Master table
    # cursor.execute("DROP TABLE IF EXISTS BatchProductionRecord;")
    # cursor.execute("DROP TABLE IF EXISTS GradeMaster;")
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS GradeMaster (
            grade_id VARCHAR PRIMARY KEY,
            grade_name VARCHAR NOT NULL
        );
    """
    )

    # Create Batch Production Record table
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS BatchProductionRecord (
            batch_id VARCHAR PRIMARY KEY,
            grade_id VARCHAR REFERENCES GradeMaster(grade_id),
            production_number INT NOT NULL,
            production_timestamp TIMESTAMP NOT NULL
        );
    """
    )

    # Insert dummy data into Grade Master
    for i in range(1, 4):
        cursor.execute(
            sql.SQL(
                """
            INSERT INTO GradeMaster (grade_id, grade_name)
            VALUES (%s, %s)
            ON CONFLICT (grade_id) DO NOTHING;
        """
            ),
            (f"grade_{i}", f"grade_{['A', 'B', 'C'][i-1]}"),
        )

    # Insert dummy data into Batch Production Record
    for i in range(1, 11):
        batch_id = str(ULID())
        cursor.execute(
            sql.SQL(
                """
            INSERT INTO BatchProductionRecord (batch_id, grade_id, production_number, production_timestamp)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (batch_id) DO NOTHING;
        """
            ),
            (batch_id, f"grade_{i%3+1}", i * 10, datetime.datetime.now()),
        )

    # Verify the inserted records
    cursor.execute("SELECT * FROM GradeMaster;")
    grade_records = cursor.fetchall()

    cursor.execute("SELECT * FROM BatchProductionRecord;")
    batch_records = cursor.fetchall()

    connection.commit()
    cursor.close()
    connection.close()

    return {
        "statusCode": 200,
        "body": json.dumps(
            {
                "message": "Table creation and dummy data insertion completed.",
                "GradeMaster": grade_records,
                "BatchProductionRecord": batch_records,
            },
            default=lambda x: x.isoformat() if isinstance(x, datetime.datetime) else x,
        ),
    }
