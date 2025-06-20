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
  
  try {
    // Check if user is authenticated
    const userEmail = Session.getActiveUser().getEmail();
    if (!userEmail) {
      return [createAuthCard()];
    }

    // Get message details
    const messageId = e.gmail?.messageId;
    const accessToken = e.gmail?.accessToken;
    
    if (!messageId) {
      return [createErrorCard('Unable to access message details')];
    }

    // Create the main interface
    return [createMainCard(messageId, accessToken, userEmail)];
    
  } catch (error) {
    console.error('Error in onGmailMessage:', error);
    return [createErrorCard('Failed to load Frootful: ' + String(error))];
  }
}

/**
 * Handle compose trigger
 */
function onGmailCompose(e: GoogleAppsScript.Addons.EventObject): GoogleAppsScript.Card_Service.Card[] {
  const userEmail = Session.getActiveUser().getEmail();
  const accessToken = e.gmail?.accessToken;
  return [createMainCard(null, accessToken, userEmail)];
}

/**
 * Create the main card interface
 */
function createMainCard(messageId: string | null, accessToken: string | undefined, userEmail: string): GoogleAppsScript.Card_Service.Card {
  const card = CardService.newCardBuilder()
    .setName('frootful-main')
    .setHeader(CardService.newCardHeader()
      .setTitle('Frootful')
      .setSubtitle('Email to ERP Integration')
      .setImageUrl('https://images.pexels.com/photos/1640777/pexels-photo-1640777.jpeg?auto=compress&cs=tinysrgb&w=64&h=64')
      .setImageStyle(CardService.ImageStyle.CIRCLE)
    );

  const section = CardService.newCardSection();

  if (!messageId) {
    // No message selected
    section.addWidget(
      CardService.newTextParagraph()
        .setText('📧 Open an email with order information to extract details and create ERP orders.')
    );
  } else {
    // Message is available - show extract button
    section.addWidget(
      CardService.newTextParagraph()
        .setText('🔍 Ready to analyze this email for order information.')
    );

    section.addWidget(
      CardService.newButtonSet()
        .addButton(CardService.newTextButton()
          .setText('Extract Order Details')
          .setBackgroundColor('#6366F1')
          .setOnClickAction(CardService.newAction()
            .setFunctionName('extractEmailContent')
            .setParameters({
              'messageId': messageId,
              'accessToken': accessToken || '',
              'userEmail': userEmail
            })
          )
        )
    );
  }

  // Add authentication status
  section.addWidget(
    CardService.newKeyValue()
      .setTopLabel('Signed in as')
      .setContent(userEmail)
      .setIcon(CardService.Icon.PERSON)
  );

  // Add Business Central connection button
  section.addWidget(
    CardService.newButtonSet()
      .addButton(CardService.newTextButton()
        .setText('Connect Business Central')
        .setOnClickAction(CardService.newAction()
          .setFunctionName('connectBusinessCentral')
          .setParameters({'userEmail': userEmail})
        )
      )
  );

  card.addSection(section);
  return card.build();
}

/**
 * Extract email content and analyze for order information
 */
function extractEmailContent(e: GoogleAppsScript.Addons.EventObject): GoogleAppsScript.Card_Service.ActionResponse {
  const messageId = (e as any).parameters?.messageId as string;
  const accessToken = (e as any).parameters?.accessToken as string;
  const userEmail = (e as any).parameters?.userEmail as string;

  try {
    console.log('Extracting email content for message:', messageId);

    // Get email details using Gmail API
    const emailData = getEmailDetails(messageId, accessToken);
    
    if (!emailData) {
      return CardService.newActionResponseBuilder()
        .setNavigation(CardService.newNavigation().updateCard(createErrorCard('Failed to retrieve email content')))
        .build();
    }

    // Call Supabase edge function for comprehensive analysis
    const analysisResult = callComprehensiveAnalysis(emailData, userEmail);
    
    if (!analysisResult.success) {
      return CardService.newActionResponseBuilder()
        .setNavigation(CardService.newNavigation().updateCard(createErrorCard('Analysis failed: ' + (analysisResult.error || 'Unknown error'))))
        .build();
    }

    // Create results card
    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().updateCard(createResultsCard(analysisResult.data!, userEmail)))
      .build();

  } catch (error) {
    console.error('Error extracting email:', error);
    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().updateCard(createErrorCard('Extraction failed: ' + String(error))))
      .build();
  }
}

/**
 * Get email details using Gmail API
 */
function getEmailDetails(messageId: string, accessToken: string): EmailData | null {
  try {
    const response = UrlFetchApp.fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.getResponseCode() !== 200) {
      console.error('Gmail API error:', response.getContentText());
      return null;
    }

    const emailData = JSON.parse(response.getContentText());
    return parseEmailData(emailData);

  } catch (error) {
    console.error('Error fetching email details:', error);
    return null;
  }
}

