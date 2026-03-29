export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { supplement, focus, usedPmids, apiKey } = req.body;

    if (!apiKey || !apiKey.startsWith('sk-ant')) {
      return res.status(400).json({ error: 'Invalid API key' });
    }

    const usedList = (usedPmids || []).join(', ') || 'none yet';

    const prompt = `You are writing a spoken video script for Max, a professional volleyball player who runs SUPPSTACKD (a supplement tracking app). Max films 20-25 second videos where he speaks in ONE BREATH about a supplement, then gasps and delivers a CTA.

TASK: Research ${supplement} for ${focus || 'performance and recovery'} and write Max's script.

STEP 1 — Find 4-5 real peer-reviewed RCT or meta-analysis studies on PubMed about ${supplement} for ${focus || 'athletic performance or recovery'}. Pick ONE that has the most compelling specific measurable stat (a real number — %, kg, seconds, etc). Do NOT use any study with these PMIDs: ${usedList}.

STEP 2 — Write the one-breath script. Rules:
- Exactly 65-80 words (counts as ~20-25 seconds spoken)
- Written as Max speaks: casual, fast, confident, first person
- Must include: the key benefit, the specific stat with its number, the dose for general population, and end with "I log mine in SUPPSTACKD"
- Use "studies show..." or "research found..." — never prescribe, always share
- No filler words. Every word earns its place.

STEP 3 — Write a punchy CTA (5-8 words) Max says after gasping. Must drive follows. Not generic. Examples of good CTAs: "Follow — your stack deserves better data." / "Follow SUPPSTACKD, stop guessing your stack."

Return ONLY this exact JSON, raw, no markdown, no backticks, nothing before or after the opening brace:

{
  "supplement": "${supplement}",
  "focus": "${focus || 'performance'}",
  "video_title": "Everything about ${supplement} in one breath",
  "one_breath_script": "WRITE THE FULL 65-80 WORD SCRIPT HERE — DO NOT LEAVE THIS EMPTY",
  "word_count": 72,
  "cta": "WRITE THE 5-8 WORD CTA HERE",
  "key_stat": "The specific number from the study e.g. 23% increase in power output",
  "dose": "Evidence-based dose e.g. 3-5g daily",
  "study": {
    "title": "Full exact study title",
    "authors": "First author et al.",
    "year": 2022,
    "pmid": "12345678",
    "pubmed_url": "https://pubmed.ncbi.nlm.nih.gov/12345678/"
  }
}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        system: 'You are a sports science content writer. You always return valid JSON only — no markdown, no explanation, no text outside the JSON object. You always fully populate every field. You never leave one_breath_script empty.',
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await response.json();
    if (data.error) return res.status(400).json({ error: data.error.message });

    const textBlocks = (data.content || []).filter(b => b.type === 'text');
    const rawText = textBlocks.map(b => b.text).join('');
    const clean = rawText.replace(/```json|```/g, '').trim();

    // Walk chars to extract outermost JSON
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

    if (!parsed) return res.status(500).json({ error: 'Could not parse response. Try again.' });
    if (!parsed.one_breath_script || parsed.one_breath_script.includes('WRITE THE FULL')) {
      return res.status(500).json({ error: 'Script was not generated. Try again.' });
    }

    return res.status(200).json(parsed);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
