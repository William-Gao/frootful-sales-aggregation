// Content script relay for authentication callback
// This script runs on localhost pages to relay auth messages to the extension

// contentRelay.js

console.log('Frootful content relay script loaded');

// Listen for auth success messages from the SPA
window.addEventListener('message', (event) => {
  console.log('Content relay received message:', event.data);
  
  if (event.data.source === "frootful-auth") {
    if (event.data.type === "SUPABASE_AUTH_SUCCESS") {
      console.log('✅ Auth success detected, forwarding to background script');
      
      // Forward the session data to the background script
      chrome.runtime.sendMessage({
        source: "frootful-auth",
        type: "SUPABASE_AUTH_SUCCESS",
        session: event.data.session
      });
    } else if (event.data.type === "SUPABASE_SIGN_OUT") {
      console.log('🚪 Sign out detected, forwarding to background script');
      
      // Forward the sign out message to the background script
      chrome.runtime.sendMessage({
        source: "frootful-auth",
        type: "SUPABASE_SIGN_OUT"
      });
    }
  }
});

// Listen for logout messages from extension
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Content relay received runtime message:', message);
  
  if (message.type === 'FROOTFUL_LOGOUT' && message.source === 'extension') {
    console.log('🚪 Extension logout detected, processing immediate logout...');
    
    // Force immediate redirect to login if not already there
    if (window.location.pathname !== '/login') {
      console.log('🔄 Force redirecting to login page due to extension logout');
      // Use replace to prevent back button issues
      window.location.replace('/login');
    }
    
    sendResponse({ success: true });
  }
  
  // Keep existing sign out handling for backward compatibility
  if (message.action === 'signOut') {
    console.log('🚪 Sign out action received via runtime message');
    
    // Post message to notify any listening components
    window.postMessage({
      source: "frootful-auth",
      type: "SUPABASE_SIGN_OUT"
    }, "*");
    
    sendResponse({ success: true });
  }
});

console.log('Frootful content relay script ready');