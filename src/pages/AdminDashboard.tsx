import React, { useEffect, useState } from 'react';
import { Shield, Search, Plus, Building2, Users, Package, FileText, LogOut, X, Loader2, ShoppingCart, ClipboardList, RefreshCw, Eye, GitCompare, Minus, ArrowRight, ChevronDown, ChevronRight } from 'lucide-react';
import { supabaseClient } from '../supabaseClient';
import ProposalDiffModal from '../components/ProposalDiffModal';

const ADMIN_EMAIL = 'orders.frootful@gmail.com';

const TAG_PRESETS: { key: string; label: string; options: { value: string; label: string; color: string; tooltip: string }[] }[] = [
  {
    key: 'order_frequency',
    label: 'Order Frequency',
    options: [
      { value: 'one-time', label: 'One-time', color: 'orange', tooltip: 'One-time order update. Will not affect recurring standing orders.' },
      { value: 'recurring', label: 'Recurring', color: 'blue', tooltip: 'Updates the recurring standing order going forward.' },
    ],
  },
];

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
  sort_order: number | null;
}

interface ItemVariant {
  id: string;
  variant_code: string;
  variant_name: string;
}

interface Item {
  id: string;
  sku: string;
  name: string;
  item_variants: ItemVariant[];
}

interface OrderLine {
  itemId: string;
  itemName: string;
  variantId: string | null;
  variantCode: string;
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
  tags: Record<string, string>;
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
  item_variant_id: string | null;
  product_name: string;
  base_name: string; // items.name — base item name without variant
  quantity: number;
  variant_code: string;
  variant_name: string;
  meta: { sku?: string } | null;
}

interface ProposedLine {
  originalLineId: string | null;  // null for new items
  itemId: string;
  itemName: string;
  sku: string;
  variantId: string | null;
  variantCode: string;
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
  const [highlightedItemIndex, setHighlightedItemIndex] = useState(-1);
  const itemDropdownRef = React.useRef<HTMLDivElement>(null);
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

  // Mode toggle: 'create_order' (direct) or 'create_proposal' (new or attached to existing)
  const [mode, setMode] = useState<'create_order' | 'create_proposal'>('create_order');

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

  // Tag editing
  const [editingTagsProposalId, setEditingTagsProposalId] = useState<string | null>(null);
  const [editingTagKey, setEditingTagKey] = useState('');
  const [editingTagValue, setEditingTagValue] = useState('');

  // Tags for the create form
  const [formTags, setFormTags] = useState<Record<string, string>>({ order_frequency: 'one-time' });
  const [formTagKey, setFormTagKey] = useState('');
  const [formTagValue, setFormTagValue] = useState('');
  const [showCustomTagInput, setShowCustomTagInput] = useState(false);

