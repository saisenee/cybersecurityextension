require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const levenshtein = require('js-levenshtein');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// CORS configuration
const allowedOrigins = process.env.CORS_ORIGINS 
  ? process.env.CORS_ORIGINS.split(',') 
  : ['http://localhost:3000'];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Allow Chrome/Edge extension origins
    if (origin && (origin.startsWith('chrome-extension://') || origin.startsWith('moz-extension://'))) {
      return callback(null, true);
    }
    
    if (allowedOrigins.some(allowed => origin.startsWith(allowed.trim()) || allowed.trim() === '*')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

// In-memory cache with TTL
const cache = new Map();
const CACHE_TTL = (process.env.CACHE_TTL || 600) * 1000; // ms

function getCacheKey(url) {
  return require('crypto').createHash('sha256').update(url).digest('hex');
}

function getFromCache(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key, data) {
  cache.set(key, { data, timestamp: Date.now() });
}

// ===== THREAT DETECTION ENGINE =====

// Official domain list
const OFFICIAL_DOMAINS = (process.env.OFFICIAL_DOMAIN_ALLOWLIST || 
  'amazon.com,google.com,microsoft.com,interac.ca,canada.ca,cra-arc.gc.ca,apple.com,meta.com,twitter.com,ebay.com,paypal.com'
).split(',').map(d => d.trim());

// Heuristic keywords
const URGENCY_KEYWORDS = ['urgent', 'immediately', 'expires', 'final notice', 'act now', 'verify now', 'suspended', 'limited time', '24 hours', 'now', 'asap', 'action required', 'within 24', 'permanent', 'locked', 'restore access'];
const CRA_KEYWORDS = ['cra', 'canada revenue agency', 'gst', 'hst', 'refund', 'benefit', 'carbon rebate', 'my account', 'gckey', 'efile', 'tax return'];
const INTERAC_KEYWORDS = ['interac', 'e-transfer', 'etransfer', 'escrow', 'processing fee', 'deposit pending', 'unlock transfer', 'pending funds'];
const PHISHING_KEYWORDS = ['confirm', 'verify', 'urgent action', 'click here', 'update payment', 'unusual activity', 'suspended account', 'verify your account', 'verify your identity', 'security code', 'account suspended', 'temporarily suspended', 'restore your account'];
const BANKING_KEYWORDS = ['username', 'password', 'account number', 'card number', 'cvv', 'security code', 'access card', 'phone number for verification', 'credit card', 'debit card', 'pin code'];
const THREAT_KEYWORDS = ['permanent', 'permanently', 'locked', 'closure', 'closed', 'disabled', 'terminated', 'blocked', 'restricted'];

function extractDomain(url) {
  try {
    const u = new URL(url);
    return u.hostname.toLowerCase();
  } catch {
    return null;
  }
}

function findLookalikeMatch(domain) {
  if (!domain) return null;
  let bestMatch = null;
  let bestScore = 0;
  const threshold = 0.75;

  for (const official of OFFICIAL_DOMAINS) {
    const distance = levenshtein(domain, official);
    const maxLen = Math.max(domain.length, official.length);
    const similarity = 1 - (distance / maxLen);

    if (similarity >= threshold && similarity > bestScore) {
      bestScore = similarity;
      bestMatch = { brand: official, distance, similarity: similarity.toFixed(2) };
    }
  }

  return bestMatch;
}

function checkKeywords(text, keywords) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return keywords.some(kw => lower.includes(kw.toLowerCase()));
}

function countMatches(text, keywords) {
  if (!text) return 0;
  const lower = text.toLowerCase();
  return keywords.filter(kw => lower.includes(kw.toLowerCase())).length;
}

