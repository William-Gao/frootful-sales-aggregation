# Frootful Google Workspace Add-on

A Google Workspace Add-on that integrates with Gmail mobile to extract order information from emails and create orders in Business Central ERP.

## Development Setup

This project uses **clasp** (Command Line Apps Script Projects) with TypeScript for modern development workflow.

### Prerequisites

1. **Node.js** (v16 or higher)
2. **Google Apps Script API** enabled in your Google Cloud Console
3. **clasp** CLI tool

### Initial Setup

1. **Install dependencies:**
   ```bash
   cd workspace-addon
   npm install
   ```

2. **Login to clasp:**
   ```bash
   npm run setup
   ```
   This will:
   - Login to your Google account
   - Create a new Apps Script project
   - Generate `.clasp.json` with your script ID

3. **Update configuration:**
   - Copy your script ID from `.clasp.json`
   - Update `SUPABASE_URL` and `SUPABASE_ANON_KEY` in `src/Code.ts`

### Development Workflow

#### 🔨 **Build & Deploy**
```bash
# Build TypeScript to JavaScript
npm run build

# Deploy to Apps Script
npm run deploy

# Build and deploy in one command
npm run deploy
```

#### 🔄 **Watch Mode Development**
```bash
# Watch TypeScript files and auto-compile
npm run watch

# Build and deploy with watch mode
npm run deploy:watch
```

#### 📝 **Other Commands**
```bash
# View Apps Script logs
npm run logs

# Open project in Apps Script editor
npm run open

# Pull latest from Apps Script
npm run pull

# Create production deployment
npm run deploy:prod
```

### Project Structure

```
workspace-addon/
├── src/
│   └── Code.ts              # Main TypeScript source
├── dist/                    # Compiled JavaScript (auto-generated)
├── appsscript.json         # Apps Script manifest
├── .clasp.json             # Clasp configuration (auto-generated)
├── tsconfig.json           # TypeScript configuration
└── package.json            # Node.js dependencies
```

### Features

- 📱 **Mobile-First Design**: Optimized for Gmail mobile app
- 🔍 **AI-Powered Analysis**: Extracts order details from email content
- 👤 **Customer Matching**: Automatically matches senders to ERP customers
- 📦 **Item Recognition**: Identifies products and quantities
- 🚀 **One-Click Orders**: Creates ERP orders directly from Gmail
- 📅 **Delivery Date Detection**: Extracts requested delivery dates

### TypeScript Benefits

- **Type Safety**: Catch errors at compile time
- **IntelliSense**: Better IDE support with autocomplete
- **Modern JavaScript**: Use latest ES features
- **Refactoring**: Safe code refactoring with type checking

### Testing

1. **Build and deploy:**
   ```bash
   npm run deploy
   ```

2. **Test in Apps Script:**
   - Run `npm run open` to open the project
   - Use the Apps Script debugger

3. **Test in Gmail:**
   - Deploy as add-on in Apps Script
   - Install in your Gmail account
   - Test with real emails

### Deployment

#### Development Testing
```bash
npm run deploy
```

#### Production Release
```bash
npm run deploy:prod
```

### Troubleshooting

**Build Errors:**
- Check TypeScript compilation: `npm run compile`
- Verify types: `@types/google-apps-script` is installed

**Deployment Issues:**
- Ensure you're logged in: `clasp login`
- Check script ID in `.clasp.json`
- Verify permissions in Apps Script

**Runtime Errors:**
- Check logs: `npm run logs`
- Test functions individually in Apps Script editor

### Configuration

Update these values in `src/Code.ts`:

```typescript
const SUPABASE_URL = 'your-supabase-url';
const SUPABASE_ANON_KEY = 'your-supabase-anon-key';
```

## Support

For issues or questions:
1. Check the TypeScript compilation output
2. Verify Apps Script execution logs: `npm run logs`
3. Test individual functions in Apps Script editor