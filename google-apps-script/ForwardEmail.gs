/**
 * Google Apps Script to forward emails to Frootful Edge Function
 *
 * Setup Instructions:
 * 1. Go to script.google.com
 * 2. Create a new project
 * 3. Copy this code into the Code.gs file
 * 4. Update EDGE_FUNCTION_URL with your actual Supabase URL
 * 5. Update SUPABASE_ANON_KEY with your anon key (or service role key for production)
 * 6. Run the function manually or set up a trigger
 *
 * Required OAuth Scopes:
 * - https://www.googleapis.com/auth/gmail.readonly
 * - https://www.googleapis.com/auth/script.external_request
 */

// ============================================
// CONFIGURATION - UPDATE THESE VALUES
// ============================================

const EDGE_FUNCTION_URL = 'https://your-project-ref.supabase.co/functions/v1/process-forwarded-email';
const SUPABASE_ANON_KEY = 'your-anon-key-here';

// ============================================
// MAIN FUNCTION
// ============================================

/**
 * Forward a specific email to the Edge Function
 *
 * Usage:
 * - Run manually from Apps Script editor
 * - Call from a time-based trigger
 * - Call from Gmail addon UI
 *
 * @param {string} messageId - Gmail message ID (optional, will use first unread if not provided)
 */
function forwardEmailToEdgeFunction(messageId) {
  console.log('=== Starting forwardEmailToEdgeFunction ===');
  console.log('Message ID provided:', messageId || 'none (will find first unread)');

  try {
    // Get the email message
    let message;

    if (messageId) {
      // Use provided message ID
      console.log('Fetching message by ID:', messageId);
      message = GmailApp.getMessageById(messageId);

      if (!message) {
        console.error('Message not found with ID:', messageId);
        throw new Error('Message not found');
      }
    } else {
      // Get first unread message as test
      console.log('Searching for first unread message...');
      const threads = GmailApp.search('is:unread', 0, 1);

      if (threads.length === 0) {
        console.log('No unread messages found');
        return { success: false, message: 'No unread messages found' };
      }

      const thread = threads[0];
      const messages = thread.getMessages();
      message = messages[0];
      console.log('Found message with subject:', message.getSubject());
    }

    // Extract email data
    console.log('=== Extracting Email Data ===');
    const emailData = extractEmailData(message);

    console.log('Email subject:', emailData.subject);
    console.log('Email from:', emailData.from);
    console.log('Email to:', emailData.to);
    console.log('Email date:', emailData.date);
    console.log('Attachment count:', emailData.attachments.length);
    console.log('Plain text length:', emailData.plainText?.length || 0);
    console.log('HTML body length:', emailData.htmlBody?.length || 0);

    // Send to Edge Function
    console.log('=== Calling Edge Function ===');
    console.log('URL:', EDGE_FUNCTION_URL);

    const response = callEdgeFunction(emailData);

    console.log('=== Edge Function Response ===');
    console.log('Response code:', response.getResponseCode());
    console.log('Response body:', response.getContentText());

    const responseData = JSON.parse(response.getContentText());
    console.log('Parsed response:', JSON.stringify(responseData, null, 2));

    if (responseData.success) {
      console.log('✓ Email forwarded successfully!');
      return { success: true, data: responseData };
    } else {
      console.error('✗ Edge function returned error:', responseData.error);
      return { success: false, error: responseData.error };
    }

  } catch (error) {
    console.error('=== Error in forwardEmailToEdgeFunction ===');
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    throw error;
  }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Extract all relevant data from a Gmail message
 */
function extractEmailData(message) {
  console.log('Extracting data from message...');

  const messageId = message.getId();
  const threadId = message.getThread().getId();
  const subject = message.getSubject();
  const from = message.getFrom();
  const to = message.getTo();
  const date = message.getDate().toISOString();
  const plainText = message.getPlainBody();
  const htmlBody = message.getBody();

  // Get user email (for associating with Frootful account)
  const userEmail = Session.getActiveUser().getEmail();

  console.log('Message ID:', messageId);
  console.log('Thread ID:', threadId);
  console.log('User email:', userEmail);

  // Extract attachments
  console.log('Extracting attachments...');
  const gmailAttachments = message.getAttachments();
  const attachments = gmailAttachments.map((attachment, index) => {
    console.log(`Processing attachment ${index + 1}:`, attachment.getName());

    return {
      name: attachment.getName(),
      mimeType: attachment.getContentType(),
      size: attachment.getSize(),
      // Convert to base64 for transmission
      data: Utilities.base64Encode(attachment.getBytes()),
    };
  });

  console.log('Extracted', attachments.length, 'attachments');

  // Get labels
  const thread = message.getThread();
  const labels = thread.getLabels().map(label => label.getName());
  console.log('Labels:', labels.join(', '));

  return {
    messageId,
    threadId,
    from,
    to,
    subject,
    date,
    plainText,
    htmlBody,
    body: plainText || htmlBody, // Prefer plain text
    attachments,
    labels,
    userId: userEmail, // Use email as user identifier
  };
}

/**
 * Call the Supabase Edge Function with email data
 */
function callEdgeFunction(emailData) {
  console.log('Preparing Edge Function request...');
  console.log('Payload size:', JSON.stringify(emailData).length, 'bytes');

  const options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'apikey': SUPABASE_ANON_KEY,
    },
    payload: JSON.stringify(emailData),
    muteHttpExceptions: true, // Don't throw on non-200 responses
  };

  console.log('Making HTTP request...');
  console.log('Headers:', JSON.stringify(options.headers, null, 2));

  const response = UrlFetchApp.fetch(EDGE_FUNCTION_URL, options);

  console.log('Request complete');
  return response;
}

// ============================================
// TEST FUNCTIONS
// ============================================

/**
 * Test function - forward the most recent unread email
 * Run this from the Apps Script editor to test
 */
function testForwardLatestEmail() {
  console.log('=== TEST: Forwarding latest unread email ===');
  const result = forwardEmailToEdgeFunction();
  console.log('Test result:', JSON.stringify(result, null, 2));
  return result;
}

/**
 * Test function - forward a specific email by ID
 * Replace 'your-message-id-here' with an actual Gmail message ID
 */
function testForwardSpecificEmail() {
  console.log('=== TEST: Forwarding specific email ===');
  const messageId = 'your-message-id-here'; // Replace with actual message ID
  const result = forwardEmailToEdgeFunction(messageId);
  console.log('Test result:', JSON.stringify(result, null, 2));
  return result;
}

/**
 * Test function - log details about latest email without sending
 */
function testInspectLatestEmail() {
  console.log('=== TEST: Inspecting latest email ===');

  const threads = GmailApp.search('is:unread', 0, 1);

  if (threads.length === 0) {
    console.log('No unread messages found');
    return;
  }

  const message = threads[0].getMessages()[0];
  const emailData = extractEmailData(message);

  console.log('=== Email Data ===');
  console.log(JSON.stringify(emailData, null, 2));

  return emailData;
}

// ============================================
// TRIGGER SETUP (Optional)
// ============================================

/**
 * Create a time-based trigger to check for new emails every 5 minutes
 * Run this once to set up automatic forwarding
 */
function createTimeTrigger() {
  // Delete existing triggers first
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => ScriptApp.deleteTrigger(trigger));

  // Create new trigger
  ScriptApp.newTrigger('forwardEmailToEdgeFunction')
    .timeBased()
    .everyMinutes(5)
    .create();

  console.log('Time-based trigger created: runs every 5 minutes');
}

/**
 * Delete all triggers
 */
function deleteAllTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => ScriptApp.deleteTrigger(trigger));
  console.log('All triggers deleted');
}
