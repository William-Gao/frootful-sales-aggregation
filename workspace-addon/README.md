# Frootful Google Workspace Add-on

A Google Workspace Add-on that integrates with Gmail mobile to extract order information from emails and create orders in Business Central ERP.

## Features

- 📱 **Mobile-First Design**: Optimized for Gmail mobile app
- 🔍 **AI-Powered Analysis**: Extracts order details from email content
- 👤 **Customer Matching**: Automatically matches senders to ERP customers
- 📦 **Item Recognition**: Identifies products and quantities
- 🚀 **One-Click Orders**: Creates ERP orders directly from Gmail
- 📅 **Delivery Date Detection**: Extracts requested delivery dates

## Setup Instructions

### 1. Create Google Apps Script Project

1. Go to [Google Apps Script](https://script.google.com)
2. Click "New Project"
3. Replace the default code with the contents of `src/Code.js`
4. Copy the contents of `appsscript.json` to your project's manifest

### 2. Configure Project Settings

1. In Apps Script, go to **Project Settings**
2. Check "Show 'appsscript.json' manifest file in editor"
3. Replace the manifest with our `appsscript.json`

### 3. Enable Advanced Services

1. In Apps Script, go to **Services** (+ icon)
2. Add **Gmail API** (v1)

### 4. Deploy as Add-on

1. In Apps Script, click **Deploy** > **New Deployment**
2. Choose type: **Add-on**
3. Fill in the deployment details:
   - **Description**: Frootful Gmail Integration
   - **Version**: New version
4. Click **Deploy**

### 5. Install in Gmail

1. Go to [Google Workspace Marketplace](https://workspace.google.com/marketplace)
2. Search for your add-on (if published) or use the deployment URL
3. Install the add-on

### 6. Test in Gmail Mobile

1. Open Gmail mobile app
2. Open an email with order information
3. Look for the Frootful add-on panel
4. Click "Extract Order Details"

## Configuration

### Environment Variables

Update these values in `src/Code.js`:

```javascript
const SUPABASE_URL = 'your-supabase-url';
const SUPABASE_ANON_KEY = 'your-supabase-anon-key';
```

### Business Central Integration

The add-on uses the same Supabase edge functions as the Chrome extension for:
- Email analysis
- Customer and item data
- Order creation

## File Structure

```
workspace-addon/
├── appsscript.json          # Apps Script manifest
├── src/
│   └── Code.js             # Main add-on code
├── README.md               # This file
└── deploy.md               # Deployment guide
```

## Mobile Interface

The add-on provides a clean, mobile-optimized interface with:

- **Main Card**: Shows extract button when email is open
- **Results Card**: Displays analyzed order information
- **Success Card**: Confirms order creation
- **Error Handling**: User-friendly error messages

## Permissions

The add-on requires these OAuth scopes:
- `gmail.readonly` - Read email content
- `gmail.addons.current.message.readonly` - Access current message
- `script.external_request` - Call external APIs

## Testing

### Local Testing

1. Use the Apps Script editor's debugger
2. Test individual functions with sample data
3. Check logs in **Executions** tab

### Gmail Testing

1. Install the add-on in your Gmail
2. Open emails with order information
3. Test the extraction and order creation flow

## Deployment

See `deploy.md` for detailed deployment instructions including:
- Publishing to Google Workspace Marketplace
- Organization-wide deployment
- Testing and approval process

## Support

For issues or questions:
1. Check the Apps Script execution logs
2. Verify Supabase edge function connectivity
3. Ensure Business Central integration is configured