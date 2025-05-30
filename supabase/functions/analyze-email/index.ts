import OpenAI from 'npm:openai@4.28.0';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};
const openai = new OpenAI({
  apiKey: Deno.env.get('OPENAI_API_KEY')
});
Deno.serve(async (req)=>{
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders
    });
  }
  try {
    const { emailContent, fromEmail } = await req.json();
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant that extracts purchase order information from emails. Extract each product with its quantity and price. Return the data in JSON format with the following structure: { orderLines: [{ itemName: string, quantity: number, unitPrice: number }] }'
        },
        {
          role: 'user',
          content: emailContent
        }
      ],
      temperature: 0.7,
      max_tokens: 500,
      response_format: {
        type: "json_object"
      }
    });
    console.log('completed completion request');
    const analysis = JSON.parse(completion.choices[0].message.content);
    console.log(analysis);
    // Create purchase order in Business Central
    // const bcResponse = await fetch(`${req.headers.get('origin')}/functions/v1/business-central`, {
    //   method: 'POST',
    //   headers: {
    //     'Content-Type': 'application/json',
    //     'Authorization': req.headers.get('Authorization') || ''
    //   },
    //   body: JSON.stringify({
    //     purchaseOrder: {
    //       vendorEmail: fromEmail,
    //       orderLines: analysis.orderLines
    //     }
    //   })
    // });
    // const bcResult = await bcResponse.json();
    return new Response(JSON.stringify({
      success: true,
      analysis: analysis.orderLines,
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
