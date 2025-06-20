# Deployment Guide for Frootful Workspace Add-on

## Quick Start for Testing

### 1. Create Apps Script Project

1. Go to [script.google.com](https://script.google.com)
2. Click **"New Project"**
3. Name it "Frootful Gmail Add-on"

### 2. Setup Project Files

1. **Replace Code.gs content** with `src/Code.js`
2. **Add manifest**: 
   - Click the settings gear ⚙️
   - Check "Show 'appsscript.json' manifest file in editor"
   - Replace `appsscript.json` content with our version

### 3. Enable Gmail API

1. In Apps Script, click **Services** (+ icon in left sidebar)
2. Search for "Gmail API"
3. Select **Gmail API v1**
4. Click **Add**

### 4. Test Deployment

1. Click **Deploy** > **Test deployments**
2. Choose **Add-on**
3. Click **Install add-on**
4. Grant permissions when prompted

### 5. Test in Gmail

1. Open [Gmail](https://mail.google.com)
2. Open any email
3. Look for **Frootful** in the right sidebar
4. Click to test the interface

## Mobile Testing

### Gmail Mobile App

1. **Install the add-on** (from desktop steps above)
2. **Open Gmail mobile app**
3. **Open an email** with order information
4. **Swipe left** or tap the add-on icon
5. **Look for Frootful** in the add-ons panel

### Expected Mobile Interface

- **Main Panel**: Shows "Extract Order Details" button
- **Results Panel**: Displays found customers and items
- **Action Panel**: "Create ERP Order" button
- **Success Panel**: Order confirmation

## Production Deployment

### 1. Prepare for Marketplace

```javascript
// Update configuration in Code.js
const SUPABASE_URL = 'https://zkglvdfppodwlgzhfgqs.supabase.co';
const SUPABASE_ANON_KEY = 'your-production-key';
```

### 2. Create Deployment

1. **Deploy** > **New deployment**
2. **Type**: Add-on
3. **Description**: Production version
4. **Execute as**: Me
5. **Who has access**: Anyone

### 3. Marketplace Submission

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. **APIs & Services** > **OAuth consent screen**
3. Configure app information
4. Submit for verification

### 4. Organization Deployment

For internal use only:

1. **Google Admin Console**
2. **Apps** > **Google Workspace Marketplace apps**
3. **Add app** > **Add from private marketplace**
4. Enter your deployment URL

## Testing Checklist

### ✅ Basic Functionality

- [ ] Add-on loads in Gmail desktop
- [ ] Add-on loads in Gmail mobile
- [ ] Extract button appears
- [ ] Email analysis works
- [ ] Results display correctly

### ✅ Integration Testing

- [ ] Supabase connection works
- [ ] Business Central data loads
- [ ] Order creation succeeds
- [ ] Error handling works

### ✅ Mobile Specific

- [ ] Interface fits mobile screen
- [ ] Buttons are touch-friendly
- [ ] Text is readable
- [ ] Navigation works smoothly

## Troubleshooting

### Common Issues

**Add-on not appearing:**
- Check deployment status
- Verify permissions granted
- Refresh Gmail

**API errors:**
- Check Supabase URL/key
- Verify edge functions are deployed
- Check Apps Script execution logs

**Mobile issues:**
- Clear Gmail app cache
- Reinstall add-on
- Check mobile permissions

### Debug Tools

1. **Apps Script Logs**: View in Executions tab
2. **Gmail Debug**: Use desktop version first
3. **Network**: Check external API calls

## Quick Deploy Script

Save this as a bookmark for quick testing:

```javascript
javascript:(function(){
  window.open('https://script.google.com/create', '_blank');
})();
```

## Next Steps

1. **Test the basic deployment** following Quick Start
2. **Verify mobile functionality** in Gmail app
3. **Test with real order emails**
4. **Configure Business Central integration**
5. **Deploy to production** when ready

The add-on should now be ready for testing in your Gmail mobile app! 📱✨