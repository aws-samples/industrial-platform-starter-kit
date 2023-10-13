import datetime
import json
import os

import psycopg2
from psycopg2 import sql


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
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS GradeMaster (
            GradeID VARCHAR PRIMARY KEY,
            GradeName VARCHAR NOT NULL
        );
    """
    )

    # Create Batch Production Record table
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS BatchProductionRecord (
            BatchID VARCHAR PRIMARY KEY,
            GradeID VARCHAR REFERENCES GradeMaster(GradeID),
            ProductionNumber INT NOT NULL,
            ProductionTimestamp TIMESTAMP NOT NULL
        );
    """
    )

    # Insert dummy data into Grade Master
    for i in range(1, 4):
        cursor.execute(
            sql.SQL(
                """
            INSERT INTO GradeMaster (GradeID, GradeName)
            VALUES (%s, %s)
            ON CONFLICT (GradeID) DO NOTHING;
        """
            ),
            (f"Grade{i}", f"GradeName{i}"),
        )

    # Insert dummy data into Batch Production Record
    for i in range(1, 11):
        cursor.execute(
            sql.SQL(
                """
            INSERT INTO BatchProductionRecord (BatchID, GradeID, ProductionNumber, ProductionTimestamp)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (BatchID) DO NOTHING;
        """
            ),
            (f"Batch{i}", f"Grade{i%3+1}", i * 10, datetime.datetime.now()),
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
                "BrandMaster": grade_records,
                "BatchProductionRecord": batch_records,
            },
            default=lambda x: x.isoformat() if isinstance(x, datetime.datetime) else x,
        ),
    }
