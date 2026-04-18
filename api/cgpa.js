// api/cgpa.js
// CGPA.exe — Reality Check API
// Grok → Groq → Gemini fallback
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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { prompt } = req.body || {};
    if (!prompt) return res.status(400).json({ error: 'No prompt provided.' });

    const XKEY  = process.env.XAI_API_KEY;
    const GQKEY = process.env.GROQ_API_KEY;
    const GKEY  = process.env.GEMINI_API_KEY;

    if (!XKEY && !GQKEY && !GKEY) {
      return res.status(500).json({ error: 'No API keys configured. Add GEMINI_API_KEY in Vercel → Settings → Environment Variables.' });
    }

    const messages = [
      { role: 'system', content: 'You are a brutally honest Indian career counselor. Always respond with valid JSON only. No markdown, no extra text.' },
      { role: 'user', content: prompt }
    ];

    let raw = null;

    // Grok
    if (XKEY) {
      try {
        const r = await fetchWithTimeout('https://api.x.ai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${XKEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model:'grok-3-mini', messages, max_tokens:2000, temperature:0.8, response_format:{type:'json_object'} })
        });
        const d = await r.json();
        const t = d?.choices?.[0]?.message?.content?.trim();
        if (r.ok && t) { raw = t; console.log('[CGPA] Grok OK'); }
        else console.log('[CGPA] Grok failed:', r.status, d?.error?.message);
      } catch(e) { console.log('[CGPA] Grok error:', e.message); }
    }

    // Groq
    if (!raw && GQKEY) {
      for (const model of ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768']) {
        try {
          const r = await fetchWithTimeout('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${GQKEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model, messages, max_tokens:2000, temperature:0.8, response_format:{type:'json_object'} })
          });
          const d = await r.json();
          const t = d?.choices?.[0]?.message?.content?.trim();
          if (r.ok && t) { raw = t; console.log('[CGPA] Groq OK:', model); break; }
          else console.log('[CGPA] Groq failed:', model, r.status, d?.error?.message);
        } catch(e) { console.log('[CGPA] Groq error:', model, e.message); }
      }
    }

    // Gemini
    if (!raw && GKEY) {
      for (const model of ['gemini-2.0-flash-lite', 'gemini-1.5-flash', 'gemini-1.5-flash-8b']) {
        try {
          const r = await fetchWithTimeout(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GKEY}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ role:'user', parts:[{ text: prompt }] }],
                systemInstruction: { parts:[{ text:'You are a brutally honest Indian career counselor. Always respond with valid JSON only.' }] },
                generationConfig: { maxOutputTokens:2000, temperature:0.8, responseMimeType:'application/json' }
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

    if (!raw) return res.status(500).json({ error: 'All AI providers failed. Check your API keys.' });

    const parsed = safeParseJSON(raw);
    if (!parsed?.verdict) return res.status(500).json({ error: 'AI returned incomplete data. Please try again.' });

    return res.status(200).json(parsed);

  } catch(e) {
    console.error('[CGPA] Handler error:', e);
    return res.status(500).json({ error: e.message || 'Server error' });
  }
}