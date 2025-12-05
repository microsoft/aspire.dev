// OS Tab Detector
// This script detects the operating system and sets the default tab for terminal commands
// It should run early to avoid flash of incorrect content
(function() {
  // Check if localStorage is available
  if (typeof localStorage === 'undefined') return;
  
  // Only set the default if the user hasn't already made a choice
  const storageKey = 'starlight-synced-tabs__terminal';
  const existingPreference = localStorage.getItem(storageKey);
  
  // If user already has a preference, respect it
  if (existingPreference) return;
  
  // Detect OS - check platform first as it's more reliable, then fall back to userAgent
  const platform = navigator.platform || '';
  const userAgent = navigator.userAgent || '';
  
  // Check for Windows in platform or userAgent
  const isWindows = /^Win/i.test(platform) || 
                   /Win(dows|32|64)/i.test(userAgent);
  
  // Set default tab based on OS
  // Windows users get PowerShell, everyone else gets Bash
  const defaultTab = isWindows ? 'PowerShell' : 'Bash';
  
  localStorage.setItem(storageKey, defaultTab);
})();
