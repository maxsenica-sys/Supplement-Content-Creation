export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { supplement, focus, usedPmids, apiKey } = req.body;

    if (!apiKey || !apiKey.startsWith('sk-ant')) {
      return res.status(400).json({ error: 'Invalid API key format — must start with sk-ant' });
    }

    const usedList = (usedPmids || []).join(', ') || 'none yet';
    const currentYear = new Date().getFullYear();
    const cutoffYear = currentYear - 15;

    const prompt = `You are writing a 9-second dot-point video script about ${supplement} for ${focus || 'general health and performance'}.

Creator reads each point off his phone — one cut per point. Audience: everyday gym goers and health-conscious adults wanting long-term results. NOT specialists.

━━━ STEP 1: FIND A REAL STUDY ━━━

Find ONE real, human, peer-reviewed RCT or meta-analysis specifically about ${supplement}.

STUDY SELECTION RULES — ALL must be met:
- Published ${cutoffYear} or later (within the last 15 years) — older studies are rejected
- Prefer highly-cited studies or recent meta-analyses over single small trials
- Must be specifically about ${supplement} — not a related compound, not animal or in-vitro research
- Must use a REALISTIC, SUSTAINABLE dose — the kind a normal person would take long-term
  REJECT: megadose studies (e.g. 20g creatine/day, 100g protein bolus, 10x RDA of any vitamin)
  ACCEPT: standard recommended doses that appear consistently across multiple studies
- Must report a specific measurable number (%, kg, seconds, mg/dL, etc.)
- Must state the study duration clearly
- Do NOT use these PMIDs: ${usedList}
- Only include a PMID if you are highly confident it exists on PubMed — if uncertain, set pmid and pubmed_url to null

DOSE REALISM CHECK — before writing Point 3, ask yourself:
"Would a doctor or dietitian recommend this dose for ongoing daily use?"
If no → find a different study with a realistic dose.

━━━ STEP 2: WRITE EXACTLY 5 DOT POINTS ━━━

POINT 1 — BENEFIT + BIOLOGICAL MECHANISM
Structure: "[What it does] — [the actual biological reason why]."
The mechanism must be the specific biological or chemical process — NOT a restatement of the benefit.
Ask: "HOW does it do that at a cellular or molecular level?"
Max 14 words total.

FAIL (rejected — no mechanism or vague):
  x "Increases your power during workouts."
  x "Boosts power — makes muscles work better."
  x "Helps you recover between sets faster."

PASS (accepted — real mechanism):
  v "Boosts power — it refills phosphocreatine in muscles so they can contract again faster."
  v "Sharpens focus — it blocks adenosine, the brain chemical that builds up and makes you tired."
  v "Reduces soreness — it lowers the inflammatory markers muscles release after hard training."
  v "Improves sleep quality — it raises GABA, the calming chemical that slows brain activity."

POINT 2 — SECOND BENEFIT + BIOLOGICAL MECHANISM
Same rules. Different benefit, different mechanism. Max 14 words.

POINT 3 — DOSE + DURATION + STUDY FINDING
One sentence with all three: realistic dose, study duration, specific measured result.
Structure: "Taking [dose] daily for [X weeks/months] — a study found [specific number + outcome]."
- Dose must be realistic and sustainable (not a megadose)
- Duration from the actual study
- Number must be the real measured result
- Long-term framing preferred — studies of 8+ weeks preferred over acute/short protocols
Max 18 words.

FAIL:
  x "A study found 15% more reps." — no dose, no duration
  x "20g daily for 5 days — huge power gains." — megadose loading phase, not sustainable
  x "Taking creatine improves performance over time." — no dose, no number

PASS:
  v "Taking 3g daily for 12 weeks — a study found 20% more muscle power output."
  v "Taking 400mg daily for 8 weeks — a trial found sleep onset 9 minutes faster."
  v "Taking 1g daily for 6 months — researchers found 12% lower LDL cholesterol."

POINT 4 — SUPPSTACKD
One sentence. Cost-tracking or long-term logging angle. Useful, not salesy. Max 12 words.
  v "Most supplement stacks cost $300+ a year — SUPPSTACKD shows the breakdown."
  v "Log your daily dose in SUPPSTACKD — see what's actually costing you."

POINT 5 — CTA (FIXED — DO NOT CHANGE)
Exactly: "Follow for supplement data that actually matters."

━━━ RULES ━━━
- Plain everyday English — if a 15-year-old wouldn't understand, rewrite
- No sport names, no volleyball
- Mechanisms must be real biology, not marketing language
- Long-term health and safety framing throughout — sustainable use, not short-term hacks
- Never say "may", "can help", "supports", "promotes" — be specific and direct

━━━ RETURN THIS EXACT JSON — RAW, NO MARKDOWN, NO BACKTICKS ━━━

{
  "supplement": "${supplement}",
  "focus": "${focus || 'performance'}",
  "video_title": "Everything about ${supplement} in 9 seconds",
  "dot_points": [
    "Benefit plus mechanism sentence.",
    "Benefit plus mechanism sentence.",
    "Taking [realistic dose] for [duration] — a study found [number plus outcome].",
    "SUPPSTACKD sentence.",
    "Follow for supplement data that actually matters."
  ],
  "key_stat": "Specific number with context e.g. 20% more muscle power after 12 weeks on 3g per day",
  "dose": "Realistic sustainable dose from the study e.g. 3g per day",
  "study": {
    "title": "Full exact study title",
    "authors": "First author surname et al.",
    "year": 2018,
    "pmid": null,
    "pubmed_url": null
  }
}

CRITICAL: Only populate pmid and pubmed_url if you are confident the PMID is real. If uncertain, leave both as null.`;

    // ── Call Claude API ──────────────────────────────────────
    let claudeRaw;
    try {
      const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1500,
          system: `You are a supplement video script writer producing content about long-term, sustainable supplement use.

NON-NEGOTIABLE RULES:
1. Return valid JSON only — nothing outside the braces, no markdown, no backticks.
2. Points 1 and 2 MUST state the real biological mechanism. "Makes muscles work better" is NOT a mechanism. "Refills phosphocreatine stores between reps" IS a mechanism.
3. Point 3 MUST have dose + duration + specific number. Dose must be realistic for daily long-term use — reject megadose protocols.
4. Study must be from ${cutoffYear} or later. Prefer meta-analyses and highly cited trials.
5. Study must be specifically about ${supplement} in humans.
6. Only include PMID/URL if you are confident it is real. A wrong link is a critical failure — default to null.
7. Point 5 is always exactly: "Follow for supplement data that actually matters."
8. Long-term health framing throughout — not short-term hacks or loading phases.`,
          messages: [{ role: 'user', content: prompt }]
        })
      });

      // Read as text first — catches HTML error pages from Anthropic
      claudeRaw = await claudeRes.text();

      if (!claudeRes.ok) {
        // Try to extract a useful message from the response
        let errMsg = `Anthropic API error ${claudeRes.status}`;
        try {
          const errData = JSON.parse(claudeRaw);
          errMsg = errData.error?.message || errData.error || errMsg;
        } catch (_) {}
        return res.status(502).json({ error: errMsg });
      }

    } catch (fetchErr) {
      return res.status(502).json({ error: 'Could not reach Anthropic API: ' + fetchErr.message });
    }

    // ── Parse Claude response ────────────────────────────────
    let claudeData;
    try {
      claudeData = JSON.parse(claudeRaw);
    } catch (_) {
      return res.status(500).json({ error: 'Unexpected response from Anthropic API. Try again.' });
    }

    if (claudeData.error) {
      return res.status(400).json({ error: claudeData.error.message || String(claudeData.error) });
    }

    const rawText = (claudeData.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    const clean = rawText.replace(/```json|```/g, '').trim();

    // Extract outermost JSON object
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
    for (const m of allMatches) { try { parsed = JSON.parse(m); break; } catch (_) {} }

    if (!parsed) return res.status(500).json({ error: 'Could not parse AI response. Try again.' });
    if (!parsed.dot_points || !Array.isArray(parsed.dot_points) || parsed.dot_points.length === 0) {
      return res.status(500).json({ error: 'No content generated. Try again.' });
    }

    // Lock CTA
    parsed.dot_points[parsed.dot_points.length - 1] = 'Follow for supplement data that actually matters.';

    // ── Validate PubMed URL by actually fetching it ──────────
    if (parsed.study) {
      const url = parsed.study.pubmed_url;
      const pmid = String(parsed.study.pmid || '');
      const isValidFormat = url && /^https:\/\/pubmed\.ncbi\.nlm\.nih\.gov\/\d+\/$/.test(url);
      const isPlaceholder = !pmid || pmid === 'null' || /^\[|^null$|^unknown$|^N\/A$/i.test(pmid);

      if (isPlaceholder || !isValidFormat) {
        parsed.study.pmid = null;
        parsed.study.pubmed_url = null;
        parsed.study._link_status = 'none';
      } else {
        try {
          const pubmedCheck = await fetch(url, {
            method: 'HEAD',
            headers: { 'User-Agent': 'Mozilla/5.0' },
            redirect: 'follow',
            signal: AbortSignal.timeout(5000)
          });
          parsed.study._link_status = pubmedCheck.status === 200 ? 'verified' : 'not_found';
          if (pubmedCheck.status !== 200) {
            parsed.study.pmid = null;
            parsed.study.pubmed_url = null;
          }
        } catch (_) {
          parsed.study._link_status = 'unverified';
        }
      }
    }

    if (parsed.study?.pmid && parsed.study?._link_status === 'verified') {
      parsed._usedPmid = parsed.study.pmid;
    }

    return res.status(200).json(parsed);

  } catch (err) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
