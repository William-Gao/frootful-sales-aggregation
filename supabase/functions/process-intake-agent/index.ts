/**
 * process-intake-agent — entry point
 *
 * Receives intake events (via DB webhook or direct call), resolves the
 * organization, dispatches to the correct org-specific agent, and runs
 * the shared agent loop.
 */

import Anthropic from 'npm:@anthropic-ai/sdk';
import { createLogger } from '../_shared/logger.ts';
import {
  AgentDefinition,
  supabase,
  loadCatalogs,
  runAgentLoop,
} from '../_shared/agent-core.ts';

// ─── Org → Agent Mapping ────────────────────────────────────────────────────

import { agent as bostonMicrogreensAgent } from '../agents/boston-microgreens.ts';
import { agent as laGaitanaFarmsAgent } from '../agents/la-gaitana-farms.ts';
import { agent as defaultAgent } from '../agents/default.ts';

const ORG_AGENT_MAP: Record<string, AgentDefinition> = {
  'e047b512-0012-4287-bb74-dc6d4f7e673f': bostonMicrogreensAgent, // Boston Microgreens
  '81cf0716-45ee-4fe8-895f-d9af962f5fab': laGaitanaFarmsAgent,    // La Gaitana Farms
};

function getAgentForOrg(organizationId: string): AgentDefinition {
  return ORG_AGENT_MAP[organizationId] || defaultAgent;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const DEMO_ORGANIZATION_ID = '00000000-0000-0000-0000-000000000001';
const DEMO_USER_ID = '00000000-0000-0000-0000-000000000002';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// ─── Entry Point ────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();
  const logger = createLogger({ requestId, functionName: 'process-intake-agent' });

  try {
    const body = await req.json();

    // Accept webhook format or direct call
    let intakeEventId: string;
    if (body.type === 'INSERT' && body.record) {
      intakeEventId = body.record.id;
      logger.info('Database trigger received');
    } else if (body.intakeEventId) {
      intakeEventId = body.intakeEventId;
      logger.info('Direct call received');
    } else {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid payload. Expected { type: "INSERT", record } or { intakeEventId }' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    const eventLogger = logger.child({ intakeEventId });

    // ── Fetch intake event ────────────────────────────────────────────────
    const { data: intakeEvent, error: fetchError } = await supabase
      .from('intake_events')
      .select('*')
      .eq('id', intakeEventId)
      .single();

    if (fetchError || !intakeEvent) {
      eventLogger.error('Intake event not found', fetchError);
      return new Response(
        JSON.stringify({ success: false, error: 'Intake event not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    // ── Idempotency ───────────────────────────────────────────────────────
    const { count } = await supabase
      .from('order_change_proposals')
      .select('id', { count: 'exact', head: true })
      .eq('intake_event_id', intakeEventId);

    if (count && count > 0) {
      eventLogger.info('Skipping - already processed', { existingProposalCount: count });
      return new Response(
        JSON.stringify({ success: true, data: { intake_event_id: intakeEventId, skipped: true, reason: 'already_processed' } }),
        { headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    // ── Resolve organization ──────────────────────────────────────────────
    let organizationId = intakeEvent.organization_id;
    let _createdByUserId: string | null = null;

    if (intakeEvent.channel === 'sms') {
      const fromPhone = intakeEvent.raw_content?.from;
      if (fromPhone) {
        const normalizedPhone = fromPhone.replace(/\s+/g, '');
        const { data: userId } = await supabase.rpc('get_user_id_by_phone', { user_phone: normalizedPhone });

        if (userId) {
          _createdByUserId = userId;
        } else {
          const phoneWithoutPlus = normalizedPhone.replace(/^\+/, '');
          const { data: altUserId } = await supabase.rpc('get_user_id_by_phone', { user_phone: phoneWithoutPlus });
          if (altUserId) _createdByUserId = altUserId;
        }

        if (_createdByUserId && !organizationId) {
          const { data: userOrg } = await supabase
            .from('user_organizations')
            .select('organization_id')
            .eq('user_id', _createdByUserId)
            .single();
          if (userOrg) organizationId = userOrg.organization_id;
        }
      }
    }

    if (intakeEvent.channel === 'email') {
      const fromEmail = intakeEvent.raw_content?.from;
      if (fromEmail) {
        const emailMatch = fromEmail.match(/<([^>]+)>/) || [null, fromEmail];
        const email = emailMatch[1];
        const { data: userId } = await supabase.rpc('get_user_id_by_email', { user_email: email });

        if (userId) {
          _createdByUserId = userId;
          if (!organizationId) {
            const { data: userOrg } = await supabase
              .from('user_organizations')
              .select('organization_id')
              .eq('user_id', userId)
              .single();
            if (userOrg) organizationId = userOrg.organization_id;
          }
        }
      }
    }

    // Fallback to demo org
    if (!organizationId) {
      organizationId = DEMO_ORGANIZATION_ID;
      _createdByUserId = DEMO_USER_ID;
      eventLogger.info('Falling back to demo organization');
    }

    // Update intake_event org if it wasn't set
    if (!intakeEvent.organization_id) {
      await supabase.from('intake_events').update({ organization_id: organizationId }).eq('id', intakeEvent.id);
    }

    const orgLogger = eventLogger.child({ organizationId });

    // ── Load catalogs ─────────────────────────────────────────────────────
    const { customers, items } = await loadCatalogs(organizationId);
    orgLogger.info('Loaded catalogs', { customerCount: customers.length, itemCount: items.length });

    // ── Resolve agent ─────────────────────────────────────────────────────
    const agent = getAgentForOrg(organizationId);
    orgLogger.info('Resolved agent', { isCustom: organizationId in ORG_AGENT_MAP });

    // ── Extract message content ───────────────────────────────────────────
    let messageText = '';
    if (intakeEvent.channel === 'sms') {
      messageText = intakeEvent.raw_content?.body || '';
    } else if (intakeEvent.channel === 'email') {
      messageText = intakeEvent.raw_content?.body_text || intakeEvent.raw_content?.body_html || '';
      if (intakeEvent.raw_content?.subject) {
        messageText = `Subject: ${intakeEvent.raw_content.subject}\n\n${messageText}`;
      }
    }

    // ── Process file attachments ──────────────────────────────────────────
    const contentBlocks: Anthropic.ContentBlockParam[] = [];
    const { data: intakeFiles } = await supabase
      .from('intake_files')
      .select('*')
      .eq('intake_event_id', intakeEventId);

    if (intakeFiles && intakeFiles.length > 0) {
      orgLogger.info('Processing intake files', { fileCount: intakeFiles.length });

      const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'webp'];
      const pdfExts = ['pdf'];

      for (const file of intakeFiles) {
        const ext = (file.extension || '').toLowerCase();

        if (!imageExts.includes(ext) && !pdfExts.includes(ext)) {
          orgLogger.info('Skipping non-visual file', { filename: file.filename, extension: ext });
          continue;
        }

        const { data: signedUrlData } = await supabase
          .storage
          .from('intake-files')
          .createSignedUrl(file.storage_path, 600);

        if (signedUrlData?.signedUrl) {
          if (imageExts.includes(ext)) {
            contentBlocks.push({
              type: 'image',
              source: { type: 'url', url: signedUrlData.signedUrl },
            } as Anthropic.ImageBlockParam);
          } else {
            contentBlocks.push({
              type: 'document',
              source: { type: 'url', url: signedUrlData.signedUrl },
            } as Anthropic.DocumentBlockParam);
          }
          orgLogger.info('Added file as content block', { filename: file.filename, type: ext });
        }
      }
    }

    // ── Build user message ────────────────────────────────────────────────
    const today = new Date().toISOString().split('T')[0];
    let userContent: string | Anthropic.ContentBlockParam[];

    if (contentBlocks.length > 0) {
      userContent = [
        ...contentBlocks,
        {
          type: 'text' as const,
          text: messageText
            ? `Process this incoming order message:\n\n${messageText}\n\nToday's date: ${today}`
            : `Process this order document. Today's date: ${today}`,
        },
      ];
    } else {
      userContent = `Process this incoming order message:\n\n${messageText}\n\nToday's date: ${today}`;
    }

    // ── Run agent loop ────────────────────────────────────────────────────
    const result = await runAgentLoop(
      agent,
      userContent,
      { organizationId, intakeEventId },
      orgLogger,
    );

    return new Response(
      JSON.stringify({ success: result.success, data: { intake_event_id: intakeEventId, ...result } }),
      { headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  } catch (error) {
    logger.error('Function failed', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  }
});