/**
 * Parse Gmail API response into structured email data
 */
function parseEmailData(emailData: any): EmailData {
  const headers: Record<string, string> = {};
  
  if (emailData.payload && emailData.payload.headers) {
    emailData.payload.headers.forEach((header: any) => {
      headers[header.name.toLowerCase()] = header.value;
    });
  }
  
  let body = '';
  
  function extractBodyParts(part: any): void {
    if (part.body && part.body.data) {
      const decodedData = Utilities.base64Decode(
        part.body.data.replace(/-/g, '+').replace(/_/g, '/')
      );
      body += Utilities.newBlob(decodedData).getDataAsString();
    }
    
    if (part.parts) {
      part.parts.forEach((subPart: any) => {
        if (subPart.mimeType === 'text/html') {
          extractBodyParts(subPart);
        }
      });
      
      if (!body) {
        part.parts.forEach((subPart: any) => {
          if (subPart.mimeType === 'text/plain') {
            extractBodyParts(subPart);
          }
        });
      }
    }
  }
  
  if (emailData.payload) {
    extractBodyParts(emailData.payload);
  }
  
  return {
    id: emailData.id,
    threadId: emailData.threadId,
    labelIds: emailData.labelIds || [],
    snippet: emailData.snippet || '',
    subject: headers.subject || '',
    from: headers.from || '',
    to: headers.to || '',
    date: headers.date || '',
    body: body
  };
}

/**
 * Call Supabase comprehensive analysis function
 */
function callComprehensiveAnalysis(emailData: EmailData, userEmail: string): { success: boolean; data?: AnalysisData; error?: string } {
  try {
    // For the workspace add-on, we'll use the user's email as a simple auth mechanism
    // In production, you'd want proper OAuth integration
    const response = UrlFetchApp.fetch(
      `${SUPABASE_URL}/functions/v1/analyze-email`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json'
        },
        payload: JSON.stringify({
          emailId: emailData.id,
          emailData: emailData,
          userEmail: userEmail
        })
      }
    );

    if (response.getResponseCode() !== 200) {
      console.error('Supabase analysis error:', response.getContentText());
      return {
        success: false,
        error: 'Analysis service unavailable'
      };
    }

    return JSON.parse(response.getContentText());

  } catch (error) {
    console.error('Error calling analysis service:', error);
    return {
      success: false,
      error: String(error)
    };
  }
}

/**
 * Create results card showing extracted order information
 */
function createResultsCard(analysisData: AnalysisData, userEmail: string): GoogleAppsScript.Card_Service.Card {
  const card = CardService.newCardBuilder()
    .setName('frootful-results')
    .setHeader(CardService.newCardHeader()
      .setTitle('Order Analysis Results')
      .setSubtitle('Extracted from email')
    );

  // Email info section
  const emailSection = CardService.newCardSection()
    .setHeader('📧 Email Details');
  
  emailSection.addWidget(
    CardService.newKeyValue()
      .setTopLabel('From')
      .setContent(analysisData.email.from)
      .setIcon(CardService.Icon.PERSON)
  );

  emailSection.addWidget(
    CardService.newKeyValue()
      .setTopLabel('Subject')
      .setContent(analysisData.email.subject)
      .setIcon(CardService.Icon.EMAIL)
  );

  card.addSection(emailSection);

  // Customer section
  if (analysisData.matchingCustomer) {
    const customerSection = CardService.newCardSection()
      .setHeader('👤 Matched Customer');
    
    customerSection.addWidget(
      CardService.newKeyValue()
        .setTopLabel('Customer')
        .setContent(analysisData.matchingCustomer.displayName)
        .setIcon(CardService.Icon.PERSON)
    );

    customerSection.addWidget(
      CardService.newKeyValue()
        .setTopLabel('Customer Number')
        .setContent(analysisData.matchingCustomer.number)
    );

    card.addSection(customerSection);
  }

  // Items section
  if (analysisData.analyzedItems && analysisData.analyzedItems.length > 0) {
    const itemsSection = CardService.newCardSection()
      .setHeader(`📦 Items Found (${analysisData.analyzedItems.length})`);

    analysisData.analyzedItems.forEach((item, index) => {
      if (index < 5) { // Limit to first 5 items for mobile display
        const itemText = item.matchedItem 
          ? `${item.matchedItem.displayName} (Qty: ${item.quantity})`
          : `${item.itemName} (Qty: ${item.quantity}) - No match found`;
        
        itemsSection.addWidget(
          CardService.newKeyValue()
            .setTopLabel(`Item ${index + 1}`)
            .setContent(itemText)
            .setIcon(CardService.Icon.DESCRIPTION)
        );
      }
    });

    if (analysisData.analyzedItems.length > 5) {
      itemsSection.addWidget(
        CardService.newTextParagraph()
          .setText(`... and ${analysisData.analyzedItems.length - 5} more items`)
      );
    }

    card.addSection(itemsSection);
  }

  // Delivery date section
  if (analysisData.requestedDeliveryDate) {
    const deliverySection = CardService.newCardSection()
      .setHeader('📅 Delivery Information');
    
    deliverySection.addWidget(
      CardService.newKeyValue()
        .setTopLabel('Requested Delivery Date')
        .setContent(analysisData.requestedDeliveryDate)
        .setIcon(CardService.Icon.EVENT_SEAT)
    );

    card.addSection(deliverySection);
  }

  // Actions section
  const actionsSection = CardService.newCardSection()
    .setHeader('🚀 Actions');

  if (analysisData.matchingCustomer && analysisData.analyzedItems.length > 0) {
    actionsSection.addWidget(
      CardService.newButtonSet()
        .addButton(CardService.newTextButton()
          .setText('Create ERP Order')
          .setBackgroundColor('#10B981')
          .setOnClickAction(CardService.newAction()
            .setFunctionName('createERPOrder')
            .setParameters({
              'analysisData': JSON.stringify(analysisData),
              'userEmail': userEmail
            })
          )
        )
    );
  } else {
    actionsSection.addWidget(
      CardService.newTextParagraph()
        .setText('⚠️ Cannot create order: Missing customer match or items')
    );
  }

  actionsSection.addWidget(
    CardService.newButtonSet()
      .addButton(CardService.newTextButton()
        .setText('Back to Main')
        .setOnClickAction(CardService.newAction()
          .setFunctionName('backToMain')
          .setParameters({'userEmail': userEmail})
        )
      )
  );

  card.addSection(actionsSection);
  return card.build();
}

