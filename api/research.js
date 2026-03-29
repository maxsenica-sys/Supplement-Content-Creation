export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { prompt, apiKey } = req.body;

    if (!apiKey || !apiKey.startsWith('sk-ant')) {
      return res.status(400).json({ error: 'Invalid API key' });
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        system: `You are a scientific research assistant for SUPPSTACKD, a supplement tracking app used by athletes.
Return real peer-reviewed studies about supplements as structured JSON.
The user is a professional volleyball player creating short-form content. NOT a nutritionist.
You have deep knowledge of sports science literature including PubMed.

CRITICAL: Return ONLY raw JSON. No markdown, no backticks, no text before or after.
Start your response with { and end with }
Include only real studies with real PMIDs — RCTs or meta-analyses, human subjects, quantified outcomes.`,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await response.json();
    if (data.error) return res.status(400).json({ error: data.error.message });

    // Extract text blocks
    const textBlocks = (data.content || []).filter(b => b.type === 'text');
    const rawText = textBlocks.map(b => b.text).join('');
    const clean = rawText.replace(/```json|```/g, '').trim();

    // Walk chars to find outermost JSON object
    const allMatches = [];
    let depth = 0, start = -1;
    for (let i = 0; i < clean.length; i++) {
      if (clean[i] === '{') { if (depth === 0) start = i; depth++; }
      else if (clean[i] === '}') {
        depth--;
        if (depth === 0 && start !== -1) {
          allMatches.push(clean.slice(start, i + 1));
          start = -1;
        }
      }
    }

    allMatches.sort((a, b) => b.length - a.length);
    let parsed = null;
    for (const m of allMatches) {
      try { parsed = JSON.parse(m); break; } catch (e) {}
    }

    if (!parsed) return res.status(500).json({ error: 'Could not parse research data. Try again.' });

    return res.status(200).json({ content: [{ type: 'text', text: JSON.stringify(parsed) }] });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
