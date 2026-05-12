export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { ox, oy, dx, dy } = req.query;
  if (!ox || !oy || !dx || !dy) return res.status(400).json({ error: '좌표 필요' });

  try {
    const response = await fetch(
      `https://api.odsay.com/v1/api/searchPubTransPathT?SX=${ox}&SY=${oy}&EX=${dx}&EY=${dy}&apiKey=${process.env.ODSAY_KEY}`
    );
    const data = await response.json();

    if (data.error) return res.status(500).json({ error: data.error.message });

    const paths = data.result?.path || [];
    if (!paths.length) return res.status(404).json({ error: '경로 없음' });

    res.json(paths.slice(0, 3).map(path => {
      const info = path.info;
      const subPaths = path.subPath || [];

      const steps = subPaths.map(sp => {
        const typeMap = { 1: 'SUBWAY', 2: 'BUS', 3: 'WALK' };
        const iconMap = { 1: '🚇', 2: '🚌', 3: '🚶' };
        return {
          type: typeMap[sp.trafficType] || 'WALK',
          icon: iconMap[sp.trafficType] || '🚶',
          name: sp.lane?.[0]?.name || sp.lane?.[0]?.subwayName || '',
          duration: (sp.sectionTime || 0) * 60,
          distance: (sp.distance || 0) * 1000,
          from: sp.startName || '',
          to: sp.endName || '',
        };
      });

      return {
        duration: (info.totalTime || 0) * 60,
        distance: (info.totalDistance || 0) * 1000,
        fare: info.payment || 1400,
        transfers: info.busTransitCount + info.subwayTransitCount - 1,
        steps
      };
    }));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
