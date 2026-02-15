import React, { useState, useEffect } from 'react';
import { supabaseClient } from '../supabaseClient';

// Helper function to format date strings (YYYY-MM-DD) without timezone issues
const formatDateString = (dateStr: string): string => {
  // Parse YYYY-MM-DD format and display in local format without timezone shift
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString();
};

interface OrderLine {
  id: string;
  line_number: number;
  product_name: string;
  quantity: number;
  status: string;
  variant_code: string;
}

interface ProposalLine {
  id: string;
  order_line_id: string | null;
  line_number: number;
  change_type: 'add' | 'remove' | 'modify';
  item_id: string | null;
  item_variant_id?: string | null;
  item_name: string;
  proposed_values: Record<string, any> | null;
}

type EditableDiffRow = {
  left: OrderLine | null;
  right: { product_name: string; quantity: number; size: string; item_id?: string | null } | null;
  changeType: 'add' | 'remove' | 'modify' | 'none';
  orderLineId?: string | null;
};

interface Order {
  id: string;
  customer_name: string;
  delivery_date: string;
  status: string;
  order_lines: OrderLine[];
}

interface IntakeEvent {
  id: string;
  channel: 'email' | 'sms';
  created_at: string;
  raw_content: {
    body?: string;
    body_text?: string;
    subject?: string;
    from?: string;
  };
}

interface IntakeFile {
  id: string;
  filename: string;
  extension: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  storage_path: string;
  processing_status: string;
  processed_content: {
    llm_whisperer?: {
      text?: string;
    };
  } | null;
}

interface OrderEvent {
  id: string;
  type: string;
  created_at: string;
  metadata: Record<string, any>;
  intake_event_id: string | null;
}

interface TimelineItem {
  id: string;
  type: 'communication' | 'event';
  timestamp: string;
  channel?: 'email' | 'sms';
  eventType?: string;
  content?: string;
  subject?: string;
  from?: string;
  metadata?: Record<string, any>;
}

interface Props {
  proposalId: string;
  orderId: string | null; // NULL for new order proposals
  onClose: () => void;
  onResolved: () => void;
  catalogItems?: { id: string; sku: string; name: string; item_variants: { id: string; variant_code: string; variant_name: string }[] }[];
  catalogCustomers?: { id: string; name: string; email: string | null; phone: string | null }[];
}

