import { useState, useEffect } from 'react';
import { supabaseClient } from '../supabaseClient';

interface OrderLine {
  id: string;
  line_number: number;
  product_name: string;
  quantity: number;
  status: string;
}

interface ProposalLine {
  id: string;
  order_line_id: string | null;
  line_number: number;
  change_type: 'add' | 'remove' | 'modify';
  item_id: string | null;
  item_name: string;
  proposed_values: {
    quantity?: number;
  } | null;
}

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
}

export default function ProposalDiffModal({ proposalId, orderId, onClose, onResolved }: Props) {
  const [order, setOrder] = useState<Order | null>(null);
  const [proposalLines, setProposalLines] = useState<ProposalLine[]>([]);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [timelineWidth, setTimelineWidth] = useState(384); // 96 * 4 = 384px (w-96)
  const [isDragging, setIsDragging] = useState(false);
  const [timelineOrder, setTimelineOrder] = useState<'asc' | 'desc'>('desc'); // Default to newest first

  // Editing state for new order proposals
  const [isEditing, setIsEditing] = useState(false);
  const [editedCustomerId, setEditedCustomerId] = useState<string | null>(null);
  const [editedCustomerName, setEditedCustomerName] = useState('');
  const [editedDeliveryDate, setEditedDeliveryDate] = useState<string | null>(null);
  const [editedLines, setEditedLines] = useState<ProposalLine[]>([]);

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
    try {
      const session = await supabaseClient.auth.getSession();
      if (!session.data.session) return;

      // Fetch items using the same endpoint as OrdersSection
      const itemsResponse = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-catalog-data?type=items`,
        {
          headers: {
            'Authorization': `Bearer ${session.data.session.access_token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (itemsResponse.ok) {
        const itemsResult = await itemsResponse.json();
        if (itemsResult.success && itemsResult.data) {
          setItems(itemsResult.data);
        }
      }

      // Fetch customers using the same endpoint as OrdersSection
      const customersResponse = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-catalog-data?type=customers`,
        {
          headers: {
            'Authorization': `Bearer ${session.data.session.access_token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (customersResponse.ok) {
        const customersResult = await customersResponse.json();
        if (customersResult.success && customersResult.data) {
          setCustomers(customersResult.data);
        }
      }
    } catch (error) {
      console.error('Error fetching customers and items:', error);
    }
  }

  async function fetchData() {
    try {
      setLoading(true);

      const isNewOrderProposal = !orderId;

      // Fetch the proposal itself to get intake_event_id
      const { data: proposalInfo, error: proposalInfoError } = await supabaseClient
        .from('order_change_proposals')
        .select('intake_event_id')
        .eq('id', proposalId)
        .single();

      if (proposalInfoError) throw proposalInfoError;

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
              status
            )
          `)
          .eq('id', orderId)
          .eq('order_lines.status', 'active')
          .single();

        if (orderError) throw orderError;
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

      setOrder(orderData);
      setProposalLines(proposalData || []);
      setTimeline(timelineItems);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleAccept() {
    try {
      setProcessing(true);
      console.log('🚀 Starting handleAccept...');

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
      // Use edited lines if in editing mode, otherwise use original proposal lines
      const linesToApply = (isNewOrderProposal && isEditing) ? editedLines : proposalLines;

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
          // Insert new line
          const lineData = {
            order_id: finalOrderId,
            line_number: isNewOrderProposal ? change.line_number : nextLineNumber++,
            product_name: change.item_name,
            quantity: change.proposed_values?.quantity || 0,
            item_id: change.item_id,
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
    try {
      const session = await supabaseClient.auth.getSession();
      if (!session.data.session) return;

      // Get user's organization
      const { data: { user } } = await supabaseClient.auth.getUser();
      if (!user) return;

      const { data: userOrg } = await supabaseClient
        .from('user_organizations')
        .select('organization_id')
        .eq('user_id', user.id)
        .single();

      if (!userOrg) return;

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

      setOrders(ordersWithCount);
    } catch (error) {
      console.error('Error fetching orders:', error);
    }
  }

  async function handleReclassifyAsNew() {
    try {
      setProcessing(true);

      const session = await supabaseClient.auth.getSession();
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/reclassify-proposal`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.data.session?.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            proposal_id: proposalId,
            action: 'convert_to_new'
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

  async function handleReclassifyToOrder(targetOrderId: string) {
    try {
      setProcessing(true);

      const session = await supabaseClient.auth.getSession();
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/reclassify-proposal`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.data.session?.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            proposal_id: proposalId,
            action: 'reassign_to_order',
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
                        {deliveryDate ? new Date(deliveryDate).toLocaleDateString() : 'Not specified'}
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
                          <div className="text-sm font-medium text-gray-900 mb-1">
                            {line.item_name}
                          </div>
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
                              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                              placeholder="Search to change item..."
                            />
                            {showItemDropdown[index] && (
                              <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto">
                                {items
                                  .filter((item: any) =>
                                    !itemSearchTerms[index] ||
                                    item.displayName.toLowerCase().includes(itemSearchTerms[index].toLowerCase()) ||
                                    item.number?.toLowerCase().includes(itemSearchTerms[index].toLowerCase()) ||
                                    item.description?.toLowerCase().includes(itemSearchTerms[index].toLowerCase())
                                  )
                                  .map((item: any) => (
                                    <div
                                      key={item.id}
                                      onClick={() => {
                                        const newLines = [...editedLines];
                                        newLines[index].item_id = item.id;
                                        newLines[index].item_name = item.displayName;
                                        setEditedLines(newLines);
                                        setItemSearchTerms({...itemSearchTerms, [index]: ''});
                                        setShowItemDropdown({...showItemDropdown, [index]: false});
                                      }}
                                      className="px-3 py-2 hover:bg-indigo-50 cursor-pointer"
                                    >
                                      <div className="font-medium">{item.displayName}</div>
                                      <div className="text-sm text-gray-500">
                                        SKU: {item.number}
                                      </div>
                                    </div>
                                  ))}
                              </div>
                            )}
                          </div>
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
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                            placeholder="Quantity"
                            min="1"
                          />
                        </div>
                      ) : (
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <div className="text-sm font-medium text-gray-900">{line.item_name}</div>
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
          </div>
          {/* END RIGHT COLUMN */}
        </div>
      );
    }

    // For change proposals, show diff view
    // Create a map of existing lines for easy lookup
    const existingLinesMap = new Map<string, OrderLine>();
    order.order_lines
      .filter((line) => line.status === 'active')
      .forEach((line) => {
        existingLinesMap.set(line.id, line);
      });

    // Build diff rows (one row per change)
    type DiffRow = {
      left: OrderLine | null;
      right: { product_name: string; quantity: number } | null;
      changeType: 'add' | 'remove' | 'modify' | 'none';
    };

    const diffRows: DiffRow[] = [];

    // Process existing lines
    order.order_lines
      .filter((line) => line.status === 'active')
      .forEach((line) => {
        const modification = proposalLines.find(
          (pl) => pl.change_type === 'modify' && pl.order_line_id === line.id
        );
        const removal = proposalLines.find(
          (pl) => pl.change_type === 'remove' && pl.order_line_id === line.id
        );

        if (removal) {
          // Removal: left filled, right empty
          diffRows.push({
            left: line,
            right: null,
            changeType: 'remove',
          });
        } else if (modification) {
          // Modification: both sides filled
          diffRows.push({
            left: line,
            right: {
              product_name: modification.item_name,
              quantity: modification.proposed_values?.quantity ?? line.quantity,
            },
            changeType: 'modify',
          });
        } else {
          // Unchanged: both sides filled, same content
          diffRows.push({
            left: line,
            right: {
              product_name: line.product_name,
              quantity: line.quantity,
            },
            changeType: 'none',
          });
        }
      });

    // Add additions: left empty, right filled
    proposalLines
      .filter((pl) => pl.change_type === 'add')
      .forEach((addition) => {
        diffRows.push({
          left: null,
          right: {
            product_name: addition.item_name,
            quantity: addition.proposed_values?.quantity || 0,
          },
          changeType: 'add',
        });
      });

    return (
      <div>
        <div className="grid grid-cols-2 gap-6 mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Current Order</h3>
          <h3 className="text-lg font-semibold text-gray-900">Proposed Changes</h3>
        </div>

        <div className="space-y-2">
          {diffRows.map((row, idx) => (
            <div key={idx} className="grid grid-cols-2 gap-6">
              {/* Left side */}
              <div>
                {row.left ? (
                  <div
                    className={`p-3 rounded-lg border ${
                      row.changeType === 'remove'
                        ? 'bg-red-50 border-red-200'
                        : row.changeType === 'modify'
                        ? 'bg-blue-50 border-blue-200'
                        : 'bg-gray-50 border-gray-200'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-1">
                      <span
                        className={`font-medium text-sm ${
                          row.changeType === 'remove' ? 'line-through text-gray-500' : 'text-gray-900'
                        }`}
                      >
                        {row.left.product_name}
                      </span>
                      {row.changeType === 'remove' && (
                        <span className="text-xs font-semibold text-red-600 bg-red-100 px-2 py-0.5 rounded">
                          REMOVED
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-600">
                      <span>Qty: {row.left.quantity}</span>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 rounded-lg border border-dashed border-gray-300 bg-gray-50 opacity-40">
                    <div className="text-xs text-gray-400 text-center">—</div>
                  </div>
                )}
              </div>

              {/* Right side */}
              <div>
                {row.right ? (
                  <div
                    className={`p-3 rounded-lg border ${
                      row.changeType === 'add'
                        ? 'bg-green-50 border-green-200'
                        : row.changeType === 'modify'
                        ? 'bg-blue-50 border-blue-200'
                        : 'bg-gray-50 border-gray-200'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-1">
                      <span className="font-medium text-sm text-gray-900">{row.right.product_name}</span>
                      {row.changeType === 'add' && (
                        <span className="text-xs font-semibold text-green-600 bg-green-100 px-2 py-0.5 rounded">
                          NEW
                        </span>
                      )}
                      {row.changeType === 'modify' && (
                        <span className="text-xs font-semibold text-blue-600 bg-blue-100 px-2 py-0.5 rounded">
                          MODIFIED
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-600">
                      <span>Qty: {row.right.quantity}</span>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 rounded-lg border border-dashed border-gray-300 bg-gray-50 opacity-40">
                    <div className="text-xs text-gray-400 text-center">—</div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
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
                  Delivery: {new Date(deliveryDate).toLocaleDateString()}
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
          {/* Left side - Reclassify dropdown */}
          {!isEditing && (
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
          )}

          {/* Right side - Accept/Reject buttons */}
          <div className="flex gap-4 ml-auto">
            {isEditing && isNewOrderProposal ? (
              <>
                <button
                  onClick={() => {
                    setIsEditing(false);
                    setEditedCustomerName('');
                    setEditedDeliveryDate('');
                    setEditedLines([]);
                  }}
                  disabled={processing}
                  className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
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
                  {processing ? 'Processing...' : 'Create ERP Order'}
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
