// ScamDefender Service Worker
// Handles background tasks and event listeners for the extension

// Install event listener
chrome.runtime.onInstalled.addListener(() => {
  console.log("ScamDefender service worker installed");
});

// Tab update event listener
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    console.log("Tab updated:", tab.url);
  }
});
