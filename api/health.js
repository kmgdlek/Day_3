// GET /api/health → 배포 상태 점검(키 값은 노출하지 않고 존재 여부만 알려 준다)
module.exports = (req, res) => {
  res.status(200).json({
    ok: true,
    hasOpenAIKey: Boolean(process.env.OPENAI_API_KEY),
    model: process.env.OPENAI_MODEL || 'gpt-6-luna',
    vercelEnv: process.env.VERCEL_ENV || null,
    node: process.version,
  });
};
