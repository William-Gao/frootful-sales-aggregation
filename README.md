# Frootful Gmail Extractor

A Chrome extension that allows users to extract and analyze email content from Gmail.

## Features

- Google Sign-In integration for Gmail access
- "Extract" button injected into the Gmail interface
- Email content extraction using Gmail API
- Side panel UI for displaying extracted email content

## Installation Instructions

1. Download or clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top-right corner
4. Click "Load unpacked" and select the extension directory
5. The Frootful extension should now be installed and visible in your extensions list

## Developer Setup

### Prerequisites

- Google Cloud Platform account
- Gmail API enabled in your Google Cloud project
- OAuth 2.0 Client ID configured for Chrome Extension

### Configuration

1. Create a new project in the [Google Cloud Console](https://console.cloud.google.com/)
2. Enable the Gmail API for your project
3. Configure the OAuth consent screen
4. Create an OAuth 2.0 Client ID for a Chrome Extension
   - Use your extension's ID as the Application ID
5. Replace `YOUR_CLIENT_ID.apps.googleusercontent.com` in the `manifest.json` file with your actual Client ID

## Usage

1. Click the Frootful extension icon in your browser toolbar
2. Sign in with your Google account
3. Navigate to Gmail and open an email
4. Click the "Extract" button in the email toolbar
5. View the extracted email content in the side panel

## License

MIT