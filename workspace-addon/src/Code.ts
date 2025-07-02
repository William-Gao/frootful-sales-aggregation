/**
 * Frootful Gmail Workspace Add-on
 * Extracts order information from Gmail messages and integrates with Business Central
 */

// Configuration
const SUPABASE_URL = 'https://zkglvdfppodwlgzhfgqs.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InprZ2x2ZGZwcG9kd2xnemhmZ3FzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDYxOTQ5MjgsImV4cCI6MjA2MTc3MDkyOH0.qzyywdy4k6A0DucETls_YT32YvAxuwDV6eBFjs89BRg';

// Types
interface EmailData {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  body: string;
}

interface Customer {
  id: string;
  number: string;
  displayName: string;
  email: string;
}

interface Item {
  id: string;
  number: string;
  displayName: string;
  unitPrice: number;
}

interface AnalyzedItem {
  itemName: string;
  quantity: number;
  matchedItem?: Item;
}

interface AnalysisData {
  email: EmailData;
  customers: Customer[];
  items: Item[];
  matchingCustomer?: Customer;
  analyzedItems: AnalyzedItem[];
  requestedDeliveryDate?: string;
}

interface OrderData {
  customerNumber: string;
  items: Array<{
    itemName: string;
    quantity: number;
    price?: number;
  }>;
  requestedDeliveryDate?: string;
}

interface OrderResult {
  success: boolean;
  orderNumber?: string;
  orderId?: string;
  deepLink?: string;
  addedItems?: Array<{
    itemName: string;
    quantity: number;
    price: number;
    lineId: string;
  }>;
  requestedDeliveryDate?: string;
  message?: string;
  error?: string;
}

/**
 * Main entry point when a Gmail message is opened
 */
function onGmailMessage(e: GoogleAppsScript.Addons.EventObject): GoogleAppsScript.Card_Service.Card[] {
  console.log('Frootful: Gmail message opened');
  
  var accessToken = e.gmail!!.accessToken;
  GmailApp.setCurrentMessageAccessToken(accessToken);

  var messageId = e.gmail!!.messageId;
  var message = GmailApp.getMessageById(messageId);
  var subject = message.getSubject();
  var sender = message.getFrom();
  var body = message.getPlainBody();
  console.log('This is the message: ', message.getPlainBody())
  console.log('This is the message raw content: ', message.getRawContent());

  // Create a card with a single card section and two widgets.
  // Be sure to execute build() to finalize the card construction.
  var exampleCard = CardService.newCardBuilder()
      .setHeader(CardService.newCardHeader()
          .setTitle('Example card'))
      .addSection(CardService.newCardSection()
          .addWidget(CardService.newKeyValue()
              .setTopLabel('Subject')
              .setContent(subject))
          .addWidget(CardService.newKeyValue()
              .setTopLabel('From')
              .setContent(sender))
          .addWidget(CardService.newKeyValue()
              .setTopLabel('Body')
              .setContent(body)))
      .build();   // Don't forget to build the Card!
  return [exampleCard];
}


