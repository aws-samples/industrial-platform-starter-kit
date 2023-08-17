# はじめかた

以降、データの収集から QuickSight による可視化までの実際の手順について説明します。おおまかには下記の手順に従います。

- クラウド側リソースのデプロイ
- エッジゲートウェイデバイスへ Greengrass をインストール
  - エッジ側リソースのデプロイ
- QuickSight の設定のデプロイ
- QuickSight でデータを分析・可視化

## 前提条件

以降のドキュメントは全て UNIX 環境が前提の構築方法になっています。手元の環境で実行する場合は、`AdministratorAccess` 相当の広い権限を付与してください(本番環境に干渉しないよう、アカウントを分離するなどの対応をお願いいたします)。 また、AWS CDK を利用するため、Node.js の実行環境が必要です。

### UNIX コマンド実行環境の作成

手元に UNIX コマンド実行環境がない場合は、AWS Cloud9 を利用することも可能です。AWS Cloud9 の環境を作成する際は、[cloud9-setup-for-prototyping](https://github.com/aws-samples/cloud9-setup-for-prototyping) を利用することをお勧めします。

その他、EC2 インスタンス上に作成し SSH ログインする方法もあります。その場合は[ec2-setup-for-prototyping](https://github.com/aws-samples/ec2-setup-for-prototyping)を利用することをお勧めします。

続いて[クラウド側リソースのデプロイ](./deploy_cloud_ja.md)へお進みください。
