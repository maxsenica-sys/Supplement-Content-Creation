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
        system: `You are a content script writer for SUPPSTACKD. The creator is Max, a professional volleyball player (NOT a nutritionist) who films 20-25 second short-form videos about supplements in a single breath, then delivers a CTA.

VIDEO FORMAT:
1. Title card: "Everything about [supplement] in one breath"
2. Max takes a huge visible breath
3. Speaks non-stop 20-25 seconds: benefit + specific stat/number + dose + why track it in SUPPSTACKD
4. Gasps for air
5. CTA line

FRAMING RULES:
- Always athlete sharing findings, never prescribing: "studies show..." "the research I found shows..." "I take X amount..."
- Specific numbers make it credible — always include the actual stat
- Dose must be practical for general population
- SUPPSTACKD tie-in must feel natural, not forced

Return ONLY this exact JSON structure, raw, no markdown, no backticks:
{
  "supplement": "name",
  "focus": "performance/recovery/sleep/etc",
  "video_title": "Everything about [supplement] in one breath",
  "one_breath_script": "The full spoken script Max delivers in one breath — 20-25 seconds when spoken aloud. Must include: key benefit, specific stat with number, dose, and natural SUPPSTACKD tie-in. Written exactly as spoken, conversational, fast-paced.",
  "cta": "The closing line Max says after gasping — strong, punchy, 5-8 words max",
  "key_stat": "The single most compelling number from the research — e.g. '23% increase in power output'",
  "dose": "Evidence-based dose for general population",
  "studies": [
    {
      "title": "Full exact study title",
      "authors": "First author et al.",
      "year": 2022,
      "pubmed_url": "https://pubmed.ncbi.nlm.nih.gov/REALPMID/"
    }
  ]
}`,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await response.json();
    if (data.error) return res.status(400).json({ error: data.error.message });

    const textBlocks = (data.content || []).filter(b => b.type === 'text');
    const rawText = textBlocks.map(b => b.text).join('');
    const clean = rawText.replace(/```json|```/g, '').trim();

    const allMatches = [];
    let depth = 0, start = -1;
    for (let i = 0; i < clean.length; i++) {
      if (clean[i] === '{') { if (depth === 0) start = i; depth++; }
      else if (clean[i] === '}') {
        depth--;
        if (depth === 0 && start !== -1) { allMatches.push(clean.slice(start, i + 1)); start = -1; }
      }
    }
    allMatches.sort((a, b) => b.length - a.length);
    let parsed = null;
    for (const m of allMatches) { try { parsed = JSON.parse(m); break; } catch (e) {} }
    if (!parsed) return res.status(500).json({ error: 'Could not parse research data. Try again.' });

    return res.status(200).json({ content: [{ type: 'text', text: JSON.stringify(parsed) }] });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
