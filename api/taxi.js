export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { ox, oy, dx, dy } = req.query;
  if (!ox || !oy || !dx || !dy) return res.status(400).json({ error: '좌표 필요' });

  try {
    const response = await fetch(
      `https://apis-navi.kakaomobility.com/v1/directions?origin=${ox},${oy}&destination=${dx},${dy}&priority=RECOMMEND`,
      { headers: { Authorization: `KakaoAK ${process.env.KAKAO_REST_KEY}` } }
    );
    const data = await response.json();
    const route = data.routes?.[0];
    if (!route) return res.status(404).json({ error: '경로 없음' });

    const summary = route.summary;
    res.json({
      distance: summary.distance,
      duration: summary.duration,
      fare: summary.fare?.taxi || calcTaxiFare(summary.distance),
      sections: route.sections.map(s => ({
        distance: s.distance,
        duration: s.duration,
        roads: s.roads?.map(r => r.name).filter(Boolean).slice(0, 3)
      }))
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

function calcTaxiFare(distanceM) {
  if (distanceM <= 2000) return 4800;
  return Math.ceil(4800 + (distanceM - 2000) * (100 / 131));
}
