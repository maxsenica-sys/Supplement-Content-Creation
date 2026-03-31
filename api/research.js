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

    const prompt = `You are writing short-form video scripts for SUPPSTACKD. The creator films himself on his phone — one dot point per cut, reading each line off the screen. Videos are 9 seconds total. The audience is everyday gym goers and health-conscious people. NOT specialists or athletes.

TASK: Write a 9-second dot-point script for ${supplement} focused on ${focus || 'general health and performance'}.

STEP 1 — Find ONE real peer-reviewed RCT or meta-analysis on PubMed about ${supplement}. Must have a specific measurable number in the result. Do NOT use these PMIDs: ${usedList}.

STEP 2 — Write the dot points using the EXACT structure below.

━━━ STRUCTURE ━━━

POINT 1 — BENEFIT + MECHANISM (spoken at ~2s into video)
Format: "[What it does] — [why/how in plain words]."
The "why" must be a plain-English mechanism — the actual reason it works, not a restatement of the benefit.
Max 10 words total. Must fit in 2.5 seconds spoken aloud.
BAD: "Boosts your power output fast." (no mechanism)
BAD: "Boosts power — makes you stronger." (mechanism is just the benefit repeated)
GOOD: "Boosts power — your muscles store more fast-burning fuel."
GOOD: "Sharpens focus — it slows the brain chemical that causes tiredness."

POINT 2 — BENEFIT + MECHANISM (spoken at ~4s)
Same format. Different benefit, different mechanism. Max 10 words.

POINT 3 — DOSE + STUDY PROOF (spoken at ~6s)
Weave the dose AND the study finding into one sentence.
Format: "[Dose] daily — a study on [X people] found [specific number result]."
Max 12 words. The dose must be specific (e.g. "3–5g", "400mg", "10mg").
BAD: "Studies show it works well." (no number, no dose)
GOOD: "3–5g daily — a study on 40 adults found 23% more power output."
GOOD: "500mg daily — a trial on 60 people found 18% less anxiety."

POINT 4 — SUPPSTACKD (spoken at ~8s)
One sentence. Use the cost-per-dose or tracking angle. Must feel useful, not salesy.
Max 10 words.
GOOD: "Most stacks cost $300+ a year — SUPPSTACKD shows you exactly."
GOOD: "Log your dose in SUPPSTACKD — see if it's actually working."

POINT 5 — CTA (always fixed, word for word)
"Follow for supplement data that actually matters."

━━━ RULES ━━━
- Plain everyday English ONLY — if a 15-year-old wouldn't understand it, rewrite it
- No sport references, no jargon without instant explanation, no volleyball
- Every mechanism must be the actual biological or chemical reason — not marketing speak
- Mechanisms should make the viewer think "oh, THAT'S how it works" — that's the hook that keeps them watching
- Say each point aloud and time it — Points 1–2 must be under 2.5s each, Point 3 under 3s
- Dose in Point 3 must match the real evidence-based dose from the study

━━━ EXAMPLE OUTPUT for creatine ━━━
{
  "dot_points": [
    "Boosts power output — your muscles store more fast-burning fuel.",
    "Helps build more muscle — it pulls water into muscle cells to speed recovery.",
    "3–5g daily — a study on 30 athletes found 23% more peak power.",
    "Most stacks cost $300+ a year — SUPPSTACKD shows you exactly where it goes.",
    "Follow for supplement data that actually matters."
  ]
}

━━━ RETURN FORMAT ━━━
Return ONLY this exact JSON, raw, no markdown, no backticks, nothing before or after:

{
  "supplement": "${supplement}",
  "focus": "${focus || 'performance'}",
  "video_title": "Everything about ${supplement} in 9 seconds",
  "dot_points": [
    "Benefit + mechanism sentence.",
    "Benefit + mechanism sentence.",
    "Dose + study finding sentence.",
    "SUPPSTACKD sentence.",
    "Follow for supplement data that actually matters."
  ],
  "key_stat": "The specific number from the study e.g. 23% increase in power output",
  "dose": "Plain English dose e.g. 3–5g per day",
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
        system: 'You are a supplement video script writer for a general audience. Rules: (1) Return valid JSON only — nothing outside the braces. (2) Every benefit dot point MUST include the mechanism — the biological reason it works, in plain English. Not a restatement of the benefit. (3) Point 3 must weave in dose AND a specific study number. (4) Plain everyday English — no jargon. (5) Never mention volleyball or any specific sport. (6) Last dot point is always exactly: "Follow for supplement data that actually matters." (7) Say each point aloud — Points 1 and 2 must be under 2.5 seconds spoken.',
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await response.json();
    if (data.error) return res.status(400).json({ error: data.error.message || data.error });

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
