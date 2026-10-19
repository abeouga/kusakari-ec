**WindowsでEC・Canvasの初回セットアップが済んでいる方向け**です。

**同じ31商品が既に登録されている方は、手順3の取り込みは不要です。**

1. **ECとCanvasを最新にする**
    
    それぞれのリポジトリで実行します。フォルダ名は各自の環境に合わせてください。
    
    ```
    git switch main
    git pull --ff-only
    npm ci
    ```
    
    未コミットの変更がある場合は、破棄せず整理してから進めてください。
    
2. **ECを再ビルド・起動する**
    
    ECフォルダで実行します。
    
    ```
    .\stop.bat
    npm run build:api
    .\start.bat
    ```
    
    **pullだけでは起動用JARは更新されません。** 古いJARのままだとCanvasからの商品取得が失敗する場合があります。
    
3. **商品データを取り込む**
    
    ECが起動したら、別のPowerShellをECフォルダで開きます。取り込み中は商品編集・購入操作を止めてください。
    
    まず事前確認します。このコマンドではDBは変更されません。
    
    ```
    node scripts/import-product-sample.mjs
    ```
    
    エラーがなければ取り込みます。
    
    ```
    node scripts/import-product-sample.mjs --apply
    ```
    
    この処理では、商品関連データを自動バックアップし、旧商品を非公開化して31商品を登録します。店舗1の在庫は共有時点の値になります。注文・カート・庭データは削除しません。
    
4. **取り込み結果を検証する**
    
    ECフォルダで実行します。
    
    ```
    node scripts/verify-product-sample.mjs
    ```
    
    次の表示が出れば成功です。
    
    ```
    Verified 31 complete product records, 60 image hashes, and 31 Canvas material matches against the live API.
    ```
    
5. **Canvasで確認する**
    
    Canvasフォルダの`start.bat`で起動・再起動し、[Canvas](http://127.0.0.1:5173/)を開きます。
    
    - 庭を開き、商品一覧に「マーガレット（白花）」「ブルーアイス」などが表示される
    - 「庭に配置」を選んで地面をクリックすると配置できる
    - 「保存済み」を確認して再読み込みしても配置が残る

エラーが出た場合は、その段階で止めてエラー内容を共有してください。**`MySQL-reset.bat`を実行する必要はありません。**