export default function ProposalDiffModal({ proposalId, orderId, onClose, onResolved, catalogItems, catalogCustomers }: Props) {
  const [order, setOrder] = useState<Order | null>(null);
  const [proposalLines, setProposalLines] = useState<ProposalLine[]>([]);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [reanalyzing, setReanalyzing] = useState(false);
  const [intakeEventId, setIntakeEventId] = useState<string | null>(null);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [timelineWidth, setTimelineWidth] = useState(384); // 96 * 4 = 384px (w-96)
  const [isDragging, setIsDragging] = useState(false);
  const [timelineOrder, setTimelineOrder] = useState<'asc' | 'desc'>('desc'); // Default to newest first

  // Editing state for proposals (both new order and change proposals)
  const [isEditing, setIsEditing] = useState(false);
  const [editedCustomerId, setEditedCustomerId] = useState<string | null>(null);
  const [editedCustomerName, setEditedCustomerName] = useState('');
  const [editedDeliveryDate, setEditedDeliveryDate] = useState<string | null>(null);
  const [editedLines, setEditedLines] = useState<ProposalLine[]>([]);
  const [editedDiffRows, setEditedDiffRows] = useState<EditableDiffRow[]>([]);

  // Customer and item search state
  const [customers, setCustomers] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [customerSearchTerm, setCustomerSearchTerm] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [itemSearchTerms, setItemSearchTerms] = useState<{[key: number]: string}>({});
  const [showItemDropdown, setShowItemDropdown] = useState<{[key: number]: boolean}>({});

  // Reclassification state
  const [showReclassifyMenu, setShowReclassifyMenu] = useState(false);
  const [reclassifyingOrderId, setReclassifyingOrderId] = useState<string | null>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [orderSearchTerm, setOrderSearchTerm] = useState('');
  const [showOrderDropdown, setShowOrderDropdown] = useState(false);
  const [hoveredOrderId, setHoveredOrderId] = useState<string | null>(null);

  // Attachment state
  const [intakeFiles, setIntakeFiles] = useState<IntakeFile[]>([]);
  const [fileUrls, setFileUrls] = useState<{[fileId: string]: string}>({});
  const [expandedFile, setExpandedFile] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
    fetchCustomersAndItems();
  }, [proposalId, orderId]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const newWidth = window.innerWidth - e.clientX;
      setTimelineWidth(Math.max(256, Math.min(800, newWidth))); // Min 256px, max 800px
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  function toggleExpanded(itemId: string) {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  }

  async function fetchCustomersAndItems() {
    // Use catalog data passed as props from AdminDashboard (avoids RLS issues)
    if (catalogItems) {
      const transformed = catalogItems.map((i) => ({
        id: i.id,
        number: i.sku,
        displayName: i.name,
        item_variants: i.item_variants || [],
      }));
      setItems(transformed);
    }
    if (catalogCustomers) {
      const transformed = catalogCustomers.map((c) => ({
        id: c.id,
        displayName: c.name,
        email: c.email,
        phoneNumber: c.phone,
      }));
      setCustomers(transformed);
    }
    if (catalogItems && catalogCustomers) return;

    // Fallback: fetch via edge function if props not provided
    try {
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (!session) return;

      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-catalog-data`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) return;
      const data = await res.json();

      if (!catalogItems && data.items) {
        const transformed = data.items.map((i: any) => ({
          id: i.id,
          number: i.number,
          displayName: i.displayName || i.name,
          item_variants: [],
        }));
        setItems(transformed);
      }
      if (!catalogCustomers && data.customers) {
        const transformed = data.customers.map((c: any) => ({
          id: c.id,
          displayName: c.displayName || c.name,
          email: c.email,
          phoneNumber: c.phoneNumber || c.phone,
        }));
        setCustomers(transformed);
      }
    } catch (error) {
      console.error('Error fetching customers and items:', error);
    }
  }

  async function fetchData() {
    try {
      setLoading(true);

      // Check for demo proposals and return hardcoded data
      if (proposalId.startsWith('demo-proposal-')) {
        // Demo proposal 1: Whole Foods order update
        if (proposalId === 'demo-proposal-001') {
          setOrder({
            id: 'demo-order-wf',
            customer_name: 'Whole Foods Market',
            delivery_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            status: 'pending',
            order_lines: [
              { id: 'line-1', line_number: 1, product_name: 'Organic Baby Spinach', quantity: 50, status: 'active', variant_code: '' },
              { id: 'line-2', line_number: 2, product_name: 'Organic Spring Mix', quantity: 30, status: 'active', variant_code: '' },
              { id: 'line-3', line_number: 3, product_name: 'Organic Baby Kale', quantity: 25, status: 'active', variant_code: '' },
            ]
          });
          setProposalLines([
            { id: 'pl-1', order_line_id: 'line-1', line_number: 1, change_type: 'modify', item_id: null, item_name: 'Organic Baby Spinach', proposed_values: { quantity: 75 } },
            { id: 'pl-2', order_line_id: 'line-3', line_number: 3, change_type: 'modify', item_id: null, item_name: 'Organic Baby Kale', proposed_values: { quantity: 40 } },
            { id: 'pl-3', order_line_id: null, line_number: 4, change_type: 'add', item_id: null, item_name: 'Organic Arugula', proposed_values: { quantity: 20 } },
          ]);
          setTimeline([
            {
              id: 'comm-1',
              type: 'communication',
              timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
              channel: 'email',
              content: 'Hi, please send our regular weekly order:\n- 50 cases Organic Baby Spinach\n- 30 cases Organic Spring Mix\n- 25 cases Organic Baby Kale\n\nThanks,\nWhole Foods Produce Team',
              subject: 'Weekly Produce Order',
              from: 'produce@wholefoods.com'
            },
            {
              id: 'event-1',
              type: 'event',
              timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000 + 30000).toISOString(),
              eventType: 'order_created',
              metadata: { source: 'email' }
            },
            {
              id: 'comm-2',
              type: 'communication',
              timestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
              channel: 'email',
              content: 'Hi, quick update - please change the order to:\n- 75 cases Organic Baby Spinach (was 50)\n- 30 cases Organic Spring Mix (no change)\n- 40 cases Organic Baby Kale (was 25)\n- ADD 20 cases Organic Arugula\n\nSorry for the late change!\nWhole Foods Produce Team',
              subject: 'RE: Weekly Produce Order - UPDATED',
              from: 'produce@wholefoods.com'
            }
          ]);
          setIntakeEventId('demo-intake-001');
        }
        // Demo proposal 2: New order from Fresh & Easy
        else if (proposalId === 'demo-proposal-002') {
          setOrder(null); // New order proposal
          setProposalLines([
            { id: 'npl-1', order_line_id: null, line_number: 1, change_type: 'add', item_id: null, item_name: 'Red Leaf Lettuce', proposed_values: { quantity: 24 } },
            { id: 'npl-2', order_line_id: null, line_number: 2, change_type: 'add', item_id: null, item_name: 'Green Leaf Lettuce', proposed_values: { quantity: 24 } },
            { id: 'npl-3', order_line_id: null, line_number: 3, change_type: 'add', item_id: null, item_name: 'Romaine Hearts', proposed_values: { quantity: 36 } },
          ]);
          setTimeline([
            {
              id: 'comm-sms-1',
              type: 'communication',
              timestamp: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
              channel: 'sms',
              content: 'Hey need an order for Thursday: 24 red leaf, 24 green leaf, 36 romaine hearts. Thanks! - Fresh & Easy',
              from: '+1 (555) 234-5678'
            }
          ]);
          setIntakeEventId('demo-intake-002');
        }
        setLoading(false);
        return;
      }

      const isNewOrderProposal = !orderId;

      // Fetch the proposal itself to get intake_event_id
      const { data: proposalInfo, error: proposalInfoError } = await supabaseClient
        .from('order_change_proposals')
        .select('intake_event_id')
        .eq('id', proposalId)
        .single();

      if (proposalInfoError) throw proposalInfoError;

      // Store intake event ID for re-analysis
      setIntakeEventId(proposalInfo.intake_event_id);

      // Fetch order with lines (only if this is a change proposal, not a new order)
      let orderData = null;
      if (!isNewOrderProposal) {
        const { data, error: orderError } = await supabaseClient
          .from('orders')
          .select(`
            id,
            customer_name,
            delivery_date,
            status,
            order_lines!inner (
              id,
              line_number,
              product_name,
              quantity,
              status,
              item_variants ( variant_code )
            )
          `)
          .eq('id', orderId)
          .eq('order_lines.status', 'active')
          .single();

        if (orderError) throw orderError;
        // Map variant_code from join into order_lines
        if (data?.order_lines) {
          data.order_lines = data.order_lines.map((line: any) => ({
            ...line,
            variant_code: line.item_variants?.variant_code || '',
          }));
        }
        orderData = data;
      }

      // Fetch proposal lines
      const { data: proposalData, error: proposalError } = await supabaseClient
        .from('order_change_proposal_lines')
        .select('*')
        .eq('proposal_id', proposalId)
        .order('line_number', { ascending: true});

      if (proposalError) throw proposalError;

      // Fetch order events for this order (timeline events) - only for change proposals
      let orderEventsData: any[] = [];
      if (!isNewOrderProposal) {
        const { data, error: orderEventsError } = await supabaseClient
          .from('order_events')
          .select('id, type, created_at, metadata, intake_event_id')
          .eq('order_id', orderId)
          .order('created_at', { ascending: true });

        if (orderEventsError) {
          console.error('Error fetching order events:', orderEventsError);
        } else {
          orderEventsData = data || [];
        }
      }

      // Get unique intake event IDs from order events + proposal intake event
      const intakeEventIdsSet = new Set<string>(
        (orderEventsData || [])
          .map(event => event.intake_event_id)
          .filter(id => id !== null)
      );

      // For new order proposals, add the proposal's intake event
      if (isNewOrderProposal && proposalInfo.intake_event_id) {
        intakeEventIdsSet.add(proposalInfo.intake_event_id);
      }

      const intakeEventIds = Array.from(intakeEventIdsSet);

      // Fetch intake events
      let intakeEventsData: any[] = [];
      if (intakeEventIds.length > 0) {
        const { data, error: intakeEventsError } = await supabaseClient
          .from('intake_events')
          .select('id, channel, created_at, raw_content')
          .in('id', intakeEventIds)
          .order('created_at', { ascending: true });

        if (intakeEventsError) {
          console.error('Error fetching intake events:', intakeEventsError);
        } else {
          intakeEventsData = data || [];
        }
      }

      // Merge intake events and order events into timeline
      const timelineItems: TimelineItem[] = [];

      // Create a map of intake events by ID for linking
      const intakeEventsMap = new Map<string, any>();
      (intakeEventsData || []).forEach((event) => {
        intakeEventsMap.set(event.id, event);
      });

      // Add intake events (communications)
      (intakeEventsData || []).forEach((event) => {
        const content = event.channel === 'sms'
          ? event.raw_content.body
          : (event.raw_content.body_text || event.raw_content.subject);

        timelineItems.push({
          id: event.id,
          type: 'communication',
          timestamp: event.created_at,
          channel: event.channel,
          content,
          subject: event.raw_content.subject,
          from: event.raw_content.from
        });
      });

      // Add order events (no need to include linked communication since the blue intake events already show that)
      (orderEventsData || []).forEach((event) => {
        timelineItems.push({
          id: event.id,
          type: 'event',
          timestamp: event.created_at,
          eventType: event.type,
          metadata: event.metadata
        });
      });

      // Sort by timestamp (earliest first)
      timelineItems.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      // Fetch intake_files for this proposal's intake event
      let filesData: IntakeFile[] = [];
      if (proposalInfo.intake_event_id) {
        const { data: files, error: filesError } = await supabaseClient
          .from('intake_files')
          .select('id, filename, extension, mime_type, size_bytes, storage_path, processing_status, processed_content')
          .eq('intake_event_id', proposalInfo.intake_event_id);

        if (filesError) {
          console.error('Error fetching intake files:', filesError);
        } else {
          filesData = files || [];
        }
      }

      // Generate signed URLs for viewable files (images and PDFs)
      const urls: {[fileId: string]: string} = {};
      for (const file of filesData) {
        const viewableExtensions = ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'];
        if (file.extension && viewableExtensions.includes(file.extension.toLowerCase())) {
          const { data: signedUrlData } = await supabaseClient
            .storage
            .from('intake-files')
            .createSignedUrl(file.storage_path, 3600); // 1 hour expiry

          if (signedUrlData?.signedUrl) {
            urls[file.id] = signedUrlData.signedUrl;
          }
        }
      }

      setIntakeFiles(filesData);
      setFileUrls(urls);

      setOrder(orderData);
      setProposalLines(proposalData || []);
      setTimeline(timelineItems);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveEdits() {
    try {
      setProcessing(true);
      const isNewOrderProposal = !orderId;

      // Delete existing proposal lines
      const { error: deleteError } = await supabaseClient
        .from('order_change_proposal_lines')
        .delete()
        .eq('proposal_id', proposalId);

      if (deleteError) throw deleteError;

      if (isNewOrderProposal) {
        // Save edited lines for new order proposals
        const newLines = editedLines.map((line, idx) => ({
          proposal_id: proposalId,
          line_number: idx + 1,
          change_type: line.change_type,
          item_id: line.item_id,
          item_variant_id: line.item_variant_id || null,
          item_name: line.item_name,
          proposed_values: line.proposed_values,
        }));

        const { error: insertError } = await supabaseClient
          .from('order_change_proposal_lines')
          .insert(newLines);

        if (insertError) throw insertError;

        // Update customer/delivery date on the proposal's proposed_values
        if (editedCustomerName || editedDeliveryDate || editedCustomerId) {
          // Re-fetch to update local state
          const { data: updatedLines } = await supabaseClient
            .from('order_change_proposal_lines')
            .select('*')
            .eq('proposal_id', proposalId)
            .order('line_number', { ascending: true });

          // Update proposed_values on first line with customer/delivery info
          if (updatedLines && updatedLines.length > 0) {
            const firstLine = updatedLines[0];
            const updatedValues = {
              ...(firstLine.proposed_values || {}),
              customer_name: editedCustomerName || firstLine.proposed_values?.customer_name,
              customer_id: editedCustomerId || firstLine.proposed_values?.customer_id,
              delivery_date: editedDeliveryDate || firstLine.proposed_values?.delivery_date,
            };

            await supabaseClient
              .from('order_change_proposal_lines')
              .update({ proposed_values: updatedValues })
              .eq('id', firstLine.id);
          }
        }
      } else {
        // Save edited diff rows for change proposals
        const newLines = editedDiffRows
          .filter((row) => row.changeType !== 'none')
          .map((row, idx) => ({
            proposal_id: proposalId,
            order_line_id: row.orderLineId || null,
            line_number: idx + 1,
            change_type: row.changeType,
            item_id: row.right?.item_id || null,
            item_name: row.right?.product_name || row.left?.product_name || '',
            proposed_values: row.right ? { quantity: row.right.quantity, variant_code: row.right.size } : null,
          }));

        if (newLines.length > 0) {
          const { error: insertError } = await supabaseClient
            .from('order_change_proposal_lines')
            .insert(newLines);

          if (insertError) throw insertError;
        }
      }

      // Re-fetch data to update local state
      await fetchData();

      // Exit edit mode
      setIsEditing(false);
      setEditedLines([]);
      setEditedDiffRows([]);
      setEditedCustomerName('');
      setEditedDeliveryDate('');
      setEditedCustomerId(null);
    } catch (error) {
      console.error('Error saving proposal edits:', error);
      alert('Failed to save changes. Please try again.');
    } finally {
      setProcessing(false);
    }
  }

  async function handleAccept() {
    try {
      setProcessing(true);
      console.log('🚀 Starting handleAccept...');

      // Demo mode: simulate success for demo proposals
      if (proposalId.startsWith('demo-proposal-')) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        alert('✅ Changes accepted successfully! (Demo mode)');
        onResolved();
        return;
      }

      const isNewOrderProposal = !orderId;
      let finalOrderId = orderId;
      console.log('📋 Is new order proposal:', isNewOrderProposal);

      // If this is a new order proposal, create the order first
      if (isNewOrderProposal && proposalLines.length > 0) {
        console.log('📝 Creating new order...');

        // Use edited values if editing, otherwise use original proposal values
        const linesToUse = isEditing ? editedLines : proposalLines;
        const firstLine = linesToUse[0];
        const proposedValues = firstLine.proposed_values as any;

        console.log('Proposal values:', proposedValues);

        // Get organization_id from the current user if not in proposal
        let organizationId = proposedValues.organization_id;

        if (!organizationId) {
          console.log('📝 Fetching organization_id from user...');
          const { data: { user } } = await supabaseClient.auth.getUser();

          if (user) {
            const { data: userOrg } = await supabaseClient
              .from('user_organizations')
              .select('organization_id')
              .eq('user_id', user.id)
              .single();

            organizationId = userOrg?.organization_id;
            console.log('✅ Found organization_id:', organizationId);
          }

          if (!organizationId) {
            throw new Error('Could not determine organization_id for the order');
          }
        }

        const finalCustomerName = isEditing ? editedCustomerName : (proposedValues.customer_name || 'Unknown Customer');
        const finalDeliveryDate = isEditing ? editedDeliveryDate : proposedValues.delivery_date;

        console.log('Final customer name:', finalCustomerName);
        console.log('Final delivery date:', finalDeliveryDate);

        const orderData = {
          organization_id: organizationId,
          customer_id: isEditing && editedCustomerId ? editedCustomerId : proposedValues.customer_id,
          customer_name: finalCustomerName,
          delivery_date: finalDeliveryDate || null, // Convert empty string to null
          source_channel: proposedValues.source_channel,
          status: 'pushed_to_erp',
          created_by_user_id: proposedValues.created_by_user_id
        };

        console.log('📦 Order data to insert:', orderData);

        const { data: newOrder, error: createError } = await supabaseClient
          .from('orders')
          .insert(orderData)
          .select()
          .single();

        if (createError) {
          console.error('❌ Error creating order:', createError);
          throw createError;
        }

        console.log('✅ Order created with ID:', newOrder.id);
        finalOrderId = newOrder.id;

        // Create order events for order creation and export to ERP
        console.log('📝 Creating order events...');
        const { error: eventError } = await supabaseClient.from('order_events').insert([
          {
            order_id: finalOrderId,
            type: 'created',
            metadata: {
              proposal_id: proposalId,
              source: 'approved_proposal',
              line_count: proposalLines.length
            }
          },
          {
            order_id: finalOrderId,
            type: 'exported',
            metadata: {
              proposal_id: proposalId,
              destination: 'ERP',
              status: 'pushed_to_erp'
            }
          }
        ]);

        if (eventError) {
          console.error('❌ Error creating order events:', eventError);
          throw eventError;
        }
        console.log('✅ Order events created (created + exported)');
      }

      // Apply changes to order (or add lines for new order)
      // Use edited data if in editing mode, otherwise use original proposal lines
      let linesToApply: ProposalLine[];
      if (isEditing && isNewOrderProposal) {
        linesToApply = editedLines;
      } else if (isEditing && !isNewOrderProposal) {
        // Convert editedDiffRows back to ProposalLine format
        linesToApply = editedDiffRows
          .filter((row) => row.changeType !== 'none')
          .map((row, idx) => ({
            id: `edited-${idx}`,
            order_line_id: row.orderLineId || null,
            line_number: idx + 1,
            change_type: row.changeType as 'add' | 'remove' | 'modify',
            item_id: row.right?.item_id || null,
            item_name: row.right?.product_name || row.left?.product_name || '',
            proposed_values: row.right ? { quantity: row.right.quantity, variant_code: row.right.size } : null,
          }));
      } else {
        linesToApply = proposalLines;
      }

      console.log(`📝 Applying ${linesToApply.length} line changes...`);

      // For existing orders, get the max line number to avoid conflicts
      let nextLineNumber = 1;
      if (!isNewOrderProposal) {
        const { data: existingLines } = await (supabaseClient as any)
          .from('order_lines')
          .select('line_number')
          .eq('order_id', finalOrderId)
          .order('line_number', { ascending: false })
          .limit(1);

        if (existingLines && existingLines.length > 0) {
          nextLineNumber = existingLines[0].line_number + 1;
        }
      }

      for (const change of linesToApply) {
        console.log(`Processing change: ${change.change_type} - ${change.item_name}`);

        if (change.change_type === 'add') {
          // Use item_variant_id from proposal line, or look up from variant_code
          let itemVariantId: string | null = change.item_variant_id || null;
          if (!itemVariantId && change.item_id && change.proposed_values?.variant_code) {
            const { data: variantData } = await (supabaseClient as any)
              .from('item_variants')
              .select('id')
              .eq('item_id', change.item_id)
              .eq('variant_code', change.proposed_values.variant_code)
              .single();
            if (variantData) {
              itemVariantId = variantData.id;
            }
          }

          // Insert new line
          const lineData: any = {
            order_id: finalOrderId,
            line_number: isNewOrderProposal ? change.line_number : nextLineNumber++,
            product_name: change.item_name,
            quantity: change.proposed_values?.quantity || 0,
            item_id: change.item_id,
            item_variant_id: itemVariantId,
            status: 'active',
          };
          console.log('Inserting line:', lineData);

          const { error: lineError } = await supabaseClient.from('order_lines').insert(lineData);

          if (lineError) {
            console.error('❌ Error inserting order line:', lineError);
            throw lineError;
          }
          console.log('✅ Line inserted');
        } else if (change.change_type === 'remove' && change.order_line_id) {
          // Soft delete line
          const { error: deleteError } = await supabaseClient
            .from('order_lines')
            .update({ status: 'deleted' })
            .eq('id', change.order_line_id);

          if (deleteError) {
            console.error('❌ Error deleting order line:', deleteError);
            throw deleteError;
          }
          console.log('✅ Line deleted');
        } else if (change.change_type === 'modify' && change.order_line_id) {
          // Update line
          const updates: any = {};
          if (change.proposed_values?.quantity !== undefined) {
            updates.quantity = change.proposed_values.quantity;
          }

          // Update item_variant_id if variant_code changed
          if (change.proposed_values?.variant_code && change.item_id) {
            const { data: variantData } = await (supabaseClient as any)
              .from('item_variants')
              .select('id')
              .eq('item_id', change.item_id)
              .eq('variant_code', change.proposed_values.variant_code)
              .single();
            if (variantData) {
              updates.item_variant_id = variantData.id;
            }
          }

          if (Object.keys(updates).length > 0) {
            const { error: updateError } = await supabaseClient
              .from('order_lines')
              .update(updates)
              .eq('id', change.order_line_id);

            if (updateError) {
              console.error('❌ Error updating order line:', updateError);
              throw updateError;
            }
            console.log('✅ Line updated');
          }
        }
      }

      // Update proposal status and link to order
      console.log('📝 Updating proposal status...');
      const { error: proposalError } = await supabaseClient
        .from('order_change_proposals')
        .update({
          status: 'accepted',
          reviewed_at: new Date().toISOString(),
          order_id: finalOrderId // Link proposal to the order (for new orders, this was NULL)
        })
        .eq('id', proposalId);

      if (proposalError) {
        console.error('❌ Error updating proposal:', proposalError);
        throw proposalError;
      }
      console.log('✅ Proposal updated');

      // Create order event for accepted change (only if not new order - already created above)
      if (!isNewOrderProposal) {
        console.log('📝 Creating change accepted event...');
        const { error: changeEventError } = await supabaseClient
          .from('order_events')
          .insert({
            order_id: finalOrderId,
            type: 'change_accepted',
            metadata: {
              proposal_id: proposalId,
              changes_applied: proposalLines.length,
              changes: proposalLines.map((line) => ({
                type: line.change_type,
                item: line.item_name
              }))
            }
          });

        if (changeEventError) {
          console.error('❌ Error creating change event:', changeEventError);
          throw changeEventError;
        }
        console.log('✅ Change event created');
      }

      console.log('✅ All operations completed successfully!');

      // Send notification email via edge function
      try {
        console.log('📧 Sending notification email...');
        const session = await supabaseClient.auth.getSession();
        const { data: { user } } = await (supabaseClient as any).auth.getUser();

        // Get the organization name for the notification
        let organizationName = 'Unknown Organization';
        const linesToUse = isEditing ? editedLines : proposalLines;
        const proposedValues = linesToUse[0]?.proposed_values as any;
        const organizationId = proposedValues?.organization_id;

        if (organizationId) {
          const { data: orgData } = await (supabaseClient as any)
            .from('organizations')
            .select('name')
            .eq('id', organizationId)
            .single();
          if (orgData?.name) {
            organizationName = orgData.name;
          }
        } else if (user) {
          // Fallback: get org from user's organization
          const { data: userOrgData } = await (supabaseClient as any)
            .from('user_organizations')
            .select('organizations(name)')
            .eq('user_id', user.id)
            .single();
          if ((userOrgData as any)?.organizations?.name) {
            organizationName = (userOrgData as any).organizations.name;
          }
        }

        const customerName = isEditing ? editedCustomerName : (order?.customer_name || proposedValues?.customer_name || 'Unknown Customer');
        const deliveryDate = isEditing ? editedDeliveryDate : (order?.delivery_date || proposedValues?.delivery_date || null);

        const notificationPayload = {
          proposalId,
          orderId: finalOrderId,
          customerName,
          deliveryDate,
          isNewOrder: isNewOrderProposal,
          lines: linesToUse.map(line => ({
            id: line.id,
            change_type: line.change_type,
            item_name: line.item_name,
            proposed_values: line.proposed_values || {}
          })),
          acceptedBy: user?.email || 'Unknown User',
          organizationName
        };

        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-accept-proposal`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session.data.session?.access_token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(notificationPayload)
          }
        );

        if (response.ok) {
          console.log('✅ Notification email sent');
        } else {
          const errorData = await response.json();
          console.error('⚠️ Failed to send notification email:', errorData);
          // Don't fail the whole operation if notification fails
        }
      } catch (notificationError) {
        console.error('⚠️ Error sending notification (non-blocking):', notificationError);
        // Don't fail the whole operation if notification fails
      }

      // Show success message
      alert('Order accepted successfully! The order will be reflected in your ERP momentarily.');

      onResolved();
    } catch (error) {
      console.error('Error accepting proposal:', error);
      console.error('Error details:', error);
      alert(`Error accepting proposal: ${error instanceof Error ? error.message : 'Unknown error'}. Check console for details.`);
    } finally {
      setProcessing(false);
    }
  }

  async function handleReject() {
    try {
      setProcessing(true);

      // Demo mode: simulate success for demo proposals
      if (proposalId.startsWith('demo-proposal-')) {
        await new Promise(resolve => setTimeout(resolve, 500));
        alert('Changes rejected. (Demo mode)');
        onResolved();
        return;
      }

      // Update proposal status
      await supabaseClient
        .from('order_change_proposals')
        .update({
          status: 'rejected',
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', proposalId);

      // Create order event for rejected change (only for change proposals, not new orders)
      if (orderId) {
        await supabaseClient
          .from('order_events')
          .insert({
            order_id: orderId,
            type: 'change_rejected',
            metadata: {
              proposal_id: proposalId,
              changes_rejected: proposalLines.length
            }
          });
      }

      onResolved();
    } catch (error) {
      console.error('Error rejecting proposal:', error);
      alert('Error rejecting proposal. Please try again.');
    } finally {
      setProcessing(false);
    }
  }

  async function fetchOrders() {
    // Demo orders for the reclassify dropdown
    const demoOrders = [
      {
        id: 'demo-order-1',
        customer_name: 'Trader Joe\'s',
        created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'pending',
        item_count: 5,
        order_lines: [
          { id: 'ol-1', product_name: 'Organic Bananas', quantity: 100 },
          { id: 'ol-2', product_name: 'Organic Apples', quantity: 75 },
        ]
      },
      {
        id: 'demo-order-2',
        customer_name: 'Safeway',
        created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'pending',
        item_count: 8,
        order_lines: [
          { id: 'ol-3', product_name: 'Romaine Lettuce', quantity: 50 },
          { id: 'ol-4', product_name: 'Iceberg Lettuce', quantity: 40 },
        ]
      },
      {
        id: 'demo-order-3',
        customer_name: 'Costco',
        created_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'pending',
        item_count: 12,
        order_lines: [
          { id: 'ol-5', product_name: 'Mixed Greens', quantity: 200 },
          { id: 'ol-6', product_name: 'Baby Spinach', quantity: 150 },
        ]
      },
    ];

    try {
      const session = await supabaseClient.auth.getSession();
      if (!session.data.session) {
        // Use demo orders if not logged in
        setOrders(demoOrders);
        return;
      }

      // Get user's organization
      const { data: { user } } = await supabaseClient.auth.getUser();
      if (!user) {
        setOrders(demoOrders);
        return;
      }

      const { data: userOrg } = await supabaseClient
        .from('user_organizations')
        .select('organization_id')
        .eq('user_id', user.id)
        .single();

      if (!userOrg) {
        setOrders(demoOrders);
        return;
      }

      // Fetch recent orders for this organization with line details
      const { data: ordersData } = await supabaseClient
        .from('orders')
        .select(`
          id,
          customer_name,
          created_at,
          status,
          order_lines (
            id,
            product_name,
            quantity
          )
        `)
        .eq('organization_id', userOrg.organization_id)
        .order('created_at', { ascending: false })
        .limit(50);

      // Transform to include item count
      const ordersWithCount = ordersData?.map(order => ({
        ...order,
        item_count: order.order_lines?.length || 0
      })) || [];

      // Combine with demo orders for demo purposes
      setOrders([...ordersWithCount, ...demoOrders]);
    } catch (error) {
      console.error('Error fetching orders:', error);
      // Use demo orders on error
      setOrders(demoOrders);
    }
  }

  async function handleReclassifyAsNew() {
    if (!intakeEventId) {
      alert('Cannot reclassify: missing intake event ID');
      return;
    }

    try {
      setProcessing(true);

      // Demo mode: simulate success for demo proposals
      if (proposalId.startsWith('demo-proposal-')) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        alert('Successfully reclassified as new order. (Demo mode)');
        onResolved();
        return;
      }

      const session = await supabaseClient.auth.getSession();

      // Step 1: Reject the current proposal
      await (supabaseClient as any)
        .from('order_change_proposals')
        .update({
          status: 'rejected',
          reviewed_at: new Date().toISOString()
        })
        .eq('id', proposalId);

      // Step 2: Create new proposal as new order (target_order_id: null)
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-proposal`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.data.session?.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            intake_event_id: intakeEventId,
            target_order_id: null  // null = new order proposal
          })
        }
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to reclassify as new order');
      }

      alert('Successfully reclassified as new order. A new proposal has been created.');
      onResolved();
    } catch (error) {
      console.error('Error reclassifying as new:', error);
      alert(`Error reclassifying: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setProcessing(false);
    }
  }

  async function handleReanalyze() {
    if (!intakeEventId) return;

    try {
      setReanalyzing(true);

      // Step 1: Reject the current proposal with note
      await supabaseClient
        .from('order_change_proposals')
        .update({
          status: 'rejected',
          reviewed_at: new Date().toISOString(),
          notes: 'Rejected for re-analysis'
        })
        .eq('id', proposalId);

      // Step 2: Call process-intake-event to create new proposal
      const session = await supabaseClient.auth.getSession();
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-intake-event`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.data.session?.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ intakeEventId })
        }
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Re-analysis failed');
      }

      // Close modal and refresh - new proposal will appear
      onResolved();

    } catch (error) {
      console.error('Error re-analyzing:', error);
      alert(`Re-analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setReanalyzing(false);
    }
  }

  async function handleReclassifyToOrder(targetOrderId: string) {
    if (!intakeEventId) {
      alert('Cannot reclassify: missing intake event ID');
      return;
    }

    try {
      setProcessing(true);

      // Demo mode: simulate success for demo proposals
      if (proposalId.startsWith('demo-proposal-')) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        alert('Successfully reclassified to different order. (Demo mode)');
        onResolved();
        return;
      }

      const session = await supabaseClient.auth.getSession();

      // Step 1: Reject the current proposal
      await (supabaseClient as any)
        .from('order_change_proposals')
        .update({
          status: 'rejected',
          reviewed_at: new Date().toISOString()
        })
        .eq('id', proposalId);

      // Step 2: Create new proposal for the target order
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-proposal`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.data.session?.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            intake_event_id: intakeEventId,
            target_order_id: targetOrderId
          })
        }
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to reclassify to different order');
      }

      alert('Successfully reclassified to different order. A new proposal has been created.');
      onResolved();
    } catch (error) {
      console.error('Error reclassifying to order:', error);
      alert(`Error reclassifying: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setProcessing(false);
      setShowReclassifyMenu(false);
      setReclassifyingOrderId(null);
    }
  }

  function renderDiff() {
    const isNewOrderProposal = !order;

    // For new order proposals, show order details view (like get-order-details)
    if (isNewOrderProposal) {
      const linesToDisplay = isEditing ? editedLines : proposalLines;
      const firstLine = linesToDisplay[0];
      const proposedValues = firstLine?.proposed_values as any;
      const customerName = isEditing ? editedCustomerName : (proposedValues?.customer_name || 'Unknown Customer');
      const deliveryDate = isEditing ? editedDeliveryDate : proposedValues?.delivery_date;

      return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* LEFT COLUMN - Order Information */}
          <div className="space-y-6">
            {/* Customer Info */}
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h4 className="text-lg font-semibold text-gray-900 mb-4">Customer</h4>
              {isEditing ? (
                <div className="space-y-2">
                  {editedCustomerName && (
                    <div className="text-sm text-gray-700">
                      Selected: <span className="font-medium">{editedCustomerName}</span>
                    </div>
                  )}
                  <div className="relative">
                    <input
                      type="text"
                      value={customerSearchTerm}
                      onChange={(e) => {
                        setCustomerSearchTerm(e.target.value);
                        setShowCustomerDropdown(true);
                      }}
                      onFocus={() => setShowCustomerDropdown(true)}
                      onBlur={() => setTimeout(() => setShowCustomerDropdown(false), 200)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                      placeholder="Search customers..."
                    />
                    {showCustomerDropdown && (
                      <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto">
                        {customers
                          .filter((c: any) =>
                            !customerSearchTerm ||
                            c.displayName.toLowerCase().includes(customerSearchTerm.toLowerCase()) ||
                            c.email?.toLowerCase().includes(customerSearchTerm.toLowerCase()) ||
                            c.number?.toLowerCase().includes(customerSearchTerm.toLowerCase())
                          )
                          .map((customer: any) => (
                            <div
                              key={customer.id}
                              onClick={() => {
                                setEditedCustomerId(customer.id);
                                setEditedCustomerName(customer.displayName);
                                setCustomerSearchTerm('');
                                setShowCustomerDropdown(false);
                              }}
                              className="px-3 py-2 hover:bg-indigo-50 cursor-pointer"
                            >
                              <div className="font-medium">{customer.displayName}</div>
                              {customer.email && (
                                <div className="text-sm text-gray-500">{customer.email}</div>
                              )}
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="bg-gray-50 border border-gray-200 rounded-md p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <svg className="w-5 h-5 text-green-600 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      <span className="text-base font-semibold text-gray-900">
                        {customerName}
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        setIsEditing(true);
                        const firstLine = proposalLines[0];
                        const proposedValues = firstLine?.proposed_values as any;
                        setEditedCustomerId(proposedValues?.customer_id || null);
                        setEditedCustomerName(customerName);
                        setEditedDeliveryDate(deliveryDate || null);
                        setEditedLines(JSON.parse(JSON.stringify(proposalLines)));
                      }}
                      className="p-0 hover:bg-transparent"
                      title="Click to edit"
                    >
                      <svg className="w-4 h-4 text-gray-400 cursor-pointer hover:text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Delivery Date */}
            {(deliveryDate || isEditing) && (
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <h4 className="text-sm font-medium text-gray-900 mb-3">Delivery Date</h4>
                <div className="bg-gray-50 rounded-lg p-4">
                  {isEditing ? (
                    <input
                      type="date"
                      value={editedDeliveryDate || ''}
                      onChange={(e) => setEditedDeliveryDate(e.target.value || null)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  ) : (
                    <div className="flex items-center">
                      <svg className="w-4 h-4 text-gray-400 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <span className="text-sm">
                        {deliveryDate ? formatDateString(deliveryDate) : 'Not specified'}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Order Items */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-medium text-gray-900">Order Items</h4>
                {!isEditing && (
                  <button
                    onClick={() => {
                      setIsEditing(true);
                      const firstLine = proposalLines[0];
                      const proposedValues = firstLine?.proposed_values as any;
                      setEditedCustomerId(proposedValues?.customer_id || null);
                      setEditedCustomerName(customerName);
                      setEditedDeliveryDate(deliveryDate || null);
                      setEditedLines(JSON.parse(JSON.stringify(proposalLines)));
                    }}
                    className="text-xs text-indigo-600 hover:text-indigo-700 flex items-center space-x-1"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    <span>Edit Items</span>
                  </button>
                )}
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="space-y-3">
                  {linesToDisplay.map((line, index) => (
                    <div
                      key={index}
                      className="border border-gray-200 rounded-lg p-3 bg-white"
                    >
                      {isEditing ? (
                        <div className="space-y-2">
                          <div className="flex justify-between items-start">
                            <div className="text-sm font-medium text-gray-900 mb-1">
                              {line.item_name}
                              {line.proposed_values?.variant_code && (
                                <span className="ml-1.5 text-xs font-normal text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                                  {line.proposed_values.variant_code}
                                </span>
                              )}
                            </div>
                            <button
                              onClick={() => {
                                const newLines = editedLines.filter((_, i) => i !== index);
                                setEditedLines(newLines);
                              }}
                              className="p-1 text-gray-400 hover:text-red-600"
                              title="Remove item"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                          {/* Item + variant search dropdown */}
                          <div className="relative">
                            <input
                              type="text"
                              value={itemSearchTerms[index] || ''}
                              onChange={(e) => {
                                setItemSearchTerms({...itemSearchTerms, [index]: e.target.value});
                                setShowItemDropdown({...showItemDropdown, [index]: true});
                              }}
                              onFocus={() => setShowItemDropdown({...showItemDropdown, [index]: true})}
                              onBlur={() => setTimeout(() => setShowItemDropdown({...showItemDropdown, [index]: false}), 200)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                              placeholder="Search to change item..."
                            />
                            {showItemDropdown[index] && (
                              <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto">
                                {items
                                  .filter((item: any) => {
                                    const search = (itemSearchTerms[index] || '').toLowerCase();
                                    if (!search) return true;
                                    return item.displayName.toLowerCase().includes(search) ||
                                      item.number?.toLowerCase().includes(search);
                                  })
                                  .flatMap((item: any) => {
                                    const variants = item.item_variants || [];
                                    if (variants.length > 0) {
                                      return variants.map((v: any) => ({
                                        item,
                                        variant: v,
                                        label: `${item.displayName} — ${v.variant_code} (${v.variant_name})`,
                                        key: `${item.id}-${v.id}`,
                                      }));
                                    }
                                    return [{ item, variant: null, label: item.displayName, key: item.id }];
                                  })
                                  .slice(0, 30)
                                  .map((option: any) => (
                                    <div
                                      key={option.key}
                                      onClick={() => {
                                        const newLines = [...editedLines];
                                        newLines[index].item_id = option.item.id;
                                        newLines[index].item_name = option.item.displayName;
                                        newLines[index].item_variant_id = option.variant?.id || null;
                                        if (!newLines[index].proposed_values) {
                                          newLines[index].proposed_values = {};
                                        }
                                        newLines[index].proposed_values!.variant_code = option.variant?.variant_code || null;
                                        setEditedLines(newLines);
                                        setItemSearchTerms({...itemSearchTerms, [index]: ''});
                                        setShowItemDropdown({...showItemDropdown, [index]: false});
                                      }}
                                      className="px-3 py-2 hover:bg-indigo-50 cursor-pointer"
                                    >
                                      <div className="font-medium text-sm">{option.label}</div>
                                    </div>
                                  ))}
                              </div>
                            )}
                          </div>
                          {/* Variant selector if item has variants but none selected yet */}
                          {(() => {
                            const currentItem = items.find((i: any) => i.id === line.item_id);
                            const variants = currentItem?.item_variants || [];
                            if (variants.length > 0) {
                              return (
                                <select
                                  value={line.item_variant_id || ''}
                                  onChange={(e) => {
                                    const newLines = [...editedLines];
                                    const selectedVariant = variants.find((v: any) => v.id === e.target.value);
                                    newLines[index].item_variant_id = selectedVariant?.id || null;
                                    if (!newLines[index].proposed_values) {
                                      newLines[index].proposed_values = {};
                                    }
                                    newLines[index].proposed_values!.variant_code = selectedVariant?.variant_code || null;
                                    setEditedLines(newLines);
                                  }}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                                >
                                  <option value="">Select size/variant...</option>
                                  {variants.map((v: any) => (
                                    <option key={v.id} value={v.id}>
                                      {v.variant_code} — {v.variant_name}
                                    </option>
                                  ))}
                                </select>
                              );
                            }
                            return null;
                          })()}
                          <input
                            type="number"
                            value={line.proposed_values?.quantity || 0}
                            onChange={(e) => {
                              const newLines = [...editedLines];
                              if (!newLines[index].proposed_values) {
                                newLines[index].proposed_values = {};
                              }
                              newLines[index].proposed_values!.quantity = parseInt(e.target.value) || 0;
                              setEditedLines(newLines);
                            }}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                            placeholder="Quantity"
                            min="1"
                          />
                        </div>
                      ) : (
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <div className="text-sm font-medium text-gray-900">
                              {line.item_name}
                              {line.proposed_values?.variant_code && (
                                <span className="ml-1.5 text-xs font-normal text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                                  {line.proposed_values.variant_code}
                                </span>
                              )}
                            </div>
                            {line.proposed_values?.raw_user_input && (
                              <div className="text-xs text-gray-400 mt-1">
                                Original: {line.proposed_values.raw_user_input}
                              </div>
                            )}
                          </div>
                          <div className="text-right ml-4">
                            <div className="text-sm font-medium text-gray-900">
                              Qty: {line.proposed_values?.quantity || 0}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                {/* Add Item button for new order editing */}
                {isEditing && (
                  <button
                    onClick={() => {
                      const newLine: ProposalLine = {
                        id: `new-${Date.now()}`,
                        order_line_id: null,
                        line_number: editedLines.length + 1,
                        change_type: 'add',
                        item_id: null,
                        item_name: 'New Item',
                        proposed_values: { quantity: 1 },
                      };
                      setEditedLines([...editedLines, newLine]);
                    }}
                    className="mt-3 w-full py-2 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-indigo-400 hover:text-indigo-600 flex items-center justify-center space-x-1"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    <span>Add Item</span>
                  </button>
                )}
              </div>
            </div>
          </div>
          {/* END LEFT COLUMN */}

          {/* RIGHT COLUMN - Source Content */}
          <div className="space-y-6">
            {/* Original Message */}
            <div>
              <h4 className="text-sm font-medium text-gray-900 mb-3">Original Message</h4>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <div className="text-sm text-gray-700 whitespace-pre-wrap">
                  {timeline[0]?.content || 'No message content available'}
                </div>
              </div>
            </div>

            {/* Attachments */}
            {intakeFiles.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-gray-900 mb-3">
                  Attachments ({intakeFiles.length})
                </h4>
                <div className="space-y-3">
                  {intakeFiles.map((file) => {
                    const isImage = file.extension && ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(file.extension.toLowerCase());
                    const isPdf = file.extension?.toLowerCase() === 'pdf';
                    const fileUrl = fileUrls[file.id];
                    const isExpanded = expandedFile === file.id;

                    return (
                      <div key={file.id} className="bg-gray-50 border border-gray-200 rounded-lg overflow-hidden">
                        {/* File Header */}
                        <div
                          className="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-100"
                          onClick={() => setExpandedFile(isExpanded ? null : file.id)}
                        >
                          <div className="flex items-center space-x-3">
                            {/* File icon */}
                            {isImage ? (
                              <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                            ) : isPdf ? (
                              <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                              </svg>
                            ) : (
                              <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                            )}
                            <div>
                              <div className="text-sm font-medium text-gray-900">{file.filename}</div>
                              <div className="text-xs text-gray-500">
                                {file.size_bytes ? `${(file.size_bytes / 1024).toFixed(1)} KB` : 'Size unknown'}
                                {file.processing_status === 'completed' && (
                                  <span className="ml-2 text-green-600">• Processed</span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            {fileUrl && (
                              <a
                                href={fileUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="p-1 text-gray-500 hover:text-indigo-600"
                                title="Open in new tab"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                </svg>
                              </a>
                            )}
                            <svg
                              className={`w-4 h-4 text-gray-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </div>
                        </div>

                        {/* Expanded Content */}
                        {isExpanded && (
                          <div className="border-t border-gray-200">
                            {/* Image Preview */}
                            {isImage && fileUrl && (
                              <div className="p-4 bg-white">
                                <img
                                  src={fileUrl}
                                  alt={file.filename}
                                  className="max-w-full h-auto rounded-lg shadow-sm mx-auto"
                                  style={{ maxHeight: '400px' }}
                                />
                              </div>
                            )}

                            {/* PDF Preview */}
                            {isPdf && fileUrl && (
                              <div className="p-4 bg-white">
                                <iframe
                                  src={fileUrl}
                                  title={file.filename}
                                  className="w-full rounded-lg border border-gray-200"
                                  style={{ height: '500px' }}
                                />
                              </div>
                            )}

                            {/* Extracted Text */}
                            {file.processed_content?.llm_whisperer?.text && (
                              <div className="p-4 bg-gray-50 border-t border-gray-200">
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-xs font-medium text-gray-500 uppercase">Extracted Text</span>
                                </div>
                                <div className="text-sm text-gray-700 whitespace-pre-wrap bg-white p-3 rounded border border-gray-200 max-h-48 overflow-y-auto">
                                  {file.processed_content.llm_whisperer.text}
                                </div>
                              </div>
                            )}

                            {/* No preview available */}
                            {!isImage && !isPdf && !file.processed_content?.llm_whisperer?.text && (
                              <div className="p-4 text-center text-sm text-gray-500">
                                Preview not available for this file type
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          {/* END RIGHT COLUMN */}
        </div>
      );
    }

    // For change proposals, show diff view
    // Build diff rows from original data (used for display when not editing)
    function buildDiffRows(): EditableDiffRow[] {
      const rows: EditableDiffRow[] = [];

      (order?.order_lines || [])
        .filter((line) => line.status === 'active')
        .forEach((line) => {
          const modification = proposalLines.find(
            (pl) => pl.change_type === 'modify' && pl.order_line_id === line.id
          );
          const removal = proposalLines.find(
            (pl) => pl.change_type === 'remove' && pl.order_line_id === line.id
          );

          if (removal) {
            rows.push({ left: line, right: null, changeType: 'remove', orderLineId: line.id });
          } else if (modification) {
            rows.push({
              left: line,
              right: {
                product_name: modification.item_name,
                quantity: modification.proposed_values?.quantity ?? line.quantity,
                size: modification.proposed_values?.variant_code || line.variant_code || '',
                item_id: modification.item_id,
              },
              changeType: 'modify',
              orderLineId: line.id,
            });
          } else {
            rows.push({
              left: line,
              right: { product_name: line.product_name, quantity: line.quantity, size: line.variant_code || '' },
              changeType: 'none',
              orderLineId: line.id,
            });
          }
        });

      proposalLines
        .filter((pl) => pl.change_type === 'add')
        .forEach((addition) => {
          rows.push({
            left: null,
            right: {
              product_name: addition.item_name,
              quantity: addition.proposed_values?.quantity || 0,
              size: addition.proposed_values?.variant_code || '',
              item_id: addition.item_id,
            },
            changeType: 'add',
          });
        });

      return rows;
    }

    const displayRows = isEditing ? editedDiffRows : buildDiffRows();

    function startEditingChangeProposal() {
      setIsEditing(true);
      setEditedDiffRows(buildDiffRows());
    }

    function handleChangeRowQuantity(idx: number, quantity: number) {
      const newRows = [...editedDiffRows];
      const row = newRows[idx];
      if (row.right) {
        row.right = { ...row.right, quantity };
      }
      // If it was unchanged, mark as modified
      if (row.changeType === 'none') {
        row.changeType = 'modify';
      }
      setEditedDiffRows(newRows);
    }

    function handleChangeRowItem(idx: number, item: any) {
      const newRows = [...editedDiffRows];
      const row = newRows[idx];
      if (row.right) {
        row.right = { ...row.right, product_name: item.displayName, item_id: item.id };
      }
      if (row.changeType === 'none') {
        row.changeType = 'modify';
      }
      setEditedDiffRows(newRows);
      setItemSearchTerms({ ...itemSearchTerms, [idx]: '' });
      setShowItemDropdown({ ...showItemDropdown, [idx]: false });
    }

    function handleRemoveRow(idx: number) {
      const newRows = [...editedDiffRows];
      const row = newRows[idx];
      if (row.left) {
        // Existing item - mark as removal
        newRows[idx] = { ...row, right: null, changeType: 'remove' };
      } else {
        // New addition - just remove the row entirely
        newRows.splice(idx, 1);
      }
      setEditedDiffRows(newRows);
    }

    function handleUndoRemoveRow(idx: number) {
      const newRows = [...editedDiffRows];
      const row = newRows[idx];
      if (row.left) {
        // Restore to unchanged
        newRows[idx] = {
          ...row,
          right: { product_name: row.left.product_name, quantity: row.left.quantity, size: row.left.variant_code || '' },
          changeType: 'none',
        };
      }
      setEditedDiffRows(newRows);
    }

    function handleAddNewRow() {
      setEditedDiffRows([
        ...editedDiffRows,
        {
          left: null,
          right: { product_name: '', quantity: 1, size: '' },
          changeType: 'add',
        },
      ]);
    }

    // InboxCard-style single-column view
    // Find the communication (intake event) from timeline
    const communication = timeline.find(t => t.type === 'communication');

    return (
      <div>
        {/* Original message from intake event */}
        {communication && (
          <div className="mb-4">
            <div className="flex items-center gap-2 text-xs text-gray-500 mb-1.5">
              {communication.channel === 'sms' ? (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
              )}
              <span className="uppercase font-medium">{communication.channel}</span>
              {communication.from && (
                <>
                  <span>&middot;</span>
                  <span>{communication.from}</span>
                </>
              )}
              <span>&middot;</span>
              <span>{new Date(communication.timestamp).toLocaleString()}</span>
            </div>
            {communication.subject && (
              <p className="text-xs font-medium text-gray-800 mb-1">{communication.subject}</p>
            )}
            <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 italic whitespace-pre-line">
              {communication.content}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between mb-3">
          <p className="text-xs text-gray-400 uppercase tracking-wider font-medium">Changes</p>
          {!isEditing && (
            <button
              onClick={startEditingChangeProposal}
              className="text-xs text-indigo-600 hover:text-indigo-700 flex items-center space-x-1"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              <span>Edit</span>
            </button>
          )}
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-400 uppercase tracking-wider">
              <th className="py-1 text-left font-medium">Item</th>
              <th className="py-1 text-center font-medium w-16">Variant</th>
              <th className="py-1 text-center font-medium w-16">Qty</th>
              <th className="py-1 w-8"></th>
            </tr>
          </thead>
          <tbody>
            {/* Existing order items with diff annotations */}
            {displayRows.filter(r => r.left).map((row, idx) => {
              const originalIdx = displayRows.indexOf(row);
              return (
                <React.Fragment key={idx}>
                  {/* Original item row */}
                  <tr className={`${row.changeType === 'remove' || row.changeType === 'modify' ? 'opacity-50' : ''}`}>
                    <td className={`py-1.5 text-gray-700 ${row.changeType === 'remove' || row.changeType === 'modify' ? 'line-through' : ''}`}>
                      {row.left!.product_name}
                    </td>
                    <td className={`py-1.5 text-center text-gray-500 w-16 ${row.changeType === 'remove' || row.changeType === 'modify' ? 'line-through' : ''}`}>
                      {row.left!.variant_code}
                    </td>
                    <td className={`py-1.5 text-center text-gray-700 font-medium w-16 ${row.changeType === 'remove' || row.changeType === 'modify' ? 'line-through' : ''}`}>
                      {row.left!.quantity}
                    </td>
                    <td className="py-1.5 w-8">
                      {isEditing && row.changeType === 'none' && (
                        <button
                          onClick={() => handleRemoveRow(originalIdx)}
                          className="text-gray-300 hover:text-red-500 transition-colors"
                          title="Remove item"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </td>
                  </tr>
                  {/* Modify annotation sub-row */}
                  {row.changeType === 'modify' && (
                    <tr className="bg-blue-50">
                      <td className="py-1.5 pl-5 text-blue-700 text-sm">
                        <span className="text-blue-400 mr-1">&#8627;</span>
                        {row.right?.product_name}
                      </td>
                      <td className="py-1.5 text-center text-blue-600 text-sm">
                        {row.right?.size}
                      </td>
                      <td className="py-1.5 text-center">
                        {isEditing ? (
                          <input
                            type="number"
                            min="1"
                            value={row.right?.quantity || 0}
                            onChange={(e) => handleChangeRowQuantity(originalIdx, parseInt(e.target.value) || 0)}
                            className="w-12 px-1 py-0.5 text-sm text-center border border-blue-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 font-semibold"
                          />
                        ) : (
                          <span className="font-semibold text-blue-700">{row.right?.quantity}</span>
                        )}
                      </td>
                      <td className="py-1.5">
                        {isEditing && (
                          <button
                            onClick={() => handleUndoRemoveRow(originalIdx)}
                            className="text-gray-400 hover:text-red-500"
                            title="Undo modification"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </td>
                    </tr>
                  )}
                  {/* Remove annotation sub-row */}
                  {row.changeType === 'remove' && (
                    <tr>
                      <td colSpan={3} className="pb-1.5">
                        <div className="ml-4 px-2 py-1 bg-red-50 border border-red-200 rounded text-xs text-red-600 inline-flex items-center gap-2">
                          <span>&#8627; remove</span>
                        </div>
                      </td>
                      <td className="pb-1.5">
                        {isEditing && (
                          <button
                            onClick={() => handleUndoRemoveRow(originalIdx)}
                            className="text-xs text-indigo-600 hover:text-indigo-700"
                            title="Undo remove"
                          >
                            Undo
                          </button>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}

            {/* Separator before add rows */}
            {displayRows.some(r => r.changeType === 'add') && (
              <tr>
                <td colSpan={4} className="py-1">
                  <div className="border-t border-dashed border-gray-300"></div>
                </td>
              </tr>
            )}

            {/* Add rows */}
            {displayRows.filter(r => r.changeType === 'add').map((row, addIdx) => {
              const originalIdx = displayRows.indexOf(row);
              return (
                <tr key={`add-${addIdx}`} className="bg-green-50">
                  <td className="py-1.5 text-green-700">
                    <span className="text-green-500 mr-1">+</span>
                    {isEditing ? (
                      <div className="inline-block relative">
                        <span className="text-sm font-medium">{row.right?.product_name || 'Select item...'}</span>
                        <input
                          type="text"
                          value={itemSearchTerms[originalIdx] || ''}
                          onChange={(e) => {
                            setItemSearchTerms({ ...itemSearchTerms, [originalIdx]: e.target.value });
                            setShowItemDropdown({ ...showItemDropdown, [originalIdx]: true });
                          }}
                          onFocus={() => setShowItemDropdown({ ...showItemDropdown, [originalIdx]: true })}
                          onBlur={() => setTimeout(() => setShowItemDropdown({ ...showItemDropdown, [originalIdx]: false }), 200)}
                          className="ml-2 w-40 px-2 py-0.5 text-xs border border-green-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-green-500"
                          placeholder="Search..."
                        />
                        {showItemDropdown[originalIdx] && (
                          <div className="absolute z-10 left-0 mt-1 w-64 bg-white border border-gray-300 rounded-md shadow-lg max-h-48 overflow-auto">
                            {items
                              .filter((item: any) =>
                                !itemSearchTerms[originalIdx] ||
                                item.displayName.toLowerCase().includes(itemSearchTerms[originalIdx].toLowerCase())
                              )
                              .map((item: any) => (
                                <div
                                  key={item.id}
                                  onClick={() => handleChangeRowItem(originalIdx, item)}
                                  className="px-3 py-2 hover:bg-green-50 cursor-pointer text-sm"
                                >
                                  {item.displayName}
                                </div>
                              ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span>{row.right?.product_name}</span>
                    )}
                  </td>
                  <td className="py-1.5 text-center text-green-600 text-sm">
                    {row.right?.size}
                  </td>
                  <td className="py-1.5 text-center">
                    {isEditing ? (
                      <input
                        type="number"
                        min="1"
                        value={row.right?.quantity || 0}
                        onChange={(e) => handleChangeRowQuantity(originalIdx, parseInt(e.target.value) || 0)}
                        className="w-12 px-1 py-0.5 text-sm text-center border border-green-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-green-500 font-semibold"
                      />
                    ) : (
                      <span className="font-semibold text-green-700">{row.right?.quantity}</span>
                    )}
                  </td>
                  <td className="py-1.5">
                    {isEditing && (
                      <button
                        onClick={() => handleRemoveRow(originalIdx)}
                        className="text-gray-400 hover:text-red-500"
                        title="Remove"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}

            {/* Add new item button */}
            {isEditing && (
              <tr>
                <td colSpan={4} className="pt-2">
                  <button
                    onClick={handleAddNewRow}
                    className="text-xs text-green-600 hover:text-green-700 flex items-center gap-1"
                  >
                    <span>+</span> Add item
                  </button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8 max-w-4xl w-full mx-4">
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  const isNewOrderProposal = !orderId;

  // Get customer and delivery info from proposal lines for new orders
  const customerName = isNewOrderProposal && proposalLines.length > 0
    ? proposalLines[0].proposed_values?.customer_name || 'Unknown Customer'
    : order?.customer_name || 'Unknown Customer';

  const deliveryDate = isNewOrderProposal && proposalLines.length > 0
    ? proposalLines[0].proposed_values?.delivery_date
    : order?.delivery_date;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-7xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="border-b p-6">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-2xl font-bold mb-2">
                {isNewOrderProposal ? 'Review New Order' : 'Review Order Changes'}
              </h2>
              <p className="text-gray-600">Customer: {customerName}</p>
              {deliveryDate && (
                <p className="text-gray-600">
                  Delivery: {formatDateString(deliveryDate)}
                </p>
              )}
            </div>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 text-2xl"
              disabled={processing}
            >
              ×
            </button>
          </div>
        </div>

        {/* Content - Split into diff view and communications log (or full width for new orders) */}
        <div className="flex-1 overflow-hidden flex">
          {/* Left: Diff View */}
          <div className="flex-1 overflow-y-auto p-6">
            {renderDiff()}
          </div>

          {/* Only show timeline for order changes, not for new orders */}
          {!isNewOrderProposal && (
            <>
              {/* Draggable Divider */}
              <div
                className="w-1 bg-gray-300 hover:bg-blue-500 cursor-col-resize flex-shrink-0 relative group"
                onMouseDown={() => setIsDragging(true)}
              >
                <div className="absolute inset-y-0 -left-1 -right-1" />
              </div>

              {/* Right: Timeline */}
              <div
                className="bg-gray-50 flex-shrink-0 flex flex-col"
                style={{ width: `${timelineWidth}px` }}
              >
            {/* Sticky Header */}
            <div className="sticky top-0 bg-gray-50 z-10 px-6 pt-6 pb-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Timeline</h3>
                <button
                  onClick={() => setTimelineOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                  className="flex items-center gap-1 text-xs text-gray-600 hover:text-gray-900 px-2 py-1 rounded hover:bg-gray-200 transition-colors"
                  title={timelineOrder === 'asc' ? 'Sort newest first' : 'Sort oldest first'}
                >
                  {timelineOrder === 'asc' ? (
                    <>
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 11l5-5m0 0l5 5m-5-5v12" />
                      </svg>
                      <span>Oldest</span>
                    </>
                  ) : (
                    <>
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 13l-5 5m0 0l-5-5m5 5V6" />
                      </svg>
                      <span>Newest</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Scrollable Timeline Content */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {timeline.length === 0 ? (
                <p className="text-sm text-gray-500">No timeline events</p>
              ) : (
                <div className="space-y-3 relative">
                {/* Timeline line */}
                <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-300"></div>

                {[...timeline]
                  .sort((a, b) => {
                    const timeA = new Date(a.timestamp).getTime();
                    const timeB = new Date(b.timestamp).getTime();
                    return timelineOrder === 'asc' ? timeA - timeB : timeB - timeA;
                  })
                  .map((item, idx) => {
                  const isExpanded = expandedItems.has(item.id);
                  const hasExpandableContent = item.type === 'communication' && item.content && item.content.length > 100;

                  return (
                    <div key={item.id} className="relative pl-10">
                      {/* Timeline dot */}
                      <div className={`absolute left-2.5 top-2 w-3 h-3 rounded-full border-2 ${
                        item.type === 'communication'
                          ? 'bg-blue-500 border-blue-200'
                          : 'bg-green-500 border-green-200'
                      }`}></div>

                      <div className="bg-white rounded-lg p-3 shadow-sm border border-gray-200">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs text-gray-400">
                            {new Date(item.timestamp).toLocaleString()}
                          </span>
                        </div>

                        {item.type === 'communication' ? (
                          <>
                            <div className="flex items-center justify-between gap-2 mb-2">
                              <div className="flex items-center gap-2">
                                {item.channel === 'email' ? (
                                  <svg className="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                  </svg>
                                ) : (
                                  <svg className="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                  </svg>
                                )}
                                <span className="text-xs font-medium text-gray-500 uppercase">{item.channel}</span>
                              </div>
                              {hasExpandableContent && (
                                <button
                                  onClick={() => toggleExpanded(item.id)}
                                  className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
                                >
                                  {isExpanded ? (
                                    <>
                                      <span>Collapse</span>
                                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                      </svg>
                                    </>
                                  ) : (
                                    <>
                                      <span>Expand</span>
                                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                      </svg>
                                    </>
                                  )}
                                </button>
                              )}
                            </div>

                            {item.subject && (
                              <p className="text-sm font-medium text-gray-900 mb-1">{item.subject}</p>
                            )}

                            {item.from && (
                              <p className="text-xs text-gray-500 mb-2">From: {item.from}</p>
                            )}

                            <p className={`text-sm text-gray-700 whitespace-pre-wrap ${!isExpanded && hasExpandableContent ? 'line-clamp-2' : ''}`}>
                              {item.content}
                            </p>
                          </>
                        ) : (
                        <>
                          <p className="text-sm font-medium text-gray-900 capitalize mb-1">
                            {item.eventType?.replace('_', ' ')}
                          </p>
                          {item.metadata && (
                            <div className="text-xs text-gray-600 space-y-1">
                              {item.metadata.change_count && (
                                <p>{item.metadata.change_count} change{item.metadata.change_count > 1 ? 's' : ''} proposed</p>
                              )}
                              {item.metadata.changes_applied && (
                                <p>{item.metadata.changes_applied} change{item.metadata.changes_applied > 1 ? 's' : ''} applied</p>
                              )}
                              {item.metadata.line_count && (
                                <p>{item.metadata.line_count} line{item.metadata.line_count > 1 ? 's' : ''}</p>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                  );
                })}
              </div>
              )}
            </div>
          </div>
          </>
          )}
        </div>

        {/* Footer */}
        <div className="border-t p-6 flex justify-between items-center">
          {/* Left side - Reclassify dropdown and Re-analyze button */}
          {!isEditing && (
            <div className="flex items-center gap-2">
            <div className="relative">
              <button
                onClick={() => {
                  if (!showReclassifyMenu) {
                    fetchOrders();
                  }
                  setShowReclassifyMenu(!showReclassifyMenu);
                }}
                disabled={processing}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Reclassify
              </button>

              {showReclassifyMenu && (
                <div className="absolute bottom-full left-0 mb-2 w-80 bg-white border border-gray-300 rounded-lg shadow-lg z-50">
                  <div className="p-4">
                    <h4 className="font-medium text-gray-900 mb-3">Reclassify Proposal</h4>

                    {/* Option 1: Treat as new order */}
                    {!isNewOrderProposal && (
                      <button
                        onClick={handleReclassifyAsNew}
                        disabled={processing}
                        className="w-full text-left px-3 py-2 hover:bg-gray-50 rounded-md mb-2 disabled:opacity-50"
                      >
                        <div className="font-medium text-sm text-gray-900">Convert to New Order</div>
                        <div className="text-xs text-gray-500">AI incorrectly suggested changes to existing order</div>
                      </button>
                    )}

                    {/* Option 2: Reassign to different order */}
                    <div className="mb-2">
                      <div className="font-medium text-sm text-gray-900 px-3 py-2">Reassign to Different Order</div>
                      <div className="text-xs text-gray-500 px-3 pb-2">AI mapped to wrong order</div>
                      <div className="relative px-3">
                        <input
                          type="text"
                          value={orderSearchTerm}
                          onChange={(e) => {
                            setOrderSearchTerm(e.target.value);
                            setShowOrderDropdown(true);
                          }}
                          onFocus={() => setShowOrderDropdown(true)}
                          onBlur={() => {
                            // Delay to allow click on dropdown item
                            setTimeout(() => setShowOrderDropdown(false), 200);
                          }}
                          placeholder="Search orders..."
                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                        />
                        {showOrderDropdown && (
                          <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-48 overflow-auto">
                            {orders
                              .filter(o =>
                                !orderSearchTerm ||
                                o.customer_name?.toLowerCase().includes(orderSearchTerm.toLowerCase()) ||
                                o.id.toLowerCase().includes(orderSearchTerm.toLowerCase())
                              )
                              .map((order) => (
                                <div
                                  key={order.id}
                                  className="relative"
                                  onMouseEnter={() => setHoveredOrderId(order.id)}
                                  onMouseLeave={() => setHoveredOrderId(null)}
                                >
                                  <div
                                    onClick={() => {
                                      setReclassifyingOrderId(order.id);
                                      setOrderSearchTerm('');
                                      setShowOrderDropdown(false);
                                      setHoveredOrderId(null);
                                      if (confirm(`Reclassify this proposal to order for ${order.customer_name}?`)) {
                                        handleReclassifyToOrder(order.id);
                                      }
                                    }}
                                    className="px-3 py-2 hover:bg-indigo-50 cursor-pointer"
                                  >
                                    <div className="font-medium text-sm">{order.customer_name}</div>
                                    <div className="text-xs text-gray-500">
                                      {new Date(order.created_at).toLocaleDateString()} • {order.item_count} item{order.item_count !== 1 ? 's' : ''}
                                    </div>
                                  </div>

                                  {/* Hover preview tooltip */}
                                  {hoveredOrderId === order.id && order.order_lines && order.order_lines.length > 0 && (
                                    <div className="absolute left-full top-0 ml-2 w-64 bg-white border border-gray-300 rounded-lg shadow-xl p-3 z-50">
                                      <div className="font-medium text-sm text-gray-900 mb-2">Order Items:</div>
                                      <div className="space-y-1 max-h-48 overflow-auto">
                                        {order.order_lines.map((line: any, idx: number) => (
                                          <div key={line.id || idx} className="text-xs flex justify-between items-start">
                                            <span className="text-gray-700 flex-1">{line.product_name}</span>
                                            <span className="text-gray-500 ml-2 font-medium">×{line.quantity}</span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <button
                      onClick={() => setShowReclassifyMenu(false)}
                      className="w-full mt-2 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-md"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Re-analyze button */}
            {intakeEventId && (
              <button
                onClick={handleReanalyze}
                disabled={processing || reanalyzing}
                className="px-4 py-2 border border-blue-300 text-blue-700 rounded-lg hover:bg-blue-50 disabled:opacity-50 flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                {reanalyzing ? 'Re-analyzing...' : 'Re-analyze'}
              </button>
            )}
            </div>
          )}

          {/* Right side - Accept/Reject buttons */}
          <div className="flex gap-4 ml-auto">
            {isEditing ? (
              <>
                <button
                  onClick={() => {
                    setIsEditing(false);
                    setEditedCustomerName('');
                    setEditedDeliveryDate('');
                    setEditedLines([]);
                    setEditedDiffRows([]);
                  }}
                  disabled={processing}
                  className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEdits}
                  disabled={processing}
                  className="px-6 py-2 border border-indigo-300 text-indigo-700 rounded-lg hover:bg-indigo-50 disabled:opacity-50"
                >
                  {processing ? 'Saving...' : 'Save'}
                </button>
                <button
                  onClick={handleAccept}
                  disabled={processing}
                  className="px-6 py-2 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                  style={{ backgroundColor: processing ? '#16a34a' : '#53AD6D' }}
                  onMouseEnter={(e) => {
                    if (!e.currentTarget.disabled) {
                      e.currentTarget.style.backgroundColor = '#4a9c63';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!e.currentTarget.disabled) {
                      e.currentTarget.style.backgroundColor = '#53AD6D';
                    }
                  }}
                >
                  {processing ? 'Processing...' : isNewOrderProposal ? 'Create ERP Order' : 'Accept Changes'}
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={handleReject}
                  disabled={processing}
                  className="px-6 py-2 border border-red-300 text-red-700 rounded-lg hover:bg-red-50 disabled:opacity-50"
                >
                  {processing ? 'Processing...' : 'Reject'}
                </button>
                <button
                  onClick={handleAccept}
                  disabled={processing}
                  className="px-6 py-2 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                  style={{ backgroundColor: processing ? '#16a34a' : '#53AD6D' }}
                  onMouseEnter={(e) => {
                    if (!e.currentTarget.disabled) {
                      e.currentTarget.style.backgroundColor = '#4a9c63';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!e.currentTarget.disabled) {
                      e.currentTarget.style.backgroundColor = '#53AD6D';
                    }
                  }}
                >
                  {processing ? 'Processing...' : isNewOrderProposal ? 'Create ERP Order' : 'Accept Changes'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
