// Vercel 서버리스 함수: 브라우저 대신 서버에서 Pixabay를 호출해서
// API 키가 화면(HTML/JS)에 노출되지 않게 한다. 키는 환경변수 PIXABAY_API_KEY 에서 읽는다.
// GET /api/pixabay?q=cafe coffee  →  { hits: [{ id, pageURL, webformatURL, tags, user }] }
module.exports = async (req, res) => {
  const key = process.env.PIXABAY_API_KEY;
  if (!key) return res.status(500).json({ error: 'PIXABAY_API_KEY 환경변수가 설정되지 않았습니다.' });
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET 요청만 사용할 수 있습니다.' });

  const q = String(req.query.q || '').trim().slice(0, 100);
  if (!q) return res.status(400).json({ error: '검색어(q)가 필요합니다.' });

  const params = new URLSearchParams({ key, q, image_type: 'photo', per_page: '12', safesearch: 'true', order: 'popular' });
  try {
    const r = await fetch('https://pixabay.com/api/?' + params, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) {
      console.log('[pixabay] 오류', r.status);
      return res.status(r.status === 429 ? 429 : 502).json({ error: r.status === 429 ? '요청이 너무 많습니다.' : 'Pixabay 요청에 실패했습니다.' });
    }
    const data = await r.json();
    // 같은 검색은 1시간 동안 Vercel이 대신 응답해서 호출 횟수를 아낀다.
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    res.status(200).json({
      hits: (data.hits || []).map((h) => ({ id: h.id, pageURL: h.pageURL, webformatURL: h.webformatURL, tags: h.tags, user: h.user })),
    });
  } catch (e) {
    console.log('[pixabay] 실패', e.name, e.message);
    res.status(502).json({ error: 'Pixabay에 연결하지 못했습니다.' });
  }
};
