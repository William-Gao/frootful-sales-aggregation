import { Configuration, PublicClientApplication } from "@azure/msal-browser";

export const msalConfig: Configuration = {
  auth: {
    clientId: "YOUR_CLIENT_ID",
    authority: "https://login.microsoftonline.com/common",
    redirectUri: chrome.identity.getRedirectURL(),
    navigateToLoginRequestUrl: true
  },
  cache: {
    cacheLocation: "sessionStorage", // Changed to sessionStorage
    storeAuthStateInCookie: false // Disabled cookie storage
  },
  system: {
    allowNativeBroker: false, // Disable native broker
    windowHashTimeout: 60000,
    iframeHashTimeout: 6000,
    loadFrameTimeout: 0,
  }
};

export const loginRequest = {
  scopes: [
    "https://api.businesscentral.dynamics.com/user_impersonation",
    "offline_access"
  ]
};

export const msalInstance = new PublicClientApplication(msalConfig);