/**
 * Frootful Gmail Workspace Add-on
 * Extracts order information from Gmail messages and integrates with Business Central
 */

// Configuration
const SUPABASE_URL = 'https://zkglvdfppodwlgzhfgqs.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InprZ2x2ZGZwcG9kd2xnemhmZ3FzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDYxOTQ5MjgsImV4cCI6MjA2MTc3MDkyOH0.qzyywdy4k6A0DucETls_YT32YvAxuwDV6eBFjs89BRg';

// Hardcoded access token - replace with your actual token
const HARDCODED_ACCESS_TOKEN = 'your-supabase-access-token-here';

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
 * Homepage trigger - shows when Gmail is opened
 */
function onHomepage(e: GoogleAppsScript.Addons.EventObject): GoogleAppsScript.Card_Service.Card[] {
  console.log('Frootful: Homepage loaded');
  
  const card = CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader()
      .setTitle('Frootful')
      .setSubtitle('Email to ERP Integration')
      .setImageUrl('https://images.pexels.com/photos/1640777/pexels-photo-1640777.jpeg?auto=compress&cs=tinysrgb&w=128&h=128'))
    .addSection(CardService.newCardSection()
      .addWidget(CardService.newTextParagraph()
        .setText('Welcome to Frootful! Open an email to extract order information and create ERP orders.'))
      .addWidget(CardService.newButtonSet()
        .addButton(CardService.newTextButton()
          .setText('Open Dashboard')
          .setOpenLink(CardService.newOpenLink()
            .setUrl('https://frootful.ai/dashboard')))))
    .build();

  return [card];
}

/**
 * Universal action to open dashboard
 */
function openDashboard(): GoogleAppsScript.Card_Service.ActionResponse {
  return CardService.newActionResponseBuilder()
    .setOpenLink(CardService.newOpenLink()
      .setUrl('https://frootful.ai/dashboard'))
    .build();
}

/**
 * Main entry point when a Gmail message is opened
 */
function onGmailMessage(e: GoogleAppsScript.Addons.EventObject): GoogleAppsScript.Card_Service.Card[] {
  console.log('Frootful: Gmail message opened');
  
  try {
    const messageId = e.gmail?.messageId;
    if (!messageId) {
      return [createErrorCard('No message ID found')];
    }

    console.log('Processing message ID:', messageId);

    // Show loading card first
    const loadingCard = createLoadingCard();
    
    // Start analysis in background and return loading card
    // Note: Apps Script doesn't support async/await in the same way as modern JS
    // We'll need to use a different approach for the actual implementation
    
    return [loadingCard];
  } catch (error) {
    console.error('Error in onGmailMessage:', error);
    return [createErrorCard('Failed to load Frootful: ' + String(error))];
  }
}

/**
 * Action handler for extracting email content
 */
function extractEmailContent(e: GoogleAppsScript.Addons.EventObject): GoogleAppsScript.Card_Service.ActionResponse {
  console.log('Frootful: Extract email content action triggered');
  
  try {
    const messageId = e.gmail?.messageId;
    if (!messageId) {
      return createErrorResponse('No message ID found');
    }

    console.log('Extracting content for message ID:', messageId);

    // Call analyze-email endpoint
    const analysisResult = callAnalyzeEmail(messageId);
    
    if (!analysisResult.success) {
      return createErrorResponse(analysisResult.error || 'Analysis failed');
    }

    // Create result card with analysis data
    const resultCard = createAnalysisResultCard(analysisResult.data!);
    
    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().pushCard(resultCard))
      .build();

  } catch (error) {
    console.error('Error in extractEmailContent:', error);
    return createErrorResponse('Failed to extract email content: ' + String(error));
  }
}

/**
 * Action handler for creating ERP order
 */
function createERPOrder(e: GoogleAppsScript.Addons.EventObject): GoogleAppsScript.Card_Service.ActionResponse {
  console.log('Frootful: Create ERP order action triggered');
  
  try {
    // Get form data from the action
    const formInputs = e.commonEventObject?.formInputs;
    if (!formInputs) {
      return createErrorResponse('No form data found');
    }

    // Extract customer and items data
    const customerNumber = formInputs['customer']?.stringInputs?.value?.[0];
    if (!customerNumber) {
      return createErrorResponse('Please select a customer');
    }

    // Build order data from form inputs
    const orderData: OrderData = {
      customerNumber: customerNumber,
      items: [] // We'll need to extract items from form data
    };

    // Extract delivery date if provided
    const deliveryDate = formInputs['deliveryDate']?.stringInputs?.value?.[0];
    if (deliveryDate) {
      orderData.requestedDeliveryDate = deliveryDate;
    }

    // Call export-order-to-erp endpoint
    const orderResult = callExportOrderToERP(orderData);
    
    if (!orderResult.success) {
      return createErrorResponse(orderResult.error || 'Order creation failed');
    }

    // Create success card
    const successCard = createOrderSuccessCard(orderResult);
    
    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().pushCard(successCard))
      .build();

  } catch (error) {
    console.error('Error in createERPOrder:', error);
    return createErrorResponse('Failed to create ERP order: ' + String(error));
  }
}

