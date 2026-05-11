export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { ox, oy, dx, dy } = req.query;
  if (!ox || !oy || !dx || !dy) return res.status(400).json({ error: '좌표 필요' });

  try {
    const response = await fetch(
      `https://apis-navi.kakaomobility.com/v1/directions/transit?origin=${ox},${oy}&destination=${dx},${dy}`,
      { headers: { Authorization: `KakaoAK ${process.env.KAKAO_REST_KEY}` } }
    );
    const data = await response.json();
    const routes = data.routes || [];

    if (!routes.length) return res.status(404).json({ error: '경로 없음' });

    res.json(routes.slice(0, 3).map(route => {
      const summary = route.summary;
      const legs = route.sections?.flatMap(s => s.legs || []) || [];
      const steps = legs.map(leg => ({
        type: leg.mode,
        name: leg.route || leg.name || '',
        duration: leg.duration,
        distance: leg.distance,
        from: leg.start?.name,
        to: leg.end?.name,
      }));
      return {
        duration: summary.duration,
        distance: summary.distance,
        fare: summary.fare?.payment || 1400,
        transfers: steps.filter(s => ['SUBWAY','BUS'].includes(s.type)).length - 1,
        steps
      };
    }));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
