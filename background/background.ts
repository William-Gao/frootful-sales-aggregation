// Background service worker for Frootful Gmail Extension

import { supabaseClient } from "../src/supabaseClient.js";

// Types
interface Port {
  name: string;
  onDisconnect: {
    addListener: (callback: () => void) => void;
  };
  onMessage: {
    addListener: (callback: (message: any) => void) => void;
  };
  postMessage: (message: any) => void;
}

interface EmailData {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  body: string;
}

interface Customer {
  id: string;
  number: string;
  displayName: string;
  email: string;
}

interface Item {
  id: string;
  number: string;
  displayName: string;
  unitPrice: number;
}

interface AnalyzedItem {
  itemName: string;
  quantity: number;
  matchedItem?: {
    id: string;
    number: string;
    displayName: string;
    unitPrice: number;
  };
}

interface ComprehensiveAnalysisResult {
  success: boolean;
  data?: {
    email: EmailData;
    customers: Customer[];
    items: Item[];
    matchingCustomer?: Customer;
    analyzedItems: AnalyzedItem[];
  };
  error?: string;
}

// Keep track of active ports
const ports: Set<Port> = new Set();

// Handle installation
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // Open popup to prompt for sign-in instead of onboarding page
    chrome.action.openPopup();
  }
});

// Handle authentication and sign-out messages
chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  console.log('Background script received message:', message);
  
  if (message?.source === "frootful-auth") {
    if (message?.type === "SUPABASE_AUTH_SUCCESS") {
      console.log("✅ Received session from callback:", message.session);

      // Store session in chrome.storage for extension access
      chrome.storage.local.set({ session: message.session }, () => {
        console.log("🔐 Session saved to chrome.storage");
      });
      
      // Notify all connected ports about authentication state
      ports.forEach(port => {
        port.postMessage({ 
          action: 'authStateChanged',
          isAuthenticated: true 
        });
      });
    } else if (message?.type === "SUPABASE_SIGN_OUT") {
      console.log("🚪 Received sign out from SPA");
      
      // Clear chrome.storage session data
      chrome.storage.local.remove([
        'session', 
        'bc_tokens' // Also clear Business Central tokens on sign out
      ], () => {
        console.log("🧹 Cleared session data from chrome.storage");
      });
      
      // Sign out from Supabase
      supabaseClient.auth.signOut().then(() => {
        console.log("🚪 Signed out from Supabase");
      }).catch((error) => {
        console.warn("Error signing out from Supabase:", error);
      });
      
      // Notify all connected ports about authentication state
      ports.forEach(port => {
        port.postMessage({ 
          action: 'authStateChanged',
          isAuthenticated: false 
        });
      });
    }
  }
  
  // Handle direct sign out action from extension
  if (message?.action === 'signOut') {
    console.log("🚪 Received direct sign out action from extension");
    
    // Clear chrome.storage session data
    chrome.storage.local.remove([
      'session', 
      'bc_tokens' // Also clear Business Central tokens on sign out
    ], () => {
      console.log("🧹 Cleared session data from chrome.storage");
    });
    
    // Sign out from Supabase
    const { error } = await supabaseClient.auth.signOut()
    
    if (error) {
      console.warn("Error signing out from Supabase:", error);
    } else {
      console.log("🚪 Signed out from Supabase");
    }
    
    // Notify all connected ports about authentication state
    ports.forEach(port => {
      port.postMessage({ 
        action: 'authStateChanged',
        isAuthenticated: false 
      });
    });

    // Notify all SPA tabs about the logout
    await notifyAllSPATabs();
    
    sendResponse({ success: true });
  }
});

// Function to notify all SPA tabs about logout
async function notifyAllSPATabs(): Promise<void> {
  try {
    console.log("🔄 Notifying all SPA tabs about logout...");
    
    // Query all tabs
    const tabs = await chrome.tabs.query({});
    
    for (const tab of tabs) {
      // Check if the tab URL matches your SPA domains
      if (tab.url && tab.id && (
        tab.url.startsWith("https://frootful.ai") ||
        tab.url.startsWith("http://localhost") ||
        tab.url.startsWith("https://localhost")
      )) {
        try {
          console.log(`📤 Sending logout message to tab: ${tab.url}`);
          
          // Send message to the tab's content script
          await chrome.tabs.sendMessage(tab.id, {
            type: 'FROOTFUL_LOGOUT',
            source: 'extension'
          });
          
          console.log(`✅ Successfully notified tab: ${tab.url}`);
        } catch (tabError) {
          // Tab might not have content script or be accessible
          console.warn(`⚠️ Could not notify tab ${tab.url}:`, tabError);
        }
      }
    }
    
    console.log("🎉 Finished notifying all SPA tabs");
  } catch (error) {
    console.error("❌ Error notifying SPA tabs:", error);
  }
}

