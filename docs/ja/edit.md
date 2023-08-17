# 各コードの編集すべき箇所について

## ファイルの変換

### CSV ファイル・JSON ファイル

[industrial-platform-stack.ts](../../cdk/lib/industrial-data-platform-stack.ts)の下記箇所を利用するファイルの形式に応じて編集してください。

```ts
...
// CSVファイルを利用する場合
const csvFileProcessor = new FileProcessor(this, "CsvFileProcessor", {
sourceBucket: storage.fileRawBucket,
targetBucket: storage.fileProcessedBucket,
fileType: FileType.CSV,
});


// JSONファイルを利用する場合
const jsonFileProcessor = new FileProcessor(this, "JsonFileProcessor", {
sourceBucket: storage.fileRawBucket,
targetBucket: storage.fileProcessedBucket,
fileType: FileType.JSON,
});
...
```

### テキストデータの変換処理

Lambda で変換処理する実態はそれぞれ[CSV](../../cdk/lambda/file_processor/csv/index.py) / [JSON](../../cdk/lambda/file_processor/json/index.py)にあります。transform メソッドをお客様の利用ケースに合わせて実装してください。CSV は pandas の DataFrame, JSON は dict オブジェクトを想定しています。

```py
def transform(df: pd.DataFrame) -> pd.DataFrame:
    """Transform json object."""
    #######################
    # Write your own code to transform the input data (pandas.DataFrame).
    # At this sample, we just return the same data.
    #######################
    return df
```

一部の検査機などが出力するファイルは CSV や JSON などのフォーマットに従わない場合があり、その場合は handler メソッドの修正が必要となります点にご留意ください。

## Glue データカタログの編集

Athena でデータをクエリするためには、Glue データカタログに正しいテーブルを登録する必要があります。[datacatalog.ts](../../cdk/lib/constructs/datacatalog.ts)の下記箇所を、テキストデータ変換後のスキーマに合わせて編集してください。具体的には`columns`に列名を、`dataFormat`にファイル形式を設定ください。

```ts
const productionTable = new glue.Table(this, "ProductionTable", {
  database: IndustrialPlatformDatabase,
  tableName: "production",
  partitionKeys: [
    {
      name: "date",
      type: glue.Schema.STRING,
    },
  ],
  columns: [
    { name: "BatchID", type: glue.Schema.STRING },
    { name: "ProductName", type: glue.Schema.STRING },
    { name: "StartTime", type: glue.Schema.STRING },
    { name: "EndTime", type: glue.Schema.STRING },
  ],
  dataFormat: glue.DataFormat.CSV,
  // dataFormat: glue.DataFormat.JSON,
  compressed: false,
  bucket: props.storage.fileProcessedBucket,
});
```
