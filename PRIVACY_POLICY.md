# Privacy Policy for Frootful Gmail Extension

**Last Updated:** January 2025

## Overview

Frootful is a Chrome extension that helps users extract order information from Gmail emails and integrate with Business Central ERP systems. We are committed to protecting your privacy and being transparent about how we handle your data.

## What Data We Collect

### Email Content (User-Initiated Only)
- **What:** Content from emails you explicitly choose to extract using the "Extract" button
- **When:** Only when you click the "Extract" button on a specific email
- **Why:** To analyze order information and match it with your ERP system data
- **How:** Processed using AI to identify customers, items, and quantities

### Authentication Information
- **What:** Encrypted OAuth tokens for Gmail and Business Central access
- **When:** When you sign in to connect your accounts
- **Why:** To securely access Gmail emails and create orders in Business Central
- **How:** Stored encrypted in our secure database with industry-standard encryption

### ERP Integration Data
- **What:** Customer lists, item catalogs, and company information from Business Central
- **When:** When you connect your Business Central account
- **Why:** To match email content with existing customers and products
- **How:** Retrieved from your Business Central environment via official APIs

### Usage Data
- **What:** Basic usage statistics (number of emails processed, orders created)
- **When:** During normal extension usage
- **Why:** To improve our service and provide support
- **How:** Anonymized and aggregated data only

## What Data We DO NOT Collect

❌ **Browsing History** - We do not track your web browsing activity  
❌ **Personal Files** - We do not access files outside of Gmail  
❌ **Banking Information** - We do not access financial websites or data  
❌ **Automatic Email Scanning** - We never scan emails without your explicit action  
❌ **Email Passwords** - We use OAuth, never store your email password  
❌ **Sensitive Personal Data** - We do not collect SSN, credit cards, or similar data  

## How We Use Your Data

### Primary Functions
- **Email Analysis:** Extract order information from emails you choose to process
- **Customer Matching:** Match email senders to existing customers in your ERP
- **Order Creation:** Generate sales orders in your Business Central system
- **Data Synchronization:** Keep customer and product information current

### Service Improvement
- **Error Diagnosis:** Troubleshoot issues with email processing or ERP integration
- **Feature Enhancement:** Improve AI accuracy and add new functionality
- **Performance Optimization:** Ensure fast and reliable service

## Data Storage and Security

### Encryption
- All sensitive tokens are encrypted using AES-256-GCM encryption
- Encryption keys are stored separately from encrypted data
- Data is encrypted both in transit (HTTPS/TLS) and at rest

### Storage Location
- Data is stored securely in Supabase (SOC 2 Type II compliant)
- Servers located in secure data centers with physical security controls
- Regular security audits and penetration testing

### Access Controls
- Row-level security ensures users can only access their own data
- Multi-factor authentication required for administrative access
- Principle of least privilege for all system access

### Data Retention
- Authentication tokens: Retained until you disconnect the service
- Email content: Processed temporarily, not permanently stored
- Usage statistics: Retained for 2 years in anonymized form
- Account data: Retained until account deletion

## Data Sharing and Third Parties

### We DO NOT Share Data With:
- Advertising companies or data brokers
- Social media platforms
- Marketing companies
- Any third parties for commercial purposes

### Limited Third-Party Services:
- **Google Gmail API:** To access emails you choose to extract (required for core functionality)
- **Microsoft Business Central API:** To create orders in your ERP system (required for core functionality)
- **OpenAI API:** To analyze email content using AI (content is anonymized before processing)
- **Supabase:** For secure data storage and processing (SOC 2 compliant)

### Legal Requirements:
We may disclose data only when required by law, such as:
- Valid court orders or subpoenas
- Legal process requiring disclosure
- Protection of our legal rights or safety

## Your Rights and Controls

### Data Access
- View all data we have about you through your dashboard
- Export your data in standard formats
- Request detailed reports of data processing activities

### Data Control
- **Revoke Access:** Disconnect Gmail or Business Central at any time
- **Delete Data:** Request complete deletion of your account and data
- **Modify Data:** Update or correct any stored information
- **Opt-Out:** Stop using the service at any time

### How to Exercise Rights
- **In-App:** Use the settings in your Frootful dashboard
- **Email:** Contact privacy@frootful.ai
- **Response Time:** We respond to requests within 30 days

## International Data Transfers

- Data may be processed in the United States and other countries
- We ensure adequate protection through appropriate safeguards
- All transfers comply with applicable data protection laws
- Users in the EU have additional rights under GDPR

## Children's Privacy

- Frootful is not intended for users under 18 years of age
- We do not knowingly collect data from children
- If we discover data from a child, we will delete it immediately
- Parents can contact us to request deletion of a child's data

## Changes to This Policy

- We may update this policy to reflect changes in our practices
- Material changes will be communicated via email or in-app notification
- Continued use after changes constitutes acceptance
- Previous versions are available upon request

## Compliance and Certifications

### Standards We Follow:
- **SOC 2 Type II** (through Supabase infrastructure)
- **GDPR** (General Data Protection Regulation)
- **CCPA** (California Consumer Privacy Act)
- **Google Chrome Web Store Policies**
- **Microsoft Partner Security Requirements**

### Regular Audits:
- Annual security assessments
- Quarterly privacy reviews
- Continuous monitoring for compliance

## Contact Information

### Privacy Questions:
**Email:** privacy@frootful.ai  
**Response Time:** Within 48 hours for privacy inquiries

### Data Protection Officer:
**Email:** dpo@frootful.ai  
**Mail:** Frootful Privacy Team, [Your Business Address]

### General Support:
**Email:** support@frootful.ai  
**Website:** https://frootful.ai/privacy

## Specific Chrome Extension Permissions

### Why We Need Each Permission:

**Storage Permission:**
- Store authentication tokens securely
- Cache user preferences and settings
- Enable offline functionality

**ActiveTab Permission:**
- Inject the "Extract" button only in Gmail
- Access email content only when you click "Extract"
- No background monitoring or automatic access

**Tabs Permission:**
- Open authentication pages when you sign in
- Communicate between extension and web app
- No access to browsing history or other tabs

**Host Permissions:**
- **mail.google.com:** Required to add Extract button and process emails
- **supabase.co:** Required for secure backend communication and data storage

### What We DON'T Do:
- Monitor your browsing activity
- Access emails automatically
- Read content from other websites
- Track your behavior across the web

---

**This privacy policy is designed to be transparent, comprehensive, and compliant with Chrome Web Store requirements while protecting user privacy.**