async function checkSafeBrowsing(url) {
  if (!process.env.SAFE_BROWSING_API_KEY) return null;
  try {
    const response = await axios.post(
      `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${process.env.SAFE_BROWSING_API_KEY}`,
      {
        client: { clientId: 'neurosafe', clientVersion: '1.0' },
        threatInfo: {
          threatTypes: ['MALWARE', 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE', 'POTENTIALLY_HARMFUL_APPLICATION'],
          platformTypes: ['ANY_PLATFORM'],
          threatEntryTypes: ['URL'],
          threatEntries: [{ url }]
        }
      },
      { timeout: 5000 }
    );
    return response.data.matches && response.data.matches.length > 0;
  } catch (err) {
    console.warn('[SafeBrowsing] Error:', err.message);
    return null;
  }
}

async function checkURLhaus(url) {
  try {
    const response = await axios.post('https://urlhaus-api.abuse.ch/v1/url/', 
      `url=${encodeURIComponent(url)}`,
      { timeout: 5000, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    if (response.data.query_status === 'ok' && response.data.result) {
      return response.data.result.some(r => r.threat_type === 'malware_download' || r.threat_type === 'phishing');
    }
    return false;
  } catch (err) {
    console.warn('[URLhaus] Error:', err.message);
    return null;
  }
}

async function checkOTX(domain) {
  if (!process.env.OTX_API_KEY) return null;
  try {
    const response = await axios.get(
      `https://otx.alienvault.com/api/v1/indicators/domain/${domain}/general`,
      {
        headers: { 'X-OTX-API-KEY': process.env.OTX_API_KEY },
        timeout: 5000
      }
    );
    const pulseCount = response.data.pulse_info?.count || 0;
    const malwareFamilies = response.data.malware_families?.length || 0;
    
    if (pulseCount > 5 || malwareFamilies > 0) {
      return {
        flagged: true,
        pulseCount,
        malwareFamilies,
        reputation: response.data.reputation || 0
      };
    }
    return { flagged: false };
  } catch (err) {
    console.warn('[OTX] Error:', err.message);
    return null;
  }
}

async function checkVirusTotal(domain) {
  if (!process.env.VIRUSTOTAL_API_KEY) return null;
  try {
    const domainId = Buffer.from(domain).toString('base64').replace(/=/g, '');
    const response = await axios.get(
      `https://www.virustotal.com/api/v3/domains/${domain}`,
      {
        headers: { 'x-apikey': process.env.VIRUSTOTAL_API_KEY },
        timeout: 5000
      }
    );
    
    const malicious = response.data.data?.attributes?.last_analysis_stats?.malicious || 0;
    const suspicious = response.data.data?.attributes?.last_analysis_stats?.suspicious || 0;
    
    if (malicious > 2 || suspicious > 5) {
      return {
        flagged: true,
        malicious,
        suspicious,
        reputation: response.data.data?.attributes?.reputation || 0
      };
    }
    return { flagged: false };
  } catch (err) {
    console.warn('[VirusTotal] Error:', err.message);
    return null;
  }
}

async function analyzeThreat(url, pageTitle, snippet) {
  const domain = extractDomain(url);
  if (!domain) return { verdict: 'SAFE', score: 0, reasons: [], tags: [], actions: [], meta: {} };

  const reasons = [];
  const tags = [];
  let score = 5; // baseline
  const actions = [];

  // 1. Safe Browsing check
  console.log(`[Analyze] Checking Safe Browsing for ${domain}`);
  const sbMatch = await checkSafeBrowsing(url);
  if (sbMatch) {
    score = 95;
    reasons.push('Flagged by Google Safe Browsing');
    tags.push('SAFE_BROWSING_MATCH');
    return { verdict: 'DANGEROUS', score, reasons, tags, actions, meta: { domain } };
  }

  // 2. URLhaus check
  console.log(`[Analyze] Checking URLhaus for ${domain}`);
  const uhMatch = await checkURLhaus(url);
  if (uhMatch) {
    score = 92;
    reasons.push('Flagged by URLhaus malware database');
    tags.push('URLHAUS_MATCH');
    return { verdict: 'DANGEROUS', score, reasons, tags, actions, meta: { domain } };
  }

  // 3. OTX (AlienVault) check
  console.log(`[Analyze] Checking OTX for ${domain}`);
  const otxResult = await checkOTX(domain);
  if (otxResult?.flagged) {
    score += 30;
    reasons.push(`Flagged by AlienVault OTX (${otxResult.pulseCount} threat pulses${otxResult.malwareFamilies > 0 ? ', ' + otxResult.malwareFamilies + ' malware families' : ''})`);
    tags.push('OTX_THREAT_INTEL');
  }

  // 4. VirusTotal check
  console.log(`[Analyze] Checking VirusTotal for ${domain}`);
  const vtResult = await checkVirusTotal(domain);
  if (vtResult?.flagged) {
    score += 35;
    reasons.push(`Flagged by ${vtResult.malicious} VirusTotal engines as malicious, ${vtResult.suspicious} as suspicious`);
    tags.push('VIRUSTOTAL_FLAGGED');
  }

  // 5. Lookalike detection
  const lookalike = findLookalikeMatch(domain);
  if (lookalike) {
    score += 35;
    reasons.push(`Domain resembles official "${lookalike.brand}" (similarity: ${lookalike.similarity})`);
    tags.push('LOOKALIKE_DOMAIN');
  }

  // 6. Interac scam heuristics
  if (checkKeywords(snippet, INTERAC_KEYWORDS)) {
    if (checkKeywords(snippet, ['escrow', 'processing fee', 'deposit pending', 'unlock'])) {
      score = 88;
      reasons.push('Interac scam pattern detected (escrow/processing fee/unlock scheme)');
      tags.push('INTERAC_ESCROW_FEE');
      actions.push({ type: 'OPEN_OFFICIAL', label: 'Go to official Interac', url: 'https://www.interac.ca' });
      actions.push({ type: 'SEARCH_OFFICIAL', label: 'Search how Interac really works', query: 'official Interac e-transfer' });
      return { verdict: 'DANGEROUS', score, reasons, tags, actions, meta: { domain } };
    }
  }

  // 7. CRA refund scam heuristics
  if (checkKeywords(snippet, CRA_KEYWORDS)) {
    const urgencyCount = countMatches(snippet, URGENCY_KEYWORDS);
    const craCount = countMatches(snippet, CRA_KEYWORDS);
    if ((checkKeywords(snippet, ['refund', 'benefit', 'carbon rebate']) || checkKeywords(snippet, ['verify', 'confirm'])) && urgencyCount > 0) {
      score = 70 + (urgencyCount * 5);
      reasons.push(`CRA refund/benefit scam pattern (${craCount} CRA keywords, ${urgencyCount} urgency signals)`);
      tags.push('CRA_REFUND_URGENCY');
      actions.push({ type: 'OPEN_OFFICIAL', label: 'Go to official CRA site', url: 'https://www.canada.ca/cra' });
      actions.push({ type: 'SEARCH_OFFICIAL', label: 'Learn how CRA contacts you', query: 'CRA official communication' });
      return { verdict: 'SUSPICIOUS', score: Math.min(score, 85), reasons, tags, actions, meta: { domain } };
    }
  }

  // 8. Account verification / Banking phishing detection
  const urgencyCount = countMatches(snippet, URGENCY_KEYWORDS);
  const phishingCount = countMatches(snippet, PHISHING_KEYWORDS);
  const bankingCount = countMatches(snippet, BANKING_KEYWORDS);
  const threatCount = countMatches(snippet, THREAT_KEYWORDS);
  const allText = `${pageTitle} ${snippet}`.toLowerCase();

  console.log(`[Analyze] Text analysis for ${domain}:`);
  console.log(`  - Urgency: ${urgencyCount}, Phishing: ${phishingCount}, Banking: ${bankingCount}, Threats: ${threatCount}`);
  console.log(`  - Current score: ${score}`);

  // Check for account suspension/verification scams - STRONGEST INDICATOR
  if (allText.includes('account suspended') || allText.includes('temporarily suspended') || allText.includes('verify your account') || allText.includes('verify your identity')) {
    score = Math.max(score, 75);
    reasons.push('Account suspension/verification scam detected');
    tags.push('ACCOUNT_SUSPENSION_SCAM');
    console.log(`  - ✓ Account suspension scam detected`);
  }

  // Multiple credential requests (major red flag)
  if (bankingCount >= 3) {
    score += 35;
    reasons.push(`Requests multiple sensitive credentials (${bankingCount} fields detected)`);
    tags.push('MULTIPLE_CREDENTIALS');
    console.log(`  - ✓ Multiple credentials requested (${bankingCount})`);
  }

  // Urgency + Threats combination
  if (urgencyCount >= 2 && threatCount >= 1) {
    score += 25;
    reasons.push(`High-pressure tactics: ${urgencyCount} urgency signals + ${threatCount} threat keywords`);
    tags.push('URGENCY_THREATS');
    console.log(`  - ✓ Urgency + Threats detected`);
  }

  // Phishing keywords present
  if (phishingCount >= 2) {
    score += 20;
    reasons.push(`Multiple phishing red flags detected (${phishingCount} indicators)`);
    tags.push('PHISHING_KEYWORDS');
    console.log(`  - ✓ Phishing keywords (${phishingCount})`);
  }

  // Time pressure indicators
  if (checkKeywords(allText, ['24 hours', 'within 24', 'expires', 'final notice', 'immediately'])) {
    score += 15;
    reasons.push('Creates artificial time pressure');
    tags.push('TIME_PRESSURE');
    console.log(`  - ✓ Time pressure detected`);
  }

  // Urgency alone
  if (urgencyCount >= 3 && score < 60) {
    score += 20;
    reasons.push(`Strong urgency language detected (${urgencyCount} keywords)`);
    tags.push('EXCESSIVE_URGENCY');
    console.log(`  - ✓ Excessive urgency detected`);
  }

  // Final verdict
  let verdict = 'SAFE';
  if (score >= 75) verdict = 'DANGEROUS';
  else if (score >= 50) verdict = 'SUSPICIOUS';

  if (verdict === 'SUSPICIOUS' || verdict === 'DANGEROUS') {
    if (!actions.length) {
      actions.push({ type: 'SEARCH_OFFICIAL', label: 'Search for the official site', query: `official ${domain}` });
    }
  }

  return { verdict, score: Math.min(score, 100), reasons, tags, actions, meta: { domain, lookalike } };
}

// ===== API ENDPOINTS =====

app.post('/analyze', async (req, res) => {
  const { url, pageTitle, snippet } = req.body;
  
  if (!url) return res.status(400).json({ error: 'URL required' });

  const cacheKey = getCacheKey(url);
  const cached = getFromCache(cacheKey);
  if (cached) {
    console.log(`[Cache] Hit for ${url}`);
    return res.json(cached);
  }

  try {
    const result = await analyzeThreat(url, pageTitle, snippet);
    console.log(`[Analyze] Result for ${url}: ${result.verdict} (score: ${result.score})`);
    console.log(`[Analyze] Reasons:`, result.reasons);
    setCache(cacheKey, result);
    res.json(result);
  } catch (err) {
    console.error('[Analyze] Error:', err.message);
    res.status(500).json({ error: 'Analysis failed', message: err.message });
  }
});

// Cache clear endpoint (for testing)
app.post('/clear-cache', (req, res) => {
  cache.clear();
  console.log('[Cache] Cleared');
  res.json({ message: 'Cache cleared' });
});

app.post('/explain', async (req, res) => {
  const { url, verdict, tags, reasons, reading_level } = req.body;
  
  if (!verdict) return res.status(400).json({ error: 'Verdict required' });

  // Template fallback (no AI for hackathon)
  const templates = {
    DANGEROUS: {
      simple: {
        summary: 'This site shows strong signs of being unsafe.',
        bullets: [
          'Clicking links or entering info here could harm you.',
          'Stop and go to the official site instead.'
        ],
        next_steps: ['Search for the official site', 'Call the organization directly']
      },
      standard: {
        summary: 'This site has multiple danger signals indicating a likely scam or malware threat.',
        bullets: [
          'Detected threat: ' + (reasons[0] || 'Security threat detected'),
          'Do not enter passwords, payment info, or personal details.',
          'Official organizations never ask for sensitive info via email or pop-ups.'
        ],
        next_steps: [
          'Search for the official website directly',
          'Contact the organization using a phone number from a trusted source'
        ]
      }
    },
    SUSPICIOUS: {
      simple: {
        summary: 'This site may not be what it seems.',
        bullets: [
          'Something here looks suspicious—be careful.',
          'When in doubt, search for the real site yourself.'
        ],
        next_steps: ['Double-check by visiting the official website', 'Do not share personal info yet']
      },
      standard: {
        summary: 'This site has some warning signs that suggest it might not be legitimate.',
        bullets: [
          'Warning signal: ' + (reasons[0] || 'Suspicious pattern detected'),
          'Look closely at the website address and design.',
          'Real organizations rarely ask to verify info urgently via email.'
        ],
        next_steps: [
          'Search online for the official site and compare',
          'Ask a trusted person before sharing any information'
        ]
      }
    },
    SAFE: {
      simple: {
        summary: 'This site appears safe to use.',
        bullets: [
          'No major threats detected.',
          'Still be cautious with personal information on any website.'
        ],
        next_steps: []
      },
      standard: {
        summary: 'This site did not trigger any major security alerts.',
        bullets: [
          'No known malware or phishing patterns detected.',
          'However, always use strong passwords and check website security.',
          'Look for the lock icon in your browser address bar.'
        ],
        next_steps: ['Use a unique, strong password', 'Enable two-factor authentication if available']
      }
    }
  };

  const level = reading_level === 'simple' ? 'simple' : 'standard';
  const result = templates[verdict]?.[level] || templates.SAFE[level];

  res.json(result);
});

app.post('/cards', async (req, res) => {
  const { verdict, tags, reasons, reading_level, max_cards } = req.body;
  const limit = max_cards || 3;

  // Tag-based learning cards (deterministic)
  const cardLibrary = {
    LOOKALIKE_DOMAIN: {
      title: 'Spotting Fake Domain Names',
      bullets: ["Real companies' websites look slightly different from fakes.", "Check every letter carefully.", "When unsure, type the official site address yourself."],
      next_step: 'Bookmark sites you trust so you can find them quickly.'
    },
    CRA_REFUND_URGENCY: {
      title: 'CRA Will Never Rush You for Money',
      bullets: ['The real CRA never emails asking for urgent action on refunds.', 'Scammers create fake urgency to make you act fast without thinking.', 'CRA always contacts you through your registered account or mail.'],
      next_step: 'If unsure, log into CRA.gc.ca yourself or call 1-800-959-8281.'
    },
    INTERAC_ESCROW_FEE: {
      title: "Interac E-Transfer Scams",
      bullets: ["Real Interac never charges \"unlock fees\" or \"escrow fees\".", "If someone asks for a fee to receive money, it's a scam.", "Legitimate transfers are instant and free."],
      next_step: "For real e-transfer help, visit interac.ca or contact your bank."
    },
    PHISHING_KEYWORDS: {
      title: "Recognizing Phishing Tactics",
      bullets: ["Scammers often ask you to \"confirm\" or \"verify\" information urgently.", "Real companies rarely ask for passwords in emails.", "Legitimate requests come from official apps or websites, not pop-ups."],
      next_step: "When in doubt, contact the organization directly using a number you find yourself."
    },
    SAFE_BROWSING_MATCH: {
      title: "This Site Is Known to Be Harmful",
      bullets: ["Google's safety tools flagged this as dangerous.", "It may contain malware that harms your device.", "Stay away from sites with this warning."],
      next_step: "Report this site to Google if you think it was flagged by mistake."
    },
    URLHAUS_MATCH: {
      title: "Malware Distribution Site",
      bullets: ["Malware researchers have flagged this site.", "Visiting it or downloading from it could infect your device.", "Avoid completely."],
      next_step: "Run a malware scan on your device if you visited this site."
    }
  };

  const cards = [];
  for (const tag of tags) {
    if (cardLibrary[tag] && cards.length < limit) {
      cards.push(cardLibrary[tag]);
    }
  }

  // Fallback generic cards if needed
  if (cards.length === 0) {
    if (verdict === 'DANGEROUS') {
      cards.push({
        title: 'Stay Safe Online',
        bullets: ['Verify before you trust.', 'Never share passwords or payment info unexpectedly.', 'When unsure, contact the organization directly.'],
        next_step: 'Report suspicious sites to anti-fraud organizations.'
      });
    } else if (verdict === 'SUSPICIOUS') {
      cards.push({
        title: "Think Before You Click",
        bullets: ["Take a moment to check the details.", "Look at the website address carefully.", "Trust your instincts if something feels off."],
        next_step: "Search for the official website if you're unsure."
      });
    }
  }

  res.json({ cards: cards.slice(0, limit) });
});

app.post('/deepcheck', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL required' });

  const result = {
    otx: null,
    virustotal: null,
    note: 'Deep check integration available with API keys.'
  };

  // OTX enrichment
  if (process.env.OTX_API_KEY) {
    try {
      const domain = extractDomain(url);
      const response = await axios.get(`https://otx.alienvault.com/api/v1/indicators/domain/${domain}/general`, {
        headers: { 'X-OTX-API-KEY': process.env.OTX_API_KEY },
        timeout: 5000
      });
      result.otx = {
        pulseCount: response.data.pulse_count || 0,
        tags: response.data.tags || []
      };
    } catch (err) {
      console.warn('[OTX] Error:', err.message);
    }
  }

  // VirusTotal enrichment
  if (process.env.VIRUSTOTAL_API_KEY) {
    try {
      const response = await axios.get(`https://www.virustotal.com/api/v3/urls/${Buffer.from(url).toString('base64')}`, {
        headers: { 'x-apikey': process.env.VIRUSTOTAL_API_KEY },
        timeout: 5000
      });
      const stats = response.data.data.attributes.last_analysis_stats;
      result.virustotal = {
        positives: stats.malicious || 0,
        total: stats.undetected + stats.malicious + (stats.suspicious || 0),
        permalink: `https://www.virustotal.com/gui/home/url/`
      };
    } catch (err) {
      console.warn('[VirusTotal] Error:', err.message);
    }
  }

  res.json(result);
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', cacheSize: cache.size });
});

app.listen(PORT, () => {
  console.log(`🛡️ NeuroSafe Backend running on http://localhost:${PORT}`);
  console.log(`📊 Cache size: ${cache.size} entries`);
});
