import { createClient } from 'npm:@supabase/supabase-js@2.39.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// Initialize Supabase client with service role
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
    // Get user from JWT token
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'No authorization header' }),
        {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      );
    }

    const token = authHeader.replace('Bearer ', '');

    // Verify token
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid token' }),
        {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      );
    }

    // Get user IDs from request body
    const { userIds } = await req.json();

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'userIds must be a non-empty array' }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      );
    }

    // Fetch user information for the provided IDs
    const usersInfo: Record<string, any> = {};

    for (const userId of userIds) {
      try {
        const { data: userData } = await supabase.auth.admin.getUserById(userId);
        if (userData?.user) {
          usersInfo[userId] = {
            id: userData.user.id,
            name: userData.user.user_metadata?.name || userData.user.email?.split('@')[0] || 'Unknown',
            email: userData.user.email,
            profile_picture: userData.user.user_metadata?.picture || userData.user.user_metadata?.avatar_url
          };
        }
      } catch (error) {
        console.warn(`Failed to fetch user ${userId}:`, error);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        users: usersInfo
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      }
    );

  } catch (error) {
    console.error('Error fetching users info:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        },
        status: 500
      }
    );
  }
});
