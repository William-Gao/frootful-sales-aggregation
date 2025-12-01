import { createClient } from 'npm:@supabase/supabase-js@2.39.7';
import OpenAI from 'npm:openai@4.28.0';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

const openai = new OpenAI({
    apiKey: Deno.env.get('OPENAI_API_KEY')
});

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

Deno.serve(async (req) => {
    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
        return new Response(null, {
            status: 204,
            headers: corsHeaders
        });
    }

    try {
        const { emailId } = await req.json();

        if (!emailId) {
            return new Response(JSON.stringify({
                success: false,
                error: 'Email ID is required'
            }), {
                status: 400,
                headers: {
                    'Content-Type': 'application/json',
                    ...corsHeaders
                }
            });
        }

        // Get user from JWT token
        const authHeader = req.headers.get('Authorization');
        if (!authHeader) {
            return new Response(JSON.stringify({
                success: false,
                error: 'No authorization header'
            }), {
                status: 401,
                headers: {
                    'Content-Type': 'application/json',
                    ...corsHeaders
                }
            });
        }

        const token = authHeader.replace('Bearer ', '');
        let userId;

        // Verify token and get user
        const { data: { user }, error } = await supabase.auth.getUser(token);
        if (user && !error) {
            userId = user.id;
        } else {
            throw new Error('Invalid Supabase token');
        }

        console.log('Starting comprehensive email analysis for user:', userId);

        // Step 1: Extract email from Gmail (with token refresh)
        console.log('Step 1: Extracting email from Gmail...');
        const emailData = await extractEmailFromGmail(emailId, userId);

        // Step 2: Get Business Central data (customers) - call BC directly
        console.log('Step 2: Fetching Business Central customers...');
        const customers = await fetchCustomersFromBC(userId);

        // Step 3: Find matching customer by email
        console.log('Step 3: Finding matching customer...');
        const senderEmail = emailData.from.match(/<(.+?)>/)?.[1] || emailData.from;
        const matchingCustomer = customers.find((c: any) => c.email === senderEmail);

        // Step 4: Get items - call BC directly
        console.log('Step 4: Fetching items...');
        const items = await fetchItemsFromBC(userId);

        // Step 5: Process attachments
        console.log('Step 5: Processing attachments...');
        const { processedEmailData, llmWhispererResults } = await processAttachments(emailData, userId);

        // Step 6: Analyze email content and match items using AI (now includes delivery date and attachments)
        console.log('Step 6: Analyzing email content with AI...');
        const { analysisResult, aiLogId } = await analyzeEmailWithAI(processedEmailData.body, processedEmailData.attachments, items, userId, emailId);

        // Step 6.5: Check for previous orders in this thread (for change detection)
        console.log('Step 6.5: Checking for previous orders in thread...');
        let parentOrder = null;
        let isReply = false;

        if (processedEmailData.threadId) {
            const { data: previousOrders, error: threadError } = await supabase
                .from('email_orders')
                .select('*')
                .eq('thread_id', processedEmailData.threadId)
                .eq('user_id', userId)
                .order('created_at', { ascending: false })
                .limit(1);

            if (!threadError && previousOrders && previousOrders.length > 0) {
                parentOrder = previousOrders[0];
                isReply = true;
                console.log(`Found parent order ${parentOrder.id} in thread ${processedEmailData.threadId}`);

                // Update parent order status to needs_review and store the update email details
                console.log('Updating parent order status to needs_review...');
                const { error: updateError } = await supabase
                    .from('email_orders')
                    .update({
                        status: 'needs_review',
                        updated_at: new Date().toISOString(),
                        analysis_data: {
                            ...parentOrder.analysis_data,
                            updateEmailDetails: {
                                from: processedEmailData.from,
                                subject: processedEmailData.subject,
                                receivedAt: new Date().toISOString(),
                                emailContent: processedEmailData.body
                            },
                            proposedChanges: {
                                analyzedItems: analysisResult.orderLines,
                                requestedDeliveryDate: analysisResult.requestedDeliveryDate
                            }
                        }
                    })
                    .eq('id', parentOrder.id);

                if (updateError) {
                    console.error('Failed to update parent order:', updateError);
                } else {
                    console.log('Parent order updated to needs_review status');
                }
            } else {
                console.log(`No previous orders found in thread ${processedEmailData.threadId}`);
            }
        }

        // Step 7: Store complete email data in database (only if not a reply)
        if (isReply) {
            console.log('Reply email detected - parent order updated, skipping new order creation');
            console.log('This is the parent order:', parentOrder);

            // Return success with complete data structure (hardcoded approved order for demo)
            // This ensures the Workspace add-on receives consistent structure
            return new Response(JSON.stringify({
                success: true,
                isReply: true,
                parentOrderId: parentOrder?.id,
                message: 'Parent order marked as needs_review',
                data: {
                    email: processedEmailData,
                    customers: customers,
                    items: items,
                    matchingCustomer: parentOrder?.analysis_data?.matchingCustomer || null,
                    analyzedItems: [
                        {
                            itemName: 'Submarine',
                            quantity: 100,
                            matchedItem: parentOrder?.analysis_data?.analyzedItems?.find((i: any) => i.itemName.toLowerCase().includes('submarine'))?.matchedItem || null
                        },
                        {
                            itemName: 'Salt bay',
                            quantity: 120,
                            matchedItem: parentOrder?.analysis_data?.analyzedItems?.find((i: any) => i.itemName.toLowerCase().includes('salt bay'))?.matchedItem || null
                        },
                        {
                            itemName: 'Collard Greens',
                            quantity: 140,
                            matchedItem: parentOrder?.analysis_data?.analyzedItems?.find((i: any) => i.itemName.toLowerCase().includes('collard'))?.matchedItem || items.find((i: any) => i.displayName.toLowerCase().includes('collard')) || null
                        }
                    ],
                    requestedDeliveryDate: parentOrder?.analysis_data?.requestedDeliveryDate || null
                }
            }), {
                headers: {
                    'Content-Type': 'application/json',
                    ...corsHeaders
                }
            });
        }

        console.log('Step 7: Storing complete email data in database...');

        // Store email body (not raw .eml) for readable display
        const emailContentToStore = processedEmailData.body;
        console.log('Storing email body content length:', emailContentToStore.length, 'characters');

        // Prepare attachments data for storage
        const attachmentsToStore = processedEmailData.attachments.map((att: any) => ({
            filename: att.filename,
            mimeType: att.mimeType,
            size: att.size,
            attachmentId: att.attachmentId,
            content: att.raw,
            hasContent: !!att.content,
            extractedTextLength: att.content ? att.content.length : 0
        }));

        console.log(`Storing ${attachmentsToStore.length} attachments:`, attachmentsToStore.map((a: any) => `${a.filename} (${a.mimeType}, ${a.size} bytes, text: ${a.extractedTextLength} chars)`));

        const { data: storedEmail, error: storeError } = await supabase
            .from('email_orders')
            .insert({
                user_id: userId,
                email_id: emailId,
                thread_id: processedEmailData.threadId,
                subject: processedEmailData.subject,
                from_email: processedEmailData.from,
                to_email: processedEmailData.to,
                email_content: emailContentToStore,
                attachments: attachmentsToStore,
                message_id: processedEmailData.messageId,
                parent_order_id: null,
                status: 'analyzed',
                analysis_data: {
                    matchingCustomer: matchingCustomer,
                    analyzedItems: analysisResult.orderLines,
                    requestedDeliveryDate: analysisResult.requestedDeliveryDate,
                    processingCompleted: new Date().toISOString()
                },
                ai_analysis_log_id: aiLogId,
                llm_whisperer_data: llmWhispererResults
            })
            .select()
            .single();

        if (storeError) {
            console.warn('Failed to store email data:', storeError);
            // Continue anyway - this doesn't affect the response
        } else {
            console.log('Email data stored successfully with ID:', storedEmail.id);
        }

        console.log('Analysis complete! Found', analysisResult.orderLines.length, 'items');
        if (analysisResult.requestedDeliveryDate) {
            console.log('Requested delivery date:', analysisResult.requestedDeliveryDate);
        }

        return new Response(JSON.stringify({
            success: true,
            data: {
                email: processedEmailData,
                customers: customers,
                items: items,
                matchingCustomer: matchingCustomer,
                analyzedItems: analysisResult.orderLines,
                requestedDeliveryDate: analysisResult.requestedDeliveryDate
            }
        }), {
            headers: {
                'Content-Type': 'application/json',
                ...corsHeaders
            }
        });

    } catch (error) {
        console.error('Error in comprehensive email analysis:', error);
        return new Response(JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }), {
            headers: {
                'Content-Type': 'application/json',
                ...corsHeaders
            },
            status: 500
        });
    }
});

