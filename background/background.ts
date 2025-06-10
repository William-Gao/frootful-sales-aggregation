// Background service worker for Frootful Gmail Extension

import { supabaseClient } from "../src/supabaseClient.js";

// import { hybridAuth } from '../src/hybridAuth.js';

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

interface GmailResponse {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  payload?: {
    headers?: Array<{
      name: string;
      value: string;
    }>;
    body?: {
      data?: string;
    };
    parts?: Array<{
      mimeType?: string;
      body?: {
        data?: string;
      };
      parts?: any[];
    }>;
  };
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
        // Get a fresh token before making the API request
        const token = await getAuthToken();
        const result = await extractEmail(message.emailId, token);
        port.postMessage({ action: 'extractEmail', ...result });
      }
      
      if (message.action === 'checkAuthState') {
        console.log('Hardcoding true for now in checkAuthState in background');
        // hybridAuth.isAuthenticated()
        const { data: { session }, error } = await supabaseClient.auth.getSession();
        console.log('This is the session extracted in background.ts: ', session);
        port.postMessage({ action: 'checkAuthState', isAuthenticated: true });
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

// Get auth token (with refresh if needed)
async function getAuthToken(): Promise<string | null> {
  console.log('Inside background worker getAuthToken(), this method may no longer be needed');
  return new Promise((resolve) => {
    chrome.identity.getAuthToken({ interactive: false }, (token) => {
      if (chrome.runtime.lastError) {
        console.error('Auth token error:', chrome.runtime.lastError);
        resolve(null);
        return;
      }
      resolve(token);
    });
  });
}

// Authentication functions
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

// Revoke authentication
async function revokeAuthentication(): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: false }, async (token) => {
      if (token) {
        try {
          // Revoke token with Google
          await fetch(`https://accounts.google.com/o/oauth2/revoke?token=${token}`);
          
          // Remove token from cache
          chrome.identity.removeCachedAuthToken({ token: token }, () => {
            // Notify all connected ports about authentication state
            ports.forEach(port => {
              port.postMessage({ 
                action: 'authStateChanged',
                isAuthenticated: false 
              });
            });
            resolve();
          });
        } catch (error) {
          reject(error);
        }
      } else {
        resolve(); // No token to revoke
      }
    });
  });
}

// Extract email content
async function extractEmail(emailId: string, token: string | null): Promise<{ success: boolean; data?: EmailData; error?: string }> {
  try {
    if (!token) {
      throw new Error('User not authenticated');
    }

    // Fetch email from Gmail API
    const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${emailId}?format=full`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch email: ${response.status}`);
    }
    
    const emailData: GmailResponse = await response.json();
    
    // Parse email data
    const parsedEmail = parseEmailData(emailData);
    
    return {
      success: true,
      data: parsedEmail
    };
  } catch (error) {
    console.error('Error extracting email:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

// Parse Gmail API response into a more usable format
function parseEmailData(emailData: GmailResponse): EmailData {
  const headers: Record<string, string> = {};
  
  // Extract headers
  if (emailData.payload && emailData.payload.headers) {
    emailData.payload.headers.forEach(header => {
      headers[header.name.toLowerCase()] = header.value;
    });
  }
  
  // Extract body content
  let body = '';
  
  function extractBodyParts(part: any): void {
    if (part.body && part.body.data) {
      // Decode base64 content
      const decodedData = atob(part.body.data.replace(/-/g, '+').replace(/_/g, '/'));
      body += decodedData;
    }
    
    if (part.parts) {
      part.parts.forEach((subPart: any) => {
        // Prefer HTML content
        if (subPart.mimeType === 'text/html') {
          extractBodyParts(subPart);
        }
      });
      
      // If no HTML found, use plain text
      if (!body) {
        part.parts.forEach((subPart: any) => {
          if (subPart.mimeType === 'text/plain') {
            extractBodyParts(subPart);
          }
        });
      }
    }
  }
  
  if (emailData.payload) {
    extractBodyParts(emailData.payload);
  }
  
  return {
    id: emailData.id,
    threadId: emailData.threadId,
    labelIds: emailData.labelIds || [],
    snippet: emailData.snippet || '',
    subject: headers.subject || '',
    from: headers.from || '',
    to: headers.to || '',
    date: headers.date || '',
    body: body
  };
}