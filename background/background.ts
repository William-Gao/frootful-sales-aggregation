// Background service worker for Frootful Gmail Extension

import { hybridAuth } from "../src/hybridAuth.js";

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
    requestedDeliveryDate?: string;
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

// Handle connection from content scripts and popup
chrome.runtime.onConnect.addListener((port: Port) => {
  ports.add(port);
  
  port.onDisconnect.addListener(() => {
    ports.delete(port);
  });
  
  port.onMessage.addListener(async (message: { action: string; emailId?: string }) => {
    try {
      if (message.action === 'authenticate') {
        console.log('Background: Handling authenticate request');
        const session = await hybridAuth.signInWithChromeIdentity();
        port.postMessage({ action: 'authenticate', success: true, session });
      }
      
      if (message.action === 'revokeAuthentication') {
        console.log('Background: Handling revokeAuthentication request');
        await hybridAuth.signOut();
        port.postMessage({ action: 'revokeAuthentication', success: true });
      }
      
      if (message.action === 'extractEmail' && message.emailId) {
        console.log('Background: Handling extractEmail request for:', message.emailId);
        const result = await comprehensiveEmailAnalysis(message.emailId);
        port.postMessage({ action: 'extractEmail', ...result });
      }
      
      if (message.action === 'checkAuthState') {
        console.log('Background: Checking auth state via HybridAuthManager');
        const isAuthenticated = await hybridAuth.isAuthenticated();
        console.log('Background: Authentication status:', isAuthenticated);
        port.postMessage({ action: 'checkAuthState', isAuthenticated });
      }
    } catch (error) {
      console.error('Error in background message handler:', error);
      port.postMessage({ 
        action: message.action,
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
});

// Comprehensive email analysis using the analyze-email endpoint
async function comprehensiveEmailAnalysis(emailId: string): Promise<{ success: boolean; data?: ComprehensiveAnalysisResult['data']; error?: string }> {
  try {
    const authToken = await hybridAuth.getAccessToken();
    if (!authToken) {
      throw new Error('User not authenticated');
    }

    console.log('Background: Calling comprehensive analyze-email endpoint for email:', emailId);

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
      console.error('Background: Comprehensive analysis error response:', errorText);
      throw new Error(`Analysis failed: ${response.status} ${response.statusText}`);
    }
    
    const result: ComprehensiveAnalysisResult = await response.json();
    
    if (!result.success) {
      throw new Error(result.error || 'Analysis returned error');
    }
    
    console.log('Background: Comprehensive analysis successful:', {
      email: result.data?.email?.subject || 'Unknown',
      customers: result.data?.customers?.length || 0,
      items: result.data?.items?.length || 0,
      analyzedItems: result.data?.analyzedItems?.length || 0,
      matchingCustomer: result.data?.matchingCustomer?.displayName || 'None',
      requestedDeliveryDate: result.data?.requestedDeliveryDate || 'None'
    });
    
    return {
      success: true,
      data: result.data
    };
  } catch (error) {
    console.error('Background: Error in comprehensive email analysis:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}