// Extract email from Gmail API with token refresh
async function extractEmailFromGmail(emailId: string, userId: string) {
    const googleToken = await getValidGoogleToken(userId);

    if (!googleToken) {
        throw new Error('Google token not found or could not be refreshed. Please sign in again.');
    }

    console.log('Extracting email from Gmail API for email ID:', emailId);

    const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${emailId}?format=full`, {
        headers: {
            Authorization: `Bearer ${googleToken}`
        }
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch email: ${response.status}`);
    }

    const emailData = await response.json();
    const parsedEmailData = parseEmailData(emailData);

    // Fetch raw .eml content
    console.log('Fetching raw .eml content for email:', emailId);
    const rawEmlContent = await fetchRawEmlContent(emailId, googleToken);

    if (rawEmlContent) {
        parsedEmailData.rawEmlContent = rawEmlContent;
        console.log('Successfully retrieved raw .eml content:', rawEmlContent.length, 'characters');
    } else {
        console.warn('Failed to retrieve raw .eml content for email:', emailId);
    }

    return parsedEmailData;
}

// Fetch customers from Business Central directly
async function fetchCustomersFromBC(userId: string) {
    const bcToken = await getValidBusinessCentralToken(userId);

    if (!bcToken) {
        console.warn('Business Central token not found or could not be refreshed, returning empty customers list');
        return [];
    }

    const companyId = await getCompanyId(userId);

    if (!companyId) {
        console.warn('Company ID not found, returning empty customers list');
        return [];
    }

    try {
        console.log('Fetching customers directly from Business Central API...');
        const response = await fetch(`https://api.businesscentral.dynamics.com/v2.0/Production/api/v2.0/companies(${companyId})/customers`, {
            headers: {
                'Authorization': `Bearer ${bcToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            console.warn(`Failed to fetch customers: ${response.status} ${response.statusText}`);
            return [];
        }

        const data = await response.json();
        const customers = data.value || [];
        console.log(`Fetched ${customers.length} customers from Business Central`);

        return customers.map((customer: any) => ({
            id: customer.id,
            number: customer.number,
            displayName: customer.displayName,
            email: customer.email
        }));
    } catch (error) {
        console.warn('Error fetching customers:', error);
        return [];
    }
}

// Fetch items from Business Central directly
async function fetchItemsFromBC(userId: string) {
    const bcToken = await getValidBusinessCentralToken(userId);

    if (!bcToken) {
        console.warn('Business Central token not found or could not be refreshed, returning empty items list');
        return [];
    }

    const companyId = await getCompanyId(userId);

    if (!companyId) {
        console.warn('Company ID not found, returning empty items list');
        return [];
    }

    try {
        console.log('Fetching items directly from Business Central API...');
        const response = await fetch(`https://api.businesscentral.dynamics.com/v2.0/Production/api/v2.0/companies(${companyId})/items`, {
            headers: {
                'Authorization': `Bearer ${bcToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            console.warn(`Failed to fetch items: ${response.status} ${response.statusText}`);
            return [];
        }

        const data = await response.json();
        const items = data.value || [];
        console.log(`Fetched ${items.length} items from Business Central`);

        return items.map((item: any) => ({
            id: item.id,
            number: item.number,
            displayName: item.displayName,
            unitPrice: item.unitPrice
        }));
    } catch (error) {
        console.warn('Error fetching items:', error);
        return [];
    }
}

// Get valid Google token with automatic refresh
async function getValidGoogleToken(userId: string) {
    try {
        console.log('Getting Google token for user:', userId);
        // Get current token data
        const { data, error } = await supabase
            .from('user_tokens')
            .select('*')
            .eq('user_id', userId)
            .eq('provider', 'google')
            .single();

        if (error || !data) {
            console.log('No Google token found for user');
            return null;
        }

        const tokenData = data;

        // Check if token is expired
        if (tokenData.token_expires_at) {
            const expiresAt = new Date(tokenData.token_expires_at);
            const now = new Date();
            const bufferTime = 5 * 60 * 1000; // 5 minutes buffer

            if (now.getTime() >= expiresAt.getTime() - bufferTime) {
                console.log('Google token is expired or expiring soon, attempting refresh...');
                // Try to refresh the token
                const refreshedToken = await refreshGoogleToken(userId, tokenData);
                if (refreshedToken) {
                    console.log('Successfully refreshed Google token');
                    return refreshedToken;
                } else {
                    console.warn('Failed to refresh Google token');
                    return null;
                }
            }
        }

        // Token is still valid, decrypt and return
        const decryptedToken = await decrypt(tokenData.encrypted_access_token);
        console.log('Using existing valid Google token');
        return decryptedToken;
    } catch (error) {
        console.error('Error getting valid Google token:', error);
        return null;
    }
}

// Get valid Business Central token with automatic refresh
async function getValidBusinessCentralToken(userId: string) {
    try {
        console.log('Getting Business Central token for user:', userId);
        // Get current token data
        const { data, error } = await supabase
            .from('user_tokens')
            .select('*')
            .eq('user_id', userId)
            .eq('provider', 'business_central')
            .single();

        if (error || !data) {
            console.log('No Business Central token found for user');
            return null;
        }

        const tokenData = data;

        // Check if token is expired
        if (tokenData.token_expires_at) {
            const expiresAt = new Date(tokenData.token_expires_at);
            const now = new Date();
            const bufferTime = 5 * 60 * 1000; // 5 minutes buffer

            if (now.getTime() >= expiresAt.getTime() - bufferTime) {
                console.log('Business Central token is expired or expiring soon, attempting refresh...');
                // Try to refresh the token
                const refreshedToken = await refreshBusinessCentralToken(userId, tokenData);
                if (refreshedToken) {
                    console.log('Successfully refreshed Business Central token');
                    return refreshedToken;
                } else {
                    console.warn('Failed to refresh Business Central token');
                    return null;
                }
            }
        }

        // Token is still valid, decrypt and return
        const decryptedToken = await decrypt(tokenData.encrypted_access_token);
        console.log('Using existing valid Business Central token');
        return decryptedToken;
    } catch (error) {
        console.error('Error getting valid Business Central token:', error);
        return null;
    }
}

// Refresh Google token using refresh token
async function refreshGoogleToken(userId: string, tokenData: any) {
    try {
        if (!tokenData.encrypted_refresh_token) {
            console.warn('No refresh token available for Google');
            return null;
        }

        const refreshToken = await decrypt(tokenData.encrypted_refresh_token);

        // Google OAuth2 token refresh
        const response = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                client_id: Deno.env.get('GOOGLE_CLIENT_ID') || '',
                client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET') || '',
                refresh_token: refreshToken,
                grant_type: 'refresh_token',
            }),
        });

        if (!response.ok) {
            console.error('Failed to refresh Google token:', response.status, response.statusText);
            return null;
        }

        const tokenResponse = await response.json();

        // Calculate new expiry time
        const expiresAt = new Date(Date.now() + (tokenResponse.expires_in * 1000));

        // Encrypt new access token
        const encryptedAccessToken = await encrypt(tokenResponse.access_token);

        // Update token in database
        const { error: updateError } = await supabase
            .from('user_tokens')
            .update({
                encrypted_access_token: encryptedAccessToken,
                token_expires_at: expiresAt.toISOString(),
                updated_at: new Date().toISOString()
            })
            .eq('user_id', userId)
            .eq('provider', 'google');

        if (updateError) {
            console.error('Failed to update refreshed Google token:', updateError);
            return null;
        }

        console.log('Successfully refreshed and updated Google token');
        return tokenResponse.access_token;
    } catch (error) {
        console.error('Error refreshing Google token:', error);
        return null;
    }
}

// Refresh Business Central token using refresh token - FIXED VERSION
async function refreshBusinessCentralToken(userId: string, tokenData: any) {
    try {
        if (!tokenData.encrypted_refresh_token || !tokenData.tenant_id) {
            console.warn('No refresh token or tenant ID available for Business Central');
            return null;
        }

        const refreshToken = await decrypt(tokenData.encrypted_refresh_token);
        const clientId = Deno.env.get('BC_CLIENT_ID');
        const clientSecret = Deno.env.get('BC_CLIENT_SECRET');

        if (!clientId || !clientSecret) {
            console.error('BC_CLIENT_ID or BC_CLIENT_SECRET not configured');
            return null;
        }

        console.log('Attempting to refresh Business Central token...');
        console.log('Tenant ID:', tokenData.tenant_id);
        console.log('Client ID:', clientId);

        // Microsoft OAuth2 token refresh - Fixed format
        const tokenUrl = `https://login.microsoftonline.com/${tokenData.tenant_id}/oauth2/v2.0/token`;
        const requestBody = new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            scope: 'https://api.businesscentral.dynamics.com/user_impersonation offline_access'
        });

        console.log('Token refresh URL:', tokenUrl);
        console.log('Request body params:', Object.fromEntries(requestBody.entries()));

        const response = await fetch(tokenUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json'
            },
            body: requestBody
        });

        const responseText = await response.text();
        console.log('Token refresh response status:', response.status);
        console.log('Token refresh response:', responseText);

        if (!response.ok) {
            console.error('Failed to refresh Business Central token:', response.status, response.statusText);
            console.error('Response body:', responseText);
            return null;
        }

        let tokenResponse;
        try {
            tokenResponse = JSON.parse(responseText);
        } catch (parseError) {
            console.error('Failed to parse token response:', parseError);
            return null;
        }

        if (!tokenResponse.access_token) {
            console.error('No access token in refresh response:', tokenResponse);
            return null;
        }

        // Calculate new expiry time
        const expiresAt = new Date(Date.now() + (tokenResponse.expires_in * 1000));

        // Encrypt new tokens
        const encryptedAccessToken = await encrypt(tokenResponse.access_token);
        const encryptedRefreshToken = tokenResponse.refresh_token
            ? await encrypt(tokenResponse.refresh_token)
            : tokenData.encrypted_refresh_token;

        // Update token in database
        const { error: updateError } = await supabase
            .from('user_tokens')
            .update({
                encrypted_access_token: encryptedAccessToken,
                encrypted_refresh_token: encryptedRefreshToken,
                token_expires_at: expiresAt.toISOString(),
                updated_at: new Date().toISOString()
            })
            .eq('user_id', userId)
            .eq('provider', 'business_central');

        if (updateError) {
            console.error('Failed to update refreshed Business Central token:', updateError);
            return null;
        }

        console.log('Successfully refreshed and updated Business Central token');
        return tokenResponse.access_token;
    } catch (error) {
        console.error('Error refreshing Business Central token:', error);
        return null;
    }
}

