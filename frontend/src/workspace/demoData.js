// These records only exist in memory. They never replace the shop API or MySQL.
export function createDemoState() {
  return {
    session: { name: '', email: '', role: '' },
    users: [
      { id: 'member-1', name: '阿部 太郎', email: 'buyer@example.jp', role: '一般', status: '利用中' },
      { id: 'member-2', name: '湘南オリーブ園', email: 'seller@example.jp', role: '事業者', status: '利用中' },
    ],
    address: { postal: '158-0094', address: '東京都世田谷区玉川 1-2-3', recipient: '阿部 太郎' },
    profile: {
      name: '湘南オリーブ園',
      company: '湘南グリーン株式会社',
      contact: '山田 花子',
      email: 'seller@example.jp',
      address: '神奈川県藤沢市',
      hours: '10:00〜18:00',
      story: '庭に合う植物を、育て方とともにお届けします。',
      status: '営業中',
    },
    applications: [
      {
        id: 'application-1',
        company: '湘南グリーン株式会社',
        contact: '山田 花子',
        email: 'seller@example.jp',
        status: '審査待ち',
        reason: '',
      },
    ],
    reviews: [{ id: 'review-1', name: 'オリーブ 7号鉢', seller: '湘南オリーブ園', status: '審査待ち', reason: '' }],
    categories: ['庭木', '草花', 'ハーブ', '観葉植物', '鉢・庭材', '土・ケア用品', '芝', '道具'],
    orders: [
      {
        id: 'SAMPLE-1001',
        buyer: '阿部 太郎',
        product: 'オリーブ 7号鉢',
        quantity: 2,
        total: 14400,
        seller: '湘南オリーブ園',
        status: '注文受付',
        date: '2026-10-10',
        pickupStore: '湘南オリーブ園',
        pickupAddress: '神奈川県藤沢市',
        pickupHours: '10:00〜18:00',
        readyAt: '',
        pickedUpAt: '',
        payment: '支払済み',
      },
      {
        id: 'SAMPLE-1002',
        buyer: '鈴木 花子',
        product: 'ラベンダー 5号鉢',
        quantity: 3,
        total: 6740,
        seller: '湘南オリーブ園',
        status: '引き渡し完了',
        date: '2026-10-09',
        pickupStore: '湘南オリーブ園',
        pickupAddress: '神奈川県藤沢市',
        pickupHours: '10:00〜18:00',
        readyAt: '2026-10-10T01:00:00.000Z',
        pickedUpAt: '2026-10-10T03:00:00.000Z',
        payment: '支払済み',
      },
    ],
    notices: [
      {
        id: 'notice-1',
        audience: 'buyer',
        title: 'ご注文を受け付けました',
        body: 'SAMPLE-1001の注文内容をご確認ください。',
        read: false,
      },
      {
        id: 'notice-2',
        audience: 'seller',
        title: '新しい注文が届きました',
        body: 'SAMPLE-1001を受注一覧で確認してください。',
        read: false,
      },
    ],
    cancellations: /** @type {{orderId:string, reason:string, status:string}[]} */ ([]),
    feePercent: 10,
    settlements: [{ id: '2026-10', amount: 19026, status: '未精算' }],
  };
}

/** @typedef {ReturnType<typeof createDemoState>} DemoState */
