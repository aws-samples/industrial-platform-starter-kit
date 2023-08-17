# クラウド側リソースのデプロイ

## 準備

まずは、このリポジトリを `git clone` して、npm パッケージのインストールを行います。ターミナルにて、以下のコマンドを実行してください。

```bash
git clone https://github.com/aws-samples/industrial-platform-starter-kit
cd industrial-platform-starter-kit
npm ci
```

### AWS CDK のセットアップ

下記コマンドにより CDK をインストールします。

```
npm i -g aws-cdk
```

AWS CDK を利用したことがないリージョンを使う場合は、1 度だけ [Bootstrap](https://docs.aws.amazon.com/cdk/v2/guide/bootstrapping.html) という作業が必要です。下記コマンドを実行してください。

```bash
cdk bootstrap
```

### QuickSight のセットアップ

[こちら](https://docs.aws.amazon.com/ja_jp/quicksight/latest/user/signing-up.html)のドキュメントに従い、QuickSight サブスクリプションへのサインアップを完了してください。

### デプロイ設定の編集

`cdk.json`を開き、末尾にある下記の項目を変更してください。

- opcuaEndpointUri: OPC-UA サーバのエンドポイント
- sourceDir: 監視対象のディレクトリ
- quicksightUserName: QuickSight のユーザ名

本プロジェクトでは実 OPC-UA サーバやデバイスがお手元に無い場合においても動作確認ができるようにするため、仮想デバイスをサンプルに含めています。その場合は`opcuaEndpointUri`については`opc.tcp://localhost:52250`、`sourceDir`については`/home/ggc_user/data`を設定してください。`quicksightUserName`は[QuickSight トップページ](https://quicksight.aws.amazon.com)の右上アイコンより確認できますので、各自の環境に合わせた値を設定してください。

### 仮想デバイスのデプロイ

仮想デバイスを利用した動作確認をされる場合は、`cdk/bin/industrial-data-platform.ts`ファイルを開き、`provisionVirtualDevice`を`true`に設定します。実際のデバイスをご利用の場合は`false`を指定してください。

## CDK でリソースをデプロイ

以下のコマンドを実行してください。なおコマンドは`cdk`ディレクトリ下で実行する必要があります。

```bash
cdk deploy IndustialDataPlatformStack --require-approval never
```

デプロイは環境にもよりますが、5 分程度で完了します。以下のような出力であれば成功です。

```
 ✅  IndustialDataPlatformStack

✨  Deployment time: 232.14s

Outputs:
IndustialDataPlatformStack.ExportsOutputFnGetAttFileWatcherEAAA0D27componentVersion1D4BE84C = 1.0.0
...
```

続いて[エッジゲートウェイデバイスへ Greengrass をインストール](./deploy_edge_ja.md)へお進みください。
