import React, { useEffect, useState } from 'react';
import { Shield, Search, Plus, Building2, Users, Package, FileText, LogOut, X, Loader2, ShoppingCart, ClipboardList, RefreshCw, Eye, GitCompare, Minus, ArrowRight } from 'lucide-react';
import { supabaseClient } from '../supabaseClient';
import ProposalDiffModal from '../components/ProposalDiffModal';

const ADMIN_EMAIL = 'orders.frootful@gmail.com';

// Helper function to format date strings (YYYY-MM-DD) without timezone issues
const formatDateString = (dateStr: string): string => {
  // Parse YYYY-MM-DD format and display in local format without timezone shift
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString();
};

interface User {
  id: string;
  email: string;
}

interface Organization {
  id: string;
  name: string;
}

interface Customer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
}

interface Item {
  id: string;
  sku: string;
  name: string;
  base_price: number;
}

interface OrderLine {
  itemId: string;
  itemName: string;
  quantity: number;
  sku: string;
}

interface OrgSearchResult {
  id: string;
  name: string;
}

interface Order {
  id: string;
  customer_name: string | null;
  status: string;
  delivery_date: string | null;
  created_at: string;
  order_lines: { id: string; product_name: string; quantity: number; status: string }[];
}

interface Proposal {
  id: string;
  status: string;
  created_at: string;
  order_id: string | null;
  order_change_proposal_lines: { id: string; item_name: string; change_type: 'add' | 'remove' | 'modify'; proposed_values: any }[];
}

interface OrgUser {
  user_id: string;
  email: string;
  role: string;
}

interface IntakeEvent {
  id: string;
  channel: string;
  provider: string;
  raw_content: Record<string, unknown> | null;
  created_at: string;
  organization_id: string | null;
}

interface ExistingOrderLine {
  id: string;
  item_id: string | null;
  product_name: string;
  quantity: number;
  meta: { sku?: string } | null;
}

interface ProposedLine {
  originalLineId: string | null;  // null for new items
  itemId: string;
  itemName: string;
  sku: string;
  quantity: number;
  isNew: boolean;
}

interface OrderForSelection {
  id: string;
  customer_name: string | null;
  status: string;
  delivery_date: string | null;
  created_at: string;
}

