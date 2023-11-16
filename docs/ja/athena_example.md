# Athena によるクエリ例

OPC-UA データを保管している S3 バケットは Raw バケットと Processed バケットの 2 つがあります。Raw バケットはタグによるパーティショニングがされていないためスキャン量が増える一方、ニアリアルタイムなデータアクセスが可能です。一方 Processed バケットはタグによるパーティショニングがされているためスキャン量を抑えることができ過去データの分析に向いている一方、データ到着まで 1 時間以上の遅延が発生します。ここではそれぞれのバケットに対する実践的なクエリ例を掲載します。まずは Processed バケットの方から解説します。

## Processed バケット

クエリ時はパーティションの指定が必要です。具体的には`datehour`および`tag`の指定が必要です。`datehour`は `YYYY/MM/dd/HH` のフォーマット、タグは文字列で指定します。なおタグは URL エンコーディングされた状態であることを考慮する必要があります。これは Athena のパーティションに利用できる文字列が ASCII 文字である制約があるためです。下記にその SQL 例を示します。

```sql
SELECT
    "value"."doublevalue"
    -- 日本のタイムゾーンを考慮し9を足す
    ,"timestamp"  + interval '9' hour as "timestamp"
    , datehour
    -- URLエンコーディングされたタグ
    , url_encoded_tag
    -- URLエンコード前の元のタグ名
    , REPLACE(url_decode(REPLACE(url_encoded_tag, '/', '_')), '_', '/') as tag
FROM "industrial_platform"."opc_processed"
WHERE datehour BETWEEN
-- 2023-08-17 00:00:00を、タイムゾーンを考慮してYYYY/MM/dd/HHのフォーマットに変換する
date_format(at_timezone(timestamp '2023-08-17 00:00:00', INTERVAL '-9' HOUR), '%Y/%m/%d/%H')
    AND date_format(at_timezone(timestamp '2023-08-18 00:00:00', INTERVAL '-9' HOUR), '%Y/%m/%d/%H')
-- URLエンコードして指定する
  AND url_encoded_tag IN (REPLACE(URL_ENCODE(REPLACE('/factory1/tag2', '/', '_')), '_', '/'))
-- 必要であればさらにタイムスタンプを絞り込む
-- NOTE: パーティション (datehour) のみの指定の場合、１時間分のデータ全てが取得されます
  AND timestamp BETWEEN
  at_timezone(timestamp '2023-08-17 00:00:00', INTERVAL '-9' HOUR)
      AND at_timezone(timestamp '2023-08-18 00:00:00', INTERVAL '-9' HOUR)
ORDER BY timestamp
```

複雑に見えるかもしれませんが、実際にやっていることはシンプルで、本質は下記のようなクエリです。

```sql
SELECT
    value, tag
FROM "table"
WHERE datehour BETWEEN 2023/01/01/00 AND 2023/01/01/23
    AND tag='/root/tag'
```

上記クエリでは、

- 期間: 2023/8/17 0:00 ~ 2023/8/18 0:00
- タグ: /root/tag2

のデータを取得しています。クエリ結果は下記のようになります。

| doublevalue       | timestamp               | datehour      | tag        |
| ----------------- | ----------------------- | ------------- | ---------- |
| 520.5613096700736 | 2023-08-17 09:00:00.244 | 2023/08/16/23 | /root/tag2 |
| 520.1623253285996 | 2023-08-17 09:00:01.245 | 2023/08/16/23 | /root/tag2 |
| 520.1805721096129 | 2023-08-17 09:00:02.247 | 2023/08/16/23 | /root/tag2 |
| 521.1050045255532 | 2023-08-17 09:00:03.248 | 2023/08/16/23 | /root/tag2 |
| 520.5403764628401 | 2023-08-17 09:00:04.250 | 2023/08/16/23 | /root/tag2 |

interval で指定している`9`は UTC との時差です。本プロジェクトでは UTC での取り扱いを想定しているため、日本時間でのクエリには指定が必要です。

