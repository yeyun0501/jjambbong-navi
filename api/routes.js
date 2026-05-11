export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { ox, oy, dx, dy, oname, dname } = req.query;
  if (!ox || !oy || !dx || !dy) return res.status(400).json({ error: '좌표 필요' });

  const BASE = `https://${req.headers.host}`;

  try {
    const [taxiRes, transitRes] = await Promise.all([
      fetch(`${BASE}/api/taxi?ox=${ox}&oy=${oy}&dx=${dx}&dy=${dy}`),
      fetch(`${BASE}/api/transit?ox=${ox}&oy=${oy}&dx=${dx}&dy=${dy}`)
    ]);
    const taxiData = taxiRes.ok ? await taxiRes.json() : null;
    const transitData = transitRes.ok ? await transitRes.json() : null;

    const routes = [];

    if (taxiData) {
      routes.push({
        id: 'taxi_full',
        label: '⚡ 최단시간',
        type: 'taxi_only',
        name: '택시 직행',
        totalMin: Math.round(taxiData.duration / 60),
        totalCost: taxiData.fare,
        segments: [{ type: 'taxi', ratio: 1.0 }],
        steps: [{
          type: 'taxi', icon: '🚕',
          title: `택시 탑승 → ${dname || '목적지'}`,
          desc: `직행 (${(taxiData.distance/1000).toFixed(1)}km)`,
          time: `${Math.round(taxiData.duration/60)}분`,
          cost: taxiData.fare
        }]
      });
    }

    if (transitData?.[0]) {
      const t = transitData[0];
      routes.push({
        id: 'transit_full',
        label: '💰 최저비용',
        type: 'transit_only',
        name: '대중교통',
        totalMin: Math.round(t.duration / 60),
        totalCost: t.fare,
        segments: buildSegments(t.steps),
        steps: t.steps.map(s => formatStep(s))
      });
    }

    if (taxiData && transitData?.[0]) {
      const taxi = taxiData;
      const transit = transitData[0];
      const taxiPortionMin = Math.round(taxi.duration / 60 * 0.35);
      const taxiPortionCost = Math.round(taxi.fare * 0.4);
      const mixMin = taxiPortionMin + Math.round(transit.duration / 60 * 0.7);
      const mixCost = taxiPortionCost + transit.fare;

      routes.push({
        id: 'mixed',
        label: '✨ 균형 추천',
        type: 'mixed',
        name: '택시 → 대중교통 환승',
        totalMin: mixMin,
        totalCost: mixCost,
        segments: [
          { type: 'taxi', ratio: 0.35 },
          { type: 'walk', ratio: 0.05 },
          { type: 'subway', ratio: 0.6 }
        ],
        steps: [
          {
            type: 'taxi', icon: '🚕',
            title: `택시 탑승 → 인근 지하철역`,
            desc: `${oname || '출발지'}에서 가까운 지하철역까지`,
            time: `${taxiPortionMin}분`,
            cost: taxiPortionCost
          },
          {
            type: 'walk', icon: '🚶',
            title: '지하철역 진입',
            desc: '개찰구까지 도보',
            time: '3분', cost: 0
          },
          ...transit.steps.slice(1).map(s => formatStep(s))
        ]
      });
    }

    routes.sort((a, b) => a.totalMin - b.totalMin);
    res.json(routes);

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

function buildSegments(steps) {
  const counts = {};
  steps.forEach(s => { counts[s.type] = (counts[s.type]||0) + (s.duration||1); });
  const total = Object.values(counts).reduce((a,b)=>a+b, 0) || 1;
  return Object.entries(counts).map(([type, dur]) => ({
    type: type.toLowerCase() === 'subway' ? 'subway' : type.toLowerCase() === 'bus' ? 'bus' : 'walk',
    ratio: dur / total
  }));
}

function formatStep(s) {
  const typeMap = { SUBWAY: 'subway', BUS: 'bus', WALK: 'walk', TAXI: 'taxi' };
  const iconMap = { SUBWAY: '🚇', BUS: '🚌', WALK: '🚶', TAXI: '🚕' };
  const type = typeMap[s.type] || 'walk';
  return {
    type, icon: iconMap[s.type] || '🚶',
    title: s.name ? `${s.name} 탑승` : '도보 이동',
    desc: s.from && s.to ? `${s.from} → ${s.to}` : '',
    time: `${Math.round((s.duration||0)/60)}분`,
    cost: 0
  };
}
