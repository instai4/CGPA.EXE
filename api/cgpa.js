// api/cgpa.js
// CGPA.exe — Reality Check API
// Accepts structured payload, builds prompt server-side
// Grok → Groq → Gemini fallback
//
// Env vars: XAI_API_KEY, GROQ_API_KEY, GEMINI_API_KEY

async function fetchWithTimeout(url, options, ms = 9000) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { ...options, signal: ctrl.signal }); }
  finally { clearTimeout(id); }
}

function safeParseJSON(text) {
  if (!text) return null;
  try { return JSON.parse(text.replace(/```json|```/g, '').trim()); }
  catch {
    try { const m = text.match(/\{[\s\S]*\}/); if (m) return JSON.parse(m[0]); } catch {}
    return null;
  }
}

function buildPrompt({ cgpa, branch, tier, year, goal, extras, honesty }) {
  const honestyInstructions = {
    kind:   'Be honest but encouraging. Acknowledge challenges but focus on what is possible.',
    honest: 'Be straightforward and realistic. Give the actual ground reality without sugarcoating but without being cruel.',
    brutal: 'Be completely brutally honest like a senior who genuinely cares. No filter. Say exactly what Indian recruiters think when they see this profile. Be blunt but constructive.'
  };

  const extrasText = extras && extras.length > 0 && !extras.includes('nothing')
    ? `They also have: ${extras.join(', ')}.`
    : 'They have nothing beyond the degree — just the CGPA.';

  return `You are a brutally honest Indian career counselor who knows the ground reality of the Indian job market — placements, recruiters, CGPA cutoffs, college tier bias, everything.

Student profile:
- CGPA: ${cgpa}/10
- Branch: ${branch}
- College Tier: ${tier}
- Current Year: ${year}
- Dream Goal: ${goal}
- Additional profile: ${extrasText}
- Honesty level: ${honestyInstructions[honesty] || honestyInstructions.honest}

Give a REALISTIC assessment. Respond in this EXACT JSON format (no markdown, no extra text):

{
  "verdict": "One powerful word or short phrase describing their situation",
  "verdictColor": "red OR orange OR yellow OR green",
  "overallScore": 45,
  "opportunityScores": [
    {"name": "Product Companies (FAANG/MNCs)", "icon": "fa-solid fa-building", "score": 20, "note": "Brief honest note specific to this profile"},
    {"name": "Service Companies (TCS/Infosys)", "icon": "fa-solid fa-server", "score": 75, "note": "Brief honest note"},
    {"name": "Startups & Mid-size", "icon": "fa-solid fa-rocket", "score": 55, "note": "Brief honest note"},
    {"name": "Higher Studies (M.Tech/MS)", "icon": "fa-solid fa-graduation-cap", "score": 60, "note": "Brief honest note"},
    {"name": "Government Jobs / PSU", "icon": "fa-solid fa-landmark", "score": 40, "note": "Brief honest note"},
    {"name": "Data Science / ML Roles", "icon": "fa-solid fa-brain", "score": 35, "note": "Brief honest note"}
  ],
  "openDoors": [
    "Specific opportunity that IS accessible with this profile",
    "Another realistic open door",
    "Another one",
    "Another one"
  ],
  "closedDoors": [
    "Specific opportunity that is NOT accessible without improvement",
    "Another closed door",
    "Another one",
    "Another one"
  ],
  "brutalTruth": "Write 3-4 sentences of raw honest truth about this profile in the Indian context. Mention specific company names, CGPA cutoffs, real statistics. Do not be motivational — be factual.",
  "actionPlan": [
    "Specific actionable step 1 that will actually move the needle",
    "Specific actionable step 2",
    "Specific actionable step 3",
    "Specific actionable step 4",
    "Specific actionable step 5"
  ],
  "famousExamples": [
    {"name": "Famous person or real example", "story": "One sentence about how they overcame a similar situation"},
    {"name": "Another example", "story": "One sentence story"}
  ]
}`;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = req.body || {};

    // Accept either structured payload OR raw prompt string
    const prompt = body.prompt || buildPrompt(body);

    if (!prompt || prompt.trim().length < 20) {
      return res.status(400).json({ error: 'No prompt provided.' });
    }

    const XKEY  = process.env.XAI_API_KEY;
    const GQKEY = process.env.GROQ_API_KEY;
    const GKEY  = process.env.GEMINI_API_KEY;

    if (!XKEY && !GQKEY && !GKEY) {
      return res.status(500).json({
        error: 'No API keys configured. Add GEMINI_API_KEY in Vercel → Settings → Environment Variables. Get a free key at aistudio.google.com/app/apikey'
      });
    }

    const messages = [
      { role: 'system', content: 'You are a brutally honest Indian career counselor. Always respond with valid JSON only. No markdown, no extra text.' },
      { role: 'user', content: prompt }
    ];

    let raw = null;

    // ── Grok ──
    if (XKEY) {
      try {
        const r = await fetchWithTimeout('https://api.x.ai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${XKEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'grok-3-mini', messages, max_tokens: 2000,
            temperature: 0.8, response_format: { type: 'json_object' }
          })
        });
        const d = await r.json();
        const t = d?.choices?.[0]?.message?.content?.trim();
        if (r.ok && t) { raw = t; console.log('[CGPA] Grok OK'); }
        else console.log('[CGPA] Grok failed:', r.status, d?.error?.message);
      } catch(e) { console.log('[CGPA] Grok error:', e.message); }
    }

    // ── Groq ──
    if (!raw && GQKEY) {
      for (const model of ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768']) {
        try {
          const r = await fetchWithTimeout('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${GQKEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model, messages, max_tokens: 2000,
              temperature: 0.8, response_format: { type: 'json_object' }
            })
          });
          const d = await r.json();
          const t = d?.choices?.[0]?.message?.content?.trim();
          if (r.ok && t) { raw = t; console.log('[CGPA] Groq OK:', model); break; }
          else console.log('[CGPA] Groq failed:', model, r.status, d?.error?.message);
        } catch(e) { console.log('[CGPA] Groq error:', model, e.message); }
      }
    }

    // ── Gemini ──
    if (!raw && GKEY) {
      for (const model of ['gemini-2.0-flash-lite', 'gemini-1.5-flash', 'gemini-1.5-flash-8b']) {
        try {
          const r = await fetchWithTimeout(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GKEY}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                systemInstruction: { parts: [{ text: 'You are a brutally honest Indian career counselor. Always respond with valid JSON only. No markdown.' }] },
                generationConfig: { maxOutputTokens: 2000, temperature: 0.8, responseMimeType: 'application/json' }
              })
            }
          );
          const d = await r.json();
          const t = d?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
          if (r.ok && t) { raw = t; console.log('[CGPA] Gemini OK:', model); break; }
          else console.log('[CGPA] Gemini failed:', model, r.status, d?.error?.message);
        } catch(e) { console.log('[CGPA] Gemini error:', model, e.message); }
      }
    }

    if (!raw) {
      return res.status(500).json({
        error: 'All AI providers failed. Check your API keys have quota remaining in Vercel env vars.'
      });
    }

    const parsed = safeParseJSON(raw);
    if (!parsed?.verdict) {
      return res.status(500).json({ error: 'AI returned incomplete data. Please try again.' });
    }

    return res.status(200).json(parsed);

  } catch(e) {
    console.error('[CGPA] Handler error:', e);
    return res.status(500).json({ error: e.message || 'Server error' });
  }
}