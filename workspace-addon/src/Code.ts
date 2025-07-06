/**
 * Frootful Gmail Workspace Add-on
 * Extracts order information from Gmail messages and integrates with Business Central
 */

// Configuration
const SUPABASE_URL = 'https://zkglvdfppodwlgzhfgqs.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InprZ2x2ZGZwcG9kd2xnemhmZ3FzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDYxOTQ5MjgsImV4cCI6MjA2MTc3MDkyOH0.qzyywdy4k6A0DucETls_YT32YvAxuwDV6eBFjs89BRg';

// Hardcoded access token - replace with your actual token
const HARDCODED_ACCESS_TOKEN = 'eyJhbGciOiJIUzI1NiIsImtpZCI6IkRnTGVDbC8yaEppQ0l0MFQiLCJ0eXAiOiJKV1QifQ.eyJpc3MiOiJodHRwczovL3prZ2x2ZGZwcG9kd2xnemhmZ3FzLnN1cGFiYXNlLmNvL2F1dGgvdjEiLCJzdWIiOiIxYTgyZDIxYS1lNTY3LTQ0YWItYmFhZi1iYzQwMGE4MmVmNzYiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzUxODM1MTA3LCJpYXQiOjE3NTE4MzE1MDcsImVtYWlsIjoia29uc3RhbnRpbi5ub3BsZUBnbWFpbC5jb20iLCJwaG9uZSI6IiIsImFwcF9tZXRhZGF0YSI6eyJwcm92aWRlciI6Imdvb2dsZSIsInByb3ZpZGVycyI6WyJnb29nbGUiXX0sInVzZXJfbWV0YWRhdGEiOnsiYXZhdGFyX3VybCI6Imh0dHBzOi8vbGgzLmdvb2dsZXVzZXJjb250ZW50LmNvbS9hL0FDZzhvY0pGdWZPNVpHX1JIaVRrZVE5UGpNSVQ1T2N4ZHc1RHRsRVVhYmY0UWNaRWNabUVwQTZsPXM5Ni1jIiwiZW1haWwiOiJrb25zdGFudGluLm5vcGxlQGdtYWlsLmNvbSIsImVtYWlsX3ZlcmlmaWVkIjp0cnVlLCJmdWxsX25hbWUiOiJLb25zdGFudGluIE5vcGxlIiwiaXNzIjoiaHR0cHM6Ly9hY2NvdW50cy5nb29nbGUuY29tIiwibmFtZSI6IktvbnN0YW50aW4gTm9wbGUiLCJwaG9uZV92ZXJpZmllZCI6ZmFsc2UsInBpY3R1cmUiOiJodHRwczovL2xoMy5nb29nbGV1c2VyY29udGVudC5jb20vYS9BQ2c4b2NKRnVmTzVaR19SSGlUa2VROVBqTUlUNU9jeGR3NUR0bEVVYWJmNFFjWkVjWm1FcEE2bD1zOTYtYyIsInByb3ZpZGVyX2lkIjoiMTAwNDAyNzk1MTYwNDUxOTQxMzAzIiwic3ViIjoiMTAwNDAyNzk1MTYwNDUxOTQxMzAzIn0sInJvbGUiOiJhdXRoZW50aWNhdGVkIiwiYWFsIjoiYWFsMSIsImFtciI6W3sibWV0aG9kIjoib2F1dGgiLCJ0aW1lc3RhbXAiOjE3NTE4MjMwNDd9XSwic2Vzc2lvbl9pZCI6IjA0MGZkY2Q0LTVmZGMtNGRlMy05MWUxLTMwZmFjNTg5MTY3MSIsImlzX2Fub255bW91cyI6ZmFsc2V9.d_jM9owJLLJLovA2BIbGuU1uVnpRIuXaVXSc4HhzBFs';

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

    // Show loading card with extract button
    const loadingCard = createLoadingCard();
    
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

    // Store analysis data in PropertiesService
    storeAnalysisData(analysisResult.data!);

    // Create result card with analysis data and form
    const resultCard = createAnalysisFormCard(analysisResult.data!);
    
    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().pushCard(resultCard))
      .build();

  } catch (error) {
    console.error('Error in extractEmailContent:', error);
    return createErrorResponse('Failed to extract email content: ' + String(error));
  }
}

