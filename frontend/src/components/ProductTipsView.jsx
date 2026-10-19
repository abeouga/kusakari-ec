/** @param {{product:import('../types').Product}} props */
export function ProductTipsView({ product: p }) {
  const topics = [
    ['水やり・育て方', p.care],
    ['季節の育て方', p.seasonalCare],
    ['相性のよい庭・空間', p.styleDescription],
    ['開花・結実', p.floweringDescription],
    ['耐寒温度', p.minTemperatureC === null ? '' : `${p.minTemperatureC}℃まで`],
    ['日照条件', p.sunlight === '未設定' ? '' : p.sunlight],
    ['用途・植栽場所', p.useCase],
    [
      '耐暑性・耐乾性',
      [p.heatTolerant ? '暑さに強い' : '', p.droughtTolerant ? '乾燥に強い' : ''].filter(Boolean).join('・'),
    ],
  ].filter(([, value]) => value);
  if (!topics.length) return null;
  return (
    <section className="care-accordions" aria-label="出品者Tips">
      <h3>出品者Tips</h3>
      {topics.map(([label, value]) => (
        <details key={label}>
          <summary>{label}</summary>
          <p style={{ whiteSpace: 'pre-wrap' }}>{value}</p>
        </details>
      ))}
    </section>
  );
}
