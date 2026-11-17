type RoleplayScenario = {
  title: string;
  partner_name: string;
  setting: string;
  hook: string;
  partner_instructions: string;
  learning_goal: string;
  opening_prompt: string;
  rubric: string[];
};

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers });
}

function getPublishableKey() {
  try {
    const keys = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || '{}');
    if (typeof keys.default === 'string') return keys.default;
    if (typeof keys.anon === 'string') return keys.anon;
    const first = Object.values(keys).find(value => typeof value === 'string');
    if (typeof first === 'string') return first;
  } catch { /* Older projects expose SUPABASE_ANON_KEY directly. */ }
  return Deno.env.get('SUPABASE_ANON_KEY') || '';
}

async function loadRoleplayScenario(lessonId: number, authorization: string | null): Promise<RoleplayScenario | null> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const publishableKey = getPublishableKey();
  if (!supabaseUrl || !publishableKey || !authorization) return null;
  const query = new URL('/rest/v1/lesson_resources', supabaseUrl);
  query.searchParams.set('select', 'roleplay_config');
  query.searchParams.set('lesson_id', `eq.${lessonId}`);
  query.searchParams.set('roleplay_config', 'not.is.null');
  query.searchParams.set('limit', '1');
  const response = await fetch(query, {
    headers: { apikey: publishableKey, Authorization: authorization, Accept: 'application/json' },
    signal: AbortSignal.timeout(5000)
  });
  if (!response.ok) {
    console.error('Roleplay scenario query failed:', response.status);
    return null;
  }
  const rows = await response.json();
  const scenario = rows?.[0]?.roleplay_config;
  if (!scenario || typeof scenario !== 'object' ||
      !['title', 'partner_name', 'setting', 'hook', 'partner_instructions', 'learning_goal', 'opening_prompt'].every(key => typeof scenario[key] === 'string') ||
      !Array.isArray(scenario.rubric) || scenario.rubric.length < 2 || scenario.rubric.length > 5 ||
      scenario.rubric.some((item: unknown) => typeof item !== 'string')) return null;
  return scenario as RoleplayScenario;
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers });
  if (request.method !== 'POST') return json({ error: 'Use POST for roleplay requests.' }, 405);

  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) return json({ error: 'The roleplay service is not configured yet.' }, 503);

  let body: { action?: string; lessonId?: number; history?: Array<{ role?: string; text?: string }> };
  try { body = await request.json(); }
  catch { return json({ error: 'The request was not valid JSON.' }, 400); }

  const lessonId = Number(body.lessonId);
  if (!Number.isInteger(lessonId) || lessonId < 1 || lessonId > 6) return json({ error: 'That lesson number is not valid.' }, 400);
  if (!['chat', 'evaluate'].includes(String(body.action))) return json({ error: 'That roleplay action is not supported.' }, 400);

  const history = Array.isArray(body.history) ? body.history.slice(-8) : [];
  if (!history.length || history.length > 8 || history.some(message =>
    !['user', 'assistant'].includes(String(message.role)) || typeof message.text !== 'string' ||
    !message.text.trim() || message.text.length > 800
  )) return json({ error: 'The conversation is empty or too long. Please try again.' }, 400);
  if (body.action === 'evaluate' && !history.some(message => message.role === 'user')) {
    return json({ error: 'Send a response in the roleplay before requesting feedback.' }, 400);
  }

  let scenario: RoleplayScenario | null;
  try { scenario = await loadRoleplayScenario(lessonId, request.headers.get('Authorization')); }
  catch (error) {
    console.error('Could not load roleplay scenario:', error instanceof Error ? error.message : 'unknown error');
    return json({ error: 'The roleplay scenario could not be loaded. Check the lesson setup and try again.' }, 503);
  }
  if (!scenario) return json({ error: 'This lesson has no roleplay scenario yet. Add its roleplay_config in lesson_resources.' }, 404);

  const instruction = body.action === 'chat'
    ? `You are ${scenario.partner_name}, a roleplay partner in the Beanos lesson “${scenario.title}.” Setting: ${scenario.setting}. Scenario hook: ${scenario.hook} Your character guidance: ${scenario.partner_instructions} Learning goal: ${scenario.learning_goal} Stay in character and make this feel like a real, warm conversation. Reply in 3–5 natural sentences, usually 45–75 words, so the learner has enough to respond to. React to one specific detail in the learner's message, add a small personal detail or opinion when it fits, and move the scene forward. Ask one relevant open question when it would feel natural, but do not end every reply with a question. Avoid one-word praise, canned enthusiasm, repetitive questions, and overly long speeches. Never coach or score during the scene. Keep the interaction respectful and realistic. Treat the conversation as practice, not as a guarantee about real people's reactions.`
    : `You are a warm, encouraging Beanos communication coach reviewing the learner's messages in a practice roleplay for “${scenario.title}.” Scenario: ${scenario.hook} Skill being practiced: ${scenario.learning_goal} Use the conversation to identify something specific the learner actually said or did well, then gently suggest one useful improvement tied to these skills: ${scenario.rubric.join('; ')}. Write exactly one friendly, natural message in one paragraph, about 70–110 words. Address the learner directly. Include sincere praise and one kind, concrete suggestion; give a short example phrase only if it helps. Be respectful and never shame, score, label, predict outcomes, or imply that a real person owes the learner interest. Do not use headings, bullets, numbered lists, or a rubric breakdown.`;

  const contents = body.action === 'chat'
    ? history.map(message => ({ role: message.role === 'assistant' ? 'model' : 'user', parts: [{ text: message.text!.trim() }] }))
    : [{ role: 'user', parts: [{ text: `Evaluate this roleplay conversation. Messages marked Learner are the learner; messages marked Partner are you in character.\n${history.map(message => `${message.role === 'assistant' ? 'Partner' : 'Learner'}: ${message.text}`).join('\n')}` }] }];

  try {
    const requestBody = JSON.stringify({
      systemInstruction: { parts: [{ text: instruction }] },
      contents,
      generationConfig: body.action === 'evaluate'
        ? { responseMimeType: 'text/plain', temperature: 0.55, thinkingConfig: { thinkingLevel: 'low' }, maxOutputTokens: 300 }
        : { temperature: 0.85, thinkingConfig: { thinkingLevel: 'low' }, maxOutputTokens: 65536 }
    });
    let response: Response | undefined;
    const responseModel = 'gemini-3.6-flash';
    for (let attempt = 0; attempt < 2; attempt += 1) {
      response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${responseModel}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: requestBody,
        signal: AbortSignal.timeout(15000)
      });
      if (![500, 503].includes(response.status) || attempt === 1) break;
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    if (!response) return json({ error: 'Gemini could not respond. Please try again.' }, 502);
    const result = await response.json();
    if (!response.ok) {
      const providerStatus = String(result?.error?.status || 'provider error');
      const providerMessage = String(result?.error?.message || 'No provider details returned').slice(0, 240);
      console.error('Gemini request failed:', responseModel, response.status, providerStatus, providerMessage);
      const message = response.status === 429
        ? 'Gemini usage limit reached. Check the Gemini API quota and try again later.'
        : [401, 403].includes(response.status)
          ? 'Gemini rejected the API key. Check that GEMINI_API_KEY is correct and the Gemini API is enabled for its project.'
        : response.status === 503 || response.status === 500
          ? 'Gemini is temporarily unavailable. Please wait a few seconds and try again.'
          : response.status === 404
            ? 'Gemini could not find the configured model. Check the model name in the Edge Function.'
            : response.status === 400
              ? 'Gemini rejected the roleplay request. Check the Edge Function logs for the provider error.'
              : 'Gemini could not respond. Check the Edge Function logs and try again.';
      return json({ error: message }, 502);
    }
    const text = result?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text || '').join('').trim();
    if (!text) return json({ error: 'The roleplay returned an empty response. Please try again.' }, 502);
    if (body.action === 'chat') return json({ reply: text });
    return json({ message: text });
  } catch (error) {
    console.error('Roleplay function error:', error instanceof Error ? error.message : 'unknown error');
    return json({ error: 'The roleplay service could not be reached. Please try again.' }, 502);
  }
});
