export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { query } = req.query;
  if (!query) return res.status(400).json({ error: 'query 필요' });

  try {
    const response = await fetch(
      `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(query)}&size=7`,
      { headers: { Authorization: `KakaoAK ${process.env.KAKAO_REST_KEY}` } }
    );
    const data = await response.json();
    
    if (!data.documents) {
      return res.status(500).json({ error: '카카오 API 오류', raw: data });
    }
    
    res.json(data.documents.map(d => ({
      name: d.place_name,
      address: d.road_address_name || d.address_name,
      x: parseFloat(d.x),
      y: parseFloat(d.y),
      category: d.category_group_name
    })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
