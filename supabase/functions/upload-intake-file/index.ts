import { createClient } from 'npm:@supabase/supabase-js@2.39.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const organizationId = formData.get('organization_id') as string | null;

    if (!file) {
      return new Response(JSON.stringify({ error: 'No file provided' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!organizationId) {
      return new Response(JSON.stringify({ error: 'No organization_id provided' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const fileId = crypto.randomUUID();
    const extension = file.name.split('.').pop()?.toLowerCase() || 'pdf';

    // 1. Create intake_event
    const { data: intakeEvent, error: eventErr } = await supabase
      .from('intake_events')
      .insert({
        organization_id: organizationId,
        channel: 'email',
        provider: 'gmail',
        provider_message_id: `upload-${fileId}`,
        raw_content: {
          subject: `PO Upload: ${file.name}`,
          from: 'Dashboard Upload',
          body_text: `Purchase order uploaded via dashboard: ${file.name}`,
        },
      })
      .select()
      .single();

    if (eventErr) {
      console.error('Failed to create intake event:', eventErr);
      return new Response(JSON.stringify({ error: `Failed to create intake event: ${eventErr.message}` }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const storagePath = `${organizationId}/${intakeEvent.id}/${fileId}.${extension}`;

    // 2. Upload to storage
    const fileBuffer = await file.arrayBuffer();
    const { error: uploadErr } = await supabase.storage
      .from('intake-files')
      .upload(storagePath, fileBuffer, {
        contentType: file.type || 'application/pdf',
      });

    if (uploadErr) {
      console.error('Storage upload failed:', uploadErr);
      return new Response(JSON.stringify({ error: `Storage upload failed: ${uploadErr.message}` }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. Create intake_files record
    const { error: fileErr } = await supabase
      .from('intake_files')
      .insert({
        id: fileId,
        organization_id: organizationId,
        intake_event_id: intakeEvent.id,
        filename: file.name,
        extension,
        mime_type: file.type || 'application/pdf',
        size_bytes: file.size,
        source: 'dashboard_upload',
        storage_path: storagePath,
        processing_status: 'pending',
      });

    if (fileErr) {
      console.error('Failed to create intake file record:', fileErr);
      return new Response(JSON.stringify({ error: `Failed to create file record: ${fileErr.message}` }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Upload complete: ${file.name} → intake_event ${intakeEvent.id}, file ${fileId}`);

    return new Response(JSON.stringify({
      success: true,
      intake_event_id: intakeEvent.id,
      file_id: fileId,
      filename: file.name,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Upload handler error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