/**
 * Create ERP order from analyzed data
 */
function createERPOrder(e: GoogleAppsScript.Addons.EventObject): GoogleAppsScript.Card_Service.ActionResponse {
  const analysisData: AnalysisData = JSON.parse((e as any).parameters?.analysisData as string);
  const userEmail = (e as any).parameters?.userEmail as string;

  try {
    // Prepare order data
    const orderData: OrderData = {
      customerNumber: analysisData.matchingCustomer!.number,
      items: analysisData.analyzedItems.map(item => ({
        itemName: item.matchedItem ? item.matchedItem.number : item.itemName,
        quantity: item.quantity
      })),
      requestedDeliveryDate: analysisData.requestedDeliveryDate
    };

    // Call export-order-to-erp edge function
    const response = UrlFetchApp.fetch(
      `${SUPABASE_URL}/functions/v1/export-order-to-erp`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json'
        },
        payload: JSON.stringify({
          orderData: orderData,
          userEmail: userEmail
        })
      }
    );

    if (response.getResponseCode() !== 200) {
      const errorText = response.getContentText();
      console.error('ERP order creation error:', errorText);
      return CardService.newActionResponseBuilder()
        .setNavigation(CardService.newNavigation().updateCard(createErrorCard('Failed to create order: ' + errorText)))
        .build();
    }

    const result: OrderResult = JSON.parse(response.getContentText());
    
    if (!result.success) {
      return CardService.newActionResponseBuilder()
        .setNavigation(CardService.newNavigation().updateCard(createErrorCard('Order creation failed: ' + (result.error || 'Unknown error'))))
        .build();
    }

    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().updateCard(createSuccessCard(result, userEmail)))
      .build();

  } catch (error) {
    console.error('Error creating ERP order:', error);
    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().updateCard(createErrorCard('Order creation failed: ' + String(error))))
      .build();
  }
}

/**
 * Connect to Business Central
 */
function connectBusinessCentral(e: GoogleAppsScript.Addons.EventObject): GoogleAppsScript.Card_Service.ActionResponse {
  const userEmail = (e as any).parameters?.userEmail as string;
  
  const card = CardService.newCardBuilder()
    .setName('frootful-bc-connect')
    .setHeader(CardService.newCardHeader()
      .setTitle('Connect Business Central')
      .setSubtitle('ERP Integration Setup')
    );

  const section = CardService.newCardSection();
  
  section.addWidget(
    CardService.newTextParagraph()
      .setText('🔗 To connect Business Central, please visit the Frootful dashboard on your computer and complete the setup process.')
  );

  section.addWidget(
    CardService.newTextParagraph()
      .setText('📱 Once connected, you\'ll be able to create orders directly from Gmail mobile.')
  );

  section.addWidget(
    CardService.newButtonSet()
      .addButton(CardService.newTextButton()
        .setText('Open Dashboard')
        .setOpenLink(CardService.newOpenLink()
          .setUrl('http://localhost:5173/dashboard')
          .setOpenAs(CardService.OpenAs.FULL_SIZE)
        )
      )
  );

  section.addWidget(
    CardService.newButtonSet()
      .addButton(CardService.newTextButton()
        .setText('Back to Main')
        .setOnClickAction(CardService.newAction()
          .setFunctionName('backToMain')
          .setParameters({'userEmail': userEmail})
        )
      )
  );

  card.addSection(section);
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().updateCard(card.build()))
    .build();
}

