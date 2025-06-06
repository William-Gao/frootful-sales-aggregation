# Frootful Gmail Extractor

A Chrome extension that allows users to extract and analyze email content from Gmail and integrate with Business Central ERP systems.

## Features

- Google Sign-In integration for Gmail access
- "Extract" button injected into the Gmail interface
- Email content extraction using Gmail API
- Side panel UI for displaying extracted email content
- Business Central integration for creating sales orders
- AI-powered email content analysis and item matching

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
- Microsoft Azure account for Business Central integration
- Supabase account for AI analysis functionality

### Configuration

#### Google Cloud Setup
1. Create a new project in the [Google Cloud Console](https://console.cloud.google.com/)
2. Enable the Gmail API for your project
3. Configure the OAuth consent screen
4. Create an OAuth 2.0 Client ID for a Chrome Extension
   - Use your extension's ID as the Application ID
5. Replace the client ID in the `manifest.json` file with your actual Client ID

#### Business Central Setup
1. Register an application in Azure Active Directory
2. Configure API permissions for Business Central
3. Update the client ID in `src/businessCentralAuth.ts`
4. Configure your Business Central environment URLs

#### Supabase Setup
1. Create a Supabase project
2. Set up the edge functions for email analysis
3. Configure environment variables in your `.env` file

### Building

Run the build command to prepare the extension for distribution:

```bash
npm run build
```

This will create a `dist` folder with all the necessary files for the Chrome extension.

## Usage

1. Click the Frootful extension icon in your browser toolbar
2. Sign in with your Google account
3. Connect to Business Central (optional)
4. Navigate to Gmail and open an email
5. Click the "Extract" button in the email toolbar
6. Review and edit the extracted content in the side panel
7. Export to Business Central ERP system

## Technical Architecture

- **Content Scripts**: Inject functionality into Gmail interface
- **Background Service Worker**: Handles API authentication and requests
- **Popup Interface**: User authentication and settings management
- **Sidebar**: Email content extraction and ERP integration
- **Edge Functions**: AI-powered email analysis using OpenAI
- **Business Central API**: Direct integration with Microsoft Dynamics 365

## Support

For technical support and feature requests, please contact the development team.