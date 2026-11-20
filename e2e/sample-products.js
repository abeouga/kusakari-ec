// v3 の前に店舗1で売っていた31商品。マイグレーション V7 で店舗1（二子玉川ガーデン）の商品として入る
// （docs/decisions/2026-11-20-sample-products-and-creator.md）。店舗1の V2 の4商品（olive・lavender・rosemary・monstera）と店舗2の canvas-oak・canvas-boxwood・canvas-brick・canvas-bench は
// V7 で削除済みになったので、E2E は代わりにこの商品を使う。一覧は1ページ12件で、E2E の商品も増えていくので、
// 一覧の中の商品を操作するときは商品番号で検索してから操作する。
export const OLIVE = {
  id: '50ee707f-cd6a-47ed-9ab9-89e0a0d954c1',
  sku: 'PLANT-V2-NARROW-TREE',
  name: 'オリーブ',
  priceYen: 7200,
};
export const MARGUERITE = {
  id: '068d60e6-a1eb-41ac-8dd4-8bae8ea91f31',
  sku: 'PLANT-V2-WHITE-DAISY',
  name: 'マーガレット（白花）',
  priceYen: 1600,
};
export const MONSTERA = {
  id: '19535687-a1e1-4ac8-ad13-6c15c6fb9548',
  sku: 'PLANT-V2-SPLIT-LEAF',
  name: 'モンステラ・デリシオーサ',
  priceYen: 4200,
};
// V2 の店舗2・3の商品のうち、ハーブのカテゴリーのもの（31商品にハーブはない）。
export const HERB = { id: 'garden-demo-herb-shrub', name: '細葉のハーブ' };

/** 31商品の ID（ID の順）。 */
export const SAMPLE_PRODUCT_IDS = [
  '068d60e6-a1eb-41ac-8dd4-8bae8ea91f31', // マーガレット（白花）
  '091ae304-d32f-4b36-b0b9-afc08e503b6f', // ブルーアイス
  '0b334546-1b7e-42e3-9663-ba0083a24913', // アガベ・アテナータ
  '0d93b129-5d8c-40cc-a39c-b43f30204fcb', // ユーカリ・ポポラス
  '180837d7-42fb-4bb4-ba31-087876af8458', // カツラ
  '19535687-a1e1-4ac8-ad13-6c15c6fb9548', // モンステラ・デリシオーサ
  '228e730e-44f9-4b23-b3e6-062ce42bde96', // ウエストリンギア
  '25f69481-8fb5-4246-afaf-fb1493af79e7', // ボックスウッド
  '276de0dc-aa72-4b5e-bd15-f68893b557cb', // クロチク
  '29dbbf56-5cde-4ca5-9174-aaea4c6730d0', // エケベリア・パールフォンニュルンベルク
  '29e1e98e-8b12-4383-9af9-2b7bb15b14e1', // フェニックス・ロベレニー
  '2c82cfd5-bf6c-43a8-abc9-8c713b85a32f', // イングリッシュラベンダー
  '2ecbae16-2cc2-4af6-95ad-7be810cbe1e0', // イベリス
  '37797499-b526-4454-b33a-e5f7862f9067', // フィロデンドロン・ヘデラケウム
  '4811876d-653f-4c62-a145-38e0fddcbff0', // サツキ（桃花）
  '4a84c65a-cbf4-4d70-85a2-5873d7f28ef0', // フウチソウ
  '50ee707f-cd6a-47ed-9ab9-89e0a0d954c1', // オリーブ
  '51c341bc-19b0-45b5-a75e-5e887ef115e0', // テーブルヤシ
  '54fe473a-567c-4713-8b49-1604d1d0af51', // ソヨゴ（株立ち）
  '560ab9aa-c32a-4ab2-b20f-8129e9191ba9', // ヘデラ・ヘリックス
  '5f734dfa-7575-4cdc-85ab-4d5d0f6bc7a6', // シマトネリコ
  '639c3941-fb40-4102-b057-225531457cf8', // 黄金シモツケ・ゴールドマウンド
  '748abf88-c6e7-4f7d-b318-5e5945140ed0', // 矮性パンパスグラス
  'a441fa76-1e85-4e68-aa3e-75be3d8918d1', // エケベリア・七福神
  'a57a58e9-6045-43db-a28b-d6f1a27ef1c9', // カンパニュラ（青紫花）
  'acc6c342-542d-4c43-9fd2-7a0505b51c95', // イロハモミジ
  'c34dec59-3f2d-417b-8c34-0a620317d3e5', // 出品デモ｜モンステラ
  'd8d8dd0f-acc6-4d41-93f3-5c540bd7bac4', // アジサイ（青花）
  'e12efe6e-2c77-46f2-b9c1-606feb2795ba', // ゴールドクレスト
  'e7876d22-c3cf-4ed0-83b3-dbaf66c2e589', // コニカ
  'e9b03e41-7e80-4584-aac9-975a38a6bc25', // ベニチガヤ
];