/**
 * Go back to main interface
 */
function backToMain(e: GoogleAppsScript.Addons.EventObject): GoogleAppsScript.Card_Service.ActionResponse {
  const userEmail = (e as any).parameters?.userEmail as string;
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().updateCard(createMainCard(null, undefined, userEmail)))
    .build();
}

/**
 * Create loading card
 */
function createLoadingCard(message: string): GoogleAppsScript.Card_Service.Card {
  const card = CardService.newCardBuilder()
    .setName('frootful-loading')
    .setHeader(CardService.newCardHeader()
      .setTitle('Frootful')
      .setSubtitle('Processing...')
    );

  const section = CardService.newCardSection();
  section.addWidget(
    CardService.newTextParagraph()
      .setText('⏳ ' + message)
  );

  card.addSection(section);
  return card.build();
}

/**
 * Create error card
 */
function createErrorCard(errorMessage: string): GoogleAppsScript.Card_Service.Card {
  const card = CardService.newCardBuilder()
    .setName('frootful-error')
    .setHeader(CardService.newCardHeader()
      .setTitle('Frootful')
      .setSubtitle('Error')
    );

  const section = CardService.newCardSection();
  section.addWidget(
    CardService.newTextParagraph()
      .setText('❌ ' + errorMessage)
  );

  section.addWidget(
    CardService.newButtonSet()
      .addButton(CardService.newTextButton()
        .setText('Try Again')
        .setOnClickAction(CardService.newAction()
          .setFunctionName('backToMain')
        )
      )
  );

  card.addSection(section);
  return card.build();
}

/**
 * Create success card
 */
function createSuccessCard(result: OrderResult, userEmail: string): GoogleAppsScript.Card_Service.Card {
  const card = CardService.newCardBuilder()
    .setName('frootful-success')
    .setHeader(CardService.newCardHeader()
      .setTitle('Order Created Successfully!')
      .setSubtitle('ERP Integration Complete')
    );

  const section = CardService.newCardSection();
  
  if (result.orderNumber) {
    section.addWidget(
      CardService.newKeyValue()
        .setTopLabel('Order Number')
        .setContent(result.orderNumber)
        .setIcon(CardService.Icon.CONFIRMATION_NUMBER_ICON)
    );
  }

  if (result.addedItems) {
    section.addWidget(
      CardService.newKeyValue()
        .setTopLabel('Items Added')
        .setContent(result.addedItems.length.toString())
        .setIcon(CardService.Icon.DESCRIPTION)
    );
  }

  if (result.requestedDeliveryDate) {
    section.addWidget(
      CardService.newKeyValue()
        .setTopLabel('Delivery Date')
        .setContent(result.requestedDeliveryDate)
        .setIcon(CardService.Icon.EVENT_SEAT)
    );
  }

  section.addWidget(
    CardService.newTextParagraph()
      .setText('✅ ' + (result.message || 'Order created successfully!'))
  );

  if (result.deepLink) {
    section.addWidget(
      CardService.newButtonSet()
        .addButton(CardService.newTextButton()
          .setText('View in Business Central')
          .setOpenLink(CardService.newOpenLink()
            .setUrl(result.deepLink)
            .setOpenAs(CardService.OpenAs.FULL_SIZE)
          )
        )
    );
  }

  section.addWidget(
    CardService.newButtonSet()
      .addButton(CardService.newTextButton()
        .setText('Back to Main')
        .setOnClickAction(CardService.newAction()
          .setFunctionName('backToMain')
          .setParameters({'userEmail': userEmail})
        )
      )
  );

  card.addSection(section);
  return card.build();
}

/**
 * Create authentication card
 */
function createAuthCard(): GoogleAppsScript.Card_Service.Card {
  const card = CardService.newCardBuilder()
    .setName('frootful-auth')
    .setHeader(CardService.newCardHeader()
      .setTitle('Frootful')
      .setSubtitle('Authentication Required')
    );

  const section = CardService.newCardSection();
  section.addWidget(
    CardService.newTextParagraph()
      .setText('🔐 Please sign in to your Google account to use Frootful.')
  );

  card.addSection(section);
  return card.build();
}