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

    const prompt = `You are writing a spoken video script for Max, who runs SUPPSTACKD, a supplement tracking app. Max speaks directly to everyday people who take supplements — gym goers, busy professionals, people who care about their health. NOT specialists. NOT athletes specifically.

TASK: Research ${supplement} for ${focus || 'general health and performance'} and write Max's script.

STEP 1 — Find ONE real peer-reviewed RCT or meta-analysis on PubMed about ${supplement}. Pick the one with the most compelling specific measurable stat — a real number like a percentage or amount. Do NOT use these PMIDs: ${usedList}.

STEP 2 — Write the one-breath script. NON-NEGOTIABLE RULES:
- MAXIMUM 60 words. Hard limit. Count every single word before returning.
- Proper punctuation — commas where you pause, full stops where sentences end. Must read naturally aloud.
- Plain everyday English only. Write like you're explaining it to a friend over coffee. If a scientific word is unavoidable, follow it immediately with a simple explanation in brackets or a quick clause.
- NEVER mention volleyball, sport type, or any specific sport. If needed, say "when I train" — nothing more specific.
- Include: what it does in plain terms, the specific stat with its number, the dose in plain terms, end with "I log mine in SUPPSTACKD."
- Use "studies show..." or "research found..." to frame it as sharing, not prescribing.

GOOD EXAMPLE of tone, length and punctuation (54 words):
"Creatine is one of the most researched supplements out there. Studies show it can boost your power output by up to 23% during intense exercise, and increase strength gains by around 15%. The standard dose is three to five grams a day. Simple. I log mine in SUPPSTACKD."

STEP 3 — CTA is always fixed, word for word: "Follow for supplement data that actually matters."

Return ONLY this exact JSON, raw, no markdown, no backticks, nothing before or after:

{
  "supplement": "${supplement}",
  "focus": "${focus || 'performance'}",
  "video_title": "Everything about ${supplement} in one breath",
  "one_breath_script": "THE SCRIPT HERE — MAX 60 WORDS, PROPER PUNCTUATION, PLAIN ENGLISH, NO SPORT REFERENCES",
  "word_count": 54,
  "cta": "Follow for supplement data that actually matters.",
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
        system: 'You are a supplement content writer for a general audience. Rules: (1) Return valid JSON only — nothing outside the braces. (2) one_breath_script must never exceed 60 words — count them. (3) Use plain everyday English — no jargon without immediate plain explanation. (4) Never mention volleyball or any specific sport. (5) Always use proper punctuation. (6) cta is always exactly: "Follow for supplement data that actually matters."',
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
    if (!parsed.one_breath_script || parsed.one_breath_script.includes('THE SCRIPT HERE')) {
      return res.status(500).json({ error: 'Script not generated. Try again.' });
    }

    // Hard enforce 60 word cap server-side
    const words = parsed.one_breath_script.trim().split(/\s+/);
    if (words.length > 60) {
      parsed.one_breath_script = words.slice(0, 60).join(' ').replace(/[,;]$/, '') + '.';
      parsed.word_count = 60;
    } else {
      parsed.word_count = words.length;
    }

    // Always lock CTA
    parsed.cta = 'Follow for supplement data that actually matters.';

    return res.status(200).json(parsed);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