const AdminDashboard: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);

  // Organization selection
  const [allOrganizations, setAllOrganizations] = useState<OrgSearchResult[]>([]);
  const [loadingOrgs, setLoadingOrgs] = useState(false);
  const [selectedOrg, setSelectedOrg] = useState<{ id: string; name: string } | null>(null);
  const [showOrgDropdown, setShowOrgDropdown] = useState(false);

  // Customers, Items, Users, and Intake Events for selected org
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [orgUsers, setOrgUsers] = useState<OrgUser[]>([]);
  const [intakeEvents, setIntakeEvents] = useState<IntakeEvent[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);

  // Create order form
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [orderLines, setOrderLines] = useState<OrderLine[]>([]);
  const [itemSearch, setItemSearch] = useState('');
  const [showItemDropdown, setShowItemDropdown] = useState(false);
  const [deliveryDate, setDeliveryDate] = useState('');
  const [selectedReceivedBy, setSelectedReceivedBy] = useState<OrgUser | null>(null);
  const [receivedBySearch, setReceivedBySearch] = useState('');
  const [showReceivedByDropdown, setShowReceivedByDropdown] = useState(false);
  const [selectedIntakeEvent, setSelectedIntakeEvent] = useState<IntakeEvent | null>(null);
  const [intakeEventSearch, setIntakeEventSearch] = useState('');
  const [showIntakeEventDropdown, setShowIntakeEventDropdown] = useState(false);
  const [previewIntakeEvent, setPreviewIntakeEvent] = useState<IntakeEvent | null>(null);
  const [sourceChannel, setSourceChannel] = useState<string>('email');
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);
  const [orderCreatedMessage, setOrderCreatedMessage] = useState<string | null>(null);

  // Orders and Proposals
  const [orders, setOrders] = useState<Order[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);

  // Mode toggle: 'new_order' or 'change_proposal'
  const [mode, setMode] = useState<'new_order' | 'change_proposal'>('new_order');

  // Change Proposal state
  const [selectedOrderForChange, setSelectedOrderForChange] = useState<OrderForSelection | null>(null);
  const [orderSearchForChange, setOrderSearchForChange] = useState('');
  const [showOrderDropdown, setShowOrderDropdown] = useState(false);
  const [originalLines, setOriginalLines] = useState<ExistingOrderLine[]>([]);
  const [proposedLines, setProposedLines] = useState<ProposedLine[]>([]);
  const [loadingOrderLines, setLoadingOrderLines] = useState(false);

  // Viewing proposal/order details
  const [viewingProposal, setViewingProposal] = useState<{ proposalId: string; orderId: string | null } | null>(null);
  const [viewingOrder, setViewingOrder] = useState<Order | null>(null);

  useEffect(() => {
    checkAuthState();
  }, []);

  const checkAuthState = async () => {
    try {
      const { data: { session }, error } = await supabaseClient.auth.getSession();
      if (error || !session) {
        window.location.href = '/login/admin';
        return;
      }

      const userEmail = session.user.email;
      if (userEmail !== ADMIN_EMAIL) {
        console.warn('Unauthorized access attempt:', userEmail);
        setIsAuthorized(false);
        setIsLoading(false);
        return;
      }

      setUser({
        id: session.user.id,
        email: userEmail
      });
      setIsAuthorized(true);
      setIsLoading(false);

      // Fetch all organizations for the dropdown
      fetchAllOrganizations();
    } catch (error) {
      console.error('Auth check error:', error);
      window.location.href = '/login/admin';
    }
  };

  const handleSignOut = async () => {
    await supabaseClient.auth.signOut();
    window.location.href = '/login/admin';
  };

  const fetchAllOrganizations = async () => {
    setLoadingOrgs(true);
    try {
      const { data: orgs, error } = await supabaseClient
        .from('organizations')
        .select('id, name')
        .order('name', { ascending: true });

      if (error) throw error;
      setAllOrganizations(orgs || []);
    } catch (error) {
      console.error('Error fetching organizations:', error);
    } finally {
      setLoadingOrgs(false);
    }
  };

  const fetchOrdersAndProposals = async (orgId: string) => {
    setLoadingOrders(true);
    try {
      // Fetch orders with only active order lines
      const { data: ordersData, error: ordersError } = await supabaseClient
        .from('orders')
        .select(`
          id,
          customer_name,
          status,
          delivery_date,
          created_at,
          order_lines (id, product_name, quantity, status)
        `)
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false })
        .limit(20);

      if (ordersError) throw ordersError;

      // Filter out deleted order lines on the client side
      const ordersWithActiveLines = (ordersData || []).map(order => ({
        ...order,
        order_lines: order.order_lines.filter((line: any) => line.status === 'active')
      }));
      setOrders(ordersWithActiveLines);

      // Fetch proposals
      const { data: proposalsData, error: proposalsError } = await supabaseClient
        .from('order_change_proposals')
        .select(`
          id,
          status,
          created_at,
          order_id,
          order_change_proposal_lines (id, item_name, change_type, proposed_values)
        `)
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false })
        .limit(20);

      if (proposalsError) throw proposalsError;
      setProposals(proposalsData || []);
    } catch (error) {
      console.error('Error loading orders/proposals:', error);
    } finally {
      setLoadingOrders(false);
    }
  };

  const selectOrganization = async (org: OrgSearchResult) => {
    setSelectedOrg({ id: org.id, name: org.name });
    setShowOrgDropdown(false);
    setLoadingCatalog(true);

    try {
      // Fetch customers for this org
      const { data: customersData, error: customersError } = await supabaseClient
        .from('customers')
        .select('id, name, email, phone')
        .eq('organization_id', org.id)
        .eq('active', true)
        .order('name');

      if (customersError) throw customersError;
      setCustomers(customersData || []);

      // Fetch items for this org
      const { data: itemsData, error: itemsError } = await supabaseClient
        .from('items')
        .select('id, sku, name, base_price')
        .eq('organization_id', org.id)
        .eq('active', true)
        .order('name');

      if (itemsError) throw itemsError;
      setItems(itemsData || []);

      // Fetch users for this org
      const { data: usersData, error: usersError } = await supabaseClient
        .rpc('get_organization_users', { org_id: org.id });

      if (usersError) throw usersError;
      setOrgUsers(usersData || []);

      // Fetch intake events: unassigned (organization_id IS NULL)
      // Note: order_id column was removed, so we just fetch unassigned events for now
      const { data: unassignedIntake, error: unassignedError } = await supabaseClient
        .from('intake_events')
        .select('id, channel, provider, raw_content, created_at, organization_id')
        .is('organization_id', null)
        .order('created_at', { ascending: false })
        .limit(50);

      if (unassignedError) throw unassignedError;

      const { data: orgIntake, error: orgIntakeError } = await supabaseClient
        .from('intake_events')
        .select('id, channel, provider, raw_content, created_at, organization_id')
        .eq('organization_id', org.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (orgIntakeError) throw orgIntakeError;

      // Combine: unassigned events first, then org-specific unlinked events
      const combinedIntake = [...(unassignedIntake || []), ...(orgIntake || [])];
      setIntakeEvents(combinedIntake);

      // Also fetch orders and proposals
      await fetchOrdersAndProposals(org.id);
    } catch (error) {
      console.error('Error loading catalog:', error);
    } finally {
      setLoadingCatalog(false);
    }
  };

  const clearSelection = () => {
    setSelectedOrg(null);
    setCustomers([]);
    setItems([]);
    setOrgUsers([]);
    setIntakeEvents([]);
    setSelectedCustomer(null);
    setSelectedReceivedBy(null);
    setSelectedIntakeEvent(null);
    setSourceChannel('email');
    setOrderLines([]);
    setOrders([]);
    setProposals([]);
  };

  const filteredCustomers = customers.filter(c =>
    c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
    (c.email && c.email.toLowerCase().includes(customerSearch.toLowerCase()))
  );

  const filteredItems = items.filter(i =>
    i.name.toLowerCase().includes(itemSearch.toLowerCase()) ||
    i.sku.toLowerCase().includes(itemSearch.toLowerCase())
  );

  const filteredOrgUsers = orgUsers.filter(u =>
    u.email.toLowerCase().includes(receivedBySearch.toLowerCase())
  );

  const getIntakeEventPreview = (e: IntakeEvent): string => {
    if (!e.raw_content) return 'No content';
    return JSON.stringify(e.raw_content).substring(0, 100);
  };

  const filteredIntakeEvents = intakeEvents.filter(e => {
    const searchLower = intakeEventSearch.toLowerCase();
    const rawStr = e.raw_content ? JSON.stringify(e.raw_content).toLowerCase() : '';
    return rawStr.includes(searchLower) ||
      e.channel.toLowerCase().includes(searchLower) ||
      e.provider.toLowerCase().includes(searchLower);
  });

  // Filter orders for change proposal selection
  const filteredOrdersForChange = orders.filter(o => {
    const searchLower = orderSearchForChange.toLowerCase();
    return (o.customer_name && o.customer_name.toLowerCase().includes(searchLower)) ||
      o.id.toLowerCase().includes(searchLower);
  });

  // Fetch order lines when an order is selected for change proposal
  const selectOrderForChange = async (order: OrderForSelection) => {
    setSelectedOrderForChange(order);
    setOrderSearchForChange('');
    setShowOrderDropdown(false);
    setLoadingOrderLines(true);

    try {
      const { data: lines, error } = await supabaseClient
        .from('order_lines')
        .select('id, item_id, product_name, quantity, meta, status')
        .eq('order_id', order.id)
        .eq('status', 'active')
        .order('line_number');

      if (error) throw error;

      const existingLines: ExistingOrderLine[] = (lines || []).map(l => ({
        id: l.id,
        item_id: l.item_id,
        product_name: l.product_name,
        quantity: l.quantity,
        meta: l.meta as { sku?: string } | null
      }));

      setOriginalLines(existingLines);

      // Initialize proposed lines as a copy of the original lines
      const proposed: ProposedLine[] = existingLines.map(l => ({
        originalLineId: l.id,
        itemId: l.item_id || '',
        itemName: l.product_name,
        sku: l.meta?.sku || '',
        quantity: l.quantity,
        isNew: false
      }));

      setProposedLines(proposed);
    } catch (error) {
      console.error('Error loading order lines:', error);
      alert('Failed to load order lines');
    } finally {
      setLoadingOrderLines(false);
    }
  };

  // Handle mode switch
  const handleModeSwitch = (newMode: 'new_order' | 'change_proposal') => {
    if (newMode === mode) return;
    setMode(newMode);
    // Reset form state
    setSelectedCustomer(null);
    setSelectedReceivedBy(null);
    setSelectedIntakeEvent(null);
    setSourceChannel('email');
    setOrderLines([]);
    setDeliveryDate('');
    setOrderCreatedMessage(null);
    // Reset change proposal state
    setSelectedOrderForChange(null);
    setOriginalLines([]);
    setProposedLines([]);
  };

  // Update proposed line quantity
  const updateProposedLineQuantity = (index: number, quantity: number) => {
    if (quantity <= 0) {
      // Remove the line
      setProposedLines(proposedLines.filter((_, i) => i !== index));
    } else {
      setProposedLines(proposedLines.map((l, i) =>
        i === index ? { ...l, quantity } : l
      ));
    }
  };

  // Remove proposed line
  const removeProposedLine = (index: number) => {
    setProposedLines(proposedLines.filter((_, i) => i !== index));
  };

  // Add item to proposed lines
  const addItemToProposedLines = (item: Item) => {
    const existing = proposedLines.find(l => l.itemId === item.id);
    if (existing) {
      setProposedLines(proposedLines.map(l =>
        l.itemId === item.id ? { ...l, quantity: l.quantity + 1 } : l
      ));
    } else {
      setProposedLines([...proposedLines, {
        originalLineId: null,
        itemId: item.id,
        itemName: item.name,
        sku: item.sku,
        quantity: 1,
        isNew: true
      }]);
    }
    setItemSearch('');
    setShowItemDropdown(false);
  };

  const addItemToOrder = (item: Item) => {
    const existing = orderLines.find(l => l.itemId === item.id);
    if (existing) {
      setOrderLines(orderLines.map(l =>
        l.itemId === item.id ? { ...l, quantity: l.quantity + 1 } : l
      ));
    } else {
      setOrderLines([...orderLines, {
        itemId: item.id,
        itemName: item.name,
        quantity: 1,
        sku: item.sku
      }]);
    }
    setItemSearch('');
    setShowItemDropdown(false);
  };

  const updateLineQuantity = (itemId: string, quantity: number) => {
    if (quantity <= 0) {
      setOrderLines(orderLines.filter(l => l.itemId !== itemId));
    } else {
      setOrderLines(orderLines.map(l =>
        l.itemId === itemId ? { ...l, quantity } : l
      ));
    }
  };

  const removeLineItem = (itemId: string) => {
    setOrderLines(orderLines.filter(l => l.itemId !== itemId));
  };

  const createOrderProposal = async () => {
    if (!selectedOrg || !selectedCustomer || !selectedReceivedBy || orderLines.length === 0) {
      alert('Please select an organization, customer, received by user, and add at least one item.');
      return;
    }

    setIsCreatingOrder(true);
    setOrderCreatedMessage(null);

    try {
      // Create the proposal
      const { data: proposal, error: proposalError } = await supabaseClient
        .from('order_change_proposals')
        .insert({
          organization_id: selectedOrg.id,
          order_id: null, // New order proposal
          intake_event_id: selectedIntakeEvent?.id || null,
          status: 'pending'
        })
        .select()
        .single();

      if (proposalError) throw proposalError;

      // Create proposal lines
      const proposalLines = orderLines.map((line, index) => ({
        proposal_id: proposal.id,
        order_line_id: null,
        line_number: index + 1,
        change_type: 'add',
        item_id: line.itemId,
        item_name: line.itemName,
        proposed_values: {
          quantity: line.quantity,
          sku: line.sku,
          ai_matched: true,
          confidence: 1.0,
          organization_id: selectedOrg.id,
          customer_id: selectedCustomer.id,
          customer_name: selectedCustomer.name,
          delivery_date: deliveryDate || null,
          source_channel: 'admin',
          created_by_user_id: user?.id || null,
          received_by_user_id: selectedReceivedBy?.user_id || null,
          received_by_email: selectedReceivedBy?.email || null
        }
      }));

      const { error: linesError } = await supabaseClient
        .from('order_change_proposal_lines')
        .insert(proposalLines);

      if (linesError) throw linesError;

      setOrderCreatedMessage(`Order proposal created successfully! Proposal ID: ${proposal.id}`);

      // Reset form and refresh lists
      setSelectedCustomer(null);
      setSelectedReceivedBy(null);
      setSelectedIntakeEvent(null);
      setSourceChannel('email');
      setOrderLines([]);
      setDeliveryDate('');
      await fetchOrdersAndProposals(selectedOrg.id);
    } catch (error) {
      console.error('Error creating order proposal:', error);
      alert('Failed to create order proposal. Please try again.');
    } finally {
      setIsCreatingOrder(false);
    }
  };

  const createOrderDirect = async () => {
    if (!selectedOrg || !selectedCustomer || !selectedReceivedBy || orderLines.length === 0) {
      alert('Please select an organization, customer, received by user, and add at least one item.');
      return;
    }

    if (!selectedIntakeEvent) {
      alert('Please select an intake event.');
      return;
    }

    if (!deliveryDate) {
      alert('Please select a delivery date.');
      return;
    }

    setIsCreatingOrder(true);
    setOrderCreatedMessage(null);

    try {
      // Create the order directly in the orders table
      const { data: order, error: orderError } = await supabaseClient
        .from('orders')
        .insert({
          organization_id: selectedOrg.id,
          customer_id: selectedCustomer.id,
          customer_name: selectedCustomer.name,
          status: 'ready',
          delivery_date: deliveryDate || null,
          origin_intake_event_id: selectedIntakeEvent?.id || null,
          created_by_user_id: selectedReceivedBy?.user_id || null,
          source_channel: sourceChannel
        })
        .select()
        .single();

      if (orderError) throw orderError;

      // Create order lines
      const orderLinesData = orderLines.map((line, index) => ({
        order_id: order.id,
        line_number: index + 1,
        item_id: line.itemId,
        product_name: line.itemName,
        quantity: line.quantity,
        meta: {
          sku: line.sku,
          source: 'admin',
          created_by_user_id: user?.id || null
        }
      }));

      const { error: linesError } = await supabaseClient
        .from('order_lines')
        .insert(orderLinesData);

      if (linesError) throw linesError;

      // Create order event for audit trail
      await supabaseClient
        .from('order_events')
        .insert({
          order_id: order.id,
          type: 'created',
          metadata: {
            source: 'admin_portal',
            created_by: user?.email
          }
        });

      setOrderCreatedMessage(`Order created successfully! Order ID: ${order.id}`);

      // Reset form and refresh lists
      setSelectedCustomer(null);
      setSelectedReceivedBy(null);
      setSelectedIntakeEvent(null);
      setSourceChannel('email');
      setOrderLines([]);
      setDeliveryDate('');
      await fetchOrdersAndProposals(selectedOrg.id);
    } catch (error) {
      console.error('Error creating order:', error);
      alert('Failed to create order. Please try again.');
    } finally {
      setIsCreatingOrder(false);
    }
  };

  // Create a change proposal for an existing order
  const createChangeProposal = async () => {
    if (!selectedOrg || !selectedOrderForChange || !selectedIntakeEvent) {
      alert('Please select an order and an intake event.');
      return;
    }

    // Check if there are any actual changes
    const hasChanges = proposedLines.length !== originalLines.length ||
      proposedLines.some((proposed, idx) => {
        const original = originalLines.find(o => o.id === proposed.originalLineId);
        if (!original) return true; // New item
        return original.quantity !== proposed.quantity;
      }) ||
      originalLines.some(original =>
        !proposedLines.some(p => p.originalLineId === original.id)
      );

    if (!hasChanges) {
      alert('No changes detected. Please modify the order before creating a proposal.');
      return;
    }

    setIsCreatingOrder(true);
    setOrderCreatedMessage(null);

    try {
      // Create the change proposal
      const { data: proposal, error: proposalError } = await supabaseClient
        .from('order_change_proposals')
        .insert({
          organization_id: selectedOrg.id,
          order_id: selectedOrderForChange.id,
          intake_event_id: selectedIntakeEvent.id,
          status: 'pending'
        })
        .select()
        .single();

      if (proposalError) throw proposalError;

      // Assign intake event to organization if not already assigned
      if (!selectedIntakeEvent.organization_id) {
        const { error: updateError } = await supabaseClient
          .from('intake_events')
          .update({ organization_id: selectedOrg.id })
          .eq('id', selectedIntakeEvent.id);

        if (updateError) {
          console.error('Error assigning intake event to organization:', updateError);
          // Don't fail the whole operation, just log the error
        }
      }

      // Build the proposal lines with change types
      const proposalLinesData: {
        proposal_id: string;
        order_line_id: string | null;
        line_number: number;
        change_type: string;
        item_id: string | null;
        item_name: string;
        proposed_values: Record<string, unknown>;
      }[] = [];

      let lineNumber = 1;

      // Find removed lines (in original but not in proposed)
      for (const original of originalLines) {
        const inProposed = proposedLines.find(p => p.originalLineId === original.id);
        if (!inProposed) {
          proposalLinesData.push({
            proposal_id: proposal.id,
            order_line_id: original.id,
            line_number: lineNumber++,
            change_type: 'remove',
            item_id: original.item_id,
            item_name: original.product_name,
            proposed_values: {
              original_quantity: original.quantity,
              quantity: 0
            }
          });
        }
      }

      // Find modified and new lines
      for (const proposed of proposedLines) {
        if (proposed.isNew) {
          // New item
          proposalLinesData.push({
            proposal_id: proposal.id,
            order_line_id: null,
            line_number: lineNumber++,
            change_type: 'add',
            item_id: proposed.itemId,
            item_name: proposed.itemName,
            proposed_values: {
              quantity: proposed.quantity,
              sku: proposed.sku
            }
          });
        } else {
          // Check if modified
          const original = originalLines.find(o => o.id === proposed.originalLineId);
          if (original && original.quantity !== proposed.quantity) {
            proposalLinesData.push({
              proposal_id: proposal.id,
              order_line_id: original.id,
              line_number: lineNumber++,
              change_type: 'modify',
              item_id: original.item_id,
              item_name: original.product_name,
              proposed_values: {
                original_quantity: original.quantity,
                quantity: proposed.quantity
              }
            });
          }
        }
      }

      if (proposalLinesData.length > 0) {
        const { error: linesError } = await supabaseClient
          .from('order_change_proposal_lines')
          .insert(proposalLinesData);

        if (linesError) throw linesError;
      }

      setOrderCreatedMessage(`Change proposal created successfully! Proposal ID: ${proposal.id}`);

      // Reset form
      setSelectedOrderForChange(null);
      setSelectedIntakeEvent(null);
      setOriginalLines([]);
      setProposedLines([]);
      await fetchOrdersAndProposals(selectedOrg.id);
    } catch (error) {
      console.error('Error creating change proposal:', error);
      alert('Failed to create change proposal. Please try again.');
    } finally {
      setIsCreatingOrder(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
      </div>
    );
  }

  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-lg max-w-md text-center">
          <Shield className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h2>
          <p className="text-gray-600 mb-4">
            This admin portal is only accessible to authorized administrators.
          </p>
          <button
            onClick={() => window.location.href = '/login'}
            className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700"
          >
            Go to Regular Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-purple-600 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Shield className="w-8 h-8" />
            <h1 className="text-xl font-bold">Frootful Admin</h1>
          </div>
          <div className="flex items-center space-x-4">
            <span className="text-purple-100 text-sm">{user?.email}</span>
            <button
              onClick={handleSignOut}
              className="flex items-center space-x-1 px-3 py-1.5 bg-purple-700 rounded-md hover:bg-purple-800 text-sm"
            >
              <LogOut className="w-4 h-4" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Organization Search */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <Building2 className="w-5 h-5 mr-2 text-purple-600" />
            Select Organization
          </h2>

          {selectedOrg ? (
            <div className="flex items-center justify-between bg-purple-50 border border-purple-200 rounded-lg p-4">
              <div>
                <p className="font-medium text-purple-900">{selectedOrg.name}</p>
                <p className="text-sm text-purple-600">ID: {selectedOrg.id}</p>
              </div>
              <button
                onClick={clearSelection}
                className="p-2 text-purple-600 hover:bg-purple-100 rounded-md"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          ) : (
            <div className="relative">
              <button
                onClick={() => setShowOrgDropdown(!showOrgDropdown)}
                className="w-full flex items-center justify-between border border-gray-300 rounded-lg px-4 py-3 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <span className="text-gray-500">Select an organization...</span>
                {loadingOrgs ? (
                  <Loader2 className="w-5 h-5 animate-spin text-purple-600" />
                ) : (
                  <svg className={`w-5 h-5 text-gray-400 transition-transform ${showOrgDropdown ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                )}
              </button>

              {showOrgDropdown && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                  {allOrganizations.length === 0 ? (
                    <div className="px-4 py-3 text-gray-500 text-center">
                      {loadingOrgs ? 'Loading organizations...' : 'No organizations found'}
                    </div>
                  ) : (
                    allOrganizations.map((org) => (
                      <button
                        key={org.id}
                        onClick={() => {
                          selectOrganization(org);
                          setShowOrgDropdown(false);
                        }}
                        className="w-full px-4 py-3 text-left hover:bg-purple-50 border-b last:border-b-0"
                      >
                        <p className="font-medium text-gray-900">{org.name}</p>
                        <p className="text-xs text-gray-500 font-mono">{org.id.slice(0, 8)}...</p>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Create Order / Change Proposal Form - Only shown when org is selected */}
        {selectedOrg && (
          <div className="bg-white rounded-lg shadow-md p-6">
            {/* Mode Toggle */}
            <div className="flex items-center space-x-1 mb-6 bg-gray-100 rounded-lg p-1 w-fit">
              <button
                onClick={() => handleModeSwitch('new_order')}
                className={`flex items-center px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  mode === 'new_order'
                    ? 'bg-white text-purple-700 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Plus className="w-4 h-4 mr-2" />
                New Order
              </button>
              <button
                onClick={() => handleModeSwitch('change_proposal')}
                className={`flex items-center px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  mode === 'change_proposal'
                    ? 'bg-white text-purple-700 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <GitCompare className="w-4 h-4 mr-2" />
                Change Proposal
              </button>
            </div>

            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              {mode === 'new_order' ? (
                <>
                  <Plus className="w-5 h-5 mr-2 text-purple-600" />
                  Create New Order
                </>
              ) : (
                <>
                  <GitCompare className="w-5 h-5 mr-2 text-purple-600" />
                  Create Change Proposal
                </>
              )}
            </h2>

            {loadingCatalog ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-purple-600 mr-2" />
                <span className="text-gray-600">Loading catalog...</span>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Success Message */}
                {orderCreatedMessage && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <p className="text-green-800">{orderCreatedMessage}</p>
                  </div>
                )}

                {/* NEW ORDER MODE */}
                {mode === 'new_order' && (
                  <>
                {/* Customer Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <Users className="w-4 h-4 inline mr-1" />
                    Customer
                  </label>
                  {selectedCustomer ? (
                    <div className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg p-3">
                      <div>
                        <p className="font-medium">{selectedCustomer.name}</p>
                        {selectedCustomer.email && (
                          <p className="text-sm text-gray-500">{selectedCustomer.email}</p>
                        )}
                      </div>
                      <button
                        onClick={() => setSelectedCustomer(null)}
                        className="p-1 text-gray-400 hover:text-gray-600"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="relative">
                      <input
                        type="text"
                        value={customerSearch}
                        onChange={(e) => {
                          setCustomerSearch(e.target.value);
                          setShowCustomerDropdown(true);
                        }}
                        onFocus={() => setShowCustomerDropdown(true)}
                        onBlur={() => setTimeout(() => setShowCustomerDropdown(false), 150)}
                        placeholder="Search customers..."
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                      {showCustomerDropdown && filteredCustomers.length > 0 && (
                        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                          {filteredCustomers.slice(0, 10).map((customer) => (
                            <button
                              key={customer.id}
                              onClick={() => {
                                setSelectedCustomer(customer);
                                setCustomerSearch('');
                                setShowCustomerDropdown(false);
                              }}
                              className="w-full px-3 py-2 text-left hover:bg-gray-50 border-b last:border-b-0"
                            >
                              <p className="font-medium text-sm">{customer.name}</p>
                              {customer.email && (
                                <p className="text-xs text-gray-500">{customer.email}</p>
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Received By Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <Users className="w-4 h-4 inline mr-1" />
                    Received By
                  </label>
                  {selectedReceivedBy ? (
                    <div className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg p-3">
                      <div>
                        <p className="font-medium">{selectedReceivedBy.email}</p>
                        <p className="text-sm text-gray-500 capitalize">{selectedReceivedBy.role}</p>
                      </div>
                      <button
                        onClick={() => setSelectedReceivedBy(null)}
                        className="p-1 text-gray-400 hover:text-gray-600"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="relative">
                      <input
                        type="text"
                        value={receivedBySearch}
                        onChange={(e) => {
                          setReceivedBySearch(e.target.value);
                          setShowReceivedByDropdown(true);
                        }}
                        onFocus={() => setShowReceivedByDropdown(true)}
                        onBlur={() => setTimeout(() => setShowReceivedByDropdown(false), 150)}
                        placeholder="Search users by email..."
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                      {showReceivedByDropdown && filteredOrgUsers.length > 0 && (
                        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                          {filteredOrgUsers.slice(0, 10).map((orgUser) => (
                            <button
                              key={orgUser.user_id}
                              onClick={() => {
                                setSelectedReceivedBy(orgUser);
                                setReceivedBySearch('');
                                setShowReceivedByDropdown(false);
                              }}
                              className="w-full px-3 py-2 text-left hover:bg-gray-50 border-b last:border-b-0"
                            >
                              <p className="font-medium text-sm">{orgUser.email}</p>
                              <p className="text-xs text-gray-500 capitalize">{orgUser.role}</p>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Intake Event Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <FileText className="w-4 h-4 inline mr-1" />
                    Intake Event <span className="text-red-500">*</span>
                  </label>
                  {selectedIntakeEvent ? (
                    <div className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg p-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2 flex-wrap">
                          {!selectedIntakeEvent.organization_id && (
                            <span className="text-xs px-2 py-0.5 bg-orange-100 text-orange-700 rounded font-medium">UNASSIGNED</span>
                          )}
                          <span className="text-xs px-2 py-0.5 bg-purple-100 text-purple-700 rounded capitalize">{selectedIntakeEvent.channel}</span>
                        </div>
                        <p className="text-sm text-gray-600 mt-1 truncate">
                          {getIntakeEventPreview(selectedIntakeEvent)}
                          {(getIntakeEventPreview(selectedIntakeEvent).length || 0) >= 100 && '...'}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                          {new Date(selectedIntakeEvent.created_at).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex items-center ml-2">
                        <button
                          onClick={() => setPreviewIntakeEvent(selectedIntakeEvent)}
                          className="p-1 text-gray-400 hover:text-purple-600"
                          title="Preview"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setSelectedIntakeEvent(null)}
                          className="p-1 text-gray-400 hover:text-gray-600"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="relative">
                      <input
                        type="text"
                        value={intakeEventSearch}
                        onChange={(e) => {
                          setIntakeEventSearch(e.target.value);
                          setShowIntakeEventDropdown(true);
                        }}
                        onFocus={() => setShowIntakeEventDropdown(true)}
                        onBlur={() => setTimeout(() => setShowIntakeEventDropdown(false), 150)}
                        placeholder="Search intake events..."
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                      {showIntakeEventDropdown && filteredIntakeEvents.length > 0 && (
                        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                          {filteredIntakeEvents.slice(0, 15).map((event) => (
                            <div
                              key={event.id}
                              className="flex items-start justify-between px-3 py-2 hover:bg-gray-50 border-b last:border-b-0"
                            >
                              <button
                                onClick={() => {
                                  setSelectedIntakeEvent(event);
                                  setIntakeEventSearch('');
                                  setShowIntakeEventDropdown(false);
                                }}
                                className="flex-1 text-left"
                              >
                                <div className="flex items-center space-x-2 mb-1 flex-wrap">
                                  {!event.organization_id && (
                                    <span className="text-xs px-2 py-0.5 bg-orange-100 text-orange-700 rounded font-medium">UNASSIGNED</span>
                                  )}
                                  <span className="text-xs px-2 py-0.5 bg-purple-100 text-purple-700 rounded capitalize">{event.channel}</span>
                                  <span className="text-xs text-gray-400">
                                    {new Date(event.created_at).toLocaleDateString()}
                                  </span>
                                </div>
                                <p className="text-sm text-gray-600 truncate">
                                  {getIntakeEventPreview(event).substring(0, 60)}
                                  {getIntakeEventPreview(event).length > 60 && '...'}
                                </p>
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setPreviewIntakeEvent(event);
                                }}
                                className="ml-2 p-1 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded"
                                title="Preview"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      {showIntakeEventDropdown && filteredIntakeEvents.length === 0 && intakeEvents.length === 0 && (
                        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-center text-gray-500 text-sm">
                          No unlinked intake events found
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Delivery Date */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Delivery Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={deliveryDate}
                    onChange={(e) => setDeliveryDate(e.target.value)}
                    onClick={(e) => (e.target as HTMLInputElement).showPicker()}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 cursor-pointer"
                  />
                </div>

                {/* Source Channel */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Source Channel
                  </label>
                  <select
                    value={sourceChannel}
                    onChange={(e) => setSourceChannel(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="email">Email</option>
                    <option value="sms">SMS</option>
                  </select>
                </div>

                {/* Add Items */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <Package className="w-4 h-4 inline mr-1" />
                    Add Items
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={itemSearch}
                      onChange={(e) => {
                        setItemSearch(e.target.value);
                        setShowItemDropdown(true);
                      }}
                      onFocus={() => setShowItemDropdown(true)}
                      onBlur={() => setTimeout(() => setShowItemDropdown(false), 150)}
                      placeholder="Search items by name or SKU..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                    {showItemDropdown && filteredItems.length > 0 && (
                      <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                        {filteredItems.slice(0, 15).map((item) => (
                          <button
                            key={item.id}
                            onClick={() => addItemToOrder(item)}
                            className="w-full px-3 py-2 text-left hover:bg-gray-50 border-b last:border-b-0"
                          >
                            <div className="flex justify-between items-center">
                              <div>
                                <p className="font-medium text-sm">{item.name}</p>
                                <p className="text-xs text-gray-500">SKU: {item.sku}</p>
                              </div>
                              <Plus className="w-4 h-4 text-purple-600" />
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Order Lines */}
                {orderLines.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Order Lines ({orderLines.length} items)
                    </label>
                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                      <table className="w-full">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Item</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">SKU</th>
                            <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">Qty</th>
                            <th className="px-4 py-2 text-right text-xs font-medium text-gray-500"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {orderLines.map((line) => (
                            <tr key={line.itemId}>
                              <td className="px-4 py-2 text-sm">{line.itemName}</td>
                              <td className="px-4 py-2 text-sm text-gray-500">{line.sku}</td>
                              <td className="px-4 py-2">
                                <input
                                  type="number"
                                  min="1"
                                  value={line.quantity}
                                  onChange={(e) => updateLineQuantity(line.itemId, parseInt(e.target.value) || 0)}
                                  className="w-20 px-2 py-1 text-center border border-gray-300 rounded"
                                />
                              </td>
                              <td className="px-4 py-2 text-right">
                                <button
                                  onClick={() => removeLineItem(line.itemId)}
                                  className="text-red-500 hover:text-red-700"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Create Buttons */}
                <div className="flex justify-end space-x-3 pt-4 border-t">
                  <button
                    onClick={createOrderProposal}
                    disabled={isCreatingOrder || !selectedCustomer || !selectedReceivedBy || orderLines.length === 0}
                    className="flex items-center px-6 py-2 bg-gray-100 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isCreatingOrder ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <FileText className="w-4 h-4 mr-2" />
                        Create Proposal
                      </>
                    )}
                  </button>
                  <button
                    onClick={createOrderDirect}
                    disabled={isCreatingOrder || !selectedCustomer || !selectedReceivedBy || orderLines.length === 0 || !selectedIntakeEvent || !deliveryDate}
                    className="flex items-center px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isCreatingOrder ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <ShoppingCart className="w-4 h-4 mr-2" />
                        Create Order
                      </>
                    )}
                  </button>
                </div>
                  </>
                )}

                {/* CHANGE PROPOSAL MODE */}
                {mode === 'change_proposal' && (
                  <>
                    {/* Order Selection */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        <ShoppingCart className="w-4 h-4 inline mr-1" />
                        Select Order to Modify
                      </label>
                      {selectedOrderForChange ? (
                        <div className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg p-3">
                          <div>
                            <p className="font-medium">{selectedOrderForChange.customer_name || 'Unknown Customer'}</p>
                            <p className="text-sm text-gray-500">
                              {new Date(selectedOrderForChange.created_at).toLocaleDateString()}
                              {selectedOrderForChange.delivery_date && ` • Delivery: ${formatDateString(selectedOrderForChange.delivery_date)}`}
                            </p>
                            <p className="text-xs text-gray-400 font-mono">{selectedOrderForChange.id.slice(0, 8)}...</p>
                          </div>
                          <button
                            onClick={() => {
                              setSelectedOrderForChange(null);
                              setOriginalLines([]);
                              setProposedLines([]);
                            }}
                            className="p-1 text-gray-400 hover:text-gray-600"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="relative">
                          <input
                            type="text"
                            value={orderSearchForChange}
                            onChange={(e) => {
                              setOrderSearchForChange(e.target.value);
                              setShowOrderDropdown(true);
                            }}
                            onFocus={() => setShowOrderDropdown(true)}
                            onBlur={() => setTimeout(() => setShowOrderDropdown(false), 150)}
                            placeholder="Search orders by customer name or ID..."
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                          />
                          {showOrderDropdown && filteredOrdersForChange.length > 0 && (
                            <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                              {filteredOrdersForChange.slice(0, 15).map((order) => (
                                <button
                                  key={order.id}
                                  onClick={() => selectOrderForChange(order)}
                                  className="w-full px-3 py-2 text-left hover:bg-gray-50 border-b last:border-b-0"
                                >
                                  <p className="font-medium text-sm">{order.customer_name || 'Unknown Customer'}</p>
                                  <p className="text-xs text-gray-500">
                                    {new Date(order.created_at).toLocaleDateString()}
                                    {order.delivery_date && ` • Delivery: ${formatDateString(order.delivery_date)}`}
                                  </p>
                                  <p className="text-xs text-gray-400 font-mono">{order.id.slice(0, 8)}...</p>
                                </button>
                              ))}
                            </div>
                          )}
                          {showOrderDropdown && orders.length === 0 && (
                            <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-center text-gray-500 text-sm">
                              No orders found for this organization
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Intake Event Selection (Required for change proposal) */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        <FileText className="w-4 h-4 inline mr-1" />
                        Intake Event (required)
                      </label>
                      {selectedIntakeEvent ? (
                        <div className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg p-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center space-x-2 flex-wrap">
                              {!selectedIntakeEvent.organization_id && (
                                <span className="text-xs px-2 py-0.5 bg-orange-100 text-orange-700 rounded font-medium">UNASSIGNED</span>
                              )}
                              <span className="text-xs px-2 py-0.5 bg-purple-100 text-purple-700 rounded capitalize">{selectedIntakeEvent.channel}</span>
                            </div>
                            <p className="text-sm text-gray-600 mt-1 truncate">
                              {getIntakeEventPreview(selectedIntakeEvent)}
                            </p>
                            <p className="text-xs text-gray-400 mt-1">
                              {new Date(selectedIntakeEvent.created_at).toLocaleString()}
                            </p>
                          </div>
                          <div className="flex items-center ml-2">
                            <button
                              onClick={() => setPreviewIntakeEvent(selectedIntakeEvent)}
                              className="p-1 text-gray-400 hover:text-purple-600"
                              title="Preview"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setSelectedIntakeEvent(null)}
                              className="p-1 text-gray-400 hover:text-gray-600"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="relative">
                          <input
                            type="text"
                            value={intakeEventSearch}
                            onChange={(e) => {
                              setIntakeEventSearch(e.target.value);
                              setShowIntakeEventDropdown(true);
                            }}
                            onFocus={() => setShowIntakeEventDropdown(true)}
                            onBlur={() => setTimeout(() => setShowIntakeEventDropdown(false), 150)}
                            placeholder="Search intake events..."
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                          />
                          {showIntakeEventDropdown && filteredIntakeEvents.length > 0 && (
                            <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                              {filteredIntakeEvents.slice(0, 15).map((event) => (
                                <div
                                  key={event.id}
                                  className="flex items-start justify-between px-3 py-2 hover:bg-gray-50 border-b last:border-b-0"
                                >
                                  <button
                                    onClick={() => {
                                      setSelectedIntakeEvent(event);
                                      setIntakeEventSearch('');
                                      setShowIntakeEventDropdown(false);
                                    }}
                                    className="flex-1 text-left"
                                  >
                                    <div className="flex items-center space-x-2 mb-1 flex-wrap">
                                      {!event.organization_id && (
                                        <span className="text-xs px-2 py-0.5 bg-orange-100 text-orange-700 rounded font-medium">UNASSIGNED</span>
                                      )}
                                      <span className="text-xs px-2 py-0.5 bg-purple-100 text-purple-700 rounded capitalize">{event.channel}</span>
                                      <span className="text-xs text-gray-400">
                                        {new Date(event.created_at).toLocaleDateString()}
                                      </span>
                                    </div>
                                    <p className="text-sm text-gray-600 truncate">
                                      {getIntakeEventPreview(event).substring(0, 60)}
                                      {getIntakeEventPreview(event).length > 60 && '...'}
                                    </p>
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setPreviewIntakeEvent(event);
                                    }}
                                    className="ml-2 p-1 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded"
                                    title="Preview"
                                  >
                                    <Eye className="w-4 h-4" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Side-by-side Diff View */}
                    {selectedOrderForChange && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          <GitCompare className="w-4 h-4 inline mr-1" />
                          Order Changes
                        </label>

                        {loadingOrderLines ? (
                          <div className="flex items-center justify-center py-8">
                            <Loader2 className="w-6 h-6 animate-spin text-purple-600 mr-2" />
                            <span className="text-gray-600">Loading order lines...</span>
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 gap-4">
                            {/* Original Order (Left) */}
                            <div className="border border-gray-200 rounded-lg overflow-hidden">
                              <div className="bg-gray-100 px-4 py-2 border-b">
                                <h4 className="text-sm font-medium text-gray-700">Original Order</h4>
                              </div>
                              <div className="p-2">
                                {originalLines.length === 0 ? (
                                  <p className="text-gray-500 text-sm text-center py-4">No items</p>
                                ) : (
                                  <table className="w-full">
                                    <thead>
                                      <tr>
                                        <th className="px-2 py-1 text-left text-xs font-medium text-gray-500">Item</th>
                                        <th className="px-2 py-1 text-center text-xs font-medium text-gray-500">Qty</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                      {originalLines.map((line) => {
                                        const isRemoved = !proposedLines.some(p => p.originalLineId === line.id);
                                        const proposedLine = proposedLines.find(p => p.originalLineId === line.id);
                                        const isModified = proposedLine && proposedLine.quantity !== line.quantity;
                                        return (
                                          <tr key={line.id} className={isRemoved ? 'bg-red-50' : isModified ? 'bg-yellow-50' : ''}>
                                            <td className="px-2 py-1.5 text-sm">
                                              <span className={isRemoved ? 'line-through text-red-600' : ''}>
                                                {line.product_name}
                                              </span>
                                              {line.meta?.sku && (
                                                <span className="text-xs text-gray-400 ml-1">({line.meta.sku})</span>
                                              )}
                                            </td>
                                            <td className={`px-2 py-1.5 text-sm text-center ${isRemoved ? 'line-through text-red-600' : ''}`}>
                                              {line.quantity}
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                )}
                              </div>
                            </div>

                            {/* Proposed Order (Right) */}
                            <div className="border border-purple-200 rounded-lg overflow-visible">
                              <div className="bg-purple-50 px-4 py-2 border-b border-purple-200">
                                <h4 className="text-sm font-medium text-purple-700">Proposed Changes</h4>
                              </div>
                              <div className="p-2">
                                {proposedLines.length === 0 ? (
                                  <p className="text-gray-500 text-sm text-center py-4">All items removed</p>
                                ) : (
                                  <table className="w-full">
                                    <thead>
                                      <tr>
                                        <th className="px-2 py-1 text-left text-xs font-medium text-gray-500">Item</th>
                                        <th className="px-2 py-1 text-center text-xs font-medium text-gray-500">Qty</th>
                                        <th className="px-2 py-1 text-right text-xs font-medium text-gray-500"></th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                      {proposedLines.map((line, index) => {
                                        const original = originalLines.find(o => o.id === line.originalLineId);
                                        const isModified = original && original.quantity !== line.quantity;
                                        return (
                                          <tr key={index} className={line.isNew ? 'bg-green-50' : isModified ? 'bg-yellow-50' : ''}>
                                            <td className="px-2 py-1.5 text-sm">
                                              <span className={line.isNew ? 'text-green-700 font-medium' : ''}>
                                                {line.itemName}
                                              </span>
                                              {line.isNew && (
                                                <span className="text-xs text-green-600 ml-1">(new)</span>
                                              )}
                                              {line.sku && (
                                                <span className="text-xs text-gray-400 ml-1">({line.sku})</span>
                                              )}
                                            </td>
                                            <td className="px-2 py-1.5">
                                              <input
                                                type="number"
                                                min="1"
                                                value={line.quantity}
                                                onChange={(e) => updateProposedLineQuantity(index, parseInt(e.target.value) || 0)}
                                                className={`w-16 px-2 py-0.5 text-center border rounded text-sm ${
                                                  isModified ? 'border-yellow-400 bg-yellow-50' : 'border-gray-300'
                                                }`}
                                              />
                                            </td>
                                            <td className="px-2 py-1.5 text-right">
                                              <button
                                                onClick={() => removeProposedLine(index)}
                                                className="text-red-500 hover:text-red-700"
                                                title="Remove"
                                              >
                                                <Minus className="w-4 h-4" />
                                              </button>
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                )}

                                {/* Add new item */}
                                <div className="mt-3 pt-3 border-t border-gray-200">
                                  <div className="relative">
                                    <input
                                      type="text"
                                      value={itemSearch}
                                      onChange={(e) => {
                                        setItemSearch(e.target.value);
                                        setShowItemDropdown(true);
                                      }}
                                      onFocus={() => setShowItemDropdown(true)}
                                      onBlur={() => setTimeout(() => setShowItemDropdown(false), 150)}
                                      placeholder="Add new item..."
                                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                                    />
                                    {showItemDropdown && (
                                      <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto scrollbar-thin">
                                        {filteredItems.length > 0 ? (
                                          filteredItems.map((item) => (
                                            <button
                                              key={item.id}
                                              onClick={() => addItemToProposedLines(item)}
                                              className="w-full px-3 py-2 text-left hover:bg-gray-50 border-b last:border-b-0"
                                            >
                                              <div className="flex justify-between items-center">
                                                <div>
                                                  <p className="font-medium text-sm">{item.name}</p>
                                                  <p className="text-xs text-gray-500">SKU: {item.sku}</p>
                                                </div>
                                                <Plus className="w-4 h-4 text-purple-600" />
                                              </div>
                                            </button>
                                          ))
                                        ) : (
                                          <div className="p-3 text-center text-gray-500 text-sm">
                                            {itemSearch ? `No items matching "${itemSearch}"` : 'Type to search items...'}
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Change Summary */}
                        {originalLines.length > 0 && (
                          <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                            <h4 className="text-sm font-medium text-gray-700 mb-2">Change Summary</h4>
                            <div className="flex flex-wrap gap-3 text-sm">
                              {(() => {
                                const removed = originalLines.filter(o => !proposedLines.some(p => p.originalLineId === o.id)).length;
                                const added = proposedLines.filter(p => p.isNew).length;
                                const modified = proposedLines.filter(p => {
                                  if (p.isNew) return false;
                                  const original = originalLines.find(o => o.id === p.originalLineId);
                                  return original && original.quantity !== p.quantity;
                                }).length;
                                return (
                                  <>
                                    {removed > 0 && (
                                      <span className="px-2 py-1 bg-red-100 text-red-700 rounded">
                                        {removed} removed
                                      </span>
                                    )}
                                    {modified > 0 && (
                                      <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded">
                                        {modified} modified
                                      </span>
                                    )}
                                    {added > 0 && (
                                      <span className="px-2 py-1 bg-green-100 text-green-700 rounded">
                                        {added} added
                                      </span>
                                    )}
                                    {removed === 0 && modified === 0 && added === 0 && (
                                      <span className="text-gray-500">No changes yet</span>
                                    )}
                                  </>
                                );
                              })()}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Create Change Proposal Button */}
                    <div className="flex justify-end pt-4 border-t">
                      <button
                        onClick={createChangeProposal}
                        disabled={isCreatingOrder || !selectedOrderForChange || !selectedIntakeEvent}
                        className="flex items-center px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isCreatingOrder ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin mr-2" />
                            Creating...
                          </>
                        ) : (
                          <>
                            <GitCompare className="w-4 h-4 mr-2" />
                            Create Change Proposal
                          </>
                        )}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* Orders and Proposals - Only shown when org is selected */}
        {selectedOrg && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
            {/* Orders Section */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900 flex items-center">
                  <ShoppingCart className="w-5 h-5 mr-2 text-purple-600" />
                  Orders ({orders.length})
                </h2>
                <button
                  onClick={() => fetchOrdersAndProposals(selectedOrg.id)}
                  disabled={loadingOrders}
                  className="p-2 text-purple-600 hover:bg-purple-50 rounded-md"
                  title="Refresh"
                >
                  <RefreshCw className={`w-4 h-4 ${loadingOrders ? 'animate-spin' : ''}`} />
                </button>
              </div>

              {loadingOrders ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-purple-600" />
                </div>
              ) : orders.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No orders found</p>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {orders.map((order) => (
                    <div
                      key={order.id}
                      className="border border-gray-200 rounded-lg p-3 hover:border-purple-300 hover:bg-purple-50 cursor-pointer transition-colors"
                      onClick={() => setViewingOrder(order)}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-medium text-sm">{order.customer_name || 'Unknown Customer'}</p>
                          <p className="text-xs text-gray-500">
                            {new Date(order.created_at).toLocaleDateString()}
                            {order.delivery_date && ` • Delivery: ${formatDateString(order.delivery_date)}`}
                          </p>
                        </div>
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          order.status === 'pending_review' ? 'bg-yellow-100 text-yellow-800' :
                          order.status === 'ready' ? 'bg-blue-100 text-blue-800' :
                          order.status === 'pushed_to_erp' ? 'bg-green-100 text-green-800' :
                          order.status === 'completed' ? 'bg-gray-100 text-gray-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {order.status.replace('_', ' ')}
                        </span>
                      </div>
                      {order.order_lines && order.order_lines.length > 0 && (
                        <div className="mt-2 text-xs text-gray-600">
                          {order.order_lines.slice(0, 3).map((line, i) => (
                            <span key={line.id}>
                              {line.product_name} x{line.quantity}
                              {i < Math.min(order.order_lines.length - 1, 2) && ', '}
                            </span>
                          ))}
                          {order.order_lines.length > 3 && (
                            <span className="text-gray-400"> +{order.order_lines.length - 3} more</span>
                          )}
                        </div>
                      )}
                      <p className="text-xs text-gray-400 mt-1 font-mono">{order.id.slice(0, 8)}...</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Proposals Section */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900 flex items-center">
                  <ClipboardList className="w-5 h-5 mr-2 text-purple-600" />
                  Proposals ({proposals.length})
                </h2>
                <button
                  onClick={() => fetchOrdersAndProposals(selectedOrg.id)}
                  disabled={loadingOrders}
                  className="p-2 text-purple-600 hover:bg-purple-50 rounded-md"
                  title="Refresh"
                >
                  <RefreshCw className={`w-4 h-4 ${loadingOrders ? 'animate-spin' : ''}`} />
                </button>
              </div>

              {loadingOrders ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-purple-600" />
                </div>
              ) : proposals.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No proposals found</p>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {proposals.map((proposal) => (
                    <div
                      key={proposal.id}
                      className="border border-gray-200 rounded-lg p-3 hover:border-purple-300 hover:bg-purple-50 cursor-pointer transition-colors"
                      onClick={() => setViewingProposal({ proposalId: proposal.id, orderId: proposal.order_id })}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-medium text-sm">
                            {proposal.order_id ? 'Change Proposal' : 'New Order Proposal'}
                          </p>
                          <p className="text-xs text-gray-500">
                            {new Date(proposal.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          proposal.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                          proposal.status === 'approved' ? 'bg-green-100 text-green-800' :
                          proposal.status === 'rejected' ? 'bg-red-100 text-red-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {proposal.status}
                        </span>
                      </div>
                      {proposal.order_change_proposal_lines && proposal.order_change_proposal_lines.length > 0 && (
                        <div className="mt-2 text-xs space-y-1">
                          {proposal.order_change_proposal_lines.slice(0, 5).map((line) => (
                            <div key={line.id} className={`flex items-center ${
                              line.change_type === 'remove' ? 'text-red-600' :
                              line.change_type === 'add' ? 'text-green-600' :
                              line.change_type === 'modify' ? 'text-yellow-700' :
                              'text-gray-600'
                            }`}>
                              <span className="w-4 mr-1 text-center font-medium">
                                {line.change_type === 'remove' ? '−' :
                                 line.change_type === 'add' ? '+' :
                                 line.change_type === 'modify' ? '~' : ''}
                              </span>
                              <span className={line.change_type === 'remove' ? 'line-through' : ''}>
                                {line.item_name}
                              </span>
                              {line.proposed_values?.quantity !== undefined && (
                                <span className="ml-1">
                                  {line.change_type === 'modify' && line.proposed_values?.original_quantity
                                    ? `(${line.proposed_values.original_quantity} → ${line.proposed_values.quantity})`
                                    : ` x${line.proposed_values.quantity}`
                                  }
                                </span>
                              )}
                            </div>
                          ))}
                          {proposal.order_change_proposal_lines.length > 5 && (
                            <span className="text-gray-400 ml-5">+{proposal.order_change_proposal_lines.length - 5} more</span>
                          )}
                        </div>
                      )}
                      <p className="text-xs text-gray-400 mt-1 font-mono">{proposal.id.slice(0, 8)}...</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Placeholder for future features */}
        {!selectedOrg && (
          <div className="bg-white rounded-lg shadow-md p-12 text-center">
            <Building2 className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Select an Organization</h3>
            <p className="text-gray-500">
              Choose an organization from the dropdown above to view and create orders and proposals.
            </p>
          </div>
        )}
      </main>

      {/* Intake Event Preview Modal */}
      {previewIntakeEvent && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h3 className="text-lg font-semibold text-gray-900">Intake Event Preview</h3>
              <button
                onClick={() => setPreviewIntakeEvent(null)}
                className="p-1 text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 py-4 overflow-y-auto max-h-[60vh]">
              <div className="flex items-center space-x-2 mb-4 flex-wrap">
                {!previewIntakeEvent.organization_id && (
                  <span className="text-sm px-3 py-1 bg-orange-100 text-orange-700 rounded-full font-medium">UNASSIGNED</span>
                )}
                <span className="text-sm px-3 py-1 bg-purple-100 text-purple-700 rounded-full capitalize">{previewIntakeEvent.channel}</span>
                <span className="text-sm px-3 py-1 bg-gray-100 text-gray-700 rounded-full">{previewIntakeEvent.provider}</span>
              </div>
              <div className="text-sm text-gray-500 mb-4">
                <span className="font-medium">Created:</span> {new Date(previewIntakeEvent.created_at).toLocaleString()}
              </div>
              <div className="text-sm text-gray-500 mb-2">
                <span className="font-medium">ID:</span> <span className="font-mono">{previewIntakeEvent.id}</span>
              </div>
              <div className="mt-4">
                <h4 className="text-sm font-medium text-gray-700 mb-2">Raw Content:</h4>
                <pre className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm text-gray-700 max-h-64 overflow-auto">
                  {previewIntakeEvent.raw_content ? JSON.stringify(previewIntakeEvent.raw_content, null, 2) : 'No content available'}
                </pre>
              </div>
            </div>
            <div className="flex justify-end space-x-3 px-6 py-4 border-t bg-gray-50">
              <button
                onClick={() => setPreviewIntakeEvent(null)}
                className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-100"
              >
                Close
              </button>
              <button
                onClick={() => {
                  setSelectedIntakeEvent(previewIntakeEvent);
                  setPreviewIntakeEvent(null);
                  setShowIntakeEventDropdown(false);
                }}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
              >
                Select This Event
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Proposal Details Modal */}
      {viewingProposal && (
        <ProposalDiffModal
          proposalId={viewingProposal.proposalId}
          orderId={viewingProposal.orderId}
          onClose={() => setViewingProposal(null)}
          onResolved={() => {
            setViewingProposal(null);
            if (selectedOrg) {
              fetchOrdersAndProposals(selectedOrg.id);
            }
          }}
        />
      )}

      {/* Order Details Modal */}
      {viewingOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b bg-purple-50">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Order Details</h3>
                <p className="text-sm text-gray-500 font-mono">{viewingOrder.id}</p>
              </div>
              <button
                onClick={() => setViewingOrder(null)}
                className="p-1 text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 py-4 overflow-y-auto max-h-[60vh]">
              {/* Order Info */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <p className="text-sm text-gray-500">Customer</p>
                  <p className="font-medium">{viewingOrder.customer_name || 'Unknown Customer'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Status</p>
                  <span className={`inline-block text-sm px-2 py-1 rounded-full ${
                    viewingOrder.status === 'pending_review' ? 'bg-yellow-100 text-yellow-800' :
                    viewingOrder.status === 'ready' ? 'bg-blue-100 text-blue-800' :
                    viewingOrder.status === 'pushed_to_erp' ? 'bg-green-100 text-green-800' :
                    viewingOrder.status === 'completed' ? 'bg-gray-100 text-gray-800' :
                    'bg-red-100 text-red-800'
                  }`}>
                    {viewingOrder.status.replace(/_/g, ' ')}
                  </span>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Created</p>
                  <p className="font-medium">{new Date(viewingOrder.created_at).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Delivery Date</p>
                  <p className="font-medium">
                    {viewingOrder.delivery_date ? formatDateString(viewingOrder.delivery_date) : 'Not specified'}
                  </p>
                </div>
              </div>

              {/* Order Lines */}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-3">Order Items ({viewingOrder.order_lines.length})</h4>
                {viewingOrder.order_lines.length === 0 ? (
                  <p className="text-gray-500 text-sm">No items</p>
                ) : (
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 text-sm font-medium text-gray-600">Item</th>
                        <th className="text-center py-2 text-sm font-medium text-gray-600">Quantity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {viewingOrder.order_lines.map((line) => (
                        <tr key={line.id} className="border-b last:border-b-0">
                          <td className="py-2 text-sm">{line.product_name}</td>
                          <td className="py-2 text-sm text-center">{line.quantity}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
            <div className="px-6 py-4 border-t bg-gray-50 flex justify-end">
              <button
                onClick={() => setViewingOrder(null)}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
