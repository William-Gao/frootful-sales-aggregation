# AC215 Demo Setup Guide

## Overview

The demo site is available at `/demo` and provides a public, no-login-required interface for demonstrating the Frootful Sales Aggregation system.

## Demo URL

Once deployed, the demo is accessible at:
```
https://your-domain.com/demo
```

## Demo Organization

- **Organization ID**: `00000000-0000-0000-0000-000000000001`
- **Organization Name**: AC215 Demo
- Pre-populated with sample customers (Harvard Dining, MIT Catering, etc.) and microgreen products

## Setting Up Demo Gmail Account

To have the demo fully functional with email forwarding, you need to:

### 1. Create Demo Gmail Account

Create a new Gmail account (e.g., `demo.frootful@gmail.com`)

### 2. Set Up Gmail API & Pub/Sub (Same as Production)

Follow the same setup as `orders.frootful@gmail.com`:

1. Enable Gmail API in Google Cloud Console
2. Create OAuth credentials
3. Set up Pub/Sub topic and subscription
4. Configure Gmail push notifications to your Supabase webhook

### 3. Update Demo Email Address

In `src/pages/Demo.tsx`, update the constant:
```typescript
const DEMO_EMAIL_ADDRESS = 'demo.frootful@gmail.com'; // Update this
```

### 4. Configure Email Processing

The `process-gmail-notification` edge function needs to route demo emails to the demo organization. You may need to add logic to detect the demo inbox and assign `organization_id = '00000000-0000-0000-0000-000000000001'`.

## How It Works

1. **Attendees visit `/demo`** - No login required
2. **Forward any order email** to the demo Gmail address
3. **System processes the email** via Gmail Pub/Sub → Edge Function → AI Analysis
4. **Order/Proposal appears** in the demo dashboard via real-time subscriptions
5. **Attendees click Accept/Reject** to approve or reject proposals

## Architecture

The demo page is completely self-contained:
- Uses its own Supabase client with anon key (no auth required)
- Has RLS policies allowing public read access to demo org data
- Real-time subscriptions auto-update when new orders arrive
- Simplified UI focused on the core workflow

## Files Created

- `src/pages/Demo.tsx` - Self-contained demo dashboard
- `supabase/migrations/20251209000001_create_demo_organization.sql` - Demo org, customers, items, and RLS policies

## Security Notes

- Demo data is isolated to organization ID `00000000-0000-0000-0000-000000000001`
- RLS policies allow public SELECT access only to demo org data
- No auth tokens or sensitive data exposed
- Demo attendees cannot access production data