// Handle connection from content scripts and popup
chrome.runtime.onConnect.addListener((port: Port) => {
  ports.add(port);
  
  port.onDisconnect.addListener(() => {
    ports.delete(port);
  });
  
  port.onMessage.addListener(async (message: { action: string; emailId?: string }) => {
    try {
      if (message.action === 'authenticate') {
        const token = await authenticate();
        port.postMessage({ action: 'authenticate', success: true, token });
      }
      
      if (message.action === 'revokeAuthentication') {
        await revokeAuthentication();
        port.postMessage({ action: 'revokeAuthentication', success: true });
      }
      
      if (message.action === 'extractEmail' && message.emailId) {
        // Use comprehensive analyze-email endpoint instead of separate extraction
        const result = await comprehensiveEmailAnalysis(message.emailId);
        port.postMessage({ action: 'extractEmail', ...result });
      }
      
      if (message.action === 'checkAuthState') {
        console.log('Checking auth state via Supabase session');
        const { data: { session }, error } = await supabaseClient.auth.getSession();
        console.log('Supabase session in background.ts:', session ? 'Found' : 'Not found');
        const isAuthenticated = session !== null && !error;

        port.postMessage({ action: 'checkAuthState', isAuthenticated });
      }

      if (message.action === 'authComplete') {
        console.log('Huzzah! The background.ts got this message!');
      }
    } catch (error) {
      console.error('Error in message handler:', error);
      port.postMessage({ 
        action: message.action,
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
});

// Get auth token from Supabase session
async function getAuthToken(): Promise<string | null> {
  try {
    const { data: { session }, error } = await supabaseClient.auth.getSession();
    
    if (error || !session) {
      console.error('No valid Supabase session found');
      return null;
    }
    
    // Return the access token for API calls
    return session.access_token;
  } catch (error) {
    console.error('Error getting auth token:', error);
    return null;
  }
}

// Authentication functions - keep existing Chrome Identity for initial auth
async function authenticate(): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: true }, (token) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }
      
      if (token) {
        // Notify all connected ports about authentication state
        ports.forEach(port => {
          port.postMessage({ 
            action: 'authStateChanged',
            isAuthenticated: true 
          });
        });
        resolve(token);
      } else {
        reject(new Error('Failed to get auth token'));
      }
    });
  });
}

// Revoke authentication - Enhanced to clear all session data AND notify SPA tabs
async function revokeAuthentication(): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: false }, async (token) => {
      if (token) {
        try {
          // Revoke token with Google
          await fetch(`https://accounts.google.com/o/oauth2/revoke?token=${token}`);
          
          // Remove token from cache
          chrome.identity.removeCachedAuthToken({ token: token }, async () => {
            // Sign out from Supabase
            await supabaseClient.auth.signOut();
            
            // Clear chrome.storage session data
            chrome.storage.local.remove([
              'session', 
              'bc_tokens' // Also clear Business Central tokens
            ], () => {
              console.log("🧹 Cleared session data during revoke");
            });
            
            // Notify all connected ports about authentication state
            ports.forEach(port => {
              port.postMessage({ 
                action: 'authStateChanged',
                isAuthenticated: false 
              });
            });

            // Notify all SPA tabs about the logout
            await notifyAllSPATabs();
            
            resolve();
          });
        } catch (error) {
          reject(error);
        }
      } else {
        // Still clear local data even if no token to revoke
        await supabaseClient.auth.signOut();
        chrome.storage.local.remove([
          'session', 
          'bc_tokens'
        ], () => {
          console.log("🧹 Cleared session data (no token to revoke)");
        });
        
        // Notify all connected ports about authentication state
        ports.forEach(port => {
          port.postMessage({ 
            action: 'authStateChanged',
            isAuthenticated: false 
          });
        });

        // Notify all SPA tabs about the logout
        await notifyAllSPATabs();
        
        resolve();
      }
    });
  });
}

// Comprehensive email analysis using the new endpoint
async function comprehensiveEmailAnalysis(emailId: string): Promise<{ success: boolean; data?: ComprehensiveAnalysisResult['data']; error?: string }> {
  try {
    const authToken = await getAuthToken();
    if (!authToken) {
      throw new Error('User not authenticated');
    }

    console.log('Calling comprehensive analyze-email endpoint for email:', emailId);

    // Call the comprehensive analyze-email edge function
    console.log('Calling supabase for comprehensive analysis');
    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-email`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ emailId })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Comprehensive analysis error response:', errorText);
      throw new Error(`Analysis failed: ${response.status} ${response.statusText}`);
    }
    const response_text = await response.json();
    console.log('This is the result from supabase call: ', response_text);
    const result: ComprehensiveAnalysisResult = response_text;
    
    if (!result.success) {
      throw new Error(result.error || 'Analysis returned error');
    }
    
    console.log('Comprehensive analysis successful:', {
      email: result.data?.email?.subject || 'Unknown',
      customers: result.data?.customers?.length || 0,
      items: result.data?.items?.length || 0,
      analyzedItems: result.data?.analyzedItems?.length || 0,
      matchingCustomer: result.data?.matchingCustomer?.displayName || 'None'
    });
    
    return {
      success: true,
      data: result.data
    };
  } catch (error) {
    console.error('Error in comprehensive email analysis:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}