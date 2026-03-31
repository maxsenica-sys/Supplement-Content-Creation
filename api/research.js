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

    const prompt = `You are writing a 9-second dot-point video script about ${supplement} for ${focus || 'general health and performance'}.

The creator reads each point off his phone — one cut per point. Audience: everyday gym goers and health-conscious adults. NOT specialists.

━━━ STEP 1: FIND A REAL STUDY ━━━

Find ONE real, human, peer-reviewed RCT or meta-analysis specifically about ${supplement}.

STRICT STUDY RULES:
- Must be specifically about ${supplement} — not a tangentially related compound, not fungi, not animal research
- Must have a REAL PubMed ID (PMID) — you must be certain this PMID exists on pubmed.ncbi.nlm.nih.gov
- Must include a specific measurable number (%, kg, seconds, etc.)
- Must include the dose used in the study AND the duration (how many weeks/days)
- Do NOT use these PMIDs: ${usedList}
- If you are not certain a PMID is real, set pmid and pubmed_url to null in the JSON
- The pubmed_url must exactly match: https://pubmed.ncbi.nlm.nih.gov/[PMID]/ — only include if PMID is certain

━━━ STEP 2: WRITE THE DOT POINTS ━━━

You must write EXACTLY 5 dot points in this order:

POINT 1 — BENEFIT + BIOLOGICAL MECHANISM
Structure: "[What it does] — [the actual biological reason why]."
- The mechanism is the specific biological or chemical process that causes the benefit
- It must answer "but HOW does it do that at a cellular level?" — not restate the benefit in different words
- Max 14 words total.
- FAIL examples (rejected — no real mechanism):
  x "Increases your power during workouts." — just a statement, zero mechanism
  x "Boosts power — makes muscles work better." — vague, not a mechanism
  x "Helps you recover between sets faster." — zero mechanism
- PASS examples (accepted — real biological mechanism):
  v "Boosts power output — it refills your muscles' fast energy stores between reps."
  v "Sharpens focus — it blocks adenosine, the brain chemical that makes you feel tired."
  v "Reduces soreness — it lowers the inflammatory signals muscles release after hard training."
  v "Improves sleep — it raises GABA, the chemical that slows your brain activity at night."

POINT 2 — SECOND BENEFIT + BIOLOGICAL MECHANISM
Same rules as Point 1. Must be a different benefit with its own distinct mechanism. Max 14 words.

POINT 3 — DOSE + DURATION + STUDY FINDING
ONE sentence containing all three: the dose from the study, the duration of the study, and the specific result.
Structure: "Taking [dose] daily for [X weeks] — a study found [specific number + outcome]."
- Dose = the actual dose used in the study
- Duration = the actual study length
- Result = the specific measured number
- Max 18 words. Conversational tone, not academic.
- FAIL examples:
  x "A study on 20 men found 15% more bench press reps." — no dose, no duration
  x "3-5g daily — a study found 15% more reps." — no duration
  x "Taking creatine for 8 weeks improves performance." — no dose, no specific number
- PASS examples:
  v "Taking 5g daily for 8 weeks — a study found 23% more peak power output."
  v "Taking 400mg daily for 12 weeks — a trial found 18% lower anxiety scores."
  v "Taking 3g daily for 4 weeks — researchers found sleep onset cut by 9 minutes."

POINT 4 — SUPPSTACKD
One sentence. Cost-tracking or daily logging angle. Useful, not salesy. Max 12 words.
v "Most supplement stacks cost $300+ a year — SUPPSTACKD shows the breakdown."
v "Log your dose in SUPPSTACKD and see what's actually costing you."

POINT 5 — CTA (FIXED — DO NOT CHANGE A SINGLE WORD)
Exactly: "Follow for supplement data that actually matters."

━━━ LANGUAGE RULES ━━━
- Plain everyday English only — if a 15-year-old wouldn't get it, rewrite it
- No sport names, no volleyball
- Mechanisms must be biological facts, not marketing copy
- Be direct — never say "may", "can help", "supports", "promotes"

━━━ RETURN THIS EXACT JSON — RAW, NO MARKDOWN, NO BACKTICKS ━━━

{
  "supplement": "${supplement}",
  "focus": "${focus || 'performance'}",
  "video_title": "Everything about ${supplement} in 9 seconds",
  "dot_points": [
    "Benefit plus mechanism sentence.",
    "Benefit plus mechanism sentence.",
    "Taking [dose] for [duration] — a study found [number plus outcome].",
    "SUPPSTACKD sentence.",
    "Follow for supplement data that actually matters."
  ],
  "key_stat": "The specific number with context e.g. 23% increase in peak power output after 8 weeks on 5g per day",
  "dose": "Dose from the study e.g. 5g per day",
  "study": {
    "title": "Full exact title of the study",
    "authors": "First author surname et al.",
    "year": 2022,
    "pmid": null,
    "pubmed_url": null
  }
}

IMPORTANT: Only populate pmid and pubmed_url if you are 100% certain the PMID is real and points to a study about ${supplement} on PubMed. If there is any doubt, leave both as null. A wrong link is worse than no link.`;

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
        system: `You are a supplement video script writer. Follow this format exactly or the output is rejected.

NON-NEGOTIABLE RULES:
1. Return valid JSON only. Nothing outside the braces. No markdown. No backticks.
2. Points 1 and 2 MUST contain a real biological mechanism — the specific cellular or chemical reason the benefit occurs. "Makes muscles work better" is NOT a mechanism. "Refills phosphocreatine stores so muscles can contract again faster" IS a mechanism.
3. Point 3 MUST contain dose + duration + specific number from the study — all three in one sentence.
4. The study must be specifically about ${supplement}. If you cannot find a real study, say so in the study title field and set pmid and pubmed_url to null.
5. Only include a PMID/URL if you are 100% certain it is real. A wrong link is a critical failure. Default to null if uncertain.
6. Point 5 is always exactly: "Follow for supplement data that actually matters."
7. Plain English only — no jargon, no sport names.`,
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

    // Sanitise PMID/URL — null out anything that looks like a placeholder or hallucination
    if (parsed.study) {
      const badPattern = /^\[|\]$|^null$|^unknown$|^N\/A$|^none$/i;
      const pmid = String(parsed.study.pmid || '');
      const url = String(parsed.study.pubmed_url || '');
      if (!pmid || badPattern.test(pmid) || pmid === 'null') parsed.study.pmid = null;
      if (!url || badPattern.test(url) || url === 'null' || url.includes('[')) parsed.study.pubmed_url = null;
      // If URL doesn't match expected PubMed format, null it
      if (parsed.study.pubmed_url && !/^https:\/\/pubmed\.ncbi\.nlm\.nih\.gov\/\d+\/$/.test(parsed.study.pubmed_url)) {
        parsed.study.pubmed_url = null;
      }
    }

    // Store used PMID
    if (parsed.study && parsed.study.pmid) {
      parsed._usedPmid = parsed.study.pmid;
    }

    return res.status(200).json(parsed);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
