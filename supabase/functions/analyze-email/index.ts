import OpenAI from 'npm:openai@4.28.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

const openai = new OpenAI({
  apiKey: Deno.env.get('OPENAI_API_KEY')
});

interface Item {
  id: string;
  number: string;
  displayName: string;
}

interface AnalyzedItem {
  itemName: string;
  quantity: number;
  matchedItem?: {
    id: string;
    number: string;
    displayName: string;
  };
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders
    });
  }

  try {
    const { emailContent, items } = await req.json();

    // Create a simplified list of items for the prompt
    const itemsList = items.map((item: Item) => ({
      id: item.id,
      number: item.number,
      displayName: item.displayName
    }));

    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: `You are a helpful assistant that extracts purchase order information from emails and matches them to a list of available items. Here is the list of available items: ${JSON.stringify(itemsList)}`
        },
        {
          role: 'user',
          content: `Extract products with quantities from this email and match them to the available items list. For each product found, find the best matching item from the available items list.

Email content:
${emailContent}

Return the data in JSON format with the following structure:
{
  "orderLines": [{
    "itemName": "extracted item name from email",
    "quantity": number,
    "matchedItem": {
      "id": "matched item id",
      "number": "matched item number",
      "displayName": "matched item display name"
    }
  }]
}`
        }
      ],
      temperature: 0.7,
      max_tokens: 500,
      response_format: { type: "json_object" }
    });

    const analysis = JSON.parse(completion.choices[0].message.content);

    return new Response(JSON.stringify({
      success: true,
      analysis: analysis.orderLines
    }), {
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  } catch (error) {
    console.error('Error analyzing email:', error);
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