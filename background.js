/**
 * TabThread: The Chronometer (Service Worker)
 * Tracking Tab Inactivity for Triage
 */

let lastActiveTabId = null;

/**
 * Initialization Sweep: Assign timestamps to all existing tabs
 */
function performInitialSweep() {
  chrome.tabs.query({}, (tabs) => {
    chrome.storage.local.get({ tabStats: {} }, (data) => {
      const stats = data.tabStats;
      const now = Date.now();
      
      tabs.forEach(tab => {
        // Only assign if it doesn't already have one and is NOT active
        if (!stats[tab.id] && !tab.active) {
          stats[tab.id] = { staleSince: now };
        }
      });
      
      chrome.storage.local.set({ tabStats: stats }, () => {
        console.log('[TabThread] Initial sweep complete. Timestamps assigned.');
      });
    });
  });
}

// 1. Initial State & Event Listeners
chrome.tabs.onActivated.addListener(activeInfo => {
  const now = Date.now();
  const newActiveTabId = activeInfo.tabId;

  if (lastActiveTabId !== null) {
    chrome.storage.local.get({ tabStats: {} }, (data) => {
      const stats = data.tabStats;
      stats[lastActiveTabId] = { staleSince: now };
      chrome.storage.local.set({ tabStats: stats });
    });
  }

  chrome.storage.local.get({ tabStats: {} }, (data) => {
    const stats = data.tabStats;
    delete stats[newActiveTabId];
    chrome.storage.local.set({ tabStats: stats });
  });

  lastActiveTabId = newActiveTabId;
});

chrome.tabs.onRemoved.addListener(tabId => {
  chrome.storage.local.get({ tabStats: {} }, (data) => {
    const stats = data.tabStats;
    delete stats[tabId];
    chrome.storage.local.set({ tabStats: stats });
  });
});

// Run sweep on install or update
chrome.runtime.onInstalled.addListener(() => {
  performInitialSweep();
});

// Run sweep on startup
chrome.runtime.onStartup.addListener(() => {
  performInitialSweep();
});

chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
  if (tabs[0]) lastActiveTabId = tabs[0].id;
});
