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

    const prompt = `You are generating short-form video content for SUPPSTACKD, a supplement tracking app. The creator films himself reading dot points off his phone, cutting between each one. The audience is everyday people — gym goers, health-conscious adults, general population. NOT specialists.

TASK: Research ${supplement} for ${focus || 'general health and performance'}.

STEP 1 — Find ONE real peer-reviewed RCT or meta-analysis on PubMed about ${supplement}. Pick the one with the clearest measurable outcome — a specific number. Do NOT use these PMIDs: ${usedList}.

STEP 2 — Generate the dot points. STRICT RULES:
- Each dot point is ONE short sentence — maximum 6 words ideally, 8 absolute max
- Each point takes 2 to 2.5 seconds to say out loud — test this mentally
- Plain everyday English ONLY. If a 15 year old would not understand it, rewrite it
- No sport references, no jargon without instant plain explanation
- No volleyball, no specific sport mentions
- Maximum 3 benefit points — use 2 if 2 is enough
- The study reference point must be conversational and relatable — "A study on 40 adults found..." style, NOT academic
- The SUPPSTACKD point must feel natural — use the cost tracking angle or logging angle, not salesy
- CTA is always fixed word for word: "Follow for supplement data that actually matters."

REQUIRED DOT POINT ORDER:
1. Benefit 1 — what it does, plain terms
2. Benefit 2 — second key benefit
3. Benefit 3 — only if genuinely adds value, skip if not
4. Study reference — "A [study type] on [who] found [specific number result]"
5. SUPPSTACKD — one sentence on logging, tracking, or cost-per-dose
6. CTA — always: "Follow for supplement data that actually matters."

GOOD EXAMPLE for creatine:
[
  "Boosts your power output fast.",
  "Helps you build more muscle.",
  "A study on 30 adults found 23% more peak power.",
  "Most people spend $400+ a year on supps — SUPPSTACKD shows you exactly where it goes.",
  "Follow for supplement data that actually matters."
]

Notice: short, punchy, plain, each one standalone, study is conversational, SUPPSTACKD feels useful not pushy.

Return ONLY this exact JSON, raw, no markdown, no backticks, nothing before or after:

{
  "supplement": "${supplement}",
  "focus": "${focus || 'performance'}",
  "video_title": "Everything about ${supplement} in 9 seconds",
  "dot_points": [
    "Benefit 1 here.",
    "Benefit 2 here.",
    "Study reference here.",
    "SUPPSTACKD sentence here.",
    "Follow for supplement data that actually matters."
  ],
  "key_stat": "The specific number from the study e.g. 23% increase in power output",
  "dose": "Plain English dose e.g. 3-5g per day",
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
        system: 'You are a supplement content writer for a general audience. Rules: (1) Return valid JSON only — nothing outside the braces. (2) dot_points is an array of short standalone sentences, each 2-2.5 seconds when spoken. (3) Plain everyday English — no jargon. (4) Never mention volleyball or any specific sport. (5) Last dot point is always exactly: "Follow for supplement data that actually matters." (6) Study reference must be conversational not academic.',
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
    if (!parsed.dot_points || !Array.isArray(parsed.dot_points) || parsed.dot_points.length === 0) {
      return res.status(500).json({ error: 'Content not generated. Try again.' });
    }

    // Always lock CTA as last point
    parsed.dot_points[parsed.dot_points.length - 1] = 'Follow for supplement data that actually matters.';

    // Store used PMID
    if (parsed.study && parsed.study.pmid) {
      parsed._usedPmid = parsed.study.pmid;
    }

    return res.status(200).json(parsed);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