/**
 * Call the analyze-email Supabase edge function
 */
function callAnalyzeEmail(emailId: string): { success: boolean; data?: AnalysisData; error?: string } {
  try {
    console.log('Calling analyze-email endpoint for email:', emailId);

    const response = UrlFetchApp.fetch(`${SUPABASE_URL}/functions/v1/analyze-email`, {
      method: 'post',
      headers: {
        'Authorization': `Bearer ${HARDCODED_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      payload: JSON.stringify({ emailId: emailId })
    });

    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();

    console.log('Analyze-email response code:', responseCode);
    console.log('Analyze-email response:', responseText);

    if (responseCode !== 200) {
      throw new Error(`HTTP ${responseCode}: ${responseText}`);
    }

    const result = JSON.parse(responseText);
    
    if (!result.success) {
      throw new Error(result.error || 'Analysis failed');
    }

    console.log('Analysis successful:', {
      email: result.data.email.subject,
      customers: result.data.customers.length,
      items: result.data.items.length,
      analyzedItems: result.data.analyzedItems.length,
      matchingCustomer: result.data.matchingCustomer?.displayName || 'None'
    });

    return { success: true, data: result.data };

  } catch (error) {
    console.error('Error calling analyze-email:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * Call the export-order-to-erp Supabase edge function
 */
function callExportOrderToERP(orderData: OrderData): OrderResult {
  try {
    console.log('Calling export-order-to-erp endpoint');

    const response = UrlFetchApp.fetch(`${SUPABASE_URL}/functions/v1/export-order-to-erp`, {
      method: 'post',
      headers: {
        'Authorization': `Bearer ${HARDCODED_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      payload: JSON.stringify({ orderData: orderData })
    });

    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();

    console.log('Export-order response code:', responseCode);
    console.log('Export-order response:', responseText);

    if (responseCode !== 200) {
      throw new Error(`HTTP ${responseCode}: ${responseText}`);
    }

    const result = JSON.parse(responseText);
    
    if (!result.success) {
      throw new Error(result.error || 'Order creation failed');
    }

    return result;

  } catch (error) {
    console.error('Error calling export-order-to-erp:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * Create loading card
 */
function createLoadingCard(): GoogleAppsScript.Card_Service.Card {
  return CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader()
      .setTitle('Frootful')
      .setSubtitle('Analyzing Email...'))
    .addSection(CardService.newCardSection()
      .addWidget(CardService.newTextParagraph()
        .setText('🔍 Analyzing email content...\n📊 Matching customers and items...\n⏳ Please wait...'))
      .addWidget(CardService.newButtonSet()
        .addButton(CardService.newTextButton()
          .setText('Extract Order Details')
          .setOnClickAction(CardService.newAction()
            .setFunctionName('extractEmailContent')))))
    .build();
}

/**
 * Create analysis result card
 */
function createAnalysisResultCard(data: AnalysisData): GoogleAppsScript.Card_Service.Card {
  const cardBuilder = CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader()
      .setTitle('Frootful')
      .setSubtitle('Order Analysis Results'));

  // Email metadata section
  const emailSection = CardService.newCardSection()
    .setHeader('📧 Email Details')
    .addWidget(CardService.newKeyValue()
      .setTopLabel('From')
      .setContent(data.email.from))
    .addWidget(CardService.newKeyValue()
      .setTopLabel('Subject')
      .setContent(data.email.subject))
    .addWidget(CardService.newKeyValue()
      .setTopLabel('Date')
      .setContent(new Date(data.email.date).toLocaleDateString()));

  // Add delivery date if found
  if (data.requestedDeliveryDate) {
    emailSection.addWidget(CardService.newKeyValue()
      .setTopLabel('Requested Delivery')
      .setContent(data.requestedDeliveryDate));
  }

  cardBuilder.addSection(emailSection);

  // Customer section
  const customerSection = CardService.newCardSection()
    .setHeader('👤 Customer Information');

  if (data.matchingCustomer) {
    customerSection
      .addWidget(CardService.newKeyValue()
        .setTopLabel('Matched Customer')
        .setContent(`${data.matchingCustomer.displayName} (${data.matchingCustomer.number})`))
      .addWidget(CardService.newKeyValue()
        .setTopLabel('Email')
        .setContent(data.matchingCustomer.email));
  } else {
    customerSection.addWidget(CardService.newTextParagraph()
      .setText('⚠️ No matching customer found. You may need to create a new customer or check the email address.'));
  }

  // Customer selection dropdown
  if (data.customers.length > 0) {
    const customerOptions = data.customers.map(customer => 
      CardService.newSelectionInput()
        .setType(CardService.SelectionInputType.DROPDOWN)
        .setFieldName('customer')
        .addItem(customer.displayName, customer.number, data.matchingCustomer?.number === customer.number)
    );

    if (customerOptions.length > 0) {
      customerSection.addWidget(customerOptions[0]);
    }
  }

  cardBuilder.addSection(customerSection);

  // Items section
  if (data.analyzedItems.length > 0) {
    const itemsSection = CardService.newCardSection()
      .setHeader(`📦 Found ${data.analyzedItems.length} Items`);

    data.analyzedItems.forEach((item, index) => {
      const itemText = item.matchedItem 
        ? `${item.itemName} (Qty: ${item.quantity})\n→ Matched: ${item.matchedItem.displayName}\n→ Price: $${item.matchedItem.unitPrice}`
        : `${item.itemName} (Qty: ${item.quantity})\n⚠️ No matching item found`;

      itemsSection.addWidget(CardService.newKeyValue()
        .setTopLabel(`Item ${index + 1}`)
        .setContent(itemText));
    });

    cardBuilder.addSection(itemsSection);
  }

  // Action buttons
  const actionSection = CardService.newCardSection();

  if (data.matchingCustomer && data.analyzedItems.some(item => item.matchedItem)) {
    actionSection.addWidget(CardService.newButtonSet()
      .addButton(CardService.newTextButton()
        .setText('Create ERP Order')
        .setOnClickAction(CardService.newAction()
          .setFunctionName('createERPOrder'))
        .setTextButtonStyle(CardService.TextButtonStyle.FILLED)));
  }

  actionSection.addWidget(CardService.newButtonSet()
    .addButton(CardService.newTextButton()
      .setText('Open Dashboard')
      .setOpenLink(CardService.newOpenLink()
        .setUrl('https://frootful.ai/dashboard'))));

  cardBuilder.addSection(actionSection);

  return cardBuilder.build();
}

/**
 * Create order success card
 */
function createOrderSuccessCard(orderResult: OrderResult): GoogleAppsScript.Card_Service.Card {
  const cardBuilder = CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader()
      .setTitle('Frootful')
      .setSubtitle('Order Created Successfully! ✅'));

  const successSection = CardService.newCardSection()
    .addWidget(CardService.newKeyValue()
      .setTopLabel('Order Number')
      .setContent(orderResult.orderNumber || 'Unknown'))
    .addWidget(CardService.newKeyValue()
      .setTopLabel('Items Added')
      .setContent(String(orderResult.addedItems?.length || 0)));

  if (orderResult.requestedDeliveryDate) {
    successSection.addWidget(CardService.newKeyValue()
      .setTopLabel('Delivery Date')
      .setContent(orderResult.requestedDeliveryDate));
  }

  if (orderResult.message) {
    successSection.addWidget(CardService.newTextParagraph()
      .setText(orderResult.message));
  }

  cardBuilder.addSection(successSection);

  // Action buttons
  const actionSection = CardService.newCardSection();

  if (orderResult.deepLink) {
    actionSection.addWidget(CardService.newButtonSet()
      .addButton(CardService.newTextButton()
        .setText('View Order in BC')
        .setOpenLink(CardService.newOpenLink()
          .setUrl(orderResult.deepLink))));
  }

  actionSection.addWidget(CardService.newButtonSet()
    .addButton(CardService.newTextButton()
      .setText('Back to Gmail')
      .setOnClickAction(CardService.newAction()
        .setFunctionName('onHomepage'))));

  cardBuilder.addSection(actionSection);

  return cardBuilder.build();
}

/**
 * Create error card
 */
function createErrorCard(message: string): GoogleAppsScript.Card_Service.Card {
  return CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader()
      .setTitle('Frootful')
      .setSubtitle('Error ❌'))
    .addSection(CardService.newCardSection()
      .addWidget(CardService.newTextParagraph()
        .setText(`❌ ${message}`))
      .addWidget(CardService.newButtonSet()
        .addButton(CardService.newTextButton()
          .setText('Try Again')
          .setOnClickAction(CardService.newAction()
            .setFunctionName('onGmailMessage')))))
    .build();
}

/**
 * Create error response
 */
function createErrorResponse(message: string): GoogleAppsScript.Card_Service.ActionResponse {
  const errorCard = createErrorCard(message);
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().pushCard(errorCard))
    .build();
}

/**
 * Compose trigger - when composing emails
 */
function onGmailCompose(e: GoogleAppsScript.Addons.EventObject): GoogleAppsScript.Card_Service.Card[] {
  console.log('Frootful: Gmail compose opened');
  
  const card = CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader()
      .setTitle('Frootful')
      .setSubtitle('Compose Assistant'))
    .addSection(CardService.newCardSection()
      .addWidget(CardService.newTextParagraph()
        .setText('Frootful can help you create orders from received emails. Open an email with order information to get started.'))
      .addWidget(CardService.newButtonSet()
        .addButton(CardService.newTextButton()
          .setText('Open Dashboard')
          .setOpenLink(CardService.newOpenLink()
            .setUrl('https://frootful.ai/dashboard')))))
    .build();

  return [card];
}