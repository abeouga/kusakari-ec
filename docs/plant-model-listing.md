# 植物特徴とCanvasのGLB部品構成

2026-10-17更新：第2版では24部品・10構成規則を使用し、特徴から構成した30商品を店舗1のローカルカタログへ追加しました。出品フォームは針葉樹・株立ち・横広がり・グラス・ロゼット・つる・ヤシにも対応します。旧版の商品・庭は以前の構成を保持します。以下の6部品の記述は初期版の記録です。

## Context

商品の園芸情報はECが管理する。出品者は完成済み3Dモデルを選ばず、植物の特徴を入力し、あらかじめ制作した共通GLB部品から構成を決める。

## Decision

- 出品フォームの「庭シミュレーター用の植物情報」を有効にすると、樹木・低木・草花、幅、全体形状、幹・枝、葉、花を入力できる。高さは既存 `heightCm` を使う。
- プレビューはCanvasの `/model-preview` を埋め込む。特徴を変更した後はプレビューボタンで再確認する。
- 保存リクエストは `plantModelProfile` を送る。ECバックエンドがCanvasの `POST /api/model-assemblies/resolve` を呼び、返された部品構成を `modelComposition` として商品に保存する。クライアントに確定構成を指定させない。
- 商品APIとカート内の商品は、プロフィール・構成・`canvasMaterialCode` を返す。価格・在庫・カート・注文は引き続きECの正本を使う。
- 材料コード `product.<商品ID>` を当該商品だけに関連付け、既存の材料照合APIで配置数量から同じ商品を購入候補にできる。
- 特徴を変更しない在庫編集は保存済み構成を再利用する。旧クライアントが追加フィールドを省略した更新も構成を保持する。明示的なnullはモデル設定解除として扱う。
- 植物構成の更新が必要な保存でCanvasへ接続できない場合、商品更新をロールバックしてエラーを返す。
- JSON列はFlyway V4で追加する。既存商品の設定はnullで、従来の登録・編集リクエストも受け付ける。

## Setup

ECの `start.bat` とCanvasの `start.bat` で双方を起動する。

- ECサーバーからCanvas API：`KUSAKARI_CANVAS_API_URL`（既定 `http://127.0.0.1:8080`）
- 出品プレビュー：`VITE_KUSAKARI_CANVAS_URL`（既定 `http://127.0.0.1:5173/`）

部品の制作・接続点・構成契約はCanvasの `docs/modular-plant-models.md` に記載する。

## Alternatives

完成モデルのプルダウン選択は要件に合わない。表示時の形状生成やGLB生成は行わず、登録済み部品を保存済み変換で描画する。

## Consequences

新しい特徴に対応するにはCanvasの部品・規則を追加する。Canvasの庭は配置時の構成を持ち、商品の後日編集で既存庭の形状は変わらない。初期ライブラリは汎用部品6種類で、商品写真からの自動復元機能は含まない。

## Verification

ECの `npm run build:api` 後、Canvasで `npm run test:shopping` を実行する。専用MySQLを使い、各植物タイプ2パターンの出品プレビュー・登録・商品一覧と庭の買い物リストからのドラッグ・庭の保存復元・写真表示・旧固定GLBとの混在を検証する。成果物はCanvasの `artifacts/e2e/plant-model/` に保存する。
# 旧モデル応答の互換性（2026-10-18）

## Context

旧保存データのモデル構成profileにはbotanicalFormが存在しない。一方、商品側の型付きprofileとCanvasのGardenDocumentは未指定値をnullで返すため、同じモデルを配置・再読込した際の構造比較が不一致になる。

## Decision

商品APIのDTO変換で、旧モデル構成のprofileに限り未指定のbotanicalFormをnullとして返す。元のDB JSONには触らず、モデルのversion・部品・寸法・配置を維持する。JSONをその場で変更して購入トランザクションの変更検出に巻き込まないよう、応答用のprofileを分ける。

## Alternatives / Consequences

全商品再生成、既存JSONの一括更新、テスト期待値の緩和は採用しない。値を持つ植物別モデルはそのまま返す。旧6種の配置・再読込・カート転送を実API/MySQLで再検証し、元のseed JSONのハッシュも前後で比較する。

## 販売停止時の旧JSON保持（2026-10-18）

### Context / Decision

カタログ整理で旧14商品を販売停止した際、エンティティの全列更新により旧プロフィール7件に
未指定の `botanicalForm:null` が保存されることを実DB照合で検出した。
`ProductRepository.archiveById` は販売状態だけを更新し、プロフィールや構成を読み直して書き戻さない。
存在しないIDは404、既に販売停止した商品の再削除は成功とする。物理削除はしない。

### Alternatives / Consequences

検証で差を無視する方法や全モデルの再生成は採用しない。発生した7件の差は事前バックアップから当該列だけ復元した。
直近30商品と旧「木」の対応商品だけが通常カタログに残る。旧商品の既存の庭・注文・カート参照は維持される。

### Verification

Javaビルドと、Canvas側 `backend/verification/verify_catalog_archive.py` による
専用MySQL/実APIの8項目が成功。旧JSONを含む全商品列のうち販売状態だけが変わり、
再削除・販売一覧/材料照合からの除外・404・検証後の既存DB保持を確認した。
通常EC/Canvasの31商品表示と再読み込みもChromiumで確認した。
詳細と非公開の退避場所はCanvasの `docs/plant-library-v2.md` のカタログ整理節を参照。

## AI画像参照のID指定取得（2026-10-18）

### Context / Decision

Canvasの配置は商品IDを保持しているため、AI生成の参考商品を店舗や素材候補から再選択しない。
`POST /api/products/references` は最大200件の重複しない商品IDに対して、要求順で
ID・商品名・画像URL・販売状態・植物モデル有無だけを返す。3D構成JSONは読み出さない。
既存庭の参照を維持するため販売終了商品もID指定で読める。存在しないIDは404、重複は400。

### Alternatives / Consequences

一覧全件の大きな構成データ取得、商品名からの類似推測、価格・在庫の再選択は採用しない。
販売一覧・購入時の販売終了判定は変更しない。DBスキーマ変更はない。
利用者が旧「木」の例外を取り下げたため `canvas-oak` も販売停止し、現在の通常一覧は30商品。
保存済み庭・注文等を参照切れにしないため商品行や旧モデルファイルは物理削除していない。

### Verification

Javaビルドと、Canvasの `playwright.ai-products.config.ts` による専用MySQL/実API/Chromium検証で、
要求順・メタデータのみの応答・重複400・欠落404・販売終了商品の画像参照を確認した。
通常カタログと既存庭に必要な36商品の実画像取得も成功。通常DBの変更は木の販売状態1列のみ。
今回の有料画像生成は行っていない。

