# エッジゲートウェイデバイスへ Greengrass をインストール

## 想定環境

まずデバイスの想定環境を確認します。仮想デバイスをご利用の場合、本手順をスキップし次節の「Greengrass のインストール」へお進みください。

まず[Greengrass 動作環境](https://docs.aws.amazon.com/greengrass/v2/developerguide/setting-up.html#installation-requirements) を参照し、サポートされているプラットフォームとデバイスの要件を確認してください。

続いて Python / Java をインストールします。Python はバージョン 3.9 以降、Java はバージョン 11 のインストールをお勧めします。なお Java は JDK インストールは不要です。また仮想デバイスでは[Amazon Corretto 11](https://aws.amazon.com/corretto/)をインストールしています。

### 補足: Java のバージョン

Greengrass が必要とする Java のバージョンは 8 以降となっています。Java SE では v20 と最新版がリリースされていたり、Corretto でも v8,v11,v17,v20 がダウンロードできる状態です。Greengrass が動作するバージョンとしては v8 以降であればどのバージョンでも問題ありませんが、今回適用する SiteWise コンポーネントが、v17 以降で正常に動作しないことが確認されているため、v11 をインストールすることをお勧めします。

### 補足: Windows 環境の Python のインストール

Python セットアップ時に PATH 環境変数への追加と、すべてのユーザで Python を実行可能なようにインストールする必要があります。
セットアップ中の Add python.exe to PATH のチェックボックスへのチェック及び、カスタマイズインストールの Advanced Options で Install Python 3.xx for all users を選択してインストールを行なってください。

![](../imgs/python_install_1.jpeg)
![](../imgs/python_install_2.jpeg)

## Greengrass ユーザのセットアップ

Greengrass 用のユーザーを作成します。仮想デバイスをご利用の場合、本手順をスキップし次節の「Greengrass のインストール」へお進みください。

### Linux の場合

エッジデバイスが Linux の場合、下記のコマンドを実行します。

```
sudo adduser --system ggc_user
sudo groupadd --system ggc_group
```

### Windows の場合

管理者として Windows コマンドプロンプト cmd.exe を開き下記コマンドを実行しユーザを作成します。`<password>`は安全なパスワードに置き換えてください。また、Greengrass が使用するユーザ名は通常 ggc_user となります。特別な理由がない限りはこのユーザ名を使用するようにしてください。

```
net user /add ggc_user <password>
```

Windows の構成によっては、ユーザパスワードの期限切れが設定されている場合があります。Greengrass アプリケーションを継続的に動作させるためには、作成したユーザのパスワードを期限切れまでに更新するか、期限切れを起こさないように設定します。
下記コマンドでパスワード期限について確認できます。

```
net user ggc_user | findstr /C:expires
```

ユーザのパスワード期限が切れないように設定するには下記のコマンドを実行します。

```
wmic UserAccount where "Name='ggc_user'" set PasswordExpires=False
```

また、作成したデフォルトユーザのアカウント情報を LocalSystem アカウントの認証情報マネージャインスタンスに格納する必要があります。PsExec ユーティリティを使用する必要があるため、ダウンロードの上、下記のコマンドを実行します。パスワードは ggc_user 作成時に設定したパスワードに置き換えてください。

```
psexec -s cmd /c cmdkey /generic:ggc_user /user:ggc_user /pass:<password>
```

## Greengrass のインストール

次にゲートウェイデバイス（以降、デバイスと呼称）へ Greengrass をインストールします。

### 準備

仮想デバイスを利用の場合はスキップし、次節の「インストール」から実施してください。

Greengrass インストーラーは必要な AWS リソースを自動的にプロビジョニングするため、インストーラー実行に際して AWS 認証情報が必要です。Greengrass インストール用の IAM ユーザを準備して、 Greengrass インストールを行う Windows 環境に環境変数としてアクセスキー情報を設定します。
このインストールを行う際に使用する AWS 認証情報に割り当てるべきな最低限の IAM ポリシーについては[こちら](https://docs.aws.amazon.com/greengrass/v2/developerguide/provision-minimal-iam-policy.html)を確認し作成いただくか、前章でデプロイした IndustrialPlatformStack で作成される IAM ポリシーをご利用ください (ポリシー名は CloudFormation > IndustrialPlatformStack の出力タブ > GreengrassInstallPolicyName を参照してください)。

ユーザを作成し、ユーザの `AWS_ACCESS_KEY_ID` と `AWS_SECRET_ACCESS_KEY` が取得できたら、ターミナル (Linux)またはコマンドプロンプト (Windows) を管理者権限で立ち上げ下記を入力します。

Linux の場合:

```
export AWS_ACCESS_KEY_ID=<AWS_ACCESS_KEY_ID>
export AWS_SECRET_ACCESS_KEY=<AWS_SECRET_ACCESS_KEY>
```

Windows の場合:

```
set AWS_ACCESS_KEY_ID=<AWS_ACCESS_KEY_ID>
set AWS_SECRET_ACCESS_KEY=<AWS_SECRET_ACCESS_KEY>
```

上記の手順で AWS_ACCESS_KEY_ID,AWS_SECRET_ACCESS_KEY を環境変数にセットしたターミナル (Linux)またはコマンドプロンプト (Windows)で下記作業を続行します。以下のコマンドをで入力して Greengrass パッケージをダウンロードし展開します。なお本手順は[こちら](https://docs.aws.amazon.com/greengrass/v2/developerguide/manual-installation.html#download-greengrass-core-v2)に記載されています。

Linux の場合:

```
curl -s https://d2s8p88vqu9w66.cloudfront.net/releases/greengrass-nucleus-latest.zip > greengrass-nucleus-latest.zip
unzip greengrass-nucleus-latest.zip -d GreengrassInstaller && rm greengrass-nucleus-latest.zip
```

Windows の場合:

```
powershell.exe -command "& {Invoke-WebRequest -Uri https://d2s8p88vqu9w66.cloudfront.net/releases/greengrass-nucleus-latest.zip -OutFile .\greengrass-nucleus-latest.zip; Expand-Archive -LiteralPath .\greengrass-nucleus-latest.zip -DestinationPath .\GreengrassInstaller}"
```

### インストール

仮想デバイス利用の場合は本手順より実施してください。まずは CloudFormation のページに AWS マネージメントコンソールからアクセスし、`IndustialDataPlatformStack`をクリックしてください。その後`出力`タブをクリックし、インストールコマンドを控えます。デバイスの OS が Linux の場合は`GreengrassBootstrapGreengrassInstallCommandForLinux`、Windows の場合は`GreengrassBootstrapGreengrassInstallCommandForWindows`をそれぞれ参照してください。

コマンド例 (Linux):

```
sudo -E java "-Droot=/greengrass/v2" "-Dlog.store=FILE" -jar /GreengrassInstaller/lib/Greengrass.jar --aws-region ap-northeast-1 --thing-name IndustrialDataPlatformGateway --thing-policy-name IndustrialDataPlatformGatewayThingPolicy --tes-role-name IndustialDataPlatformStac-GreengrassBootstrapGreen-XXXXX --tes-role-alias-name IndustialDataPlatformStac-GreengrassBootstrapGreen-XXXXXAlias --component-default-user ggc_user:ggc_group --provision true --setup-system-service true --deploy-dev-tools false
```

控えたコマンドをターミナルまたはコマンドプロンプトで実行してください。なお仮想デバイスを利用している場合はマネージメントコンソールの EC2 インスタンス > IndustialDataPlatformStack/VirtualDevice/Instance > 接続 > セッションマネージャーをご利用いただくことでターミナルへアクセスできます。下記のような出力が得られれば成功です。

```
C:\Users\Administrator>java "-Droot=C:\greengrass\v2" "-Dlog.store=FILE" -jar .\GreengrassInstaller/lib/Greengrass.jar --aws-region ap-northeast-1 --thing-name Prototype-OPC-Gateway --thing-policy-name OPC-GatewayThingPolicy --tes-role-name OPC-GatewayTokenExchangeRole --tes-role-alias-name OPC-GatewayTokenExchangeRoleAlias --component-default-user ggc_user --provision true --setup-system-service true --deploy-dev-tools true
Provisioning AWS IoT resources for the device with IoT Thing Name: [Prototype-OPC-Gateway]...
Found IoT policy "OPC-GatewayThingPolicy", reusing it
Creating keys and certificate...
Attaching policy to certificate...
Creating IoT Thing "TestSite"...
Attaching certificate to IoT thing...
Successfully provisioned AWS IoT resources for the device with IoT Thing Name: [Prototype-OPC-Gateway]!
Setting up resources for aws.greengrass.TokenExchangeService ...
Attaching TES role policy to IoT thing...
Encountered error - User: arn:aws:iam::000000000000:user/gg_install_user is not authorized to perform: iam:GetPolicy on resource: policy arn:aws:iam::aws:policy/OPC-GatewayTokenExchangeRoleAccess because no identity-based policy allows the iam:GetPolicy action (Service: Iam, Status Code: 403, Request ID: f7f45511-0d49-4a21-88f8-6207736e995d); No permissions to lookup managed policy, looking for a user defined policy...
Downloading Root CA from "https://www.amazontrust.com/repository/AmazonRootCA1.pem"
Created device configuration
Successfully configured Nucleus with provisioned resource details!
Creating a deployment for Greengrass first party components to the device
Configured Nucleus to deploy aws.greengrass.Cli component
Default user creation is only supported on Linux platforms, Greengrass will not make a user for you. Ensure that the user exists and password is stored. Continuing...
Successfully set up Nucleus as a system service
```

デバイスが AWS へ登録されていることの確認のため、下記のコマンドを実行します。**このコマンドは Greengrass をインストールしたデバイスではなく、CDK をデプロイした端末のターミナルで実行してください。**

```bash
aws iot describe-thing --thing-name IndustrialDataPlatformGateway
```

下記のような出力が得られれば成功です。

```json
{
  "defaultClientId": "IndustrialDataPlatformGateway",
  "thingName": "IndustrialDataPlatformGateway",
  "thingId": "xxxxxxx",
  "thingArn": "arn:aws:iot:ap-northeast-1:xxxxxx:thing/IndustrialDataPlatformGateway",
  "attributes": {},
  "version": 1
}
```

## (Optional) OPC-UA サーバの動作確認

この手順はオプショナルです。デバイスが OPC-UA サーバと通信が可能かどうかを確認します (要 Node.js 環境)。まずは[opcua-commander](https://github.com/node-opcua/opcua-commander)をインストールします。

```
npm i -g opcua-commander
```

続いて下記のコマンドを実行します。なおアドレス (X.X.X.X)・ポート (YYYY) はお使いの OPC-UA サーバ設定に合わせてください。**以降の手順は Greengrass をインストールしたデバイス上で実行してください。**

```
opcua-commander -e opc.tcp://X.X.X.X:YYYY
```

下記は仮想デバイス上のダミー OPC-UA サーバにアクセスする場合の例です。

```
opcua-commander -e opc.tcp://127.0.0.1:52250
```

ツールの操作方法は、 カーソルキーでツリーを展開していきます。今回対象とする値は、RootFolder > Objects > root 以下に展開できます。この値をモニタしていくためには、モニタしたい値を選択し、 m キーを押します。値の詳細を確認するには、 l キーを押し Attribute List をカーソルで動かして確認します。プログラムを終了するには q キーを押します。ダミーの OPC-UA サーバでは下記のタグが確認できます。

- root/tag1: Int (整数)
  - 制御指示値、カウント数などのタグを想定
- root/tag2: Double (浮動小数点)
  - 温度や湿度、圧力などのタグを想定
- root/tag3: String (文字列)
  - good / bad などステータス用のタグを想定
- root/tag4: Boolean (ブール値)
  - ON / OFF を表すタグを想定

![](../imgs/opcua_commander.png)

OPC-UA サーバが正しく動作・接続されていれば、値を確認できるはずです。

## Greengrass コンポーネントをデバイスへデプロイ

下記コマンドで Greengrass コンポーネント (file-watcher, opc-archiver, SiteWiseEdgeCollectorOpcua など) を上記でセットアップしたデバイスへデプロイします。**このコマンドは Greengrass をインストールしたデバイスではなく、IndustrialPlatformStack をデプロイした端末のターミナルで実行してください。**

```
cdk deploy GreengrassComponentDeployStack --require-approval never
```

マネージメントコンソールの IoT Core > Greengrass デバイス > デプロイ > Deployment for IndustrialDataPlatformGateway へアクセスし、「デバイスのステータス」および「デプロイのステータス」が共に完了となっていることを確認してください。

![](../imgs/greengrass_deploy.png)

OPC-UA サーバが稼働している場合は即座にデータの収集が開始されます。マネージメントコンソールの S3 > バケットにアクセス後、OPC の Raw バケット (industialdataplatformsta-storageopcrawbucketXXXX...という名前のバケット) の中身を見ると、2023/08/15/03/opc-log.2023-08-15_03-00.gz のようなファイルが生成されていることが確認できるはずです。

![](../imgs/opc_bucket.png)

オブジェクトの中身は S3 select を使用して、入力設定を形式を JSON、JSON コンテンツタイプを行、圧縮を GZIP、出力設定を JSON としてクエリ実行して中身を確認してみてください。
下記のような中身のデータを確認できれば正しくクラウド送信されてきていることを確認できたことになります。

```json
{
  "propertyAlias": "/root/tag1",
  "propertyValues": [
    {
      "value": {
        "integerValue": 16
      },
      "timestamp": {
        "timeInSeconds": 1685005466,
        "offsetInNanos": 163000000
      },
      "quality": "GOOD"
    },
    {
      "value": {
        "integerValue": 47
      },
      "timestamp": {
        "timeInSeconds": 1685005464,
        "offsetInNanos": 162000000
      },
      "quality": "GOOD"
    },

```

## Greengrass コンポーネントのデプロイに関するトラブルシューティング

「デバイスのステータス」および「デプロイのステータス」が完了にならない場合や OPC データが S3 バケットに収集されない場合、下記項目をご確認ください。

### Greengrass のログ

コンポーネントのエラーログを直接確認しエラーの原因を調査します。ログは下記にファイルとして出力されます。Greengrass が出力するログの詳細については[こちら](https://docs.aws.amazon.com/greengrass/v2/developerguide/monitor-logs.html#access-local-logs)を参照ください。

Windows:

```
C:\greengrass\v2\logs\
```

Linux:

```
/greengrass/v2/logs/
```

### IoT SiteWise ステータスの確認

マネージメントコンソールの IoT SiteWise > エッジ > ゲートウェイ > sitewise-gateway にアクセスし、データソースの設定ステータスが同期中であるか確認します。通常デプロイ後しばらくすると同期中のステータスになりますが、非同期の場合は設定したデータソースのラジオボタンを選択し、編集ボタンを押して編集画面に移り、何も変更せずに保存をクリックすることで同期中に変更できることがあります。

### ストリームマネージャが生成するストリームファイルの確認

SiteWise コンポーネントが OPC データを収集するとストリームに書き込まれますが、ストリームの実体は下記のパスに存在します。

Windows:

```
C:\greengrass\v2\work\aws.greengrass.StreamManager\opc_archiver_stream
```

Linux:

```
/greengrass/v2/work/aws.greengrass.StreamManager/opc_archiver_stream
```

ここにファイルがない場合は、SiteWise のマネージメントコンソールのステータスが同期中になっているか、再度見直してみてください。

## ファイルの転送の確認

続いてデバイス上のファイルが S3 へ転送されることを確認します。監視対象のディレクトリ (cdk.json に設定した sourceDir の値) に移動し、下記の内容の CSV ファイルを適当な名前で保存します。

```csv
BatchID,ProductName,StartTime,EndTime
Batch1,productD,2023-08-02 02:50:02,2023-08-02 04:15:02
Batch2,productD,2023-07-27 02:50:02,2023-07-27 04:35:02
Batch3,productA,2023-08-10 02:50:02,2023-08-10 04:04:02
Batch4,productE,2023-07-19 02:50:02,2023-07-19 03:43:02
Batch5,productE,2023-07-31 02:50:02,2023-07-31 03:57:02
Batch6,productB,2023-07-28 02:50:02,2023-07-28 04:04:02
Batch7,productB,2023-08-14 02:50:02,2023-08-14 04:39:02
Batch8,productA,2023-07-21 02:50:02,2023-07-21 04:00:02
Batch9,productA,2023-08-05 02:50:02,2023-08-05 04:09:02
Batch10,productE,2023-08-04 02:50:02,2023-08-04 03:33:02
```

仮想デバイスをご利用の場合は sourceDir が/home/ggc_user/data 下のため、下記コマンドを実行し移動してください。

```
sudo su - ggc_user
cd data
```

なお Linux 環境下の場合は下記コマンドを実行することで上記と同等のファイルを生成できます。仮想デバイスをご利用の場合はそのままコピー&ペーストし実行してください。

```shell
filename=$(date +%s).csv
echo "BatchID,ProductName,StartTime,EndTime" > $filename
products=("productA" "productB" "productC" "productD" "productE")
for i in $(seq 1 100); do
  product=${products[$RANDOM % ${#products[@]}]}
  start_time=$(date -d "$((RANDOM % 30)) days ago" +"%Y-%m-%d %H:%M:%S")
  random_minutes=$((RANDOM % 91 + 30)) # 30から120のランダムな数（30分から2時間）
  end_time=$(date -d "@$(($(date -d "$start_time" +%s) + $random_minutes * 60))" +"%Y-%m-%d %H:%M:%S")
  echo "Batch$i,$product,$start_time,$end_time" >> $filename
done
```

これまでのデプロイが成功していれば、数秒以内に ファイルの Raw バケット (industialdataplatformsta-storagefilerawbucketXXX...という名前の S3 バケット) に転送されます。転送されない場合は Greengrass のログをご確認ください。

## 加工処理の確認

OPC・ファイル共に S3 バケットに転送されることを確認できたら、Lambda による加工が実施されるか確認しましょう。

### OPC

OPC データは 1 時間ごとにタグによるパーティショニングを実行します。しばらく待機したのち、OPC の Processed バケット (industialdataplatformsta-storageopcprocessedbucke...という名前のバケット) の中身が確認できれば加工処理は成功しています。なおエッジ側のタイムスタンプの遅延を考慮するため、処理は毎時 10 分 (00:10, 01:10, ..., 23:10) に実行される点に留意ください。毎時 10 分を過ぎても生成されない場合、Lambda のログをご確認ください。

### ファイル

Raw バケットに格納されると、即座に加工用の Lambda により、加工済みのデータが Processed バケット (industialdataplatformsta-storagefileprocessedbuck...という名前の S3 バケット) に保存されます。バケットの中身を確認してみてください。保存されない場合、Lambda のログをご確認ください。

---

以上の手順により、エッジ側デバイスのデータをクラウドに転送・加工することができます。この後は S3 のデータにアクセスし自由に分析や可視化が実行可能です。Athena による SQL クエリ例については[Athena によるクエリ例](./athena_example.md)を参照ください。またリソースの破棄については[こちら](./destroy_ja.md)をご覧ください。

以降、本ドキュメントでは QuickSight を利用し可視化を実施する手順について解説します。なお QuickSight は本プロジェクトの動作確認のために用意した仮想デバイス・ダミーの OPC-UA サーバを利用することを想定している点にご留意ください。では[QuickSight の設定のデプロイ](./deploy_quicksight_ja.md)へお進みください。
