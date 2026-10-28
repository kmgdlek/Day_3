const data = require('../jeju_restaurants.json');

const MODEL = process.env.OPENAI_MODEL || 'gpt-6-luna';
const ENDPOINT = 'https://api.openai.com/v1/responses';
const ITEMS = data.items;

// Vercel 대시보드 → Logs 에서 보인다. 키 값은 절대 찍지 않는다.
const log = (...a) => console.log('[chat]', ...a);

// 51곳 전체를 매번 모델에게 보여 준다(작아서 통째로 넣어도 된다).
const LIST = ITEMS.map(
  (it) => `${it.name} | ${it.category} | ${it.description} | 관심도 ${it.score}${it.selected ? ' | 가 보고 싶은 곳' : ''}`
).join('\n');

const INSTRUCTIONS = [
  '너는 제주 카페·맛집 안내 도우미다. 아래 [장소 목록]에 있는 곳만 근거로 한국어로 답한다.',
  '- 목록에 없는 곳은 없다고 보고 추천하거나 지어내지 않는다. 맞는 곳이 없으면 솔직히 없다고 말한다.',
  '- 운영시간·가격·예약 여부는 목록에 없으므로 모른다고 하고, 방문 전 네이버 지도에서 확인하라고 안내한다.',
  '- 추천하는 장소 이름은 목록에 적힌 그대로 쓴다.',
  '- 답은 짧게: 먼저 한 줄 요약, 이어서 2~4곳을 이름과 이유로 말한다.',
  '- 관심도 점수는 사용자가 직접 정한 값이며 실제 평점이 아니다. "가 보고 싶은 곳"은 사용자가 담아 둔 곳이다.',
  '',
  '[장소 목록: 이름 | 분류 | 설명 | 관심도]',
  LIST,
].join('\n');

// Responses API 응답에서 assistant 글만 모은다.
function extractText(resp) {
  const parts = [];
  for (const item of resp?.output || []) {
    if (item.type !== 'message') continue;
    for (const c of item.content || []) if (c.type === 'output_text' && c.text) parts.push(c.text);
  }
  return parts.join('').trim();
}

// 브라우저에서 온 대화 기록을 정리한다(역할 제한, 길이 제한, 최근 8개만).
function cleanMessages(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map((m) => ({ role: m.role, content: m.content.trim().slice(0, 500) }))
    .filter((m) => m.content)
    .slice(-8);
}

const FRIENDLY = {
  401: 'AI 연결 설정(API 키)이 올바르지 않아요.',
  403: 'AI 연결 권한이 없어요. 계정과 키를 확인해 주세요.',
  404: 'AI 모델 이름을 찾지 못했어요. 설정을 확인해 주세요.',
  429: 'AI 사용 한도에 걸렸어요. 잠시 후 다시 시도하거나 결제·크레딧 상태를 확인해 주세요.',
};

// POST /api/chat  { messages: [{ role: 'user', content: '바다 보이는 카페 알려줘' }] }
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST만 지원합니다.' });
  if (!process.env.OPENAI_API_KEY) {
    log('OPENAI_API_KEY 없음 — 환경변수를 추가한 뒤 Redeploy 했는지 확인');
    return res.status(500).json({ error: '서버에 OPENAI_API_KEY 환경변수가 없어요.' });
  }
  const messages = cleanMessages(req.body?.messages);
  if (!messages.length || messages[messages.length - 1].role !== 'user') {
    return res.status(400).json({ error: '질문을 입력해 주세요.' });
  }

  const t0 = Date.now();
  try {
    const r = await fetch(ENDPOINT, {
      method: 'POST',
      signal: AbortSignal.timeout(25000),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({ model: MODEL, instructions: INSTRUCTIONS, input: messages, store: false }),
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) {
      log('OpenAI 오류', r.status, MODEL, JSON.stringify(body.error || body));
      return res.status(502).json({ error: FRIENDLY[r.status] || 'AI가 지금 답하지 못했어요. 잠시 후 다시 시도해 주세요.' });
    }
    const answer = extractText(body);
    if (!answer) {
      log('빈 응답', JSON.stringify(body).slice(0, 300));
      return res.status(502).json({ error: 'AI가 답을 만들지 못했어요. 다시 물어봐 주세요.' });
    }
    log(`완료 ${Date.now() - t0}ms`, MODEL);
    const places = ITEMS.filter((it) => answer.includes(it.name)).map((it) => it.name);
    return res.status(200).json({ answer, places });
  } catch (e) {
    log('실패', e.name, e.message);
    const timedOut = e.name === 'TimeoutError' || e.name === 'AbortError';
    return res.status(500).json({ error: timedOut ? '답이 너무 오래 걸려 중단했어요. 다시 시도해 주세요.' : '서버 오류가 났어요. 잠시 후 다시 시도해 주세요.' });
  }
};

module.exports.extractText = extractText;
