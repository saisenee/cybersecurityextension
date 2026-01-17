// NeuroSafe Copilot - Side Panel

let currentAnalysis = null;

async function loadStatus() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  const currentUrl = tab.url;
  const pageTitle = tab.title;

  // Request analysis from background
  const result = await chrome.runtime.sendMessage({
    type: 'ANALYZE_URL',
    url: currentUrl,
    pageTitle,
    snippet: 'Loading...'
  }).catch(() => ({ verdict: 'SAFE', score: 0, reasons: [], tags: [], actions: [] }));

  currentAnalysis = result;
  displayStatus(result);
  loadCards(result);
}

function displayStatus(analysis) {
  const statusContent = document.getElementById('status-content');
  const statusLoading = document.getElementById('status-loading');

  statusContent.style.display = 'block';
  statusLoading.style.display = 'none';

  // Verdict card
  const verdictIcon = document.getElementById('verdict-icon');
  const verdictText = document.getElementById('verdict-text');
  const verdictScore = document.getElementById('verdict-score');

  if (analysis.verdict === 'DANGEROUS') {
    verdictIcon.textContent = '⛔';
    verdictText.textContent = 'Dangerous Site';
    verdictText.style.color = '#d32f2f';
  } else if (analysis.verdict === 'SUSPICIOUS') {
    verdictIcon.textContent = '⚠️';
    verdictText.textContent = 'Suspicious Site';
    verdictText.style.color = '#f57c00';
  } else {
    verdictIcon.textContent = '✅';
    verdictText.textContent = 'Safe Site';
    verdictText.style.color = '#4CAF50';
  }

  verdictScore.textContent = `Safety Score: ${analysis.score}/100`;

  // Reasons
  const reasonsList = document.getElementById('reasons-list');
  reasonsList.innerHTML = '';
  if (analysis.reasons.length > 0) {
    analysis.reasons.forEach(reason => {
      const li = document.createElement('li');
      li.textContent = reason;
      reasonsList.appendChild(li);
    });
  } else {
    reasonsList.innerHTML = '<li>No specific risks detected.</li>';
  }

  // Actions
  const actionsSection = document.getElementById('actions-section');
  if (analysis.actions && analysis.actions.length > 0) {
    actionsSection.style.display = 'block';
    const actionsList = document.getElementById('actions-list');
    actionsList.innerHTML = '';
    analysis.actions.forEach(action => {
      const div = document.createElement('div');
      div.style.marginBottom = '8px';
      if (action.type === 'OPEN_OFFICIAL') {
        const link = document.createElement('a');
        link.href = action.url;
        link.textContent = action.label;
        link.target = '_blank';
        link.style.display = 'block';
        link.style.padding = '8px 12px';
        link.style.background = '#e3f2fd';
        link.style.borderRadius = '4px';
        link.style.textDecoration = 'none';
        link.style.color = '#1976d2';
        link.style.marginBottom = '8px';
        actionsList.appendChild(link);
      } else if (action.type === 'SEARCH_OFFICIAL') {
        const link = document.createElement('a');
        link.href = `https://www.google.com/search?q=${encodeURIComponent(action.query)}`;
        link.textContent = action.label;
        link.target = '_blank';
        link.style.display = 'block';
        link.style.padding = '8px 12px';
        link.style.background = '#f3e5f5';
        link.style.borderRadius = '4px';
        link.style.textDecoration = 'none';
        link.style.color = '#6a1b9a';
        link.style.marginBottom = '8px';
        actionsList.appendChild(link);
      }
    });
  } else {
    actionsSection.style.display = 'none';
  }
}

async function loadCards(analysis) {
  const cardsContent = document.getElementById('cards-content');
  const cardsLoading = document.getElementById('cards-loading');

  const cardsData = await chrome.runtime.sendMessage({
    type: 'GET_CARDS',
    verdict: analysis.verdict,
    tags: analysis.tags,
    reasons: analysis.reasons
  }).catch(() => ({ cards: [] }));

  cardsLoading.style.display = 'none';
  cardsContent.style.display = 'block';
  cardsContent.innerHTML = '';

  if (cardsData.cards && cardsData.cards.length > 0) {
    cardsData.cards.forEach((card, idx) => {
      const cardEl = document.createElement('div');
      cardEl.style.background = '#f9f9f9';
      cardEl.style.borderLeft = '4px solid #4CAF50';
      cardEl.style.padding = '12px';
      cardEl.style.marginBottom = '12px';
      cardEl.style.borderRadius = '4px';
      cardEl.innerHTML = `
        <h4 style="margin: 0 0 8px; font-size: 14px;">${card.title}</h4>
        <ul style="margin: 0; padding-left: 20px; font-size: 12px;">
          ${card.bullets.map(b => `<li>${b}</li>`).join('')}
        </ul>
        ${card.next_step ? `<p style="margin: 8px 0 0; font-size: 12px; color: #555;"><strong>Next step:</strong> ${card.next_step}</p>` : ''}
      `;
      cardsContent.appendChild(cardEl);
    });
  } else {
    cardsContent.innerHTML = '<p style="font-size: 12px; color: #888;">No learning cards available for this page.</p>';
  }
}

