import { Configuration, PublicClientApplication } from "@azure/msal-browser";

export const msalConfig: Configuration = {
  auth: {
    clientId: "YOUR_CLIENT_ID",
    authority: "https://login.microsoftonline.com/common",
    redirectUri: chrome.identity.getRedirectURL(),
  },
  cache: {
    cacheLocation: "localStorage",
    storeAuthStateInCookie: true
  }
};

export const loginRequest = {
  scopes: [
    "https://api.businesscentral.dynamics.com/user_impersonation",
    "offline_access"
  ]
};

export const msalInstance = new PublicClientApplication(msalConfig);