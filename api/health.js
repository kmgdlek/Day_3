// GET /api/health          → 서버 상태(키가 있는지만 알려 주고 키 값은 노출하지 않음)
// GET /api/health?deep=1   → 추가로 OpenAI 에 실제로 연결해 키가 유효한지 확인(모델 목록 조회, 비용 없음)
module.exports = async (req, res) => {
  const key = process.env.OPENAI_API_KEY;
  const out = {
    ok: true,
    hasOpenAIKey: Boolean(key),
    hasPixabayKey: Boolean(process.env.PIXABAY_API_KEY),
    model: process.env.OPENAI_MODEL || 'gpt-6-luna',
    vercelEnv: process.env.VERCEL_ENV || null,
    node: process.version,
  };
  if (req.query?.deep === '1' && key) {
    try {
      const r = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(6000),
      });
      out.openaiStatus = r.status;
      out.openai = r.ok ? 'ok' : r.status === 401 || r.status === 403 ? 'auth' : 'error';
    } catch {
      out.openai = 'unreachable';
    }
  }
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json(out);
};
