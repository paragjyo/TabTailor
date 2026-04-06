document.addEventListener('DOMContentLoaded', () => {
  const staleList = document.getElementById('staleList');
  const refreshBtn = document.getElementById('refreshBtn');
  const settingsBtn = document.getElementById('settingsBtn');
  const backBtn = document.getElementById('backBtn');
  const triageView = document.getElementById('triageView');
  const settingsView = document.getElementById('settingsView');
  const selectAllCheckbox = document.getElementById('selectAll');
  const masterSnipBtn = document.getElementById('masterSnipBtn');
  
  const thresholdSelect = document.getElementById('thresholdSelect');
  const autoRefreshToggle = document.getElementById('autoRefreshToggle');

  let currentSettings = {
    threshold: 15,
    autoRefresh: true
  };

  function formatInactiveTime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    if (hours > 0) return `Inactive for ${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `Inactive for ${minutes}m`;
    return `Inactive for ${seconds}s`;
  }

  function init() {
    chrome.storage.local.get({ settings: currentSettings }, (data) => {
      if (data.settings.threshold > 10000) data.settings.threshold = 15;
      currentSettings = data.settings;
      thresholdSelect.value = currentSettings.threshold;
      autoRefreshToggle.checked = currentSettings.autoRefresh;
      if (currentSettings.autoRefresh) refreshTriageList();
    });
  }

  function refreshTriageList() {
    selectAllCheckbox.checked = false;
    updateBulkBar();

    const icon = refreshBtn.querySelector('svg');
    icon.classList.add('spinning');
    setTimeout(() => icon.classList.remove('spinning'), 600);

    chrome.tabs.query({ currentWindow: true }, (tabs) => {
      chrome.storage.local.get({ tabStats: {} }, (data) => {
        const stats = data.tabStats;
        const now = Date.now();
        const staleThresholdMs = currentSettings.threshold * 60000;

        const staleTabs = tabs.filter(tab => {
          if (tab.active) return false;
          if (!stats[tab.id]) return false;
          const inactiveMs = now - stats[tab.id].staleSince;
          return inactiveMs >= staleThresholdMs;
        });

        if (staleTabs.length === 0) {
          staleList.innerHTML = '<div class="empty-state">No threads meet the ' + currentSettings.threshold + 'm stale threshold...</div>';
          masterSnipBtn.style.display = 'none';
          return;
        }

        const groups = staleTabs.reduce((acc, tab) => {
          const inactiveMs = now - stats[tab.id].staleSince;
          const hours = inactiveMs / 3600000;
          if (hours >= 12) acc.critical.push(tab);
          else if (hours >= 1) acc.fraying.push(tab);
          else acc.loose.push(tab);
          return acc;
        }, { critical: [], fraying: [], loose: [] });

        staleList.innerHTML = '';
        renderGroup('Critical Snarls', groups.critical, 'priority-critical');
        renderGroup('Fraying Threads', groups.fraying, 'priority-fraying');
        renderGroup('Loose Ends', groups.loose, 'priority-loose');
      });
    });
  }

  function renderGroup(title, tabs, className) {
    if (tabs.length === 0) return;

    chrome.storage.local.get({ tabStats: {} }, (data) => {
      const stats = data.tabStats;
      const now = Date.now();
      tabs.sort((a, b) => stats[a.id].staleSince - stats[b.id].staleSince);

      const groupDiv = document.createElement('div');
      groupDiv.className = `priority-group ${className}`;
      
      let html = `
        <div class="group-header">
          <div style="display: flex; align-items: center; gap: 8px;">
            <input type="checkbox" class="stitch-checkbox group-checkbox">
            <span>${title}</span>
          </div>
          <span>${tabs.length} Tabs</span>
        </div>
      `;

      html += tabs.map(tab => {
        const inactiveMs = now - stats[tab.id].staleSince;
        const favicon = tab.favIconUrl || 'https://www.google.com/s2/favicons?domain=unknown';
        return `
          <div class="tab-thread" id="thread-${tab.id}">
            <input type="checkbox" class="stitch-checkbox row-checkbox" data-tab-id="${tab.id}">
            <div class="tab-info">
              <img src="${favicon}" class="tab-favicon" onerror="this.src='https://www.google.com/s2/favicons?domain=unknown'">
              <div class="tab-text">
                <span class="tab-title">${tab.title}</span>
                <span class="tab-time">${formatInactiveTime(inactiveMs)}</span>
              </div>
            </div>
            <div class="tab-actions">
              <button class="action-btn keep-btn" data-id="${tab.id}" title="Keep Thread">📌</button>
              <button class="action-btn snip-btn" data-id="${tab.id}" title="Snip Thread">✂️</button>
            </div>
          </div>
        `;
      }).join('');

      groupDiv.innerHTML = html;
      staleList.appendChild(groupDiv);
      attachActionListeners();
    });
  }

  function updateBulkBar() {
    const selected = document.querySelectorAll('.row-checkbox:checked');
    if (selected.length > 0) {
      masterSnipBtn.style.display = 'block';
      masterSnipBtn.innerText = `✂️ Snip Selected (${selected.length})`;
    } else {
      masterSnipBtn.style.display = 'none';
    }
  }

  function syncGlobalCheckbox() {
    const allRows = document.querySelectorAll('.row-checkbox');
    const allChecked = document.querySelectorAll('.row-checkbox:checked');
    selectAllCheckbox.checked = allRows.length > 0 && allRows.length === allChecked.length;
  }

  function attachActionListeners() {
    // 1. Group-Level Checkboxes
    document.querySelectorAll('.group-checkbox').forEach(gc => {
      gc.onchange = (e) => {
        const isChecked = e.target.checked;
        const group = e.target.closest('.priority-group');
        group.querySelectorAll('.row-checkbox').forEach(rc => rc.checked = isChecked);
        updateBulkBar();
        syncGlobalCheckbox();
      };
    });

    // 2. Individual Row Checkboxes
    document.querySelectorAll('.row-checkbox').forEach(rc => {
      rc.onchange = (e) => {
        const group = e.target.closest('.priority-group');
        const groupCheckbox = group.querySelector('.group-checkbox');
        const groupRows = group.querySelectorAll('.row-checkbox');
        const groupChecked = group.querySelectorAll('.row-checkbox:checked');
        
        // Sync Group Checkbox
        groupCheckbox.checked = groupRows.length === groupChecked.length;
        
        updateBulkBar();
        syncGlobalCheckbox();
      };
    });

    // 3. Individual Snip
    document.querySelectorAll('.snip-btn').forEach(btn => {
      btn.onclick = (e) => {
        const tabId = parseInt(e.target.closest('button').dataset.id, 10);
        chrome.tabs.remove(tabId, () => refreshTriageList());
      };
    });

    // 4. Individual Keep
    document.querySelectorAll('.keep-btn').forEach(btn => {
      btn.onclick = (e) => {
        const tabId = parseInt(e.target.closest('button').dataset.id, 10);
        chrome.storage.local.get({ tabStats: {} }, (data) => {
          const stats = data.tabStats;
          delete stats[tabId];
          chrome.storage.local.set({ tabStats: stats }, refreshTriageList);
        });
      };
    });
  }

  // Global Select All
  selectAllCheckbox.onchange = (e) => {
    const isChecked = e.target.checked;
    document.querySelectorAll('.group-checkbox, .row-checkbox').forEach(cb => cb.checked = isChecked);
    updateBulkBar();
  };

  masterSnipBtn.onclick = () => {
    const selected = document.querySelectorAll('.row-checkbox:checked');
    const ids = Array.from(selected).map(cb => parseInt(cb.dataset.tabId, 10));
    if (ids.length > 0) chrome.tabs.remove(ids, () => refreshTriageList());
  };

  // Navigation & Settings
  refreshBtn.onclick = refreshTriageList;
  settingsBtn.onclick = () => { triageView.classList.add('hidden'); settingsView.classList.remove('hidden'); };
  backBtn.onclick = () => { settingsView.classList.add('hidden'); triageView.classList.remove('hidden'); refreshTriageList(); };
  thresholdSelect.onchange = (e) => { currentSettings.threshold = parseInt(e.target.value, 10); chrome.storage.local.set({ settings: currentSettings }); };
  autoRefreshToggle.onchange = (e) => { currentSettings.autoRefresh = e.target.checked; chrome.storage.local.set({ settings: currentSettings }); };

  init();
});