/**
 * Action handler for creating ERP order from form data
 */
function createERPOrder(e: GoogleAppsScript.Addons.EventObject): GoogleAppsScript.Card_Service.ActionResponse {
  console.log('Frootful: Create ERP order action triggered');
  
  try {
    // Get stored analysis data
    const analysisData = getStoredAnalysisData();
    if (!analysisData) {
      return createErrorResponse('No analysis data found. Please extract email content first.');
    }

    // Get form data
    const formInputs = e.commonEventObject?.formInputs;
    console.log('Form inputs:', formInputs);

    if (!formInputs) {
      return createErrorResponse('No form data received');
    }

    // Get customer selection
    const customerNumber = formInputs['customer']?.stringInputs?.value?.[0];
    if (!customerNumber) {
      return createErrorResponse('Please select a customer');
    }

    // Get delivery date
    const deliveryDate = formInputs['deliveryDate']?.stringInputs?.value?.[0];

    // Build order items from form inputs
    const orderItems: Array<{itemName: string; quantity: number; price?: number}> = [];
    
    // Process each analyzed item
    analysisData.analyzedItems.forEach((analyzedItem, index) => {
      const itemKey = `item_${index}`;
      const quantityKey = `quantity_${index}`;
      
      const selectedItemNumber = formInputs[itemKey]?.stringInputs?.value?.[0];
      const quantity = parseInt(formInputs[quantityKey]?.stringInputs?.value?.[0] || '0');
      
      if (selectedItemNumber && quantity > 0) {
        // Find the selected item to get its price
        const selectedItem = analysisData.items.find(item => item.number === selectedItemNumber);
        
        orderItems.push({
          itemName: selectedItemNumber,
          quantity: quantity,
          price: selectedItem?.unitPrice
        });
      }
    });

    if (orderItems.length === 0) {
      return createErrorResponse('Please select at least one item with quantity > 0');
    }

    const orderData: OrderData = {
      customerNumber: customerNumber,
      items: orderItems
    };

    // Add delivery date if provided
    if (deliveryDate) {
      orderData.requestedDeliveryDate = deliveryDate;
    }

    console.log('Creating order with data:', orderData);

    // Call export-order-to-erp endpoint
    const orderResult = callExportOrderToERP(orderData);
    
    if (!orderResult.success) {
      return createErrorResponse(orderResult.error || 'Order creation failed');
    }

    // Clear stored data after successful order creation
    clearStoredAnalysisData();

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
 * Store analysis data in PropertiesService
 */
function storeAnalysisData(data: AnalysisData): void {
  try {
    const properties = PropertiesService.getScriptProperties();
    properties.setProperties({
      'frootful_analysis_data': JSON.stringify(data),
      'frootful_analysis_timestamp': new Date().getTime().toString()
    });
    console.log('Analysis data stored in PropertiesService');
  } catch (error) {
    console.error('Error storing analysis data:', error);
  }
}

/**
 * Get stored analysis data from PropertiesService
 */
function getStoredAnalysisData(): AnalysisData | null {
  try {
    const properties = PropertiesService.getScriptProperties();
    const dataString = properties.getProperty('frootful_analysis_data');
    const timestamp = properties.getProperty('frootful_analysis_timestamp');
    
    if (!dataString) {
      console.log('No analysis data found in PropertiesService');
      return null;
    }

    // Check if data is too old (older than 1 hour)
    if (timestamp) {
      const dataAge = new Date().getTime() - parseInt(timestamp);
      const oneHour = 60 * 60 * 1000;
      if (dataAge > oneHour) {
        console.log('Analysis data is too old, clearing it');
        clearStoredAnalysisData();
        return null;
      }
    }

    const data = JSON.parse(dataString) as AnalysisData;
    console.log('Analysis data retrieved from PropertiesService');
    return data;
  } catch (error) {
    console.error('Error retrieving analysis data:', error);
    return null;
  }
}

/**
 * Clear stored analysis data from PropertiesService
 */
function clearStoredAnalysisData(): void {
  try {
    const properties = PropertiesService.getScriptProperties();
    properties.deleteProperty('frootful_analysis_data');
    properties.deleteProperty('frootful_analysis_timestamp');
    console.log('Analysis data cleared from PropertiesService');
  } catch (error) {
    console.error('Error clearing analysis data:', error);
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

// For redirect with the url for business dynamics
function createTinyUrl(originalUrl: string): string {
  const apiToken = 'M8UaNSpBERlsratt8jiaEbo9VQ276NDy2Am07giR3VYm8PsHhiwqjuqy1ch9'; // Replace with your own if needed
  

  const url = 'https://api.tinyurl.com/create?api_token=' + encodeURIComponent(apiToken);

  const payload = {
    url: originalUrl,
    domain: 'tinyurl.com',
    description: 'Frootful-generated link'
  };

  const options: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    const data = JSON.parse(response.getContentText());

    if (response.getResponseCode() === 200 && data.data?.tiny_url) {
      return data.data.tiny_url;
    } else {
      console.error('TinyURL API error:', data);
      return originalUrl;
    }
  } catch (err) {
    console.error('Error calling TinyURL API:', err);
    return originalUrl;
  }
}

/**
 * Create loading card
 */
function createLoadingCard(): GoogleAppsScript.Card_Service.Card {

  // const TEST_LINK = 'https://businesscentral.dynamics.com/979cd3a6-6b9e-4b33-a012-feb1968a393a/Production/?company=CRONUS%20USA,%20Inc.&page=42&filter=%27Sales%20Header%27.%27No.%27%20IS%20%27S-ORD101054%27';
  // const TEST_LINK = "https://businesscentral.dynamics.com/979cd3a6-6b9e-4b33-a012-feb1968a393a/Production/?company=CRONUS%20USA,%20Inc.";
  // const TEST_LINK = "https://tinyurl.com/yc4jsact";
  // console.log('This is TEST_LINK: ', TEST_LINK);
  // const TINYURL_LINK = createTinyUrl(TEST_LINK);
  // console.log('This is the TINY URL LINK: ', TINYURL_LINK);
  return CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader()
      .setTitle('Frootful')
      .setSubtitle('Ready to Analyze'))
    .addSection(CardService.newCardSection()
      .addWidget(CardService.newTextParagraph()
        .setText('📧 Ready to extract order information from this email.\n\n🔍 Click below to analyze the email content and match customers and items.'))
      .addWidget(CardService.newButtonSet()
        .addButton(CardService.newTextButton()
          .setText('Extract Order Details')
          .setOnClickAction(CardService.newAction()
            .setFunctionName('extractEmailContent'))
          .setTextButtonStyle(CardService.TextButtonStyle.FILLED)))
      // Testing only remove later
      // .addWidget(CardService.newButtonSet()
      //   .addButton(CardService.newTextButton()
      //     .setText('View Order in Business Central')
      //     .setOpenLink(CardService.newOpenLink()
      //       .setUrl(TINYURL_LINK))
      //     .setTextButtonStyle(CardService.TextButtonStyle.FILLED)))
        
        
        )
    .build();
}

/**
 * Create analysis form card with dropdowns and inputs
 */
function createAnalysisFormCard(data: AnalysisData): GoogleAppsScript.Card_Service.Card {
  const cardBuilder = CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader()
      .setTitle('Frootful')
      .setSubtitle('Create Order'));

  // Email metadata section
  const emailSection = CardService.newCardSection()
    .setHeader('📧 Email Details')
    .addWidget(CardService.newKeyValue()
      .setTopLabel('From')
      .setContent(data.email.from))
    .addWidget(CardService.newKeyValue()
      .setTopLabel('Subject')
      .setContent(data.email.subject));

  cardBuilder.addSection(emailSection);

  // Customer selection dropdown
  const customerSection = CardService.newCardSection()
    .setHeader('👤 Select Customer');

  const customerDropdown = CardService.newSelectionInput()
    .setType(CardService.SelectionInputType.DROPDOWN)
    .setTitle('Customer')
    .setFieldName('customer');

  // Add customers to dropdown
  data.customers.forEach(customer => {
    const isMatched = data.matchingCustomer?.number === customer.number;
    const displayText = isMatched 
      ? `✅ ${customer.displayName} (${customer.number})`
      : `${customer.displayName} (${customer.number})`;
    
    customerDropdown.addItem(displayText, customer.number, isMatched);
  });

  customerSection.addWidget(customerDropdown);
  cardBuilder.addSection(customerSection);

  // Delivery date picker
  if (data.requestedDeliveryDate) {
    const deliverySection = CardService.newCardSection()
      .setHeader('📅 Delivery Date');

    const datePicker = CardService.newDatePicker()
      .setTitle('Requested Delivery Date')
      .setFieldName('deliveryDate');

    // Pre-populate with extracted date
    try {
      const deliveryDate = new Date(data.requestedDeliveryDate);
      datePicker.setValueInMsSinceEpoch(deliveryDate.getTime());
    } catch (error) {
      console.warn('Could not parse delivery date:', data.requestedDeliveryDate);
    }

    deliverySection.addWidget(datePicker);
    cardBuilder.addSection(deliverySection);
  }

  // Items section with dropdowns and quantity inputs
  if (data.analyzedItems.length > 0) {
    const itemsSection = CardService.newCardSection()
      .setHeader(`📦 Order Items (${data.analyzedItems.length} found)`);

    data.analyzedItems.forEach((analyzedItem, index) => {
      // Item dropdown
      const itemDropdown = CardService.newSelectionInput()
        .setType(CardService.SelectionInputType.DROPDOWN)
        .setTitle(`Item ${index + 1}: ${analyzedItem.itemName}`)
        .setFieldName(`item_${index}`);

      // Add "No selection" option
      itemDropdown.addItem('-- Select Item --', '', false);

      // Add all available items
      data.items.forEach(item => {
        const isMatched = analyzedItem.matchedItem?.number === item.number;
        const displayText = `${item.displayName} ($${item.unitPrice})`;
        
        itemDropdown.addItem(displayText, item.number, isMatched);
      });

      itemsSection.addWidget(itemDropdown);

      // Quantity input
      const quantityInput = CardService.newTextInput()
        .setTitle(`Quantity for Item ${index + 1}`)
        .setFieldName(`quantity_${index}`)
        .setValue(analyzedItem.quantity.toString())
        .setHint('Enter quantity (number)');

      itemsSection.addWidget(quantityInput);

      // Add separator between items (except for last item)
      if (index < data.analyzedItems.length - 1) {
        itemsSection.addWidget(CardService.newTextParagraph().setText('---'));
      }
    });

    cardBuilder.addSection(itemsSection);
  }

  // Action buttons section
  const actionSection = CardService.newCardSection()
    .addWidget(CardService.newButtonSet()
      .addButton(CardService.newTextButton()
        .setText('Create ERP Order')
        .setOnClickAction(CardService.newAction()
          .setFunctionName('createERPOrder'))
        .setTextButtonStyle(CardService.TextButtonStyle.FILLED)))
    .addWidget(CardService.newButtonSet()
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
    .addWidget(CardService.newTextParagraph()
      .setText('🎉 Your order has been successfully created in Business Central!'))
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
      .setText(`📝 ${orderResult.message}`));
  }

  cardBuilder.addSection(successSection);

  // Action buttons
  const actionSection = CardService.newCardSection();

  console.log('This is the deepLink: ', orderResult.deepLink);

  if (orderResult.deepLink) {
    const tinyUrlLink = createTinyUrl(orderResult.deepLink);
    console.log('This is the tiny url link of the real order created in MS ERP: ', tinyUrlLink);
    // const safeLink = encodeURI(orderResult.deepLink);
    // console.log('This is safeLink: ', safeLink);
    actionSection.addWidget(CardService.newButtonSet()
      .addButton(CardService.newTextButton()
        .setText('View Order in Business Central')
        .setOpenLink(CardService.newOpenLink()
          .setUrl(tinyUrlLink))
        .setTextButtonStyle(CardService.TextButtonStyle.FILLED)));
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