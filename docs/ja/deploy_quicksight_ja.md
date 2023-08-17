# QuickSight の設定のデプロイ

QuickSight はプログラミングすることなく、データの可視化や分析ができますが、このプロジェクトでは時間短縮のため CDK により一部の QuickSight のリソースをデプロイします。

下記のコマンドを実行します。

```
cdk deploy QuicksightStack --require-approval never
```

上記コマンドによりデータソースおよびデータセット (OPC データ・ファイルデータ) が作成されます。データソースおよびデータセットについては公式のドキュメント ([データソース](https://docs.aws.amazon.com/quicksight/latest/user/create-a-data-source.html)、[データセット](https://docs.aws.amazon.com/quicksight/latest/user/creating-data-sets.html)) をご確認ください。

デプロイが完了したら、[QuickSight でデータを分析・可視化](./quicksight_ja.md)にお進みください。