なおタグは本プロジェクトに含まれるダミーの OPC-UA サーバを想定しています。ダミーの OPC-UA サーバでは、tag2 は Double 型のため、SELECT 分では`doublevalue`を指定しています。他のタグをクエリする場合は下記の対応にご留意ください。

- /root/tag1: `integervalue`
- /root/tag2: `doublevalue`
- /root/tag3: `stringvalue`
- /root/tag4: `booleanvalue`

## Raw バケット

まずは Greengrass から送られてくるそのままのデータを出力してみましょう。ここで datehour の指定は適当な値に置換してください。

```sql
SELECT * FROM "industrial_platform"."opc_raw" WHERE datehour='2023/08/17/00' LIMIT 10
```

Greengrass そのままの形式では propertyvalues の配列が可変長であり可読性が悪いです。これは Greengrass 側でキューイングするデータ量が異なることに起因します。下記のクエリでは可読性の高い形で結果を取得することができます。前述したように datehour は適当な値を指定してください。

```sql
SELECT
    propertyvalue.value AS value,
    date_add('millisecond',propertyvalue.timestamp.offsetinnanos / 1000000,from_unixtime(propertyvalue.timestamp.timeinSeconds)) as timestamp,
    datehour, propertyalias AS tag
FROM "industrial_platform"."opc_raw" CROSS JOIN UNNEST(propertyvalues) AS t(propertyvalue)
WHERE datehour='2023/08/17/00'
ORDER BY timestamp, TAG
LIMIT 10

```

また、ある１時間の間（あるパーティション）のタグ一覧は下記により取得できます。OPC サーバに設定されたタグがすべて S3 へ収集されているか確かめる用途などでお使いください。

```sql
SELECT DISTINCT(propertyalias) FROM "industrial_platform"."opc_raw" WHERE datehour='2023/11/02/14' order by propertyalias
```

では続いてタグごとに最新のデータを取得してみましょう。上記のクエリを応用し、たとえば下記のように記述できます。1 時間の遅れが許容できないユースケースでご参考にしてください。

```sql
WITH temp AS (
    SELECT
        propertyvalue.value AS value,
        date_add('millisecond',propertyvalue.timestamp.offsetinnanos / 1000000,from_unixtime(propertyvalue.timestamp.timeinSeconds)) as timestamp,
        datehour, propertyalias AS tag
    FROM "industrial_platform"."opc_raw" CROSS JOIN UNNEST(propertyvalues) AS t(propertyvalue)
    WHERE datehour = (
        SELECT MAX(datehour) FROM "industrial_platform"."opc_raw"
        -- 最新の時刻を含む可能性のあるパーティションを指定することでスキャン量を削減する
        WHERE datehour >= '2023/08/17/00' and datehour <= '2023/08/17/01'
    )
), temp2 AS (
    -- タグごとに最新のタイムスタンプを取得
    SELECT
        tag,
        MAX(datehour) as datehour,
        MAX(timestamp) as latest_timestamp
    FROM temp
    GROUP BY tag
)
SELECT
    temp.*
FROM temp
JOIN temp2 ON temp.tag=temp2.tag AND temp.timestamp=temp2.latest_timestamp
```

下記のように、タグごとの最新値が得られるはずです。

| value                                                                                   | timestamp               | datehour      | tag        |
| --------------------------------------------------------------------------------------- | ----------------------- | ------------- | ---------- |
| {integervalue=-5409, doublevalue=null, stringvalue=null, booleanvalue=null}             | 2023-08-17 02:00:06.163 | 2023/08/17/01 | /root/tag1 |
| {integervalue=null, doublevalue=561.7779348057541, stringvalue=null, booleanvalue=null} | 2023-08-17 02:00:16.177 | 2023/08/17/01 | /root/tag2 |
| {integervalue=null, doublevalue=null, stringvalue=nice, booleanvalue=null}              | 2023-08-17 02:00:06.163 | 2023/08/17/01 | /root/tag3 |
| {integervalue=null, doublevalue=null, stringvalue=null, booleanvalue=false}             | 2023-08-17 02:00:06.163 | 2023/08/17/01 | /root/tag4 |
