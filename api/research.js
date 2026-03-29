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

    const prompt = `You are writing a spoken video script for Max, a professional volleyball player who runs SUPPSTACKD (a supplement tracking app). Max films short videos where he speaks about a supplement in ONE BREATH, then gasps and delivers a fixed CTA.

TASK: Research ${supplement} for ${focus || 'performance and recovery'} and write Max's script.

STEP 1 — Find real peer-reviewed RCT or meta-analysis studies on PubMed about ${supplement}. Pick ONE study with the most compelling specific measurable stat. Do NOT use any study with these PMIDs already used: ${usedList}.

STEP 2 — Write the one-breath script. STRICT RULES:
- MAXIMUM 60 words. Count every word. Do not exceed 60.
- Must use proper punctuation — commas, full stops, so it reads naturally when spoken
- Written as Max speaks: casual, confident, first person
- Must include: the key benefit, the specific stat with its number, the dose for general population, and end naturally with "I log mine in SUPPSTACKD"
- Use "studies show..." or "research found..." — never prescribe, always share findings
- No filler. Every word earns its place.

GOOD EXAMPLE (57 words):
"Creatine monohydrate is the most researched performance supplement out there. Studies show a 23% increase in peak power output during high-intensity training, plus up to 15% more strength gains combined with resistance work. The standard dose is three to five grams daily. I log mine in SUPPSTACKD."

STEP 3 — The CTA is always fixed. Do not change it: "Follow for supplement data that actually matters."

Return ONLY this exact JSON, raw, no markdown, no backticks, nothing before or after the opening brace:

{
  "supplement": "${supplement}",
  "focus": "${focus || 'performance'}",
  "video_title": "Everything about ${supplement} in one breath",
  "one_breath_script": "WRITE THE PROPERLY PUNCTUATED MAX-60-WORD SCRIPT HERE",
  "word_count": 57,
  "cta": "Follow for supplement data that actually matters.",
  "key_stat": "The specific number from the study e.g. 23% increase in peak power output",
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
        system: 'You are a sports science content writer. Return valid JSON only — no markdown, no explanation, nothing outside the JSON. Always fully populate every field. Never exceed 60 words in one_breath_script. Always use proper punctuation. The cta field is always exactly: "Follow for supplement data that actually matters."',
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

    if (!parsed) return res.status(500).json({ error: 'Could not parse response. Try again.' });
    if (!parsed.one_breath_script || parsed.one_breath_script.includes('WRITE THE')) {
      return res.status(500).json({ error: 'Script was not generated. Try again.' });
    }

    // Enforce 60 word cap server-side as a safety net
    const words = parsed.one_breath_script.trim().split(/\s+/);
    if (words.length > 60) {
      parsed.one_breath_script = words.slice(0, 60).join(' ');
      // Clean up trailing incomplete sentence
      parsed.one_breath_script = parsed.one_breath_script.replace(/[,;]$/, '') + '.';
      parsed.word_count = 60;
    }

    // Always lock the CTA
    parsed.cta = 'Follow for supplement data that actually matters.';

    return res.status(200).json(parsed);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
