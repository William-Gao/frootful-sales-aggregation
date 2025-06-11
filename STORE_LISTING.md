# Chrome Web Store Listing for Frootful

## Store Title
Frootful - Gmail to Business Central Integration

## Short Description
Extract email orders from Gmail and automatically create purchase orders in Microsoft Business Central ERP system.

## Detailed Description
Frootful streamlines your order processing workflow by intelligently extracting purchase order information from Gmail emails and seamlessly integrating with Microsoft Business Central.

**Key Features:**
✅ **Smart Email Analysis** - AI-powered extraction of order details from email content
✅ **Business Central Integration** - Direct creation of sales orders in your ERP system
✅ **Secure Authentication** - OAuth2 integration with Gmail and Business Central
✅ **Customer Matching** - Automatically matches email senders to existing customers
✅ **Item Recognition** - Intelligent matching of email content to your product catalog
✅ **One-Click Processing** - Transform emails into ERP orders with a single click

**How It Works:**
1. Sign in with your Google account to access Gmail
2. Connect to your Business Central environment
3. Open any email in Gmail containing order information
4. Click the "Extract" button that appears in the email toolbar
5. Review and edit the extracted order details
6. Export directly to Business Central as a sales order

**Privacy & Security:**
- Only accesses emails you explicitly choose to extract
- All data is encrypted and securely stored
- No access to your browsing history or other websites
- Compliant with Google's privacy requirements
- Full control over data access and deletion

**Perfect For:**
- Small to medium businesses using Business Central
- Sales teams processing email orders
- Companies looking to automate order entry
- Organizations wanting to reduce manual data entry

Transform your email-to-order workflow today with Frootful!

## Category
Productivity

## Language
English

## Screenshots Needed
1. Gmail interface with Extract button
2. Sidebar showing extracted order details
3. Business Central integration setup
4. Order creation confirmation
5. Extension popup interface

## Justification for Permissions

### Host Permissions Required:
- **https://mail.google.com/*** - Required to inject the Extract button and analyze emails
- **https://www.googleapis.com/*** - Required for Gmail API access to read email content
- **https://oauth2.googleapis.com/*** - Required for Google OAuth authentication
- **https://accounts.google.com/*** - Required for Google sign-in flow
- **https://login.microsoftonline.com/*** - Required for Microsoft Business Central authentication
- **https://api.businesscentral.dynamics.com/*** - Required to create orders in Business Central
- **https://zkglvdfppodwlgzhfgqs.supabase.co/*** - Required for secure backend processing and AI analysis

### Why These Permissions Are Necessary:
Each host permission serves a specific, essential function for the extension's core features. We do not use broad permissions like `*://*/*` or `https://*/*`. All permissions are limited to the specific domains required for Gmail access, authentication, and ERP integration.

### Data Usage Transparency:
- We only access emails when users click the "Extract" button
- No background scanning or automatic email access
- All data processing is user-initiated and transparent
- Users maintain full control over which emails are processed