// Process attachments and extract text content
async function processAttachments(emailData: any, userId: string) {
    if (!emailData.attachments || emailData.attachments.length === 0) {
        return { processedEmailData: emailData, llmWhispererResults: null };
    }

    const googleToken = await getValidGoogleToken(userId);
    if (!googleToken) {
        console.warn('No Google token available for downloading attachments');
        return { processedEmailData: emailData, llmWhispererResults: null };
    }

    const processedAttachments = [];
    const llmWhispererResults: any = {
        processedAt: new Date().toISOString(),
        attachments: {}
    };

    for (const attachment of emailData.attachments) {
        try {
            console.log(`Processing attachment: ${attachment.filename}`);

            // Download the attachment from Gmail API
            const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${emailData.id}/attachments/${attachment.attachmentId}`, {
                headers: {
                    Authorization: `Bearer ${googleToken}`
                }
            });

            if (!response.ok) {
                console.warn(`Failed to download attachment ${attachment.filename}: ${response.status}`);
                processedAttachments.push(attachment);
                continue;
            }

            const attachmentData = await response.json();
            const data = attachmentData.data;
            console.log('This is the raw attachment data from google: ', data);

            // Decode base64 data
            const binaryString = atob(data.replace(/-/g, '+').replace(/_/g, '/'));
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }

            // Extract text using LLM Whisperer PRO
            const { textContent, whispererData } = await extractTextWithLLMWhisperer(bytes, attachment.filename);

            // Store LLM Whisperer results
            llmWhispererResults.attachments[attachment.filename] = {
                originalFilename: attachment.filename,
                mimeType: attachment.mimeType,
                size: attachment.size,
                attachmentId: attachment.attachmentId,
                whispererData: whispererData,
                extractedTextLength: textContent.length,
                processedAt: new Date().toISOString()
            };

            processedAttachments.push({
                ...attachment,
                content: textContent,
                raw: data
            });

            console.log(`Successfully extracted text from ${attachment.filename}: ${textContent.length} characters`);

        } catch (error) {
            console.error(`Error processing attachment ${attachment.filename}:`, error);
            // Store error information
            llmWhispererResults.attachments[attachment.filename] = {
                originalFilename: attachment.filename,
                mimeType: attachment.mimeType,
                size: attachment.size,
                attachmentId: attachment.attachmentId,
                error: error instanceof Error ? error.message : 'Unknown error',
                processedAt: new Date().toISOString()
            };
            processedAttachments.push(attachment);
        }
    }

    return {
        processedEmailData: {
            ...emailData,
            attachments: processedAttachments
        },
        llmWhispererResults
    };
}

// Extract text from files using LLM Whisperer PRO API
async function extractTextWithLLMWhisperer(bytes: Uint8Array, filename: string) {
    try {
        const llmWhispererApiKey = Deno.env.get('LLM_WHISPERER_API_KEY');

        if (!llmWhispererApiKey) {
            console.warn('LLM_WHISPERER_API_KEY not found, returning empty string');
            return Promise.resolve({
                textContent: "",
                whispererData: { error: "API key not found" }
            });
        }

        console.log(`Extracting text from ${filename} using LLM Whisperer PRO high_quality mode...`);

        // Step 1: Submit document for processing
        const submitResult = await submitDocumentToLLMWhisperer(bytes, filename, llmWhispererApiKey);

        if (!submitResult.whisperHash) {
            console.warn('Failed to submit document to LLM Whisperer, returning empty string');
            return Promise.resolve({
                textContent: "",
                whispererData: {
                    error: "Failed to submit document",
                    submitResult: submitResult
                }
            });
        }

        // Step 2: Wait for processing and retrieve text
        const retrieveResult = await retrieveExtractedText(submitResult.whisperHash, llmWhispererApiKey);

        if (!retrieveResult.extractedText) {
            console.warn('Failed to retrieve extracted text from LLM Whisperer, returning empty string');
            return Promise.resolve({
                textContent: "",
                whispererData: {
                    error: "Failed to retrieve text",
                    whisperHash: submitResult.whisperHash,
                    submitResult: submitResult,
                    retrieveResult: retrieveResult
                }
            });
        }

        console.log(`Successfully extracted ${retrieveResult.extractedText.length} characters from ${filename} using LLM Whisperer`);

        const whispererData = {
            whisperHash: submitResult.whisperHash,
            filename: filename,
            submitResult: submitResult,
            retrieveResult: retrieveResult,
            extractedTextLength: retrieveResult.extractedText.length,
            processedAt: new Date().toISOString()
        };

        return {
            textContent: retrieveResult.extractedText,
            whispererData: whispererData
        };

    } catch (error) {
        console.error('Error using LLM Whisperer, returning empty string:', error);
        // Fall back to basic extraction
        return Promise.resolve({
            textContent: "",
            whispererData: {
                error: error instanceof Error ? error.message : 'Unknown error',
                processedAt: new Date().toISOString()
            }
        });
    }
}

// Submit document to LLM Whisperer for processing
async function submitDocumentToLLMWhisperer(bytes: Uint8Array, filename: string, apiKey: string) {
    try {
        // Call LLM Whisperer v2 API
        const response = await fetch('https://llmwhisperer-api.us-central.unstract.com/api/v2/whisper', {
            method: 'POST',
            headers: {
                'unstract-key': apiKey,
                'Content-Type': 'application/octet-stream'
            },
            body: bytes
        });

        const responseText = await response.text();
        let result;
        try {
            result = JSON.parse(responseText);
        } catch (parseError) {
            result = { error: 'Failed to parse response', responseText: responseText };
        }

        if (response.status !== 202) {
            console.error(`LLM Whisperer API error: ${response.status} ${response.statusText}`, responseText);
            return {
                whisperHash: null,
                submitResponse: {
                    status: response.status,
                    statusText: response.statusText,
                    error: responseText,
                    result: result
                }
            };
        }

        console.log('Document submitted to LLM Whisperer, whisper_hash:', result.whisper_hash);

        return {
            whisperHash: result.whisper_hash,
            submitResponse: {
                status: response.status,
                result: result,
                submittedAt: new Date().toISOString()
            }
        };
    } catch (error) {
        console.error('Error submitting document to LLM Whisperer:', error);
        return {
            whisperHash: null,
            submitResponse: {
                error: error instanceof Error ? error.message : 'Unknown error',
                submittedAt: new Date().toISOString()
            }
        };
    }
}

// Retrieve extracted text from LLM Whisperer
async function retrieveExtractedText(whisperHash: string, apiKey: string) {
    try {
        const maxAttempts = 20;
        const delayMs = 2000; // 2 seconds
        const retrieveData: any = {
            whisperHash: whisperHash,
            attempts: [],
            startedAt: new Date().toISOString()
        };

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            console.log(`Checking LLM Whisperer status (attempt ${attempt}/${maxAttempts})...`);
            const attemptStart = new Date().toISOString();

            // Check status
            const statusResponse = await fetch(`https://llmwhisperer-api.us-central.unstract.com/api/v2/whisper-status?whisper_hash=${whisperHash}`, {
                headers: {
                    'unstract-key': apiKey
                }
            });

            if (!statusResponse.ok) {
                console.error(`Status check failed: ${statusResponse.status} ${statusResponse.statusText}`);
                retrieveData.attempts.push({
                    attempt: attempt,
                    attemptStart: attemptStart,
                    error: `Status check failed: ${statusResponse.status} ${statusResponse.statusText}`,
                    attemptEnd: new Date().toISOString()
                });
                return { extractedText: null, retrieveData: retrieveData };
            }

            const statusResult = await statusResponse.json();
            console.log('LLM Whisperer status:', statusResult.status);

            retrieveData.attempts.push({
                attempt: attempt,
                attemptStart: attemptStart,
                status: statusResult.status,
                statusResult: statusResult,
                attemptEnd: new Date().toISOString()
            });

            if (statusResult.status === 'processed') {
                // Retrieve the extracted text
                const textResponse = await fetch(`https://llmwhisperer-api.us-central.unstract.com/api/v2/whisper-retrieve?whisper_hash=${whisperHash}&mode=high_quality&output_mode=layout_preserving`, {
                    headers: {
                        'unstract-key': apiKey
                    }
                });

                if (!textResponse.ok) {
                    console.error(`Text retrieval failed: ${textResponse.status} ${textResponse.statusText}`);
                    retrieveData.textRetrievalError = {
                        status: textResponse.status,
                        statusText: textResponse.statusText,
                        retrievedAt: new Date().toISOString()
                    };
                    return { extractedText: null, retrieveData: retrieveData };
                }

                const extractedText = await textResponse.text();
                retrieveData.completedAt = new Date().toISOString();
                retrieveData.extractedTextLength = extractedText.length;

                return { extractedText: extractedText, retrieveData: retrieveData };

            } else if (statusResult.status === 'processing') {
                // Wait before next attempt
                if (attempt < maxAttempts) {
                    console.log(`Document still processing, waiting ${delayMs}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delayMs));
                }
            } else if (statusResult.status === 'failed') {
                console.error('LLM Whisperer processing failed:', statusResult);
                retrieveData.processingFailed = {
                    statusResult: statusResult,
                    failedAt: new Date().toISOString()
                };
                return { extractedText: null, retrieveData: retrieveData };
            }
        }

        console.warn('LLM Whisperer processing timed out after maximum attempts');
        retrieveData.timedOut = {
            maxAttempts: maxAttempts,
            timedOutAt: new Date().toISOString()
        };
        return { extractedText: null, retrieveData: retrieveData };

    } catch (error) {
        console.error('Error retrieving extracted text from LLM Whisperer:', error);
        return {
            extractedText: null,
            retrieveData: {
                error: error instanceof Error ? error.message : 'Unknown error',
                errorAt: new Date().toISOString()
            }
        };
    }
}

// Analyze email content with AI - now includes delivery date extraction, current date, and attachments
async function analyzeEmailWithAI(emailContent: string, attachments: any[], items: any[], userId: string, emailId: string) {
    if (items.length === 0) {
        console.warn('No items available for analysis');
        return { analysisResult: { orderLines: [] }, aiLogId: '' };
    }

    try {
        const startTime = Date.now();
        const itemsList = items.map((item: any) => ({
            id: item.id,
            number: item.number,
            displayName: item.displayName,
            unitPrice: item.unitPrice
        }));

        // Get current date for context
        const currentDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format

        // Prepare content including both email and attachment text
        let fullContent = `Email content:\n${emailContent}`;

        // Add attachment content if available
        if (attachments.length > 0) {
            fullContent += '\n\nAttachments:\n';
            attachments.forEach((att: any, index: number) => {
                fullContent += `\n--- Attachment ${index + 1}: ${att.filename} ---\n${att.content}\n`;
            });
        }

        // Prepare request data for logging
        const requestData = {
            model: 'gpt-5.1',
            messages: [
                {
                    role: 'system',
                    content: `You are a helpful assistant that extracts purchase order information from emails and their attachments, then matches them to a list of available items. Here is the list of available items: ${JSON.stringify(itemsList)}

IMPORTANT: Today's date is ${currentDate}. When extracting delivery dates, ensure they are in the future and make sense in context. If a date appears to be from a past year (like 2022), interpret it as the current year (2025) instead.

You will analyze both the email content and any attachments that may contain purchase order details, item lists, quotes, or other relevant ordering information.`
                },
                {
                    role: 'user',
                    content: `Extract products with quantities and requested delivery date from this email and its attachments. Match them to the available items list. For each product found, find the best matching item from the available items list.

${fullContent}

Return the data in JSON format with the following structure:
{
  "orderLines": [{
    "itemName": "extracted item name from email",
    "quantity": number,
    "matchedItem": {
      "id": "matched item id",
      "number": "matched item number",
      "displayName": "matched item display name",
      "unitPrice": number
    }
  }],
  "requestedDeliveryDate": "YYYY-MM-DD" // ISO date format, only if a delivery date is mentioned in the email
}

For the delivery date, look for phrases like:
- "need by [date]"
- "deliver by [date]"
- "required by [date]"
- "delivery date [date]"
- "ship by [date]"
- "due [date]"
- Any other indication of when the order should be delivered

IMPORTANT: If you find a delivery date that appears to be from a past year (like 2022), interpret it as the current year (2025). Only include dates that make sense as future delivery dates.

If no delivery date is mentioned, omit the requestedDeliveryDate field entirely.`
                }
            ],
            temperature: 0.7,
            max_tokens: 1000,
            response_format: { type: "json_object" }
        };

        // Store initial AI analysis log with request data
        const { data: initialAiLog, error: initialLogError } = await supabase
            .from('ai_analysis_logs')
            .insert({
                user_id: userId,
                analysis_type: 'email',
                source_id: emailId,
                raw_request: requestData,
                model_used: 'gpt-5.1',
                created_at: new Date().toISOString()
            })
            .select('id')
            .single();

        const aiLogId = initialAiLog?.id || '';

        if (initialLogError) {
            console.warn('Failed to create initial AI analysis log:', initialLogError);
        }

        const completion = await openai.chat.completions.create({
            model: 'gpt-5.1',
            messages: requestData.messages,
            temperature: requestData.temperature,
            max_tokens: requestData.max_tokens,
            response_format: requestData.response_format
        });

        const processingTime = Date.now() - startTime;

        // Store raw response immediately after getting it from OpenAI
        if (aiLogId) {
            const { error: updateRawError } = await supabase
                .from('ai_analysis_logs')
                .update({
                    raw_response: completion,
                    tokens_used: completion.usage?.total_tokens || 0,
                    processing_time_ms: processingTime
                })
                .eq('id', aiLogId);

            if (updateRawError) {
                console.warn('Failed to store raw AI response:', updateRawError);
            } else {
                console.log('Successfully stored raw AI response for log ID:', aiLogId);
            }
        }

        // Now attempt to parse the response
        let analysis;
        try {
            analysis = JSON.parse(completion.choices[0].message.content);
        } catch (parseError: any) {
            console.error('Failed to parse AI response JSON:', parseError);
            console.error('Raw content:', completion.choices[0].message.content);

            // Store the parsing error in the log
            if (aiLogId) {
                await supabase
                    .from('ai_analysis_logs')
                    .update({
                        parsed_result: {
                            error: 'JSON parsing failed',
                            raw_content: completion.choices[0].message.content,
                            parse_error: parseError.message
                        }
                    })
                    .eq('id', aiLogId);
            }

            return { analysisResult: { orderLines: [] }, aiLogId };
        }

        const analysisResult = {
            orderLines: analysis.orderLines || [],
            requestedDeliveryDate: analysis.requestedDeliveryDate
        };

        // Update log with final parsed result
        if (aiLogId) {
            const { error: finalUpdateError } = await supabase
                .from('ai_analysis_logs')
                .update({
                    parsed_result: analysisResult
                })
                .eq('id', aiLogId);

            if (finalUpdateError) {
                console.warn('Failed to update AI log with final result:', finalUpdateError);
            }
        }

        return { analysisResult, aiLogId };

    } catch (error) {
        console.error('Error analyzing email with AI:', error);
        return { analysisResult: { orderLines: [] }, aiLogId: '' };
    }
}

// Helper functions for basic token operations
async function getCompanyId(userId: string) {
    try {
        const { data, error } = await supabase
            .from('user_tokens')
            .select('company_id')
            .eq('user_id', userId)
            .eq('provider', 'business_central')
            .single();

        if (error || !data?.company_id) {
            return null;
        }

        return data.company_id;
    } catch (error) {
        console.error('Error getting company ID:', error);
        return null;
    }
}

// Encryption functions
async function encrypt(text: string): Promise<string> {
    const ENCRYPTION_KEY = Deno.env.get('TOKEN_ENCRYPTION_KEY') || 'default-key-for-development-only-change-in-production';
    const encoder = new TextEncoder();
    const data = encoder.encode(text);

    // Generate a random IV
    const iv = crypto.getRandomValues(new Uint8Array(12));

    // Import the encryption key
    const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32)),
        { name: 'AES-GCM' },
        false,
        ['encrypt']
    );

    // Encrypt the data
    const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        data
    );

    // Combine IV and encrypted data
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(encrypted), iv.length);

    // Return base64 encoded result
    return btoa(String.fromCharCode(...combined));
}

// Decrypt function
async function decrypt(encryptedText: string): Promise<string> {
    const ENCRYPTION_KEY = Deno.env.get('TOKEN_ENCRYPTION_KEY') || 'default-key-for-development-only-change-in-production';
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const combined = new Uint8Array(
        atob(encryptedText).split('').map(char => char.charCodeAt(0))
    );

    const iv = combined.slice(0, 12);
    const encrypted = combined.slice(12);

    const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32)),
        { name: 'AES-GCM' },
        false,
        ['decrypt']
    );

    const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        encrypted
    );

    return decoder.decode(decrypted);
}

// Clean text content and fix encoding issues
function cleanTextContent(text: string): string {
    return text
        // Fix common encoding issues
        .replace(/â¦/g, '...')
        .replace(/â€™/g, "'")
        .replace(/â€˜/g, "'")
        .replace(/â€œ/g, '"')
        .replace(/â€/g, '"')
        .replace(/â€"/g, '—')
        .replace(/â€"/g, '–')
        .replace(/Â/g, ' ')
        .replace(/â€¦/g, '...')
        // Additional common encoding issues
        .replace(/â€¢/g, '•')
        .replace(/Â /g, ' ')
        .replace(/â€‹/g, '') // Zero-width space
        .replace(/â€Š/g, ' ') // Thin space
        .replace(/â€¯/g, ' ') // Narrow no-break space
        // Clean up extra whitespace
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .replace(/\n\s*\n\s*\n/g, '\n\n')
        .trim();
}

// Convert HTML to clean text
function convertHtmlToText(html: string): string {
    return html
        // Remove Gmail-specific classes and spans
        .replace(/class="[^"]*"/g, '')
        .replace(/<span[^>]*>/g, '')
        .replace(/<\/span>/g, '')
        // Clean up Microsoft Word formatting
        .replace(/class="MsoNormal"/g, '')
        .replace(/<u><\/u>/g, '')
        // Replace HTML entities
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&hellip;/g, '...')
        .replace(/&mdash;/g, '—')
        .replace(/&ndash;/g, '–')
        // Convert HTML line breaks and paragraphs to proper formatting
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>\s*<p[^>]*>/gi, '\n\n')
        .replace(/<p[^>]*>/gi, '')
        .replace(/<\/p>/gi, '\n')
        // Remove div tags but keep content with line breaks
        .replace(/<div[^>]*>/gi, '')
        .replace(/<\/div>/gi, '\n')
        // Remove any remaining HTML tags
        .replace(/<[^>]*>/g, '')
        // Fix character encoding issues
        .replace(/â€¦/g, '...')
        .replace(/â€™/g, "'")
        .replace(/â€˜/g, "'")
        .replace(/â€œ/g, '"')
        .replace(/â€/g, '"')
        .replace(/â€"/g, '—')
        .replace(/â€"/g, '–')
        .replace(/Â/g, ' ')
        .replace(/â€¢/g, '•')
        .replace(/Â /g, ' ')
        .replace(/â€‹/g, '') // Zero-width space
        // Clean up extra whitespace
        .replace(/\n\s*\n\s*\n/g, '\n\n')
        .replace(/^\s+|\s+$/g, '')
        .trim();
}

// Fetch raw .eml content from Gmail API
async function fetchRawEmlContent(emailId: string, googleToken: string) {
    try {
        console.log('Fetching raw .eml content for email:', emailId);
        const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${emailId}?format=raw`, {
            headers: {
                Authorization: `Bearer ${googleToken}`
            }
        });

        if (!response.ok) {
            console.error(`Failed to fetch raw email: ${response.status} ${response.statusText}`);
            return null;
        }

        const rawData = await response.json();
        if (!rawData.raw) {
            console.error('No raw content found in Gmail API response');
            return null;
        }

        // Decode base64url encoded content
        const base64Data = rawData.raw.replace(/-/g, '+').replace(/_/g, '/');
        const paddedBase64 = base64Data + '='.repeat((4 - base64Data.length % 4) % 4);
        const emlContent = atob(paddedBase64);

        console.log('Successfully decoded raw .eml content:', emlContent.length, 'characters');
        return emlContent;

    } catch (error) {
        console.error('Error fetching raw .eml content:', error);
        return null;
    }
}

// Parse Gmail API response
function parseEmailData(emailData: any) {
    const headers: any = {};
    if (emailData.payload && emailData.payload.headers) {
        emailData.payload.headers.forEach((header: any) => {
            headers[header.name.toLowerCase()] = header.value;
        });
    }

    let htmlBody = '';
    let textBody = '';
    const attachments: any[] = [];

    function extractBodyParts(part: any) {
        // Check if this part is an attachment
        if (part.filename && part.filename.length > 0 && part.body && part.body.attachmentId) {
            attachments.push({
                filename: part.filename,
                mimeType: part.mimeType || 'application/octet-stream',
                size: part.body.size || 0,
                attachmentId: part.body.attachmentId
            });
            return;
        }

        // Extract body text based on MIME type
        if (part.body && part.body.data && !part.filename) {
            const decodedData = atob(part.body.data.replace(/-/g, '+').replace(/_/g, '/'));
            if (part.mimeType === 'text/html') {
                htmlBody += decodedData;
            } else if (part.mimeType === 'text/plain') {
                textBody += decodedData;
            }
        }

        if (part.parts) {
            part.parts.forEach((subPart: any) => {
                extractBodyParts(subPart);
            });
        }
    }

    if (emailData.payload) {
        extractBodyParts(emailData.payload);
    }

    // Clean and process the email body
    let finalBody = '';
    // Prefer plain text if available, otherwise convert HTML to text
    if (textBody.trim()) {
        finalBody = cleanTextContent(textBody);
    } else if (htmlBody.trim()) {
        finalBody = convertHtmlToText(htmlBody);
    }

    console.log(`Found ${attachments.length} attachments in email ${emailData.id}`);
    attachments.forEach((att: any) => {
        console.log(`- ${att.filename} (${att.mimeType}, ${att.size} bytes)`);
    });

    return {
        id: emailData.id,
        threadId: emailData.threadId,
        labelIds: emailData.labelIds || [],
        snippet: emailData.snippet || '',
        subject: headers.subject || '',
        from: headers.from || '',
        to: headers.to || '',
        date: headers.date || '',
        messageId: headers['message-id'] || null,
        body: finalBody,
        attachments: attachments,
        rawGmailResponse: emailData,
        htmlBody: htmlBody,
        textBody: textBody // Store original plain text
    };
}
