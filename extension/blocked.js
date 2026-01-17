// NeuroSafe Copilot - Blocked Page Script

(async function() {
  // Get URL parameters
  const params = new URLSearchParams(window.location.search);
  const blockedUrl = params.get('url');
  const verdict = params.get('verdict') || 'DANGEROUS';
  const score = params.get('score') || '0';

  // Display basic info
  document.getElementById('blocked-url').textContent = blockedUrl || 'Unknown URL';
  document.getElementById('verdict-badge').textContent = verdict;
  document.getElementById('score-info').textContent = `Safety Score: ${score}/100`;

  // Get full block data from storage
  let blockData = null;
  try {
    const stored = await chrome.storage.local.get(['currentBlockData']);
    blockData = stored.currentBlockData;
  } catch (err) {
    console.error('[Blocked] Error loading block data:', err);
  }

  // Display reasons
  const reasonsList = document.getElementById('reasons-list');
  reasonsList.innerHTML = '';
  
  if (blockData && blockData.reasons && blockData.reasons.length > 0) {
    blockData.reasons.forEach(reason => {
      const li = document.createElement('li');
      li.textContent = reason;
      reasonsList.appendChild(li);
    });
  } else {
    const li = document.createElement('li');
    li.textContent = 'This site was flagged as dangerous by our threat detection system.';
    reasonsList.appendChild(li);
  }

  // Check reduced motion preference
  const reducedMotion = await chrome.storage.local.get(['reducedMotion']);
  if (reducedMotion.reducedMotion) {
    document.body.classList.add('reduced-motion');
  }

  // Go Back button
  document.getElementById('go-back-btn').addEventListener('click', () => {
    // Try to go back in history
    if (window.history.length > 1) {
      window.history.back();
    } else {
      // Open a new safe tab
      chrome.tabs.getCurrent((tab) => {
        chrome.tabs.update(tab.id, { url: 'chrome://newtab' });
      });
    }
  });

  // Proceed Anyway button
  document.getElementById('proceed-btn').addEventListener('click', async () => {
    if (!blockedUrl) {
      alert('Cannot proceed: URL not available');
      return;
    }

    // Confirm with user
    const confirmed = confirm(
      '⚠️ WARNING ⚠️\n\n' +
      'You are about to visit a site that was flagged as dangerous.\n\n' +
      'This site may:\n' +
      '• Steal your passwords or personal information\n' +
      '• Install malware on your device\n' +
      '• Trick you into sending money\n\n' +
      'Do you want to continue?'
    );

    if (!confirmed) {
      return;
    }

    try {
      // Get current tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab) {
        alert('Error: Cannot access current tab');
        return;
      }

      // Create temporary allow rule (expires on tab close or 10 minutes)
      const allowRule = {
        url: blockedUrl,
        tabId: tab.id,
        expires: Date.now() + (10 * 60 * 1000), // 10 minutes
        timestamp: Date.now()
      };

      // Store allow rule
      await chrome.storage.local.set({ [`allow_${tab.id}`]: allowRule });

      // Send message to background to allow this tab
      await chrome.runtime.sendMessage({
        type: 'ALLOW_ONCE',
        url: blockedUrl,
        tabId: tab.id
      });

      // Redirect to original URL
      chrome.tabs.update(tab.id, { url: blockedUrl });

    } catch (err) {
      console.error('[Blocked] Error proceeding:', err);
      alert('Error: Could not proceed to site. Try closing this tab and opening the URL manually.');
    }
  });
})();
