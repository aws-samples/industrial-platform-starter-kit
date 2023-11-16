# リソースの破棄について

下記の手順で実施してください。

## (Optional) QuickSight のスタックをデプロイした場合

下記コマンドを実行するか、または CloudFormation のページから`QuicksightStack`を手動で削除してください。

```
cdk destroy QuicksightStack
```

## コンポーネントデプロイのスタック削除

下記コマンドを実行するか、または CloudFormation のページから`GreengrassComponentDeployStack`を手動で削除してください。

```
cdk destroy GreengrassComponentDeployStack
```

### 確認

マネージメントコンソールの AWS IoT > Greengrass > デプロイをクリックし、`GreengrassComponentDeploy`という名前のデプロイが存在しなければ OK です。

## IoT リソースの削除

### ポリシーの削除

マネージメントコンソール > AWS IoT > すべてのデバイス > モノ > factory1 > 証明書タブ > 証明書 (2 つ) をそれぞれクリックし、ポリシーをクリックします。削除ボタンが登場するので、ポリシーを削除してください（証明書に紐づくポリシーを 2 つとも削除する。`IndustrailDataPlatformStackPolicy`、および`GreengrassTESCertificatePolicyIndustrialDataPlatformSta-XXX`という名前）。factory2 についても Greengrass をインストールした場合は同様の手順で削除してください。

### Greengrass デバイスの削除

マネージメントコンソール > AWS IoT > Greengrass デバイス > コアデバイスとクリックし、factory1 を削除します。factory2 についても Greengrass をインストールした場合は同様の手順で削除してください。

### モノの削除

マネージメントコンソール > AWS IoT > すべてのデバイス > モノとクリックし、factory1 を削除します。factory2 についても Greengrass をインストールした場合は同様の手順で削除してください。

## 産業データプラットフォームのスタック削除

下記コマンドを実行するか、または CloudFormation のページから`IndustialDataPlatformStack`を手動で削除してください。

```
cdk destroy IndustialDataPlatformStack
```

CloudFormation のスタック一覧から`IndustrialDataPlatformStack`が消えていれば削除は完了となります。
