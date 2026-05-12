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

    // 1. 택시 Only - 가장 빠름
    if (taxiData) {
      routes.push({
        id: 'taxi_only',
        label: '🚕 택시 Only',
        type: 'taxi_only',
        name: '택시 직행',
        desc: '가장 빠르지만 비용이 높아요',
        totalMin: Math.round(taxiData.duration / 60),
        totalCost: taxiData.fare,
        segments: [{ type: 'taxi', ratio: 1.0 }],
        steps: [{
          type: 'taxi', icon: '🚕',
          title: `택시 탑승`,
          desc: `${oname || '출발지'} → ${dname || '목적지'} 직행 (${(taxiData.distance/1000).toFixed(1)}km)`,
          time: `${Math.round(taxiData.duration/60)}분`,
          cost: taxiData.fare
        }]
      });
    }

    // 2. 대중교통 Only - 가장 저렴
    if (transitData?.[0]) {
      const t = transitData[0];
      routes.push({
        id: 'transit_only',
        label: '🚇 대중교통 Only',
        type: 'transit_only',
        name: '대중교통 전구간',
        desc: '가장 저렴하지만 시간이 걸려요',
        totalMin: Math.round(t.duration / 60),
        totalCost: t.fare,
        segments: buildSegments(t.steps),
        steps: t.steps.map(s => formatStep(s))
      });
    }

    // 3. 택시 + 대중교통 - 가성비
    if (taxiData && transitData?.[0]) {
      const taxi = taxiData;
      const transit = transitData[0];

      // 택시로 출발지 → 주요 대중교통 환승역까지
      // 택시 구간: 전체 거리의 약 30~40% (출발지 인근 역까지)
      const taxiRatio = 0.35;
      const taxiMin = Math.round(taxi.duration / 60 * taxiRatio);
      const taxiCost = Math.round(taxi.fare * taxiRatio * 1.1); // 약간 여유
      const transitMin = Math.round(transit.duration / 60 * 0.75);
      const totalMin = taxiMin + 3 + transitMin; // 3분 = 환승 도보
      const totalCost = taxiCost + transit.fare;

      // 절약 시간 계산
      const savedMin = Math.round(transit.duration / 60) - totalMin;

      routes.push({
        id: 'mixed',
        label: '✨ 택시 + 대중교통',
        type: 'mixed',
        name: '가성비 혼합',
        desc: savedMin > 0
          ? `대중교통만 탈 때보다 ${savedMin}분 빠르고, 택시만 탈 때보다 ${Math.round(taxi.fare - totalCost).toLocaleString()}원 저렴해요`
          : '택시와 대중교통의 최적 조합이에요',
        totalMin,
        totalCost,
        segments: [
          { type: 'taxi', ratio: taxiRatio },
          { type: 'walk', ratio: 0.05 },
          { type: 'subway', ratio: 1 - taxiRatio - 0.05 }
        ],
        steps: [
          {
            type: 'taxi', icon: '🚕',
            title: `택시 탑승 → 인근 환승역`,
            desc: `${oname || '출발지'}에서 가까운 지하철/버스 환승역까지`,
            time: `약 ${taxiMin}분`,
            cost: taxiCost
          },
          {
            type: 'walk', icon: '🚶',
            title: '환승역 진입',
            desc: '개찰구까지 도보 이동',
            time: '약 3분',
            cost: 0
          },
          ...transit.steps
            .filter(s => s.type !== 'WALK' || transit.steps.indexOf(s) > 0)
            .slice(0, 5)
            .map(s => formatStep(s))
        ]
      });
    }

    // 순서: 가성비 → 택시 → 대중교통
    const order = ['mixed', 'taxi_only', 'transit_only'];
    routes.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));

    res.json(routes);

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

function buildSegments(steps) {
  const counts = {};
  steps.forEach(s => {
    const type = s.type === 'SUBWAY' ? 'subway' : s.type === 'BUS' ? 'bus' : 'walk';
    counts[type] = (counts[type] || 0) + (s.duration || 1);
  });
  const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
  return Object.entries(counts).map(([type, dur]) => ({
    type, ratio: dur / total
  }));
}

function formatStep(s) {
  const typeMap = { SUBWAY: 'subway', BUS: 'bus', WALK: 'walk', TAXI: 'taxi' };
  const iconMap = { SUBWAY: '🚇', BUS: '🚌', WALK: '🚶', TAXI: '🚕' };
  const type = typeMap[s.type] || 'walk';
  return {
    type, icon: iconMap[s.type] || '🚶',
    title: s.name ? `${s.name} 탑승` : '도보 이동',
    desc: s.from && s.to ? `${s.from} → ${s.to}` : `${Math.round((s.distance||0)/1000*10)/10}km`,
    time: `${Math.round((s.duration || 0) / 60)}분`,
    cost: 0
  };
}
