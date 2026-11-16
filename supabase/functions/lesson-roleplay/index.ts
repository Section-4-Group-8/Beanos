const scenarios: Record<number, { title: string; setup: string; goal: string; rubric: string[] }> = {
  1: {
    title: 'Starting with confidence',
    setup: 'You are Maya, waiting in a café line with a well-worn novel. You notice the learner nearby. Respond naturally and briefly. Be receptive if their opener is respectful and relevant; be neutral or gently disengage if it is intrusive or overly intense.',
    goal: 'Practice a relaxed, context-based opener and handle nerves without pressure.',
    rubric: ['Contextual, natural opener', 'Warm and clear tone', 'Low-pressure approach and respect for cues']
  },
  2: {
    title: 'Starting and continuing conversations',
    setup: 'You are Jordan, waiting at a community event before a talk begins. The learner starts a conversation. Respond like a real person, sharing a little and leaving room for a genuine follow-up. Do not carry the conversation for them.',
    goal: 'Practice a simple opener, listening, sharing, and asking a relevant follow-up.',
    rubric: ['Relevant opener', 'Listening and follow-up', 'Balanced sharing rather than interviewing']
  },
  3: {
    title: 'Showing interest and respecting boundaries',
    setup: 'You are Alex, talking with the learner at a casual social gathering. Respond warmly but realistically. At one point, show a subtle cue that you need to rejoin a friend. The learner should notice and respect your cue. Do not reward persistence after a boundary.',
    goal: 'Practice expressing interest while noticing reciprocity and respecting a boundary.',
    rubric: ['Clear, considerate interest', 'Noticing reciprocal or disengaging cues', 'Respecting boundaries without pressure']
  },
  4: {
    title: 'Asking someone on a date',
    setup: 'You are Sam, someone the learner has enjoyed chatting with at a bookstore event. Respond naturally to a clear, low-pressure invitation. If the invitation is vague or pressuring, react realistically and give the learner room to clarify.',
    goal: 'Practice making a clear invitation that leaves the other person free to say yes or no.',
    rubric: ['Clear invitation', 'Specific and considerate plan', 'Low pressure and acceptance of the answer']
  },
  5: {
    title: 'Planning and enjoying a date',
    setup: 'You are Riley, meeting the learner for a first coffee date. Keep the exchange natural. Mention a preference or constraint (for example, a quieter place or a time limit) so the learner can practice collaborating on a comfortable plan.',
    goal: 'Practice collaborative planning, curiosity, listening, and comfortable conversation.',
    rubric: ['Collaborative planning', 'Curiosity and listening', 'Flexibility and consideration']
  },
  6: {
    title: 'Following up after a date',
    setup: 'You are Casey, who went on a pleasant first date with the learner yesterday. Respond realistically to their follow-up. You may be interested, uncertain, or not interested; do not guarantee a positive outcome. If the learner receives a no, allow them to respond respectfully.',
    goal: 'Practice a warm, clear follow-up and respond maturely to any answer.',
    rubric: ['Warm and clear follow-up', 'Honest expression of interest', 'Respectful response to the other person’s answer']
  }
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

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers });
  if (request.method !== 'POST') return json({ error: 'Use POST for roleplay requests.' }, 405);

  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) return json({ error: 'The roleplay service is not configured yet.' }, 503);

  let body: { action?: string; lessonId?: number; history?: Array<{ role?: string; text?: string }> };
  try { body = await request.json(); }
  catch { return json({ error: 'The request was not valid JSON.' }, 400); }

  const lessonId = Number(body.lessonId);
  const scenario = scenarios[lessonId];
  if (!scenario) return json({ error: 'That lesson number is not valid.' }, 400);
  if (!['chat', 'evaluate'].includes(String(body.action))) return json({ error: 'That roleplay action is not supported.' }, 400);

  const history = Array.isArray(body.history) ? body.history.slice(-8) : [];
  if (!history.length || history.length > 8 || history.some(message =>
    !['user', 'assistant'].includes(String(message.role)) || typeof message.text !== 'string' ||
    !message.text.trim() || message.text.length > 800
  )) return json({ error: 'The conversation is empty or too long. Please try again.' }, 400);
  if (body.action === 'evaluate' && !history.some(message => message.role === 'user')) {
    return json({ error: 'Send a response in the roleplay before requesting feedback.' }, 400);
  }

  const instruction = body.action === 'chat'
    ? `You are a roleplay partner in the Beanos social-skills lesson “${scenario.title}.” Scenario: ${scenario.setup} Learning goal: ${scenario.goal} Stay in character, reply in 1–3 natural sentences, and move the roleplay forward. Never coach or score during the scene. Keep the interaction respectful and realistic. Treat the conversation as practice, not as a guarantee about real people's reactions.`
    : `You are a supportive, practical Beanos communication coach evaluating a short roleplay for “${scenario.title}.” Scenario: ${scenario.setup} Learning goal: ${scenario.goal} Score these dimensions from 1 to 5, based only on the learner's messages: ${scenario.rubric.join('; ')}. Be fair if the conversation is short; do not grade whether the fictional person liked the learner. Give specific, kind feedback with at least one strength and one actionable improvement. Return only valid JSON with this shape: {"overallScore": number from 0 to 100, "label": "Getting started"|"Building skill"|"Strong practice", "dimensions":[{"name":string,"score":number from 1 to 5,"feedback":string}], "strengths":[string], "improvements":[string]}. Keep feedback concise and never suggest ignoring a no or boundary.`;

  const contents = body.action === 'chat'
    ? history.map(message => ({ role: message.role === 'assistant' ? 'model' : 'user', parts: [{ text: message.text!.trim() }] }))
    : [{ role: 'user', parts: [{ text: `Evaluate this roleplay conversation. Messages marked Learner are the learner; messages marked Partner are you in character.\n${history.map(message => `${message.role === 'assistant' ? 'Partner' : 'Learner'}: ${message.text}`).join('\n')}` }] }];

  try {
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: instruction }] },
        contents,
        generationConfig: body.action === 'evaluate' ? { responseMimeType: 'application/json', temperature: 0.3 } : { temperature: 0.8, maxOutputTokens: 180 }
      })
    });
    const result = await response.json();
    if (!response.ok) {
      console.error('Gemini request failed:', response.status, result?.error?.status || 'provider error');
      return json({ error: response.status === 429 ? 'The roleplay is at its current usage limit. Please try again later.' : 'The roleplay could not get a response. Please try again.' }, 502);
    }
    const text = result?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text || '').join('').trim();
    if (!text) return json({ error: 'The roleplay returned an empty response. Please try again.' }, 502);
    if (body.action === 'chat') return json({ reply: text });

    const review = JSON.parse(text);
    if (!Number.isFinite(review.overallScore) || !Array.isArray(review.dimensions) || !Array.isArray(review.strengths) || !Array.isArray(review.improvements)) {
      return json({ error: 'The feedback could not be formatted. Please try again.' }, 502);
    }
    return json({ review });
  } catch (error) {
    console.error('Roleplay function error:', error instanceof Error ? error.message : 'unknown error');
    return json({ error: 'The roleplay service could not be reached. Please try again.' }, 502);
  }
});
