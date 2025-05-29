import { Configuration, PublicClientApplication } from "@azure/msal-browser";

export const msalConfig: Configuration = {
  auth: {
    clientId: "4c92a998-6af5-4c2a-b16e-80ba1c6b9b3b",
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