  // Catalog view state
  const [expandedCatalogItems, setExpandedCatalogItems] = useState<Set<string>>(new Set());
  const [catalogSearch, setCatalogSearch] = useState('');

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
        .neq('status', 'cancelled')
        .order('delivery_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(100);

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
          tags,
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
        .select('id, name, email, phone, sort_order')
        .eq('organization_id', org.id)
        .eq('active', true)
        .order('name');

      if (customersError) throw customersError;
      setCustomers(customersData || []);

      // Fetch items with variants for this org
      const { data: itemsData, error: itemsError } = await supabaseClient
        .from('items')
        .select('id, sku, name, item_variants(id, variant_code, variant_name)')
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

      // Combine and sort by most recent first
      const combinedIntake = [...(unassignedIntake || []), ...(orgIntake || [])]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
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

  // Flat list of item+variant rows for the dropdown
  const flatItemOptions = React.useMemo(() => {
    const options: { item: Item; variant?: ItemVariant; label: string }[] = [];
    filteredItems.slice(0, 15).forEach(item => {
      const variants = item.item_variants || [];
      if (variants.length > 0) {
        variants.forEach(v => {
          options.push({ item, variant: v, label: `${item.name} — ${v.variant_code} (${v.variant_name})` });
        });
      } else {
        options.push({ item, label: item.name });
      }
    });
    return options;
  }, [filteredItems]);

  // Close item dropdown on click outside
  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (itemDropdownRef.current && !itemDropdownRef.current.contains(e.target as Node)) {
        setShowItemDropdown(false);
        setHighlightedItemIndex(-1);
      }
    };
    if (showItemDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showItemDropdown]);

  const filteredOrgUsers = orgUsers.filter(u =>
    u.email.toLowerCase().includes(receivedBySearch.toLowerCase())
  );

  const getIntakeEventPreview = (e: IntakeEvent): string => {
    if (!e.raw_content) return 'No content';
    const raw = typeof e.raw_content === 'string' ? JSON.parse(e.raw_content) : e.raw_content;
    // SMS: body field; Email: text or subject
    return raw.body || raw.text || raw.subject || JSON.stringify(raw).substring(0, 150);
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
        .select('id, item_id, item_variant_id, product_name, quantity, meta, status, item_variants(variant_code, variant_name), items(name)')
        .eq('order_id', order.id)
        .eq('status', 'active')
        .order('line_number');

      if (error) throw error;

      const existingLines: ExistingOrderLine[] = (lines || []).map((l: any) => ({
        id: l.id,
        item_id: l.item_id,
        item_variant_id: l.item_variant_id,
        product_name: l.product_name,
        base_name: l.items?.name || l.product_name,
        quantity: l.quantity,
        variant_code: l.item_variants?.variant_code || '',
        variant_name: l.item_variants?.variant_name || '',
        meta: l.meta as { sku?: string } | null
      }));

      setOriginalLines(existingLines);

      // Initialize proposed lines as a copy of the original lines
      const proposed: ProposedLine[] = existingLines.map(l => ({
        originalLineId: l.id,
        itemId: l.item_id || '',
        itemName: l.base_name,
        sku: l.meta?.sku || '',
        variantId: l.item_variant_id,
        variantCode: l.variant_code,
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

  // Clear the "attach to existing order" selection and reset change-proposal state
  const clearOrderForChange = () => {
    setSelectedOrderForChange(null);
    setOriginalLines([]);
    setProposedLines([]);
  };

  // Handle mode switch
  const handleModeSwitch = (newMode: 'create_order' | 'create_proposal') => {
    if (newMode === mode) return;
    setMode(newMode);
    setSelectedCustomer(null);
    setSelectedReceivedBy(null);
    setSelectedIntakeEvent(null);
    setSourceChannel('email');
    setOrderLines([]);
    setDeliveryDate('');
    setOrderCreatedMessage(null);
    clearOrderForChange();
  };

  // Update proposed line quantity (allow 0 as transient empty state; validated on blur)
  const updateProposedLineQuantity = (index: number, quantity: number) => {
    if (quantity < 0) {
      return;
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

  // Add item to proposed lines (with optional variant)
  const addItemToProposedLines = (item: Item, variant?: ItemVariant) => {
    const existing = proposedLines.find(l =>
      variant ? l.variantId === variant.id : l.itemId === item.id && !l.variantId
    );
    if (existing) {
      setProposedLines(proposedLines.map(l =>
        (variant ? l.variantId === variant.id : l.itemId === item.id && !l.variantId)
          ? { ...l, quantity: l.quantity + 1 } : l
      ));
    } else {
      setProposedLines([...proposedLines, {
        originalLineId: null,
        itemId: item.id,
        itemName: item.name,
        sku: variant ? `${item.sku}-${variant.variant_code}` : item.sku,
        variantId: variant?.id || null,
        variantCode: variant?.variant_code || '',
        quantity: 1,
        isNew: true
      }]);
    }
    setItemSearch('');
    setShowItemDropdown(false);
  };

  // Update variant on a proposed line
  const updateProposedLineVariant = (index: number, variantId: string) => {
    const line = proposedLines[index];
    if (!line) return;
    const item = items.find(i => i.id === line.itemId);
    if (!item) return;
    const variant = item.item_variants?.find(v => v.id === variantId);
    if (!variant) return;
    setProposedLines(prev => prev.map((l, i) =>
      i === index ? {
        ...l,
        variantId: variant.id,
        variantCode: variant.variant_code,
        itemName: item.name,
        sku: `${item.sku}-${variant.variant_code}`
      } : l
    ));
  };

  const addItemToOrder = (item: Item, variant?: ItemVariant, qty: number = 1) => {
    const existing = orderLines.find(l =>
      variant ? l.variantId === variant.id : l.itemId === item.id && !l.variantId
    );
    if (existing) {
      setOrderLines(orderLines.map(l =>
        (variant ? l.variantId === variant.id : l.itemId === item.id && !l.variantId)
          ? { ...l, quantity: l.quantity + qty } : l
      ));
    } else {
      setOrderLines([...orderLines, {
        itemId: item.id,
        itemName: item.name,
        variantId: variant?.id || null,
        variantCode: variant?.variant_code || '',
        quantity: qty,
        sku: variant ? `${item.sku}-${variant.variant_code}` : item.sku
      }]);
    }
  };

  const getLineKey = (line: OrderLine) => line.variantId || line.itemId;

  const updateLineQuantity = (lineKey: string, quantity: number) => {
    if (quantity <= 0) {
      setOrderLines(orderLines.filter(l => getLineKey(l) !== lineKey));
    } else {
      setOrderLines(orderLines.map(l =>
        getLineKey(l) === lineKey ? { ...l, quantity } : l
      ));
    }
  };

  const removeLineItem = (lineKey: string) => {
    setOrderLines(orderLines.filter(l => getLineKey(l) !== lineKey));
  };

  const createOrderProposal = async () => {
    if (!selectedOrg || !selectedCustomer || orderLines.length === 0) {
      alert('Please select an organization, customer, and add at least one item.');
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
          status: 'pending',
          tags: formTags
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
        item_variant_id: line.variantId || null,
        item_name: line.itemName,
        proposed_values: {
          quantity: line.quantity,
          sku: line.sku,
          variant_code: line.variantCode || null,
          ai_matched: true,
          confidence: 1.0,
          organization_id: selectedOrg.id,
          customer_id: selectedCustomer.id,
          customer_name: selectedCustomer.name,
          delivery_date: deliveryDate || null,
          source_channel: sourceChannel,
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
      setFormTags({ order_frequency: 'one-time' });
      await fetchOrdersAndProposals(selectedOrg.id);
    } catch (error) {
      console.error('Error creating order proposal:', error);
      alert('Failed to create order proposal. Please try again.');
    } finally {
      setIsCreatingOrder(false);
    }
  };

  const createOrderDirect = async () => {
    if (!selectedOrg || !selectedCustomer || orderLines.length === 0) {
      alert('Please select an organization, customer, and add at least one item.');
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
        item_variant_id: line.variantId || null,
        product_name: line.itemName,
        quantity: line.quantity,
        meta: {
          sku: line.sku,
          variant_code: line.variantCode || null,
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
      setFormTags({ order_frequency: 'one-time' });
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
    if (!selectedOrg || !selectedOrderForChange) {
      alert('Please select an order to modify.');
      return;
    }

    // Check if there are any actual changes (qty or variant)
    const hasChanges = proposedLines.length !== originalLines.length ||
      proposedLines.some((proposed) => {
        const original = originalLines.find(o => o.id === proposed.originalLineId);
        if (!original) return true; // New item
        return original.quantity !== proposed.quantity || original.variant_code !== proposed.variantCode;
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
          intake_event_id: selectedIntakeEvent?.id || null,
          status: 'pending',
          type: 'change_order',
          tags: { ...formTags }
        })
        .select()
        .single();

      if (proposalError) throw proposalError;

      // Assign intake event to organization if not already assigned
      if (selectedIntakeEvent && !selectedIntakeEvent.organization_id) {
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
        item_variant_id: string | null;
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
            item_variant_id: original.item_variant_id,
            item_name: original.base_name,
            proposed_values: {
              original_quantity: original.quantity,
              quantity: 0,
              variant_code: original.variant_code
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
            item_variant_id: proposed.variantId,
            item_name: proposed.itemName,
            proposed_values: {
              quantity: proposed.quantity,
              sku: proposed.sku,
              variant_code: proposed.variantCode
            }
          });
        } else {
          // Check if modified (qty or variant changed)
          const original = originalLines.find(o => o.id === proposed.originalLineId);
          if (original && (original.quantity !== proposed.quantity || original.variant_code !== proposed.variantCode)) {
            proposalLinesData.push({
              proposal_id: proposal.id,
              order_line_id: original.id,
              line_number: lineNumber++,
              change_type: 'modify',
              item_id: original.item_id,
              item_variant_id: proposed.variantId,
              item_name: proposed.itemName,
              proposed_values: {
                original_quantity: original.quantity,
                quantity: proposed.quantity,
                original_variant_code: original.variant_code,
                variant_code: proposed.variantCode
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
      setFormTags({ order_frequency: 'one-time' });
      await fetchOrdersAndProposals(selectedOrg.id);
    } catch (error) {
      console.error('Error creating change proposal:', error);
      alert('Failed to create change proposal. Please try again.');
    } finally {
      setIsCreatingOrder(false);
    }
  };

  const addTagToProposal = async (proposalId: string, key: string, value: string) => {
    const proposal = proposals.find(p => p.id === proposalId);
    if (!proposal) return;
    const updatedTags = { ...(proposal.tags || {}), [key]: value };
    const { error } = await supabaseClient
      .from('order_change_proposals')
      .update({ tags: updatedTags })
      .eq('id', proposalId);
    if (error) {
      console.error('Error adding tag:', error);
      alert('Failed to add tag.');
      return;
    }
    setProposals(prev => prev.map(p => p.id === proposalId ? { ...p, tags: updatedTags } : p));
    setEditingTagsProposalId(null);
    setEditingTagKey('');
    setEditingTagValue('');
  };

  const removeTagFromProposal = async (proposalId: string, key: string) => {
    const proposal = proposals.find(p => p.id === proposalId);
    if (!proposal) return;
    const updatedTags = { ...(proposal.tags || {}) };
    delete updatedTags[key];
    const { error } = await supabaseClient
      .from('order_change_proposals')
      .update({ tags: updatedTags })
      .eq('id', proposalId);
    if (error) {
      console.error('Error removing tag:', error);
      alert('Failed to remove tag.');
      return;
    }
    setProposals(prev => prev.map(p => p.id === proposalId ? { ...p, tags: updatedTags } : p));
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
                onClick={() => handleModeSwitch('create_order')}
                className={`flex items-center px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  mode === 'create_order'
                    ? 'bg-white text-purple-700 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <ShoppingCart className="w-4 h-4 mr-2" />
                Create Order
              </button>
              <button
                onClick={() => handleModeSwitch('create_proposal')}
                className={`flex items-center px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  mode === 'create_proposal'
                    ? 'bg-white text-purple-700 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <GitCompare className="w-4 h-4 mr-2" />
                Create Proposal
              </button>
            </div>

            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              {mode === 'create_order' ? (
                <>
                  <ShoppingCart className="w-5 h-5 mr-2 text-purple-600" />
                  Create Order
                </>
              ) : (
                <>
                  <GitCompare className="w-5 h-5 mr-2 text-purple-600" />
                  Create Proposal
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

                {/* CREATE ORDER MODE — direct order, no proposal */}
                {mode === 'create_order' && (
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
                    <option value="erp">ERP</option>
                    <option value="manual">Manual</option>
                    <option value="phone">Phone</option>
                  </select>
                </div>

                {/* Add Items + Running Order (side by side) */}
                <div className="flex gap-4" ref={itemDropdownRef}>
                  {/* Left: Item Catalog Search */}
                  <div className="flex-1 min-w-0">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      <Package className="w-4 h-4 inline mr-1" />
                      Add Items
                    </label>
                    <input
                      type="text"
                      value={itemSearch}
                      onChange={(e) => {
                        setItemSearch(e.target.value);
                        setShowItemDropdown(true);
                        setHighlightedItemIndex(-1);
                      }}
                      onFocus={() => setShowItemDropdown(true)}
                      onKeyDown={(e) => {
                        if (!showItemDropdown || flatItemOptions.length === 0) return;
                        if (e.key === 'ArrowDown') {
                          e.preventDefault();
                          setHighlightedItemIndex(prev =>
                            prev < flatItemOptions.length - 1 ? prev + 1 : 0
                          );
                        } else if (e.key === 'ArrowUp') {
                          e.preventDefault();
                          setHighlightedItemIndex(prev =>
                            prev > 0 ? prev - 1 : flatItemOptions.length - 1
                          );
                        } else if (e.key === 'Enter' && highlightedItemIndex >= 0) {
                          e.preventDefault();
                          const option = flatItemOptions[highlightedItemIndex];
                          addItemToOrder(option.item, option.variant);
                        } else if (e.key === 'Escape') {
                          setShowItemDropdown(false);
                          setHighlightedItemIndex(-1);
                        }
                      }}
                      placeholder="Search items by name or SKU..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                    {showItemDropdown && (
                    <div className="mt-1 border border-gray-200 rounded-lg max-h-72 overflow-y-auto bg-white">
                      {filteredItems.length > 0 ? (
                        filteredItems.slice(0, 15).map((item) => {
                          const variants = item.item_variants || [];
                          return (
                            <div key={item.id} className="border-b last:border-b-0 px-3 py-2">
                              <p className="font-medium text-sm text-gray-900">{item.name}</p>
                              {variants.length > 0 ? (
                                <div className="mt-1 space-y-1">
                                  {variants.map((variant) => (
                                    <div key={variant.id} className="flex items-center gap-2">
                                      <span className="text-xs text-gray-500 w-32 truncate">
                                        {variant.variant_code} — {variant.variant_name}
                                      </span>
                                      <span className="text-xs text-gray-400 w-12">${variant.price}</span>
                                      <input
                                        type="number"
                                        min="1"
                                        defaultValue={1}
                                        id={`cat-qty-${variant.id}`}
                                        className="w-14 px-1 py-0.5 text-xs text-center border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-purple-500"
                                      />
                                      <button
                                        onClick={() => {
                                          const input = document.getElementById(`cat-qty-${variant.id}`) as HTMLInputElement;
                                          const qty = parseInt(input?.value) || 1;
                                          addItemToOrder(item, variant, qty);
                                        }}
                                        className="flex-shrink-0 inline-flex items-center gap-0.5 px-2 py-0.5 text-xs font-medium bg-purple-50 text-purple-700 rounded hover:bg-purple-100 transition-colors"
                                      >
                                        <Plus className="w-3 h-3" />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="flex items-center gap-2 mt-1">
                                  <input
                                    type="number"
                                    min="1"
                                    defaultValue={1}
                                    id={`cat-qty-${item.id}`}
                                    className="w-14 px-1 py-0.5 text-xs text-center border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-purple-500"
                                  />
                                  <button
                                    onClick={() => {
                                      const input = document.getElementById(`cat-qty-${item.id}`) as HTMLInputElement;
                                      const qty = parseInt(input?.value) || 1;
                                      addItemToOrder(item, undefined, qty);
                                    }}
                                    className="flex-shrink-0 inline-flex items-center gap-0.5 px-2 py-0.5 text-xs font-medium bg-purple-50 text-purple-700 rounded hover:bg-purple-100 transition-colors"
                                  >
                                    <Plus className="w-3 h-3" />
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })
                      ) : (
                        <div className="px-3 py-4 text-center text-sm text-gray-400">
                          {itemSearch ? 'No items match your search' : 'Type to search items...'}
                        </div>
                      )}
                    </div>
                    )}
                  </div>

                  {/* Right: Running Order */}
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Order Lines ({orderLines.length} item{orderLines.length !== 1 ? 's' : ''})
                    </label>
                    <div className="border border-gray-200 rounded-lg max-h-80 overflow-y-auto bg-white">
                      {orderLines.length === 0 ? (
                        <div className="px-3 py-8 text-center text-sm text-gray-400">
                          No items added yet
                        </div>
                      ) : (
                        <div className="divide-y divide-gray-100">
                          {orderLines.map((line) => {
                            const itemForLine = items.find(i => i.id === line.itemId);
                            const variants = itemForLine?.item_variants || [];
                            return (
                              <div key={getLineKey(line)} className="px-3 py-2 flex items-center gap-2">
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-gray-900 truncate">{itemForLine?.name || line.itemName}</p>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    {variants.length > 0 ? (
                                      <select
                                        value={line.variantId || ''}
                                        onChange={(e) => {
                                          const variant = variants.find(v => v.id === e.target.value);
                                          if (variant) {
                                            setOrderLines(orderLines.map(l =>
                                              getLineKey(l) === getLineKey(line)
                                                ? {
                                                    ...l,
                                                    variantId: variant.id,
                                                    variantCode: variant.variant_code,
                                                    itemName: `${itemForLine?.name || line.itemName} - ${variant.variant_name}`,
                                                    sku: `${itemForLine?.sku || line.sku.split('-').slice(0, -1).join('-')}-${variant.variant_code}`
                                                  }
                                                : l
                                            ));
                                          }
                                        }}
                                        className="text-xs px-1.5 py-0.5 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-purple-500"
                                      >
                                        {variants.map(v => (
                                          <option key={v.id} value={v.id}>{v.variant_code}</option>
                                        ))}
                                      </select>
                                    ) : (
                                      <span className="text-xs text-gray-400">—</span>
                                    )}
                                    <span className="text-xs text-gray-400">{line.sku}</span>
                                  </div>
                                </div>
                                <input
                                  type="number"
                                  min="1"
                                  value={line.quantity}
                                  onChange={(e) => updateLineQuantity(getLineKey(line), parseInt(e.target.value) || 0)}
                                  className="w-14 px-1 py-0.5 text-sm text-center border border-gray-300 rounded"
                                />
                                <button
                                  onClick={() => removeLineItem(getLineKey(line))}
                                  className="text-gray-300 hover:text-red-500 flex-shrink-0"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Create Order Button */}
                <div className="flex justify-end pt-4 border-t">
                  <button
                    onClick={createOrderDirect}
                    disabled={isCreatingOrder || !selectedCustomer || orderLines.length === 0 || !deliveryDate}
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

                {/* CREATE PROPOSAL MODE — new order proposal or change to existing order */}
                {mode === 'create_proposal' && (
                  <>
                {/* Attach to Existing Order (optional) */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <ShoppingCart className="w-4 h-4 inline mr-1" />
                    Attach to Existing Order <span className="text-gray-400 text-xs font-normal">(optional — leave empty for new order)</span>
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
                        onClick={clearOrderForChange}
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

                {/* Intake Event Selection — always visible */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <FileText className="w-4 h-4 inline mr-1" />
                    Intake Event <span className="text-gray-400 text-xs font-normal">(optional)</span>
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
                                    {new Date(event.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                                  </span>
                                </div>
                                <p className="text-sm text-gray-600 whitespace-pre-line line-clamp-3">
                                  {getIntakeEventPreview(event)}
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

                {/* NEW ORDER FIELDS — shown when no existing order is selected */}
                {!selectedOrderForChange && (
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
                    Received By <span className="text-gray-400 text-xs font-normal">(optional)</span>
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
                    <option value="erp">ERP</option>
                    <option value="manual">Manual</option>
                    <option value="phone">Phone</option>
                  </select>
                </div>

                {/* Add Items + Running Order (side by side) */}
                <div className="flex gap-4" ref={itemDropdownRef}>
                  {/* Left: Item Catalog Search */}
                  <div className="flex-1 min-w-0">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      <Package className="w-4 h-4 inline mr-1" />
                      Add Items
                    </label>
                    <input
                      type="text"
                      value={itemSearch}
                      onChange={(e) => {
                        setItemSearch(e.target.value);
                        setShowItemDropdown(true);
                        setHighlightedItemIndex(-1);
                      }}
                      onFocus={() => setShowItemDropdown(true)}
                      onKeyDown={(e) => {
                        if (!showItemDropdown || flatItemOptions.length === 0) return;
                        if (e.key === 'ArrowDown') {
                          e.preventDefault();
                          setHighlightedItemIndex(prev =>
                            prev < flatItemOptions.length - 1 ? prev + 1 : 0
                          );
                        } else if (e.key === 'ArrowUp') {
                          e.preventDefault();
                          setHighlightedItemIndex(prev =>
                            prev > 0 ? prev - 1 : flatItemOptions.length - 1
                          );
                        } else if (e.key === 'Enter' && highlightedItemIndex >= 0) {
                          e.preventDefault();
                          const option = flatItemOptions[highlightedItemIndex];
                          addItemToOrder(option.item, option.variant);
                        } else if (e.key === 'Escape') {
                          setShowItemDropdown(false);
                          setHighlightedItemIndex(-1);
                        }
                      }}
                      placeholder="Search items by name or SKU..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                    {showItemDropdown && (
                    <div className="mt-1 border border-gray-200 rounded-lg max-h-72 overflow-y-auto bg-white">
                      {filteredItems.length > 0 ? (
                        filteredItems.slice(0, 15).map((item) => {
                          const variants = item.item_variants || [];
                          return (
                            <div key={item.id} className="border-b last:border-b-0 px-3 py-2">
                              <p className="font-medium text-sm text-gray-900">{item.name}</p>
                              {variants.length > 0 ? (
                                <div className="mt-1 space-y-1">
                                  {variants.map((variant) => (
                                    <div key={variant.id} className="flex items-center gap-2">
                                      <span className="text-xs text-gray-500 w-32 truncate">
                                        {variant.variant_code} — {variant.variant_name}
                                      </span>
                                      <span className="text-xs text-gray-400 w-12">${variant.price}</span>
                                      <input
                                        type="number"
                                        min="1"
                                        defaultValue={1}
                                        id={`cat-qty-${variant.id}`}
                                        className="w-14 px-1 py-0.5 text-xs text-center border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-purple-500"
                                      />
                                      <button
                                        onClick={() => {
                                          const input = document.getElementById(`cat-qty-${variant.id}`) as HTMLInputElement;
                                          const qty = parseInt(input?.value) || 1;
                                          addItemToOrder(item, variant, qty);
                                        }}
                                        className="flex-shrink-0 inline-flex items-center gap-0.5 px-2 py-0.5 text-xs font-medium bg-purple-50 text-purple-700 rounded hover:bg-purple-100 transition-colors"
                                      >
                                        <Plus className="w-3 h-3" />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="flex items-center gap-2 mt-1">
                                  <input
                                    type="number"
                                    min="1"
                                    defaultValue={1}
                                    id={`cat-qty-${item.id}`}
                                    className="w-14 px-1 py-0.5 text-xs text-center border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-purple-500"
                                  />
                                  <button
                                    onClick={() => {
                                      const input = document.getElementById(`cat-qty-${item.id}`) as HTMLInputElement;
                                      const qty = parseInt(input?.value) || 1;
                                      addItemToOrder(item, undefined, qty);
                                    }}
                                    className="flex-shrink-0 inline-flex items-center gap-0.5 px-2 py-0.5 text-xs font-medium bg-purple-50 text-purple-700 rounded hover:bg-purple-100 transition-colors"
                                  >
                                    <Plus className="w-3 h-3" />
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })
                      ) : (
                        <div className="px-3 py-4 text-center text-sm text-gray-400">
                          {itemSearch ? 'No items match your search' : 'Type to search items...'}
                        </div>
                      )}
                    </div>
                    )}
                  </div>

                  {/* Right: Running Order */}
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Order Lines ({orderLines.length} item{orderLines.length !== 1 ? 's' : ''})
                    </label>
                    <div className="border border-gray-200 rounded-lg max-h-80 overflow-y-auto bg-white">
                      {orderLines.length === 0 ? (
                        <div className="px-3 py-8 text-center text-sm text-gray-400">
                          No items added yet
                        </div>
                      ) : (
                        <div className="divide-y divide-gray-100">
                          {orderLines.map((line) => {
                            const itemForLine = items.find(i => i.id === line.itemId);
                            const variants = itemForLine?.item_variants || [];
                            return (
                              <div key={getLineKey(line)} className="px-3 py-2 flex items-center gap-2">
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-gray-900 truncate">{itemForLine?.name || line.itemName}</p>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    {variants.length > 0 ? (
                                      <select
                                        value={line.variantId || ''}
                                        onChange={(e) => {
                                          const variant = variants.find(v => v.id === e.target.value);
                                          if (variant) {
                                            setOrderLines(orderLines.map(l =>
                                              getLineKey(l) === getLineKey(line)
                                                ? {
                                                    ...l,
                                                    variantId: variant.id,
                                                    variantCode: variant.variant_code,
                                                    itemName: `${itemForLine?.name || line.itemName} - ${variant.variant_name}`,
                                                    sku: `${itemForLine?.sku || line.sku.split('-').slice(0, -1).join('-')}-${variant.variant_code}`
                                                  }
                                                : l
                                            ));
                                          }
                                        }}
                                        className="text-xs px-1.5 py-0.5 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-purple-500"
                                      >
                                        {variants.map(v => (
                                          <option key={v.id} value={v.id}>{v.variant_code}</option>
                                        ))}
                                      </select>
                                    ) : (
                                      <span className="text-xs text-gray-400">—</span>
                                    )}
                                    <span className="text-xs text-gray-400">{line.sku}</span>
                                  </div>
                                </div>
                                <input
                                  type="number"
                                  min="1"
                                  value={line.quantity}
                                  onChange={(e) => updateLineQuantity(getLineKey(line), parseInt(e.target.value) || 0)}
                                  className="w-14 px-1 py-0.5 text-sm text-center border border-gray-300 rounded"
                                />
                                <button
                                  onClick={() => removeLineItem(getLineKey(line))}
                                  className="text-gray-300 hover:text-red-500 flex-shrink-0"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                  </>
                )}

                {/* CHANGE PROPOSAL VIEW — shown when an existing order is selected */}
                    {selectedOrderForChange && (
                      <div className="rounded-lg border-l-4 border-l-blue-400 border border-gray-200 bg-white shadow-sm">
                        {/* Card Header */}
                        <div className="px-5 py-3 border-b border-gray-100">
                          <p className="text-xs text-blue-600 uppercase tracking-wider font-medium mb-1">Order to Modify</p>
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-medium text-sm">
                              {(selectedOrderForChange.customer_name || 'U')[0].toUpperCase()}
                            </div>
                            <div>
                              <p className="font-medium text-gray-900">{selectedOrderForChange.customer_name || 'Unknown Customer'}</p>
                              <p className="text-xs text-gray-500">
                                {selectedOrderForChange.delivery_date && `Delivery: ${formatDateString(selectedOrderForChange.delivery_date)}`}
                                {selectedOrderForChange.delivery_date && ' • '}
                                <span className="font-mono">{selectedOrderForChange.id.slice(0, 8)}...</span>
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Items Table */}
                        <div className="px-5 py-3">
                          {loadingOrderLines ? (
                            <div className="flex items-center justify-center py-8">
                              <Loader2 className="w-6 h-6 animate-spin text-purple-600 mr-2" />
                              <span className="text-gray-600">Loading order lines...</span>
                            </div>
                          ) : (
                            <>
                              <p className="text-xs text-gray-400 uppercase tracking-wider font-medium mb-2">Changes</p>
                              <table className="w-full text-sm">
                                <tbody>
                                  {/* Existing order items with inline diff annotations */}
                                  {originalLines.map((origLine) => {
                                    const proposed = proposedLines.find(p => p.originalLineId === origLine.id);
                                    const isRemoved = !proposed;
                                    const isModified = proposed && (
                                      proposed.quantity !== origLine.quantity ||
                                      proposed.variantCode !== origLine.variant_code
                                    );
                                    const itemForLine = items.find(i => i.id === origLine.item_id);
                                    const variants = itemForLine?.item_variants || [];
                                    const proposedIdx = proposedLines.findIndex(p => p.originalLineId === origLine.id);
                                    const baseName = origLine.product_name.replace(/ - (Small Clamshell|Large Clamshell|Price Live Tray)$/, '');

                                    return (
                                      <React.Fragment key={origLine.id}>
                                        {/* Original row — static, strikethrough if modified/removed */}
                                        <tr
                                          className={`${isRemoved || isModified ? 'opacity-50' : 'group hover:bg-gray-50 cursor-pointer'}`}
                                          onDoubleClick={() => {
                                            // Double-click unchanged row to create a modification (copies current values so user can edit in blue row)
                                            if (!isRemoved && !isModified && proposed && proposedIdx >= 0) {
                                              // Bump qty by 0 to trigger "modified" state — change qty to same+1 then user adjusts
                                              updateProposedLineQuantity(proposedIdx, proposed.quantity + 1);
                                            }
                                          }}
                                          title={!isRemoved && !isModified ? 'Double-click to modify' : undefined}
                                        >
                                          <td className={`py-1.5 text-gray-700 ${isRemoved || isModified ? 'line-through' : ''}`}>
                                            {baseName}
                                          </td>
                                          <td className={`py-1.5 text-center text-gray-500 w-16 ${isRemoved || isModified ? 'line-through' : ''}`}>
                                            {origLine.variant_code || '—'}
                                          </td>
                                          <td className={`py-1.5 text-center text-gray-700 font-medium w-12 ${isRemoved || isModified ? 'line-through' : ''}`}>
                                            {origLine.quantity}
                                          </td>
                                          <td className="py-1.5 w-8">
                                            {!isRemoved && !isModified && (
                                              <button
                                                onClick={() => {
                                                  setProposedLines(prev => prev.filter(p => p.originalLineId !== origLine.id));
                                                }}
                                                className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                                title="Remove item"
                                              >
                                                <X className="w-3.5 h-3.5" />
                                              </button>
                                            )}
                                          </td>
                                        </tr>

                                        {/* Blue modification row — shows new values when changed */}
                                        {isModified && proposed && (
                                          <tr className="bg-blue-50">
                                            <td className="py-1.5 pl-5 text-blue-700 text-sm">
                                              <span className="text-blue-400 mr-1">&#8627;</span>
                                              {baseName}
                                            </td>
                                            <td className="py-1.5 text-center">
                                              {variants.length > 0 ? (
                                                <select
                                                  value={proposed.variantId || ''}
                                                  onChange={(e) => {
                                                    if (proposedIdx >= 0) updateProposedLineVariant(proposedIdx, e.target.value);
                                                  }}
                                                  className="px-1 py-0.5 text-xs border border-blue-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                                                >
                                                  {variants.map(v => (
                                                    <option key={v.id} value={v.id}>{v.variant_code}</option>
                                                  ))}
                                                </select>
                                              ) : (
                                                <span className="text-xs text-gray-400">{proposed.variantCode || '—'}</span>
                                              )}
                                            </td>
                                            <td className="py-1.5 text-center">
                                              <input
                                                type="number"
                                                min="1"
                                                value={proposed.quantity || ''}
                                                onChange={(e) => {
                                                  if (proposedIdx >= 0) updateProposedLineQuantity(proposedIdx, parseInt(e.target.value) || 0);
                                                }}
                                                onBlur={(e) => {
                                                  const val = parseInt(e.target.value);
                                                  if (proposedIdx >= 0 && (!val || val < 1)) updateProposedLineQuantity(proposedIdx, 1);
                                                }}
                                                className="w-14 px-1 py-0.5 text-sm text-center border border-blue-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 font-semibold"
                                              />
                                            </td>
                                            <td className="py-1.5">
                                              <button
                                                onClick={() => {
                                                  // Revert to original values
                                                  setProposedLines(prev => prev.map(p =>
                                                    p.originalLineId === origLine.id
                                                      ? { ...p, quantity: origLine.quantity, variantId: origLine.item_variant_id, variantCode: origLine.variant_code, itemName: origLine.product_name, sku: origLine.meta?.sku || '' }
                                                      : p
                                                  ));
                                                }}
                                                className="text-gray-400 hover:text-red-500"
                                                title="Revert change"
                                              >
                                                <X className="w-3.5 h-3.5" />
                                              </button>
                                            </td>
                                          </tr>
                                        )}

                                        {/* Red removal annotation */}
                                        {isRemoved && (
                                          <tr>
                                            <td colSpan={3} className="pb-1.5">
                                              <div className="ml-4 px-2 py-1 bg-red-50 border border-red-200 rounded text-xs text-red-600 inline-flex items-center gap-2">
                                                <span>&#8627; remove</span>
                                              </div>
                                            </td>
                                            <td className="pb-1.5">
                                              <button
                                                onClick={() => {
                                                  setProposedLines(prev => [...prev, {
                                                    originalLineId: origLine.id,
                                                    itemId: origLine.item_id || '',
                                                    itemName: origLine.product_name,
                                                    sku: origLine.meta?.sku || '',
                                                    variantId: origLine.item_variant_id,
                                                    variantCode: origLine.variant_code,
                                                    quantity: origLine.quantity,
                                                    isNew: false
                                                  }]);
                                                }}
                                                className="text-gray-400 hover:text-red-500"
                                                title="Undo removal"
                                              >
                                                <X className="w-3.5 h-3.5" />
                                              </button>
                                            </td>
                                          </tr>
                                        )}
                                      </React.Fragment>
                                    );
                                  })}

                                  {/* Separator before add rows */}
                                  {proposedLines.filter(l => l.isNew).length > 0 && (
                                    <tr>
                                      <td colSpan={4} className="py-1">
                                        <div className="border-t border-dashed border-gray-300"></div>
                                      </td>
                                    </tr>
                                  )}

                                  {/* Add rows (green) */}
                                  {proposedLines
                                    .map((line, idx) => ({ line, idx }))
                                    .filter(({ line }) => line.isNew)
                                    .map(({ line, idx }) => {
                                      const itemForLine = items.find(i => i.id === line.itemId);
                                      const variants = itemForLine?.item_variants || [];
                                      return (
                                        <tr key={`new-${idx}`} className="bg-green-50">
                                          <td className="py-1.5 pl-1">
                                            <div className="flex items-center gap-1">
                                              <span className="text-green-600 text-xs font-bold">+</span>
                                              <span className="text-sm text-green-700 font-medium">{line.itemName}</span>
                                            </div>
                                          </td>
                                          <td className="py-1.5 text-center">
                                            {variants.length > 0 ? (
                                              <select
                                                value={line.variantId || ''}
                                                onChange={(e) => updateProposedLineVariant(idx, e.target.value)}
                                                className="px-1 py-0.5 text-xs border border-green-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-green-500"
                                              >
                                                {variants.map(v => (
                                                  <option key={v.id} value={v.id}>{v.variant_code}</option>
                                                ))}
                                              </select>
                                            ) : (
                                              <span className="text-xs text-gray-400">{line.variantCode || '—'}</span>
                                            )}
                                          </td>
                                          <td className="py-1.5 text-center">
                                            <input
                                              type="number"
                                              min="1"
                                              value={line.quantity || ''}
                                              onChange={(e) => updateProposedLineQuantity(idx, parseInt(e.target.value) || 0)}
                                              onBlur={(e) => {
                                                const val = parseInt(e.target.value);
                                                if (!val || val < 1) updateProposedLineQuantity(idx, 1);
                                              }}
                                              className="w-14 px-1 py-0.5 text-sm text-center border border-green-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-green-500"
                                            />
                                          </td>
                                          <td className="py-1.5">
                                            <button onClick={() => removeProposedLine(idx)} className="text-gray-400 hover:text-red-500">
                                              <X className="w-3.5 h-3.5" />
                                            </button>
                                          </td>
                                        </tr>
                                      );
                                    })}

                                  {/* Add new item button + search */}
                                  <tr>
                                    <td colSpan={4} className="pt-2">
                                      <div className="relative">
                                        <input
                                          type="text"
                                          value={itemSearch}
                                          onChange={(e) => {
                                            setItemSearch(e.target.value);
                                            setShowItemDropdown(true);
                                          }}
                                          onFocus={() => setShowItemDropdown(true)}
                                          onBlur={() => setTimeout(() => setShowItemDropdown(false), 200)}
                                          placeholder="+ Add item..."
                                          className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-green-500 placeholder-green-600"
                                        />
                                        {showItemDropdown && filteredItems.length > 0 && (
                                          <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                                            {filteredItems.slice(0, 15).map((item) => {
                                              const variants = item.item_variants || [];
                                              return (
                                                <div key={item.id} className="border-b last:border-b-0">
                                                  {variants.length > 0 ? (
                                                    <div className="px-3 py-2">
                                                      <p className="font-medium text-sm text-gray-900">{item.name}</p>
                                                      <div className="flex flex-wrap gap-1 mt-1">
                                                        {variants.map(v => (
                                                          <button
                                                            key={v.id}
                                                            onClick={() => addItemToProposedLines(item, v)}
                                                            className="inline-flex items-center gap-0.5 px-2 py-0.5 text-xs font-medium bg-green-50 text-green-700 rounded hover:bg-green-100 transition-colors"
                                                          >
                                                            <Plus className="w-3 h-3" />
                                                            {v.variant_code}
                                                          </button>
                                                        ))}
                                                      </div>
                                                    </div>
                                                  ) : (
                                                    <button
                                                      onClick={() => addItemToProposedLines(item)}
                                                      className="w-full px-3 py-2 text-left hover:bg-gray-50"
                                                    >
                                                      <div className="flex justify-between items-center">
                                                        <p className="font-medium text-sm">{item.name}</p>
                                                        <Plus className="w-4 h-4 text-green-600" />
                                                      </div>
                                                    </button>
                                                  )}
                                                </div>
                                              );
                                            })}
                                          </div>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                </tbody>
                              </table>
                            </>
                          )}
                        </div>

                        {/* Change Summary */}
                        {originalLines.length > 0 && (
                          <div className="px-5 py-3 border-t border-gray-100">
                            <div className="flex flex-wrap gap-2 text-xs">
                              {(() => {
                                const removed = originalLines.filter(o => !proposedLines.some(p => p.originalLineId === o.id)).length;
                                const added = proposedLines.filter(p => p.isNew).length;
                                const modified = proposedLines.filter(p => {
                                  if (p.isNew) return false;
                                  const original = originalLines.find(o => o.id === p.originalLineId);
                                  return original && (original.quantity !== p.quantity || original.variant_code !== p.variantCode);
                                }).length;
                                return (
                                  <>
                                    {removed > 0 && <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded">{removed} removed</span>}
                                    {modified > 0 && <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded">{modified} modified</span>}
                                    {added > 0 && <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded">{added} added</span>}
                                    {removed === 0 && modified === 0 && added === 0 && <span className="text-gray-500">No changes yet — double-click an item to modify</span>}
                                  </>
                                );
                              })()}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                {/* Tags */}
                <div className="pt-4 border-t">
                  <h3 className="text-sm font-medium text-gray-700 mb-3">Tags</h3>
                  {TAG_PRESETS.map(preset => (
                    <div key={preset.key} className="mb-3">
                      <label className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-1.5 block">{preset.label}</label>
                      <div className="flex gap-2">
                        {preset.options.map(opt => {
                          const isActive = formTags[preset.key] === opt.value;
                          const colorMap: Record<string, { active: string; inactive: string }> = {
                            orange: { active: 'bg-orange-100 text-orange-800 border-orange-300', inactive: 'bg-white text-gray-600 border-gray-300 hover:border-orange-300 hover:text-orange-700' },
                            blue: { active: 'bg-blue-100 text-blue-800 border-blue-300', inactive: 'bg-white text-gray-600 border-gray-300 hover:border-blue-300 hover:text-blue-700' },
                            purple: { active: 'bg-purple-100 text-purple-800 border-purple-300', inactive: 'bg-white text-gray-600 border-gray-300 hover:border-purple-300 hover:text-purple-700' },
                          };
                          const colors = colorMap[opt.color] || colorMap.purple;
                          return (
                            <button
                              key={opt.value}
                              onClick={() => {
                                if (isActive) {
                                  const t = { ...formTags }; delete t[preset.key]; setFormTags(t);
                                } else {
                                  setFormTags({ ...formTags, [preset.key]: opt.value });
                                }
                              }}
                              title={opt.tooltip}
                              className={`px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors ${isActive ? colors.active : colors.inactive}`}
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  {/* Custom tags display */}
                  {Object.entries(formTags).filter(([key]) => !TAG_PRESETS.some(p => p.key === key)).length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {Object.entries(formTags).filter(([key]) => !TAG_PRESETS.some(p => p.key === key)).map(([key, value]) => (
                        <span key={key} className="inline-flex items-center gap-1 text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded-full border border-gray-200">
                          <span className="font-medium">{key}:</span> {value}
                          <button onClick={() => { const t = { ...formTags }; delete t[key]; setFormTags(t); }} className="ml-0.5 text-gray-400 hover:text-red-500">
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  {/* Custom tag input */}
                  {showCustomTagInput ? (
                    <div className="flex items-center gap-2 mt-2">
                      <input type="text" placeholder="key" value={formTagKey} onChange={(e) => setFormTagKey(e.target.value)} className="w-28 px-2 py-1 text-sm border border-gray-300 rounded" />
                      <input type="text" placeholder="value" value={formTagValue} onChange={(e) => setFormTagValue(e.target.value)} className="w-36 px-2 py-1 text-sm border border-gray-300 rounded" />
                      <button onClick={() => { if (formTagKey && formTagValue) { setFormTags({ ...formTags, [formTagKey]: formTagValue }); setFormTagKey(''); setFormTagValue(''); } }} className="px-3 py-1 text-sm bg-purple-600 text-white rounded hover:bg-purple-700">Add</button>
                      <button onClick={() => { setShowCustomTagInput(false); setFormTagKey(''); setFormTagValue(''); }} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
                    </div>
                  ) : (
                    <button onClick={() => setShowCustomTagInput(true)} className="mt-2 text-xs text-purple-500 hover:text-purple-700">+ Custom tag</button>
                  )}
                </div>

                {/* Submit Button */}
                <div className="flex justify-end pt-4 border-t">
                  <button
                    onClick={selectedOrderForChange ? createChangeProposal : createOrderProposal}
                    disabled={isCreatingOrder || (selectedOrderForChange ? false : (!selectedCustomer || orderLines.length === 0))}
                    className="flex items-center px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
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
                      {/* Tags - preset buttons */}
                      <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                        {TAG_PRESETS.map(preset => (
                          <div key={preset.key} className="flex items-center gap-1 mb-1">
                            {preset.options.map(opt => {
                              const isActive = (proposal.tags || {})[preset.key] === opt.value;
                              const colorMap: Record<string, { active: string; inactive: string }> = {
                                orange: { active: 'bg-orange-100 text-orange-800 border-orange-300', inactive: 'bg-white text-gray-500 border-gray-200 hover:border-orange-300' },
                                blue: { active: 'bg-blue-100 text-blue-800 border-blue-300', inactive: 'bg-white text-gray-500 border-gray-200 hover:border-blue-300' },
                                purple: { active: 'bg-purple-100 text-purple-800 border-purple-300', inactive: 'bg-white text-gray-500 border-gray-200 hover:border-purple-300' },
                              };
                              const colors = colorMap[opt.color] || colorMap.purple;
                              return (
                                <button
                                  key={opt.value}
                                  onClick={() => {
                                    if (isActive) { removeTagFromProposal(proposal.id, preset.key); }
                                    else { addTagToProposal(proposal.id, preset.key, opt.value); }
                                  }}
                                  title={opt.tooltip}
                                  className={`px-2 py-0.5 text-xs font-medium rounded border transition-colors ${isActive ? colors.active : colors.inactive}`}
                                >
                                  {opt.label}
                                </button>
                              );
                            })}
                          </div>
                        ))}
                        {/* Non-preset custom tags */}
                        {proposal.tags && Object.entries(proposal.tags).filter(([key]) => !TAG_PRESETS.some(p => p.key === key)).map(([key, value]) => (
                          <span key={key} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-gray-100 text-gray-700 rounded-full border border-gray-200 mr-1">
                            <span className="font-medium">{key}:</span> {value}
                            <button onClick={() => removeTagFromProposal(proposal.id, key)} className="ml-0.5 text-gray-400 hover:text-red-500"><X className="w-3 h-3" /></button>
                          </span>
                        ))}
                      </div>
                      <p className="text-xs text-gray-400 mt-1 font-mono">{proposal.id.slice(0, 8)}...</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Catalog Section - Only shown when org is selected */}
        {selectedOrg && (
          <div className="bg-white rounded-lg shadow-md p-6 mt-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center">
                <Package className="w-5 h-5 mr-2 text-purple-600" />
                Catalog ({items.length} items)
              </h2>
            </div>

            {/* Search */}
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search items..."
                value={catalogSearch}
                onChange={(e) => setCatalogSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
              />
            </div>

            {loadingCatalog ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-purple-600" />
              </div>
            ) : items.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No items in catalog</p>
            ) : (
              <div className="space-y-1 max-h-96 overflow-y-auto">
                {items
                  .filter(item =>
                    catalogSearch === '' ||
                    item.name.toLowerCase().includes(catalogSearch.toLowerCase()) ||
                    item.sku.toLowerCase().includes(catalogSearch.toLowerCase())
                  )
                  .map((item) => {
                    const isExpanded = expandedCatalogItems.has(item.id);
                    const hasVariants = item.item_variants && item.item_variants.length > 0;

                    return (
                      <div key={item.id} className="border border-gray-200 rounded-lg overflow-hidden">
                        <button
                          onClick={() => {
                            if (hasVariants) {
                              const newExpanded = new Set(expandedCatalogItems);
                              if (isExpanded) {
                                newExpanded.delete(item.id);
                              } else {
                                newExpanded.add(item.id);
                              }
                              setExpandedCatalogItems(newExpanded);
                            }
                          }}
                          className={`w-full px-3 py-2 text-left flex items-center justify-between hover:bg-gray-50 ${hasVariants ? 'cursor-pointer' : 'cursor-default'}`}
                        >
                          <div className="flex items-center space-x-3">
                            {hasVariants ? (
                              isExpanded ? (
                                <ChevronDown className="w-4 h-4 text-gray-400" />
                              ) : (
                                <ChevronRight className="w-4 h-4 text-gray-400" />
                              )
                            ) : (
                              <div className="w-4 h-4" />
                            )}
                            <div>
                              <p className="font-medium text-sm text-gray-900">{item.name}</p>
                              <p className="text-xs text-gray-500 font-mono">{item.sku}</p>
                            </div>
                          </div>
                          {hasVariants && (
                            <span className="text-xs text-gray-400">
                              {item.item_variants.length} variant{item.item_variants.length !== 1 ? 's' : ''}
                            </span>
                          )}
                        </button>

                        {/* Variants (expanded) */}
                        {isExpanded && hasVariants && (
                          <div className="border-t border-gray-100 bg-gray-50">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="text-xs text-gray-500 border-b border-gray-200">
                                  <th className="text-left px-4 py-2 pl-10">Variant</th>
                                  <th className="text-left px-4 py-2">Code</th>
                                  <th className="text-left px-4 py-2">SKU</th>
                                </tr>
                              </thead>
                              <tbody>
                                {item.item_variants.map((variant) => (
                                  <tr key={variant.id} className="border-b border-gray-100 last:border-b-0">
                                    <td className="px-4 py-2 pl-10 text-gray-700">{variant.variant_name}</td>
                                    <td className="px-4 py-2">
                                      <span className="inline-block px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs font-medium">
                                        {variant.variant_code}
                                      </span>
                                    </td>
                                    <td className="px-4 py-2 text-gray-500 font-mono text-xs">{item.sku}-{variant.variant_code}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            )}
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
          catalogItems={items}
          catalogCustomers={customers}
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