// Tab switching
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    const tabName = btn.dataset.tab;
    document.getElementById(`${tabName}-tab`).classList.add('active');

    if (tabName === 'learn') {
      loadCards(currentAnalysis || { verdict: 'SAFE', tags: [], reasons: [] });
    }
  });
});

// Explain button
document.getElementById('explain-btn').addEventListener('click', async () => {
  if (!currentAnalysis) return;

  const explainSection = document.getElementById('explanation-section');
  explainSection.style.display = 'block';
  document.getElementById('explanation-text').textContent = 'Loading explanation...';

  const explanation = await chrome.runtime.sendMessage({
    type: 'GET_EXPLANATION',
    url: window.location.href,
    verdict: currentAnalysis.verdict,
    tags: currentAnalysis.tags,
    reasons: currentAnalysis.reasons
  }).catch(() => ({ summary: 'Explanation not available', bullets: [], next_steps: [] }));

  document.getElementById('explanation-text').textContent = explanation.summary || 'No explanation available.';

  const bulletsList = document.getElementById('explanation-bullets');
  bulletsList.innerHTML = '';
  if (explanation.bullets && explanation.bullets.length > 0) {
    explanation.bullets.forEach(bullet => {
      const li = document.createElement('li');
      li.textContent = bullet;
      li.style.fontSize = '12px';
      bulletsList.appendChild(li);
    });
  }

  const nextDiv = document.getElementById('explanation-next');
  nextDiv.innerHTML = '';
  if (explanation.next_steps && explanation.next_steps.length > 0) {
    nextDiv.innerHTML = '<strong style="font-size: 12px;">Next steps:</strong>';
    const ul = document.createElement('ul');
    explanation.next_steps.forEach(step => {
      const li = document.createElement('li');
      li.textContent = step;
      li.style.fontSize = '12px';
      ul.appendChild(li);
    });
    nextDiv.appendChild(ul);
  }
});

// Deep check button
document.getElementById('deepcheck-btn').addEventListener('click', async () => {
  if (!currentAnalysis) return;

  const deepcheckSection = document.getElementById('deepcheck-section');
  deepcheckSection.style.display = 'block';
  const deepcheckContent = document.getElementById('deepcheck-content');
  deepcheckContent.textContent = 'Loading threat intelligence...';

  const check = await chrome.runtime.sendMessage({
    type: 'DEEP_CHECK',
    url: window.location.href
  }).catch(() => ({}));

  deepcheckContent.innerHTML = '';

  if (check.otx) {
    const div = document.createElement('div');
    div.style.marginBottom = '12px';
    div.innerHTML = `
      <strong>AlienVault OTX:</strong><br>
      <small>Pulse count: ${check.otx.pulseCount || 0}</small><br>
      <small>Tags: ${(check.otx.tags || []).join(', ') || 'None'}</small>
    `;
    deepcheckContent.appendChild(div);
  }

  if (check.virustotal) {
    const div = document.createElement('div');
    div.style.marginBottom = '12px';
    div.innerHTML = `
      <strong>VirusTotal:</strong><br>
      <small>Flagged by: ${check.virustotal.positives || 0}/${check.virustotal.total || 0} engines</small><br>
      ${check.virustotal.permalink ? `<a href="${check.virustotal.permalink}" target="_blank" style="font-size: 12px;">View on VirusTotal</a>` : ''}
    `;
    deepcheckContent.appendChild(div);
  }

  if (!check.otx && !check.virustotal) {
    deepcheckContent.innerHTML = '<small style="color: #888;">No additional threat intelligence available. Configure API keys in the backend.</small>';
  }
});

// Settings
document.getElementById('save-settings').addEventListener('click', async () => {
  const widgetEnabled = document.getElementById('widget-toggle').checked;
  const focusModeEnabled = document.getElementById('focus-toggle').checked;
  const reducedMotion = document.getElementById('motion-toggle').checked;
  const readingLevel = document.getElementById('reading-level').value;
  const backendBaseUrl = document.getElementById('backend-url').value;

  await chrome.storage.local.set({
    widgetEnabled,
    focusModeEnabled,
    reducedMotion,
    readingLevel,
    backendBaseUrl
  });

  alert('Settings saved!');
});

// Load settings on init
async function loadSettings() {
  const stored = await chrome.storage.local.get(['widgetEnabled', 'focusModeEnabled', 'reducedMotion', 'readingLevel', 'backendBaseUrl']);
  document.getElementById('widget-toggle').checked = stored.widgetEnabled !== false;
  document.getElementById('focus-toggle').checked = stored.focusModeEnabled !== false;
  document.getElementById('motion-toggle').checked = stored.reducedMotion === true;
  document.getElementById('reading-level').value = stored.readingLevel || 'standard';
  document.getElementById('backend-url').value = stored.backendBaseUrl || 'http://localhost:3000';
}

loadSettings();
loadStatus();
