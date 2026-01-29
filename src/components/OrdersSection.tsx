import { AlertCircle, Calendar, CheckCircle, Clock, Columns, Copy, Download, CreditCard as Edit, Eye, ExternalLink, File as FileIcon, FileText, Filter, HelpCircle, Image as ImageIcon, LayoutGrid, Loader2, Mail, MapPin, MessageSquare, Minus, Network, Package, Paperclip, Phone, Plus, RefreshCw, Save, Search, Send, User, X } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { supabaseClient } from '../supabaseClient';
import NeedsReviewSection from './NeedsReviewSection';

interface OrderItem {
  name: string;
  quantity: number;
  price?: number;
  description?: string;
}

interface Customer {
  id: string;
  number: string;
  displayName: string;
  email: string;
}

interface Attachment {
  filename: string;
  mimeType: string;
  size: number;
  attachmentId: string;
  content?: string;
  hasContent: boolean;
  extractedTextLength: number;
  hasExtractedText?: boolean;
  extractedText?: string;
  storageUrl?: string;
}

interface Item {
  id: string;
  number: string;
  displayName: string;
  unitPrice: number;
  description?: string;
}

interface AnalyzedItem {
  itemName: string;
  quantity: number;
  matchedItem?: {
    id: string;
    number: string;
    displayName: string;
    unitPrice: number;
  };
}

interface AnalysisData {
  customers: Customer[];
  items: Item[];
  matchingCustomer: Customer;
  analyzedItems: AnalyzedItem[];
  requestedDeliveryDate?: string;
  proposedChanges?: {
    analyzedItems: AnalyzedItem[];
    requestedDeliveryDate?: string;
  };
  updateEmailDetails?: {
    from: string;
    subject: string;
    receivedAt: string;
    emailContent: string;
  };
  rejectedEmailHistory?: Array<{
    from: string;
    subject: string;
    receivedAt: string;
    emailContent: string;
    rejectedAt: string;
  }>;
  appliedEmailHistory?: Array<{
    from: string;
    subject: string;
    receivedAt: string;
    emailContent: string;
    appliedAt: string;
  }>;
}

interface Order {
  id: string;
  order_number: string;
  customer_name: string;
  customer_email: string;
  customer_phone?: string;
  customer_address?: string;
  items: OrderItem[];
  total_amount?: number;
  status: 'received' | 'processing' | 'analyzed' | 'exported' | 'failed' | 'pending' | 'completed' | 'cancelled' | 'needs_review';
  source: 'email' | 'text' | 'manual' | 'edi' | 'erp';
  original_content: string;
  trading_partner?: string;
  requested_delivery_date?: string;
  created_at: string;
  processed_at?: string;
  erp_order_id?: string;
  erp_order_number?: string;
  analysis_data?: AnalysisData;
  phone_number?: string;
  message_content?: string;
  attachments?: Attachment[];
  from_email?: string;
  subject?: string;
  created_by?: {
    id: string;
    name: string;
    email: string;
    profile_picture?: string;
  };
}

type ViewMode = 'current' | 'diff-side-by-side' | 'diff-unified';

interface OrdersSectionProps {
  organizationId: string | null;
}

// ============================================================================
// HARDCODED DEMO ORDERS - For gaotioncapital@gmail.com demonstration
// Timestamps are recent (minutes ago) to appear freshly uploaded
// ============================================================================
const DEMO_ORDERS: Order[] = [
  // EDI Order - Publix (FIRST - most recent, 2 minutes ago)
  {
    id: 'demo-edi-001',
    order_number: 'G120419-01',
    customer_name: 'Publix Super Markets, Inc.',
    customer_email: 'orders@publix.com',
    items: [
      { name: 'ORG GW Romaine Hearts 12oz', quantity: 56, description: '56 cases' },
      { name: 'Swiss Chard Red', quantity: 42, description: '42 cases' },
      { name: 'Organic Parsley Italian', quantity: 70, description: '70 bunches' },
      { name: 'Organic Kale Lacinato', quantity: 49, description: '49 bunches' },
      { name: 'Organic Kale Green', quantity: 28, description: '28 bunches' },
      { name: 'Organic Green Onions', quantity: 40, description: '40 bunches' },
      { name: 'Organic Dandelion Greens', quantity: 35, description: '35 bunches' },
      { name: 'Romaine', quantity: 49, description: '49 heads' },
      { name: 'Escarole', quantity: 35, description: '35 heads' },
      { name: 'Organic Cilantro', quantity: 120, description: '120 bunches' },
      { name: 'Radishes Bunched', quantity: 40, description: '40 bunches' },
      { name: 'Organic Chard Rainbow', quantity: 35, description: '35 bunches' },
      { name: 'Organic Beets Red', quantity: 49, description: '49 bunches' },
      { name: 'Lettuce Green Leaf', quantity: 98, description: '98 heads' },
    ],
    total_amount: 0,
    status: 'pending',
    source: 'edi',
    original_content: 'EDI 850 Purchase Order\nPO#: G120419-01\nShip Date: 10/30/2025\nArrival Date: 10/31/2025',
    trading_partner: 'Publix Super Markets',
    requested_delivery_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    created_at: new Date(Date.now() - 2 * 60 * 1000).toISOString(), // 2 minutes ago
    created_by: {
      id: 'demo-user-3',
      name: 'James Wilson',
      email: 'james@frootful.ai',
      profile_picture: 'https://ui-avatars.com/api/?name=James+Wilson&background=F59E0B&color=fff'
    },
    attachments: [
      {
        filename: 'Publix-Order-G120419-01.pdf',
        mimeType: 'application/pdf',
        size: 635283,
        attachmentId: 'demo-attach-edi',
        hasContent: true,
        extractedTextLength: 0,
        storageUrl: '/sample-order.pdf'
      }
    ],
    analysis_data: {
      customers: [],
      items: [],
      matchingCustomer: {
        id: 'demo-cust-3',
        number: 'PUBLIX-001',
        displayName: 'Publix Super Markets, Inc.',
        email: 'orders@publix.com'
      },
      analyzedItems: [
        { itemName: 'ORG GW Romaine Hearts 12oz', quantity: 56 },
        { itemName: 'Swiss Chard Red', quantity: 42 },
        { itemName: 'Organic Parsley Italian', quantity: 70 },
        { itemName: 'Organic Kale Lacinato', quantity: 49 },
        { itemName: 'Organic Kale Green', quantity: 28 },
        { itemName: 'Organic Green Onions', quantity: 40 },
        { itemName: 'Organic Dandelion Greens', quantity: 35 },
        { itemName: 'Romaine', quantity: 49 },
        { itemName: 'Escarole', quantity: 35 },
        { itemName: 'Organic Cilantro', quantity: 120 },
        { itemName: 'Radishes Bunched', quantity: 40 },
        { itemName: 'Organic Chard Rainbow', quantity: 35 },
        { itemName: 'Organic Beets Red', quantity: 49 },
        { itemName: 'Lettuce Green Leaf', quantity: 98 },
      ],
      requestedDeliveryDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    }
  },
  // Needs Review Order - Customer sent update email (3 minutes ago)
  {
    id: 'demo-review-001',
    order_number: 'ORD-2025-0847',
    customer_name: 'Whole Foods Market',
    customer_email: 'produce@wholefoods.com',
    items: [
      { name: 'Organic Baby Spinach', quantity: 50, description: '50 cases' },
      { name: 'Organic Spring Mix', quantity: 30, description: '30 cases' },
      { name: 'Organic Baby Kale', quantity: 25, description: '25 cases' },
    ],
    total_amount: 0,
    status: 'needs_review',
    source: 'email',
    original_content: 'Hi, please send our regular weekly order:\n- 50 cases Organic Baby Spinach\n- 30 cases Organic Spring Mix\n- 25 cases Organic Baby Kale\n\nThanks,\nWhole Foods Produce Team',
    requested_delivery_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    created_at: new Date(Date.now() - 3 * 60 * 1000).toISOString(), // 3 minutes ago
    from_email: 'produce@wholefoods.com',
    subject: 'Weekly Produce Order',
    created_by: {
      id: 'demo-user-4',
      name: 'Sarah Chen',
      email: 'sarah@frootful.ai',
      profile_picture: 'https://ui-avatars.com/api/?name=Sarah+Chen&background=EC4899&color=fff'
    },
    attachments: [],
    analysis_data: {
      customers: [],
      items: [],
      matchingCustomer: {
        id: 'demo-cust-wf',
        number: 'WF-001',
        displayName: 'Whole Foods Market',
        email: 'produce@wholefoods.com'
      },
      analyzedItems: [
        { itemName: 'Organic Baby Spinach', quantity: 50 },
        { itemName: 'Organic Spring Mix', quantity: 30 },
        { itemName: 'Organic Baby Kale', quantity: 25 },
      ],
      requestedDeliveryDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      updateEmailDetails: {
        from: 'produce@wholefoods.com',
        subject: 'RE: Weekly Produce Order - UPDATED',
        receivedAt: new Date(Date.now() - 1 * 60 * 1000).toISOString(),
        emailContent: 'Hi, quick update - please change the order to:\n- 75 cases Organic Baby Spinach (was 50)\n- 30 cases Organic Spring Mix (no change)\n- 40 cases Organic Baby Kale (was 25)\n- ADD 20 cases Organic Arugula\n\nSorry for the late change!\nWhole Foods Produce Team'
      }
    }
  },
  // Email Order - Floral order from Carmen (5 minutes ago)
  {
    id: 'demo-email-001',
    order_number: 'EMAIL-FLORAL-001',
    customer_name: 'Carmen Ines Llaury Noblecilla',
    customer_email: 'carmen.ll@hotmail.com',
    items: [
      { name: 'Blue Delphinium', quantity: 6, description: '6 bunches' },
      { name: 'Italian Ruscus', quantity: 4, description: '4 bunches' },
      { name: '17200 Square Vases', quantity: 2, description: '2 cases' },
      { name: 'Consumer Bags', quantity: 2, description: '2 cases' },
      { name: 'Bones Plant Food Little Packs', quantity: 2, description: '2 boxes' },
    ],
    total_amount: 0,
    status: 'pending',
    source: 'email',
    original_content: 'Hi Cindy please can you send me for tomorrow\n6 bunches of blue delphinium 4 bunches Italian ruscus also 2 cases 17200 square vases 2 cases consumer bags and also 2 bones plant food little packs   Thanks Ines',
    requested_delivery_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    created_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // 5 minutes ago
    from_email: 'carmen.ll@hotmail.com',
    subject: 'Re:',
    created_by: {
      id: 'demo-user-1',
      name: 'Cindi Suplee',
      email: 'cindi@frootful.ai',
      profile_picture: 'https://ui-avatars.com/api/?name=Cindi+Suplee&background=53AD6D&color=fff'
    },
    attachments: [
      {
        filename: 'floral-email-order.png',
        mimeType: 'image/png',
        size: 84714,
        attachmentId: 'demo-attach-email',
        hasContent: true,
        extractedTextLength: 0,
        storageUrl: '/sample-email-order.png'
      }
    ],
    analysis_data: {
      customers: [],
      items: [],
      matchingCustomer: {
        id: 'demo-cust-1',
        number: 'CUST-001',
        displayName: 'Carmen Ines Llaury Noblecilla',
        email: 'carmen.ll@hotmail.com'
      },
      analyzedItems: [
        { itemName: 'Blue Delphinium', quantity: 6 },
        { itemName: 'Italian Ruscus', quantity: 4 },
        { itemName: '17200 Square Vases', quantity: 2 },
        { itemName: 'Consumer Bags', quantity: 2 },
        { itemName: 'Bones Plant Food Little Packs', quantity: 2 },
      ],
      requestedDeliveryDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    }
  },
  // SMS/Text Order - Flower order (8 minutes ago)
  {
    id: 'demo-sms-001',
    order_number: 'SMS-FLOWER-001',
    customer_name: 'SMS Flower Customer',
    customer_email: '',
    customer_phone: '+1-555-123-4567',
    items: [
      { name: 'Hydrangea', quantity: 1, description: '1 bunch' },
      { name: 'Alstro', quantity: 1, description: '1 bunch' },
      { name: 'Filler Mix', quantity: 1, description: '1 bunch' },
      { name: 'Rose', quantity: 1, description: '1 bunch' },
      { name: 'Orchid', quantity: 1, description: '1 bunch' },
    ],
    total_amount: 0,
    status: 'pending',
    source: 'text',
    original_content: 'Hey! I need for tomorrow:\n- Hydrangea\n- Alstro\n- Filler Mix\n- Rose\n- Orchid\nThanks!',
    requested_delivery_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    created_at: new Date(Date.now() - 8 * 60 * 1000).toISOString(), // 8 minutes ago
    phone_number: '+1-555-123-4567',
    message_content: 'Hey! I need for tomorrow:\n- Hydrangea\n- Alstro\n- Filler Mix\n- Rose\n- Orchid\nThanks!',
    created_by: {
      id: 'demo-user-2',
      name: 'Maria Santos',
      email: 'maria@frootful.ai',
      profile_picture: 'https://ui-avatars.com/api/?name=Maria+Santos&background=6366F1&color=fff'
    },
    attachments: [
      {
        filename: 'sms-flower-order.jpg',
        mimeType: 'image/jpeg',
        size: 187973,
        attachmentId: 'demo-attach-sms',
        hasContent: true,
        extractedTextLength: 0,
        storageUrl: '/sample-text-order.jpg'
      }
    ],
    analysis_data: {
      customers: [],
      items: [],
      matchingCustomer: {
        id: 'demo-cust-2',
        number: 'CUST-002',
        displayName: 'SMS Flower Customer',
        email: ''
      },
      analyzedItems: [
        { itemName: 'Hydrangea', quantity: 1 },
        { itemName: 'Alstro', quantity: 1 },
        { itemName: 'Filler Mix', quantity: 1 },
        { itemName: 'Rose', quantity: 1 },
        { itemName: 'Orchid', quantity: 1 },
      ],
      requestedDeliveryDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    }
  },
  // Handwritten Order - AC215 Asian Vegetables (12 minutes ago)
  {
    id: 'demo-handwritten-001',
    order_number: 'HANDWRITTEN-001',
    customer_name: 'AC215 Wholesale',
    customer_email: '',
    items: [
      { name: 'AA Choy, Mx #1', quantity: 30, description: '30 cases' },
      { name: 'Baby Bok Choy, Ca #1', quantity: 30, description: '30 cases' },
      { name: 'Big Green Onion 24B Mx', quantity: 1, description: '1 case' },
      { name: 'Chi. Celery-Green, Ca', quantity: 30, description: '30 cases' },
      { name: 'Garlic Stem #1 New', quantity: 22, description: '22 cases' },
      { name: 'Gai Lan Mx #1', quantity: 25, description: '25 cases' },
      { name: 'Gai Lan Ca #1', quantity: 4, description: '4 cases' },
      { name: 'Taiwan Spinach, Mx #1', quantity: 5, description: '5 cases' },
      { name: 'Taiwan Spinach, Ca', quantity: 10, description: '10 cases' },
      { name: 'Yam Leaf, Ca #1', quantity: 10, description: '10 cases' },
      { name: 'Thai Basil, #1 Mx', quantity: 1, description: '1 case' },
      { name: 'Dan Ca, #60', quantity: 1, description: '1 case' },
      { name: 'Neo Gai', quantity: 3, description: '3 cases' },
    ],
    total_amount: 0,
    status: 'pending',
    source: 'manual',
    original_content: 'Handwritten order sheet - Asian Vegetables 亞洲蔬菜\nVendor: AC215 Wholesale',
    requested_delivery_date: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
    created_at: new Date(Date.now() - 12 * 60 * 1000).toISOString(), // 12 minutes ago
    created_by: {
      id: 'demo-user-4',
      name: 'Lisa Chen',
      email: 'lisa@frootful.ai',
      profile_picture: 'https://ui-avatars.com/api/?name=Lisa+Chen&background=EC4899&color=fff'
    },
    attachments: [
      {
        filename: 'handwritten-order-ac215.jpg',
        mimeType: 'image/jpeg',
        size: 2750574,
        attachmentId: 'demo-attach-handwritten',
        hasContent: true,
        extractedTextLength: 0,
        storageUrl: '/sample-handwritten-order.jpg'
      }
    ],
    analysis_data: {
      customers: [],
      items: [],
      matchingCustomer: {
        id: 'demo-cust-4',
        number: 'AC215-001',
        displayName: 'AC215 Wholesale',
        email: ''
      },
      analyzedItems: [
        { itemName: 'AA Choy, Mx #1', quantity: 30 },
        { itemName: 'Baby Bok Choy, Ca #1', quantity: 30 },
        { itemName: 'Big Green Onion 24B Mx', quantity: 1 },
        { itemName: 'Chi. Celery-Green, Ca', quantity: 30 },
        { itemName: 'Garlic Stem #1 New', quantity: 22 },
        { itemName: 'Gai Lan Mx #1', quantity: 25 },
        { itemName: 'Gai Lan Ca #1', quantity: 4 },
        { itemName: 'Taiwan Spinach, Mx #1', quantity: 5 },
        { itemName: 'Taiwan Spinach, Ca', quantity: 10 },
        { itemName: 'Yam Leaf, Ca #1', quantity: 10 },
        { itemName: 'Thai Basil, #1 Mx', quantity: 1 },
        { itemName: 'Dan Ca, #60', quantity: 1 },
        { itemName: 'Neo Gai', quantity: 3 },
      ],
      requestedDeliveryDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    }
  },
];

const OrdersSection: React.FC<OrdersSectionProps> = ({ organizationId }) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [parentOrder, setParentOrder] = useState<Order | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('current');
  const [isEditing, setIsEditing] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);
  const [erpOrderCreated, setErpOrderCreated] = useState(false);
  const [createdERPOrderNumber, setCreatedERPOrderNumber] = useState<string | null>(null);

  // Catalog data loaded once at component level
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [catalogsLoaded, setCatalogsLoaded] = useState(false);

  // Autocomplete search states
  const [customerSearchTerm, setCustomerSearchTerm] = useState('');
  const [itemSearchTerm, setItemSearchTerm] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [showItemDropdown, setShowItemDropdown] = useState(false);
  const [editingCustomerInline, setEditingCustomerInline] = useState(false);

  // Attachment preview modal state
  const [expandedAttachment, setExpandedAttachment] = useState<Attachment | null>(null);

  // Function to clean and format content for better display
  const cleanAndFormatContent = (content: string): string => {
    if (!content) return '';
    
    // If it's HTML content (contains HTML tags)
    if (content.includes('<') && content.includes('>')) {
      return content
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
        .replace(/<br\s*\/?>/g, '\n')
        .replace(/<\/p><p[^>]*>/g, '\n\n')
        .replace(/<p[^>]*>/g, '')
        .replace(/<\/p>/g, '\n')
        // Remove div tags but keep content
        .replace(/<div[^>]*>/g, '')
        .replace(/<\/div>/g, '\n')
        // Clean up extra whitespace
        .replace(/\n\s*\n\s*\n/g, '\n\n')
        .replace(/^\s+|\s+$/g, '')
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
        .replace(/â€Š/g, ' ') // Thin space
        .replace(/â€¯/g, ' '); // Narrow no-break space
    }
    
    // For plain text content, just clean up encoding issues
    return content
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
      .replace(/â€Š/g, ' ') // Thin space
      .replace(/â€¯/g, ' ') // Narrow no-break space
      .trim();
  };
  useEffect(() => {
    loadOrders();
    loadCatalogs();
  }, [organizationId]);

  useEffect(() => {
    // Subscribe to realtime changes for orders
    if (!organizationId) return;

    const channel = supabaseClient
      .channel('orders-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `organization_id=eq.${organizationId}`
        },
        (payload: any) => {
          console.log('Orders changed:', payload);
          // Reload orders when any change happens
          loadOrders();
        }
      )
      .subscribe();

    return () => {
      supabaseClient.removeChannel(channel);
    };
  }, [organizationId]);

  useEffect(() => {
    // No need to load parent order - the order itself is updated in place
    setParentOrder(null);
  }, [selectedOrder]);

  const loadCatalogs = async () => {
    try {
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (!session) {
        console.error('No session found');
        return;
      }

      // Load customers
      const customersResponse = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-catalog-data?type=customers`,
        {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
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

      // Load items
      const itemsResponse = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-catalog-data?type=items`,
        {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
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

      setCatalogsLoaded(true);
    } catch (error) {
      console.error('Error loading catalogs:', error);
      setCatalogsLoaded(true); // Still mark as loaded to avoid blocking UI
    }
  };

  const loadOrders = async () => {
    try {
      setLoading(true);

      const { data: { session } } = await supabaseClient.auth.getSession();
      if (!session) {
        console.error('No session found');
        return;
      }

      // Check if supabaseClient has the from method
      if (!('from' in supabaseClient)) {
        console.error('Supabase client not properly initialized');
        setLoading(false);
        return;
      }

      // Security: Require organizationId to prevent showing all orders
      if (!organizationId) {
        console.warn('No organization ID - user may not be assigned to an organization');
        setOrders([]);
        setLoading(false);
        return;
      }

      // Load lightweight order summaries with item count
      const ordersQuery = supabaseClient
        .from('orders')
        .select(`
          id,
          customer_name,
          status,
          delivery_date,
          total_amount,
          currency,
          created_at,
          updated_at,
          source_channel,
          created_by_user_id,
          order_lines!inner(count)
        `)
        .eq('organization_id', organizationId)
        .eq('order_lines.status', 'active');

      const { data: ordersData, error: ordersError } = await ordersQuery
        .order('created_at', { ascending: false });

      if (ordersError) {
        console.error('Error loading orders:', ordersError);
        setLoading(false);
        return;
      }

      // Get unique user IDs for batch fetching creator information
      const uniqueUserIds = [...new Set(
        (ordersData || [])
          .map((order: any) => order.created_by_user_id)
          .filter((id: any) => id != null)
      )];

      // Fetch creator information for all unique user IDs
      const creatorInfoMap = new Map();
      if (uniqueUserIds.length > 0) {
        try {
          const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-users-info`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ userIds: uniqueUserIds })
          });

          if (response.ok) {
            const { users } = await response.json();
            Object.entries(users).forEach(([userId, userInfo]: [string, any]) => {
              creatorInfoMap.set(userId, userInfo);
            });
          } else {
            console.warn('Failed to fetch creator information:', await response.text());
          }
        } catch (error) {
          console.warn('Failed to fetch creator information:', error);
        }
      }

      // Transform to lightweight order summaries
      const transformedOrders: Order[] = (ordersData || []).map((order: any) => {
        // Extract item count from the count aggregation
        const itemCount = order.order_lines?.[0]?.count || 0;

        return {
          id: order.id,
          order_number: `ORD-${order.id.slice(0, 8)}`,
          customer_name: order.customer_name || 'Unknown Customer',
          customer_email: '', // Will be loaded on detail view
          items: Array(itemCount).fill({ name: '', quantity: 0, price: 0 }), // Placeholder items for count
          total_amount: order.total_amount || 0,
          status: order.status as any,
          source: order.source_channel === 'sms' ? 'text' : (order.source_channel || 'email'),
          original_content: '', // Will be loaded on detail view
          requested_delivery_date: order.delivery_date,
          created_at: order.created_at,
          processed_at: order.updated_at,
          from_email: '', // Will be loaded on detail view
          subject: '', // Will be loaded on detail view
          analysis_data: undefined, // Will be loaded on detail view
          created_by: order.created_by_user_id ? creatorInfoMap.get(order.created_by_user_id) : undefined
        };
      });

      // Inject demo orders for gaotioncapital@gmail.com
      const userEmail = session.user?.email?.toLowerCase();
      const isDemoUser = userEmail === 'gaotioncapital@gmail.com';

      if (isDemoUser) {
        // Prepend demo orders to show them at the top
        const allOrders = [...DEMO_ORDERS, ...transformedOrders];
        setOrders(allOrders);
      } else {
        // Orders are already sorted by created_at DESC from query
        setOrders(transformedOrders);
      }
    } catch (error) {
      console.error('Error loading orders:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadOrderDetails = async (orderId: string): Promise<Order | null> => {
    // Check if this is a demo order - return it directly without API call
    if (orderId.startsWith('demo-')) {
      const demoOrder = DEMO_ORDERS.find(o => o.id === orderId);
      if (demoOrder) {
        return demoOrder;
      }
    }

    try {
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (!session) {
        console.error('No session found');
        return null;
      }

      // Fetch full order details from edge function
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-order-details?orderId=${orderId}`,
        {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok) {
        console.error('Failed to load order details:', response.statusText);
        return null;
      }

      const result = await response.json();
      if (!result.success || !result.data) {
        console.error('Invalid response from order details endpoint');
        return null;
      }

      const orderData = result.data;

      // Transform to Order interface
      const detailedOrder: Order = {
        id: orderData.id,
        order_number: `ORD-${orderData.id.slice(0, 8)}`,
        customer_name: orderData.customer_name || 'Unknown Customer',
        customer_email: orderData.email_data?.from || '',
        items: (orderData.order_lines || []).map((line: any) => ({
          name: line.product_name,
          quantity: line.quantity,
          price: 0, // Price will be determined dynamically from items table
          description: line.meta?.raw_user_input || line.product_name
        })),
        total_amount: orderData.total_amount || 0,
        status: orderData.status as any,
        source: orderData.source_channel === 'sms' ? 'text' : (orderData.source_channel || 'email'),
        original_content: orderData.intake_event_content || orderData.email_data?.subject || '',
        requested_delivery_date: orderData.delivery_date,
        created_at: orderData.created_at,
        processed_at: orderData.updated_at,
        from_email: orderData.email_data?.from || '',
        subject: orderData.email_data?.subject || '',
        analysis_data: orderData.analysis_data ? {
          ...orderData.analysis_data,
          customers: customers,  // Use preloaded catalogs
          items: items,
          analyzedItems: (orderData.order_lines || []).map((line: any) => ({
            itemName: line.meta?.raw_user_input || line.product_name,
            quantity: line.quantity,
            matchedItem: line.meta?.ai_matched ? {
              id: line.meta?.item_id,
              number: line.meta?.sku,
              displayName: line.product_name,
              unitPrice: 0 // Price should be fetched from items table based on customer
            } : null
          }))
        } : undefined
      };

      return detailedOrder;
    } catch (error) {
      console.error('Error loading order details:', error);
      return null;
    }
  };

  const handleOrderClick = async (order: Order) => {
    // Load full details for this order
    const detailedOrder = await loadOrderDetails(order.id);
    if (detailedOrder) {
      setSelectedOrder(detailedOrder);
    } else {
      // Fallback to the summary data we already have
      setSelectedOrder(order);
    }
  };

  const handleEditOrder = (order: Order) => {
    setEditingOrder({ ...order });
    setIsEditing(true);
  };

  const handleSaveOrder = async () => {
    if (!editingOrder || !selectedOrder) return;

    try {
      setIsSaving(true);

      const { data: { session } } = await supabaseClient.auth.getSession();
      if (!session) {
        throw new Error('No session found');
      }

      // Check if supabaseClient has the from method
      if (!('from' in supabaseClient)) {
        throw new Error('Supabase client not properly initialized');
      }

      // Check if this is the first review (critical for AI training data)
      const { data: orderCheck } = await supabaseClient
        .from('orders')
        .select('user_reviewed_at')
        .eq('id', editingOrder.id)
        .single();

      const isFirstReview = !orderCheck?.user_reviewed_at;

      // Track changes for order_events and AI predictions
      const customerChanged = selectedOrder.customer_name !== editingOrder.customer_name;
      const deliveryDateChanged = selectedOrder.requested_delivery_date !== editingOrder.requested_delivery_date;

      const changes: any = {};

      if (customerChanged) {
        changes.customer = {
          from: selectedOrder.customer_name,
          to: editingOrder.customer_name
        };
      }

      if (deliveryDateChanged) {
        changes.delivery_date = {
          from: selectedOrder.requested_delivery_date,
          to: editingOrder.requested_delivery_date
        };
      }

      // Track detailed item changes for AI predictions
      const itemChanges: any[] = [];
      if (editingOrder.analysis_data && selectedOrder.analysis_data) {
        const originalItems = selectedOrder.analysis_data.analyzedItems || [];
        const updatedItems = editingOrder.analysis_data.analyzedItems || [];

        updatedItems.forEach((updatedItem: any, index: number) => {
          const originalItem = originalItems[index];
          if (!originalItem) return;

          const skuChanged = originalItem.matchedItem?.number !== updatedItem.matchedItem?.number;
          const qtyChanged = originalItem.quantity !== updatedItem.quantity;

          if (skuChanged || qtyChanged) {
            itemChanges.push({
              line_number: index + 1,
              original_sku: originalItem.matchedItem?.number,
              new_sku: updatedItem.matchedItem?.number,
              original_quantity: originalItem.quantity,
              new_quantity: updatedItem.quantity,
              sku_changed: skuChanged,
              quantity_changed: qtyChanged
            });
          }
        });

        if (itemChanges.length > 0) {
          changes.items = itemChanges;
        }
      }

      // Update the order in the database
      const updateData: any = {
        customer_name: editingOrder.customer_name,
        delivery_date: editingOrder.requested_delivery_date,
        updated_at: new Date().toISOString()
      };

      // Update customer_id if customer was changed
      if (customerChanged && editingOrder.analysis_data?.matchingCustomer) {
        updateData.customer_id = editingOrder.analysis_data.matchingCustomer.id;
      }

      // If this is the first review, record it
      if (isFirstReview) {
        updateData.user_reviewed_at = new Date().toISOString();
        updateData.reviewed_by = session.user.id;
      }

      const { error: orderError } = await supabaseClient
        .from('orders')
        .update(updateData)
        .eq('id', editingOrder.id);

      if (orderError) {
        throw new Error(`Failed to update order: ${orderError.message}`);
      }

      // Update order_lines if items were changed
      if (itemChanges.length > 0 && editingOrder.analysis_data?.analyzedItems) {
        // Get existing order lines
        const { data: existingLines } = await supabaseClient
          .from('order_lines')
          .select('id, line_number')
          .eq('order_id', editingOrder.id)
          .order('line_number');

        if (existingLines) {
          // Update each changed line
          for (const change of itemChanges) {
            const lineToUpdate = existingLines.find(l => l.line_number === change.line_number);
            if (!lineToUpdate) continue;

            const updatedItem = editingOrder.analysis_data.analyzedItems[change.line_number - 1];
            if (!updatedItem?.matchedItem) continue;

            const lineUpdateData: any = {
              item_id: updatedItem.matchedItem.id,
              product_name: updatedItem.matchedItem.displayName || updatedItem.matchedItem.description,
              quantity: updatedItem.quantity,
              updated_at: new Date().toISOString()
            };

            const { error: lineError } = await supabaseClient
              .from('order_lines')
              .update(lineUpdateData)
              .eq('id', lineToUpdate.id);

            if (lineError) {
              console.error(`Failed to update order line ${lineToUpdate.id}:`, lineError);
            }
          }
        }
      }

      // If this is the first review, update AI predictions for training data
      if (isFirstReview) {
        // Update customer prediction accuracy
        await supabaseClient
          .from('ai_predictions')
          .update({
            actual_customer_name: editingOrder.customer_name,
            customer_is_accurate: !customerChanged,
            error_type: customerChanged ? 'customer_wrong' : 'accurate',
            user_reviewed_at: new Date().toISOString(),
            reviewed_by: session.user.id
          })
          .eq('order_id', editingOrder.id)
          .eq('prediction_type', 'customer');

        // Get order lines to match predictions
        const { data: orderLines } = await supabaseClient
          .from('order_lines')
          .select('id')
          .eq('order_id', editingOrder.id)
          .order('line_number');

        if (orderLines) {
          if (itemChanges.length > 0) {
            // Update predictions for changed items
            for (const change of itemChanges) {
              const lineId = orderLines[change.line_number - 1]?.id;
              if (!lineId) continue;

              const errorType = change.sku_changed && change.quantity_changed ? 'both_wrong' :
                              change.sku_changed ? 'sku_wrong' :
                              change.quantity_changed ? 'quantity_wrong' : 'accurate';

              await supabaseClient
                .from('ai_predictions')
                .update({
                  actual_sku: change.new_sku,
                  actual_quantity: change.new_quantity,
                  sku_is_accurate: !change.sku_changed,
                  quantity_is_accurate: !change.quantity_changed,
                  error_type: errorType,
                  user_reviewed_at: new Date().toISOString(),
                  reviewed_by: session.user.id
                })
                .eq('order_line_id', lineId);
            }

            // Mark unchanged items as accurate
            const changedLineNumbers = itemChanges.map(c => c.line_number);
            for (let i = 0; i < orderLines.length; i++) {
              if (!changedLineNumbers.includes(i + 1)) {
                await supabaseClient
                  .from('ai_predictions')
                  .update({
                    sku_is_accurate: true,
                    quantity_is_accurate: true,
                    error_type: 'accurate',
                    user_reviewed_at: new Date().toISOString(),
                    reviewed_by: session.user.id
                  })
                  .eq('order_line_id', orderLines[i].id);
              }
            }
          } else {
            // No item changes - mark all as accurate
            for (const line of orderLines) {
              await supabaseClient
                .from('ai_predictions')
                .update({
                  sku_is_accurate: true,
                  quantity_is_accurate: true,
                  error_type: 'accurate',
                  user_reviewed_at: new Date().toISOString(),
                  reviewed_by: session.user.id
                })
                .eq('order_line_id', line.id);
            }
          }
        }

        // Create user_reviewed order_event with accuracy metrics
        const { data: accuracyMetrics } = await supabaseClient
          .rpc('calculate_order_accuracy_metrics', { p_order_id: editingOrder.id });

        await supabaseClient
          .from('order_events')
          .insert({
            order_id: editingOrder.id,
            type: 'user_reviewed',
            metadata: {
              is_first_review: true,
              changed_by: session.user.email,
              changes: changes,
              accuracy_metrics: accuracyMetrics
            }
          });

        console.log('✅ First review complete - AI predictions updated for training');
      } else if (Object.keys(changes).length > 0) {
        // Subsequent edits - just track as user_edit
        await supabaseClient
          .from('order_events')
          .insert({
            order_id: editingOrder.id,
            type: 'user_edit',
            metadata: {
              changed_by: session.user.email,
              changes: changes,
              edit_timestamp: new Date().toISOString()
            }
          });
      }

      // Update local state
      setOrders(prev => prev.map(order =>
        order.id === editingOrder.id ? editingOrder : order
      ));

      setSelectedOrder(editingOrder);
      setIsEditing(false);
      setEditingOrder(null);

    } catch (error) {
      console.error('Error saving order:', error);
      alert(`Failed to save order: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditingOrder(null);
  };

  const handleCustomerChange = (customerNumber: string) => {
    if (!editingOrder) return;

    const selectedCustomer = customers.find(c => c.number === customerNumber);
    if (!selectedCustomer) return;

    // Initialize analysis_data if it doesn't exist
    const analysisData = editingOrder.analysis_data || {
      customers: customers,
      items: items,
      analyzedItems: [],
      matchingCustomer: selectedCustomer
    };

    setEditingOrder({
      ...editingOrder,
      analysis_data: {
        ...analysisData,
        matchingCustomer: selectedCustomer
      },
      customer_name: selectedCustomer.displayName || 'Unknown Customer',
      customer_email: selectedCustomer?.email || ''
    });
  };

  const handleCustomerChangeInline = async (customerNumber: string) => {
    if (!selectedOrder) return;

    const selectedCustomer = customers.find(c => c.number === customerNumber);
    if (!selectedCustomer) return;

    try {
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (!session) {
        throw new Error('No session found');
      }

      // Update the order in the database
      const { error: orderError } = await supabaseClient
        .from('orders')
        .update({
          customer_id: selectedCustomer.id,
          customer_name: selectedCustomer.displayName || 'Unknown Customer',
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedOrder.id);

      if (orderError) {
        throw new Error(`Failed to update customer: ${orderError.message}`);
      }

      // Update local state
      const updatedOrder = {
        ...selectedOrder,
        customer_name: selectedCustomer.displayName || 'Unknown Customer',
        customer_email: selectedCustomer?.email || '',
        analysis_data: {
          ...selectedOrder.analysis_data,
          customers: customers,
          items: items,
          matchingCustomer: selectedCustomer
        }
      };

      setSelectedOrder(updatedOrder);
      setOrders(prev => prev.map(order =>
        order.id === selectedOrder.id ? { ...order, customer_name: selectedCustomer.displayName || 'Unknown Customer' } : order
      ));

      console.log('✅ Customer updated successfully');
    } catch (error) {
      console.error('Error updating customer:', error);
      alert(`Failed to update customer: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleDeliveryDateChange = (date: string) => {
    if (!editingOrder?.analysis_data) return;

    setEditingOrder({
      ...editingOrder,
      analysis_data: {
        ...editingOrder.analysis_data,
        requestedDeliveryDate: date
      },
      requested_delivery_date: date
    });
  };

  const handleItemChange = (index: number, itemNumber: string) => {
    if (!editingOrder?.analysis_data) return;

    const selectedItem = items.find(item => item.number === itemNumber);
    const updatedAnalyzedItems = [...editingOrder.analysis_data.analyzedItems];

    if (updatedAnalyzedItems[index]) {
      updatedAnalyzedItems[index] = {
        ...updatedAnalyzedItems[index],
        matchedItem: selectedItem
      };
    }

    const updatedItems = updatedAnalyzedItems.map(item => ({
      name: item.matchedItem?.displayName || item.itemName,
      quantity: item.quantity,
      price: item.matchedItem?.unitPrice,
      description: item.matchedItem?.number
    }));

    const totalAmount = updatedAnalyzedItems.reduce((sum, item) =>
      sum + (item.quantity * (item.matchedItem?.unitPrice || 0)), 0);

    setEditingOrder({
      ...editingOrder,
      analysis_data: {
        ...editingOrder.analysis_data,
        analyzedItems: updatedAnalyzedItems
      },
      items: updatedItems,
      total_amount: totalAmount
    });
  };

  const handleQuantityChange = (index: number, quantity: number) => {
    if (!editingOrder?.analysis_data) return;

    const updatedAnalyzedItems = [...editingOrder.analysis_data.analyzedItems];
    
    if (updatedAnalyzedItems[index]) {
      updatedAnalyzedItems[index] = {
        ...updatedAnalyzedItems[index],
        quantity: quantity
      };
    }

    const updatedItems = updatedAnalyzedItems.map(item => ({
      name: item.matchedItem?.displayName || item.itemName,
      quantity: item.quantity,
      price: item.matchedItem?.unitPrice,
      description: item.matchedItem?.number
    }));

    const totalAmount = updatedAnalyzedItems.reduce((sum, item) => 
      sum + (item.quantity * (item.matchedItem?.unitPrice || 0)), 0);

    setEditingOrder({
      ...editingOrder,
      analysis_data: {
        ...editingOrder.analysis_data,
        analyzedItems: updatedAnalyzedItems
      },
      items: updatedItems,
      total_amount: totalAmount
    });
  };

  const createERPOrder = async (order: Order) => {
    setIsCreatingOrder(true);

    // Simulate a brief loading state for demo purposes
    await new Promise(resolve => setTimeout(resolve, 1000));

    console.log('✅ ERP order created successfully (demo mode)');

    // Generate a fake ERP order number for display
    const fakeOrderNumber = `ERP-${Date.now().toString().slice(-6)}`;
    setCreatedERPOrderNumber(fakeOrderNumber);

    // Set success state
    setErpOrderCreated(true);
    setIsCreatingOrder(false);

    // Update the selected order's status immediately in the UI
    if (selectedOrder && selectedOrder.id === order.id) {
      setSelectedOrder({
        ...selectedOrder,
        status: 'pushed_to_erp'
      });
    }
  };

  // Load parent order for change detection
  // TODO: Implement parent order tracking in new schema
  const loadParentOrder = async (_parentOrderId: string) => {
    console.log('Parent order tracking not yet implemented in new schema');
    return;
  };

  // Demo diff generator - compares current items with proposed changes
  const getDemoDiffForOrder = (order: Order) => {
    // Get original items and proposed changes from the order
    const originalItems = order.analysis_data?.analyzedItems || [];
    const proposedItems = order.analysis_data?.proposedChanges?.analyzedItems || [];

    if (!proposedItems || proposedItems.length === 0) {
      return null;
    }

    // For Legal Seafood, we know the pattern - use hardcoded diff
    if (order.customer_name === 'Legal Seafood') {
      // Find items by partial name match
      const davenportItem = originalItems.find((i: any) => i.itemName.toLowerCase().includes('davenport'));
      const saltBayOriginal = originalItems.find((i: any) => i.itemName.toLowerCase().includes('salt bay'));
      const saltBayProposed = proposedItems.find((i: any) => i.itemName.toLowerCase().includes('salt bay'));
      const collardItem = proposedItems.find((i: any) => i.itemName.toLowerCase().includes('collard'));

      return {
        items: {
          removed: davenportItem ? [
            { name: davenportItem.itemName, quantity: davenportItem.quantity, sku: davenportItem.matchedItem?.number }
          ] : [],
          modified: (saltBayOriginal && saltBayProposed && saltBayOriginal.quantity !== saltBayProposed.quantity) ? [
            {
              before: { name: saltBayOriginal.itemName, quantity: saltBayOriginal.quantity, sku: saltBayOriginal.matchedItem?.number },
              after: { name: saltBayProposed.itemName, quantity: saltBayProposed.quantity, sku: saltBayProposed.matchedItem?.number },
              quantityChange: saltBayProposed.quantity - saltBayOriginal.quantity
            }
          ] : [],
          added: collardItem ? [
            { name: collardItem.itemName, quantity: collardItem.quantity, sku: collardItem.matchedItem?.number }
          ] : []
        },
        customer: { changed: false },
        deliveryDate: { changed: false }
      };
    }

    return null;
  };

  // Apply diff to order
  const applyDiffToOrder = (originalData: any, diff: any) => {
    // Deep clone to avoid mutating the original
    let items = (originalData.analyzedItems || []).map((item: any) => ({
      ...item,
      matchedItem: item.matchedItem ? { ...item.matchedItem } : null
    }));

    // Remove items (by matching name or partial name)
    diff.items.removed?.forEach((removed: any) => {
      const idx = items.findIndex((i: any) =>
        i.itemName.toLowerCase().includes(removed.name.toLowerCase()) ||
        removed.name.toLowerCase().includes(i.itemName.toLowerCase())
      );
      if (idx !== -1) {
        console.log('Removing item:', items[idx].itemName);
        items.splice(idx, 1);
      }
    });

    // Modify items (by matching name or partial name)
    diff.items.modified?.forEach((mod: any) => {
      const item = items.find((i: any) =>
        i.itemName.toLowerCase().includes(mod.before.name.toLowerCase()) ||
        mod.before.name.toLowerCase().includes(i.itemName.toLowerCase())
      );
      if (item) {
        console.log('Modifying item:', item.itemName, 'from', item.quantity, 'to', mod.after.quantity);
        item.quantity = mod.after.quantity;
      }
    });

    // Add items (keep existing matched item if present)
    diff.items.added?.forEach((added: any) => {
      // Check if item already exists (AI might have already added it)
      const existingItem = items.find((i: any) =>
        i.itemName.toLowerCase().includes(added.name.toLowerCase())
      );

      if (!existingItem) {
        console.log('Adding new item:', added.name);
        items.push({
          itemName: added.name,
          quantity: added.quantity,
          matchedItem: added.sku ? {
            id: added.sku,
            number: added.sku,
            displayName: added.name,
            unitPrice: 0
          } : null
        });
      } else {
        console.log('Item already exists, keeping AI-matched version:', existingItem.itemName);
      }
    });

    return {
      ...originalData,
      analyzedItems: items,
      lastModified: new Date().toISOString()
    };
  };

  // Create a pending version order from proposed changes for diff rendering
  const createPendingVersion = (order: Order): Order | null => {
    if (!order.analysis_data?.proposedChanges?.analyzedItems) return null;

    const diff = getDemoDiffForOrder(order);
    if (!diff) return null;

    // Apply the diff to create the new order state
    const updatedData = applyDiffToOrder(order.analysis_data, diff);

    // Convert analyzedItems to items format
    const pendingItems: OrderItem[] = updatedData.analyzedItems.map((item: AnalyzedItem) => ({
      name: item.itemName,
      quantity: item.quantity,
      price: item.matchedItem?.unitPrice || 0,
      description: item.matchedItem?.number
    }));

    return {
      ...order,
      items: pendingItems,
      analysis_data: updatedData
    };
  };

  // Render side-by-side diff line
  const renderDiffLine = (label: string, before: string, after: string, changed: boolean) => {
    return (
      <div className="grid grid-cols-2 border-b border-gray-200">
        <div className={`p-3 ${changed ? 'bg-red-50' : 'bg-gray-50'} border-r border-gray-200`}>
          <div className="text-xs text-gray-500 mb-1 font-medium">{label}</div>
          <div className={`text-sm ${changed ? 'text-red-900' : 'text-gray-700'} flex items-start`}>
            {changed && <Minus className="w-4 h-4 mr-1 flex-shrink-0 text-red-600 mt-0.5" />}
            <span className={changed ? 'line-through' : ''}>{before || '-'}</span>
          </div>
        </div>
        <div className={`p-3 ${changed ? 'bg-green-50' : 'bg-gray-50'}`}>
          <div className="text-xs text-gray-500 mb-1 font-medium">{label}</div>
          <div className={`text-sm ${changed ? 'text-green-900' : 'text-gray-700'} flex items-start`}>
            {changed && <Plus className="w-4 h-4 mr-1 flex-shrink-0 text-green-600 mt-0.5" />}
            <span>{after || '-'}</span>
          </div>
        </div>
      </div>
    );
  };

  // Render items diff for side-by-side view
  const renderItemsDiff = (beforeItems: OrderItem[], afterItems: OrderItem[]) => {
    const beforeMap = new Map(beforeItems.map(item => [item.name, item]));
    const afterMap = new Map(afterItems.map(item => [item.name, item]));
    const allItemNames = new Set([...beforeMap.keys(), ...afterMap.keys()]);

    return (
      <div className="border-b border-gray-200">
        <div className="grid grid-cols-2 bg-gray-100 border-b border-gray-200">
          <div className="p-3 border-r border-gray-200">
            <div className="text-xs font-semibold text-gray-600">CURRENT - Items ({beforeItems.length})</div>
          </div>
          <div className="p-3">
            <div className="text-xs font-semibold text-gray-600">PROPOSED - Items ({afterItems.length})</div>
          </div>
        </div>

        {Array.from(allItemNames).map((itemName, idx) => {
          const beforeItem = beforeMap.get(itemName);
          const afterItem = afterMap.get(itemName);
          const isRemoved = beforeItem && !afterItem;
          const isAdded = !beforeItem && afterItem;
          const isModified = beforeItem && afterItem && beforeItem.quantity !== afterItem.quantity;

          return (
            <div key={idx} className="grid grid-cols-2 border-b border-gray-200 last:border-b-0">
              <div className={`p-3 border-r border-gray-200 ${
                isRemoved ? 'bg-red-50' : isModified ? 'bg-yellow-50' : 'bg-white'
              }`}>
                {beforeItem && (
                  <div className="flex items-center justify-between">
                    <div className="flex items-start flex-1">
                      {isRemoved && <Minus className="w-4 h-4 mr-2 flex-shrink-0 text-red-600 mt-0.5" />}
                      <div className="flex-1">
                        <div className={`text-sm ${isRemoved ? 'text-red-900 line-through' : 'text-gray-900'}`}>
                          {beforeItem.name}
                        </div>
                        {beforeItem.description && (
                          <div className="text-xs text-gray-500 mt-0.5">SKU: {beforeItem.description}</div>
                        )}
                      </div>
                    </div>
                    <div className={`text-lg font-semibold ml-3 ${isRemoved ? 'text-red-700' : isModified ? 'text-yellow-700' : 'text-gray-700'}`}>
                      {beforeItem.quantity}
                    </div>
                  </div>
                )}
              </div>

              <div className={`p-3 ${
                isAdded ? 'bg-green-50' : isModified ? 'bg-yellow-50' : 'bg-white'
              }`}>
                {afterItem && (
                  <div className="flex items-center justify-between">
                    <div className="flex items-start flex-1">
                      {isAdded && <Plus className="w-4 h-4 mr-2 flex-shrink-0 text-green-600 mt-0.5" />}
                      {isModified && <AlertCircle className="w-4 h-4 mr-2 flex-shrink-0 text-yellow-600 mt-0.5" />}
                      <div className="flex-1">
                        <div className={`text-sm ${isAdded ? 'text-green-900 font-medium' : 'text-gray-900'}`}>
                          {afterItem.name}
                        </div>
                        {afterItem.description && (
                          <div className="text-xs text-gray-500 mt-0.5">SKU: {afterItem.description}</div>
                        )}
                      </div>
                    </div>
                    <div className={`text-lg font-semibold ml-3 ${isAdded ? 'text-green-700' : isModified ? 'text-yellow-700' : 'text-gray-700'}`}>
                      {afterItem.quantity}
                      {isModified && beforeItem && beforeItem.quantity !== afterItem.quantity && (
                        <span className="text-xs text-gray-500 ml-1">(was {beforeItem.quantity})</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // Approve changes - apply proposed changes to the order
  const handleApproveChanges = async (order: Order) => {
    try {
      const diff = getDemoDiffForOrder(order);
      if (!diff) {
        alert('No diff data available');
        return;
      }

      // Apply changes to the order
      const updatedAnalysisData = applyDiffToOrder(order.analysis_data, diff);

      // Get the new email content from the update email
      const newEmailContent = order.analysis_data?.updateEmailDetails?.emailContent;

      // Store the update email in history for reference (now applied)
      if (order.analysis_data?.updateEmailDetails) {
        updatedAnalysisData.appliedEmailHistory = updatedAnalysisData.appliedEmailHistory || [];
        updatedAnalysisData.appliedEmailHistory.push({
          ...order.analysis_data.updateEmailDetails,
          appliedAt: new Date().toISOString()
        });
      }

      // Remove the proposedChanges and updateEmailDetails since they're now applied
      delete updatedAnalysisData.proposedChanges;
      delete updatedAnalysisData.updateEmailDetails;

      console.log('Updating order with:', {
        analysis_data: updatedAnalysisData,
        status: 'analyzed',
        email_content: newEmailContent
      });

      // TODO: Implement order updates in new schema (order_lines, order_events)
      console.log('Order update not yet implemented in new schema');
      alert('Order update feature coming soon!');
    } catch (error) {
      console.error('Error approving changes:', error);
      alert(`Failed to approve changes: ${error}`);
    }
  };

  // Reject changes - revert to analyzed without applying changes
  const handleRejectChanges = async (order: Order) => {
    try {
      // Keep updateEmailDetails but mark as rejected, remove proposedChanges
      const updatedAnalysisData = { ...order.analysis_data };
      delete updatedAnalysisData.proposedChanges;

      // Mark the email as rejected for history tracking
      if (updatedAnalysisData.updateEmailDetails) {
        updatedAnalysisData.rejectedEmailHistory = updatedAnalysisData.rejectedEmailHistory || [];
        updatedAnalysisData.rejectedEmailHistory.push({
          ...updatedAnalysisData.updateEmailDetails,
          rejectedAt: new Date().toISOString()
        });
        delete updatedAnalysisData.updateEmailDetails;
      }

      // TODO: Implement order rejection tracking in new schema
      console.log('Rejecting changes for order:', order.id);
      alert('Order rejection feature coming soon!');
    } catch (error) {
      console.error('Error rejecting changes:', error);
      alert(`Failed to reject changes: ${error}`);
    }
  };

  const filteredOrders = orders.filter(order => {
    const matchesSearch = order.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         order.customer_email.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         order.order_number.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
    const matchesSource = sourceFilter === 'all' || order.source === sourceFilter;

    return matchesSearch && matchesStatus && matchesSource;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'exported':
      case 'completed': return 'text-green-600 bg-green-100';
      case 'pushed_to_erp': return 'text-green-600 bg-green-100';
      case 'analyzed': return 'text-blue-600 bg-blue-100';
      case 'processing': return 'text-blue-600 bg-blue-100';
      case 'received':
      case 'pending': return 'text-yellow-600 bg-yellow-100';
      case 'pending_review': return 'text-yellow-600 bg-yellow-100';
      case 'needs_review': return 'text-orange-600 bg-orange-100';
      case 'failed':
      case 'cancelled': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      'pending_review': 'Pending Review',
      'ready': 'Ready',
      'pushed_to_erp': 'Pushed to ERP',
      'completed': 'Completed',
      'cancelled': 'Cancelled',
      'needs_review': 'Needs Review',
      'analyzed': 'Analyzed',
      'processing': 'Processing',
      'received': 'Received',
      'pending': 'Pending',
      'exported': 'Exported',
      'failed': 'Failed'
    };
    return labels[status] || status.charAt(0).toUpperCase() + status.slice(1);
  };

  const getSourceIcon = (source: string) => {
    switch (source) {
      case 'email': return <Mail className="w-4 h-4" />;
      case 'text': return <MessageSquare className="w-4 h-4" />;
      case 'edi': return <Network className="w-4 h-4" />;
      default: return <Package className="w-4 h-4" />;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getAttachmentIcon = (mimeType: string) => {
    if (mimeType.startsWith('image/')) {
      return <ImageIcon className="w-4 h-4 text-blue-500" />;
    } else if (mimeType.includes('pdf')) {
      return <FileText className="w-4 h-4 text-red-500" />;
    } else if (mimeType.includes('text/') || mimeType.includes('document')) {
      return <FileText className="w-4 h-4 text-green-500" />;
    } else {
      return <FileIcon className="w-4 h-4 text-gray-500" />;
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          <span className="ml-3 text-gray-600">Loading orders...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Orders</h2>
          <p className="text-gray-600">Manage and track all orders processed by Frootful</p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={() => loadOrders()}
            className="flex items-center space-x-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
            title="Refresh orders"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div 
          className={`bg-white rounded-lg shadow-sm border border-gray-200 p-6 cursor-pointer hover:shadow-md transition-shadow ${
            sourceFilter === 'all' ? 'ring-2 ring-indigo-500' : ''
          }`}
          onClick={() => setSourceFilter('all')}
        >
          <div className="flex items-center">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Package className="w-6 h-6 text-blue-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Total Orders</p>
              <p className="text-2xl font-bold text-gray-900">{orders.length}</p>
            </div>
          </div>
        </div>
        
        <div 
          className={`bg-white rounded-lg shadow-sm border border-gray-200 p-6 cursor-pointer hover:shadow-md transition-shadow ${
            sourceFilter === 'email' ? 'ring-2 ring-green-500' : ''
          }`}
          onClick={() => setSourceFilter('email')}
        >
          <div className="flex items-center">
            <div className="p-2 bg-green-100 rounded-lg">
              <Mail className="w-6 h-6 text-green-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Email Orders</p>
              <p className="text-2xl font-bold text-gray-900">
                {orders.filter(o => o.source === 'email').length}
              </p>
            </div>
          </div>
        </div>
        
        <div
          className={`bg-white rounded-lg shadow-sm border border-gray-200 p-6 cursor-pointer hover:shadow-md transition-shadow ${
            sourceFilter === 'text' ? 'ring-2 ring-yellow-500' : ''
          }`}
          onClick={() => setSourceFilter('text')}
        >
          <div className="flex items-center">
            <div className="p-2 bg-yellow-100 rounded-lg">
              <MessageSquare className="w-6 h-6 text-yellow-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Text Orders</p>
              <p className="text-2xl font-bold text-gray-900">
                {orders.filter(o => o.source === 'text').length}
              </p>
            </div>
          </div>
        </div>

        <div
          className={`bg-white rounded-lg shadow-sm border border-gray-200 p-6 cursor-pointer hover:shadow-md transition-shadow ${
            sourceFilter === 'edi' ? 'ring-2 ring-purple-500' : ''
          }`}
          onClick={() => setSourceFilter('edi')}
        >
          <div className="flex items-center">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Network className="w-6 h-6 text-purple-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">EDI Orders</p>
              <p className="text-2xl font-bold text-gray-900">
                {orders.filter(o => o.source === 'edi').length}
              </p>
            </div>
          </div>
        </div>

        <div
          className={`bg-white rounded-lg shadow-sm border border-gray-200 p-6 cursor-pointer hover:shadow-md transition-shadow ${
            sourceFilter === 'erp' ? 'ring-2 ring-teal-500' : ''
          }`}
          onClick={() => setSourceFilter('erp')}
        >
          <div className="flex items-center">
            <div className="p-2 bg-teal-100 rounded-lg">
              <LayoutGrid className="w-6 h-6 text-teal-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">ERP Orders</p>
              <p className="text-2xl font-bold text-gray-900">
                {orders.filter(o => o.source === 'erp').length}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Search orders..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="flex gap-3">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="all">All Status</option>
              <option value="received">Received</option>
              <option value="pending">Pending</option>
              <option value="processing">Processing</option>
              <option value="analyzed">Analyzed</option>
              <option value="exported">Exported</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
              <option value="cancelled">Cancelled</option>
            </select>

            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="all">All Sources</option>
              <option value="email">Email</option>
              <option value="text">Text</option>
              <option value="edi">EDI</option>
              <option value="erp">ERP</option>
              <option value="manual">Manual</option>
            </select>
          </div>
        </div>
      </div>

      {/* Needs Review Section */}
      <NeedsReviewSection />

      {/* Orders Table */}
      {/* Mobile-Friendly Orders List */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        {/* Desktop Table - Hidden on mobile */}
        <div className="hidden md:block overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Customer
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Received By
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Items
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredOrders.map((order) => (
                <tr
                  key={order.id}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => handleOrderClick(order)}
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        {getSourceIcon(order.source)}
                      </div>
                      <div className="ml-3">
                        <div className="text-sm font-medium text-gray-900">
                          {order.customer_name}
                        </div>
                        {order.source === 'edi' && order.trading_partner && (
                          <div className="mt-1">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">
                              {order.trading_partner}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </td>

                  <td className="px-6 py-4 whitespace-nowrap">
                    {order.created_by ? (
                      <div className="flex items-center">
                        {order.created_by.profile_picture ? (
                          <img
                            src={order.created_by.profile_picture}
                            alt={order.created_by.name}
                            className="w-8 h-8 rounded-full mr-2"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center mr-2">
                            <User className="w-4 h-4 text-gray-600" />
                          </div>
                        )}
                        <div className="text-sm text-gray-900">
                          {order.created_by.name}
                        </div>
                      </div>
                    ) : (
                      <span className="text-sm text-gray-400">—</span>
                    )}
                  </td>

                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {order.items.length} item{order.items.length !== 1 ? 's' : ''}
                    </div>
                  </td>

                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(order.status)}`}>
                      {getStatusLabel(order.status)}
                    </span>
                  </td>

                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatDate(order.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards - Visible on mobile */}
        <div className="md:hidden divide-y divide-gray-200">
          {filteredOrders.map((order) => (
            <div
              key={order.id}
              className="p-4 hover:bg-gray-50 cursor-pointer active:bg-gray-100 transition-colors"
              onClick={() => handleOrderClick(order)}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2">
                  {getSourceIcon(order.source)}
                  <div>
                    <div className="font-medium text-gray-900">{order.customer_name}</div>
                    {order.created_by && (
                      <div className="text-xs text-gray-500 mt-0.5">
                        Received by {order.created_by.name}
                      </div>
                    )}
                  </div>
                </div>
                <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(order.status)}`}>
                  {getStatusLabel(order.status)}
                </span>
              </div>

              {order.source === 'edi' && order.trading_partner && (
                <div className="mb-2">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">
                    {order.trading_partner}
                  </span>
                </div>
              )}

              <div className="space-y-1">
                <div className="text-sm text-gray-500">
                  {order.items.length} item{order.items.length !== 1 ? 's' : ''}
                </div>
                <div className="text-xs text-gray-400">{formatDate(order.created_at)}</div>
              </div>
            </div>
          ))}
        </div>

        {filteredOrders.length === 0 && (
          <div className="text-center py-12">
            <Package className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No orders found</h3>
            <p className="mt-1 text-sm text-gray-500">
              {searchTerm || statusFilter !== 'all' || sourceFilter !== 'all'
                ? 'Try adjusting your search or filters.'
                : 'Orders will appear here once they are processed by Frootful.'}
            </p>
          </div>
        )}
      </div>

      {/* Order Detail Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-0 md:top-20 mx-auto p-4 md:p-5 border w-full md:w-3/4 lg:w-2/3 shadow-lg rounded-none md:rounded-md bg-white min-h-full md:min-h-0 md:max-h-[80vh] overflow-y-auto">
            <div className="mt-3">
              <div className="flex items-center justify-between mb-4 px-4 md:px-0">
                <div>
                  <h3 className="text-lg font-medium text-gray-900">
                    Order Details - {selectedOrder.order_number}
                  </h3>
                  {selectedOrder.status === 'needs_review' && selectedOrder.analysis_data?.updateEmailDetails && (
                    <div className="mt-2 flex items-center space-x-2">
                      <AlertCircle className="w-4 h-4 text-orange-600" />
                      <span className="text-sm text-orange-700 font-medium">
                        This order needs review
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex items-center space-x-2">
                  {selectedOrder.status === 'needs_review' && selectedOrder.analysis_data?.updateEmailDetails && (
                    <div className="flex bg-gray-100 rounded-lg p-1">
                      <button
                        onClick={() => setViewMode('current')}
                        className={`flex items-center space-x-1 px-3 py-1.5 rounded-md transition-colors text-sm ${
                          viewMode === 'current'
                            ? 'bg-white shadow-sm text-gray-900'
                            : 'text-gray-600 hover:text-gray-900'
                        }`}
                      >
                        <Eye className="w-4 h-4" />
                        <span>Current</span>
                      </button>
                      <button
                        onClick={() => setViewMode('diff-side-by-side')}
                        className={`flex items-center space-x-1 px-3 py-1.5 rounded-md transition-colors text-sm ${
                          viewMode === 'diff-side-by-side'
                            ? 'bg-white shadow-sm text-gray-900'
                            : 'text-gray-600 hover:text-gray-900'
                        }`}
                      >
                        <Columns className="w-4 h-4" />
                        <span>Side-by-Side</span>
                      </button>
                      <button
                        onClick={() => setViewMode('diff-unified')}
                        className={`flex items-center space-x-1 px-3 py-1.5 rounded-md transition-colors text-sm ${
                          viewMode === 'diff-unified'
                            ? 'bg-white shadow-sm text-gray-900'
                            : 'text-gray-600 hover:text-gray-900'
                        }`}
                      >
                        <LayoutGrid className="w-4 h-4" />
                        <span>Unified</span>
                      </button>
                    </div>
                  )}
                  {!isEditing && selectedOrder.analysis_data && viewMode === 'current' && (
                    <button
                      onClick={() => handleEditOrder(selectedOrder)}
                      className="flex items-center space-x-1 px-3 py-1 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700"
                    >
                      <Edit className="w-4 h-4" />
                      <span>Edit</span>
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setSelectedOrder(null);
                      setCreatedERPOrderNumber(null);
                      setViewMode('current');
                    }}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X className="h-6 w-6" />
                  </button>
                </div>
              </div>

              {/* Creator Information */}
              {selectedOrder.created_by && (
                <div className="mb-4 px-4 md:px-0">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-start space-x-3">
                    {selectedOrder.created_by.profile_picture ? (
                      <img
                        src={selectedOrder.created_by.profile_picture}
                        alt={selectedOrder.created_by.name}
                        className="w-10 h-10 rounded-full"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-blue-200 flex items-center justify-center">
                        <User className="w-6 h-6 text-blue-600" />
                      </div>
                    )}
                    <div className="flex-1">
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-medium text-blue-900">
                          {selectedOrder.created_by.name}
                        </span>
                        <div className="group relative">
                          <HelpCircle className="w-4 h-4 text-blue-600 cursor-help" />
                          <div className="absolute left-0 top-6 w-64 bg-gray-900 text-white text-xs rounded p-2 opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none">
                            This is the person in your company who received the order from the customer and forwarded the information to Frootful
                          </div>
                        </div>
                      </div>
                      <div className="text-xs text-blue-700 mt-0.5">
                        Received and forwarded this order
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Content based on view mode */}
              {viewMode === 'current' && (
                <>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 px-4 md:px-0 pb-4 md:pb-0">
                {/* LEFT COLUMN - Parsed Information */}
                <div className="space-y-6">
                {/* Customer Info */}
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <h4 className="text-lg font-semibold text-gray-900 mb-4">Customer</h4>

                  {/* Current Matched Customer Display - Always Editable */}
                  <div className="mb-4">
                    {selectedOrder.analysis_data?.matchingCustomer ? (
                      <div className="space-y-3">
                        {/* Display with edit capability */}
                        {!editingCustomerInline ? (
                          <div className="bg-gray-50 border border-gray-200 rounded-md p-3">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center flex-1">
                                <User className="w-5 h-5 text-green-600 mr-2" />
                                <span className="text-base font-semibold text-gray-900">
                                  {selectedOrder.analysis_data.matchingCustomer.displayName}
                                </span>
                              </div>
                              <button
                                onClick={() => {
                                  setEditingCustomerInline(true);
                                  setCustomerSearchTerm('');
                                  setShowCustomerDropdown(true);
                                }}
                                className="p-0 hover:bg-transparent"
                                title="Click to change customer"
                              >
                                <Edit className="w-4 h-4 text-gray-400 cursor-pointer hover:text-indigo-600" />
                              </button>
                            </div>
                            <div className="grid grid-cols-1 gap-2 text-sm ml-7">
                              <div>
                                <span className="font-medium text-gray-700">Customer #:</span>
                                <span className="ml-2 text-gray-900">{selectedOrder.analysis_data.matchingCustomer.number}</span>
                              </div>
                              {selectedOrder.analysis_data.matchingCustomer.email && (
                                <div>
                                  <span className="font-medium text-gray-700">Email:</span>
                                  <span className="ml-2 text-gray-900">{selectedOrder.analysis_data.matchingCustomer.email}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        ) : (
                          /* Inline autocomplete for editing */
                          <div className="relative">
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Select Customer:
                            </label>
                            <input
                              type="text"
                              value={customerSearchTerm}
                              onChange={(e) => {
                                setCustomerSearchTerm(e.target.value);
                                setShowCustomerDropdown(true);
                              }}
                              onFocus={() => setShowCustomerDropdown(true)}
                              onBlur={() => {
                                setTimeout(() => {
                                  setShowCustomerDropdown(false);
                                  setEditingCustomerInline(false);
                                }, 200);
                              }}
                              placeholder="Search customers..."
                              className="w-full px-3 py-3 text-base border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                              autoFocus
                            />
                            {showCustomerDropdown && (
                              <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto">
                                {customers
                                  .filter(c =>
                                    c.displayName.toLowerCase().includes(customerSearchTerm.toLowerCase()) ||
                                    c.email?.toLowerCase().includes(customerSearchTerm.toLowerCase()) ||
                                    c.number.toLowerCase().includes(customerSearchTerm.toLowerCase())
                                  )
                                  .map((customer) => (
                                    <div
                                      key={customer.id}
                                      onClick={async () => {
                                        await handleCustomerChangeInline(customer.number);
                                        setCustomerSearchTerm(customer.displayName);
                                        setShowCustomerDropdown(false);
                                        setEditingCustomerInline(false);
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
                        )}
                      </div>
                    ) : (
                      <div className="text-center py-4 bg-gray-50 border border-gray-200 rounded-md">
                        <AlertCircle className="w-8 h-8 text-yellow-500 mx-auto mb-2" />
                        <p className="text-sm text-gray-600 mb-3">No customer matched</p>
                        {customers.length > 0 && (
                          <>
                            {!isEditing ? (
                              <button
                                onClick={() => handleEditOrder(selectedOrder)}
                                className="inline-flex items-center space-x-1 px-3 py-1 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700"
                              >
                                <Edit className="w-4 h-4" />
                                <span>Select Customer</span>
                              </button>
                            ) : (
                              <div className="mt-3 px-4 relative">
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                  Select Customer:
                                </label>
                                <input
                                  type="text"
                                  value={customerSearchTerm}
                                  onChange={(e) => {
                                    setCustomerSearchTerm(e.target.value);
                                    setShowCustomerDropdown(true);
                                  }}
                                  onFocus={() => setShowCustomerDropdown(true)}
                                  placeholder="Search customers..."
                                  className="w-full px-3 py-3 text-base border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                                />
                                {showCustomerDropdown && (
                                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto">
                                    {customers
                                      .filter(c =>
                                        c.displayName.toLowerCase().includes(customerSearchTerm.toLowerCase()) ||
                                        c.email?.toLowerCase().includes(customerSearchTerm.toLowerCase()) ||
                                        c.number.toLowerCase().includes(customerSearchTerm.toLowerCase())
                                      )
                                      .map((customer) => (
                                        <div
                                          key={customer.id}
                                          onClick={() => {
                                            handleCustomerChange(customer.number);
                                            setCustomerSearchTerm(customer.displayName);
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
                            )}
                          </>
                        )}
                      </div>
                    )}

                    {/* Phone Number */}
                    {selectedOrder.customer_phone && (
                      <div className="flex items-center text-sm text-gray-600 mt-3">
                        <Phone className="w-4 h-4 mr-2" />
                        <span>Phone: {selectedOrder.customer_phone}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Ship Date */}
                <div>
                      <h4 className="text-sm font-medium text-gray-900 mb-3">Ship Date</h4>
                      <div className="bg-gray-50 rounded-lg p-4">
                        <input
                          type="date"
                          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                          placeholder="Select ship date"
                        />
                      </div>
                    </div>

                {/* Delivery Date */}
                {(selectedOrder.requested_delivery_date || isEditing) && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-900 mb-3">Delivery Date</h4>
                    <div className="bg-gray-50 rounded-lg p-4">
                      {isEditing && editingOrder ? (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Requested Delivery Date:
                          </label>
                          <input
                            type="date"
                            value={editingOrder.analysis_data?.requestedDeliveryDate || ''}
                            onChange={(e) => handleDeliveryDateChange(e.target.value)}
                            className="px-3 py-3 text-base border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                          />
                        </div>
                      ) : (
                        <div className="flex items-center">
                          <Calendar className="w-4 h-4 text-gray-400 mr-2" />
                          <span className="text-sm">
                            {selectedOrder.requested_delivery_date ? 
                              new Date(selectedOrder.requested_delivery_date).toLocaleDateString() : 
                              'No delivery date specified'}
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
                    {!isEditing && selectedOrder.analysis_data && (
                      <button
                        onClick={() => handleEditOrder(selectedOrder)}
                        className="text-xs text-indigo-600 hover:text-indigo-700 flex items-center space-x-1"
                      >
                        <Edit className="w-3 h-3" />
                        <span>Edit Items</span>
                      </button>
                    )}
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="space-y-3">
                      {isEditing && editingOrder?.analysis_data ? (
                        editingOrder.analysis_data.analyzedItems.map((item, index) => (
                          <div key={index} className="border border-gray-200 rounded-lg p-3 bg-white">
                            <div className="space-y-4">
                              <div className="relative">
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                  Item:
                                </label>
                                <input
                                  type="text"
                                  value={itemSearchTerm || item.matchedItem?.displayName || ''}
                                  onChange={(e) => {
                                    setItemSearchTerm(e.target.value);
                                    setShowItemDropdown(true);
                                  }}
                                  onFocus={() => setShowItemDropdown(true)}
                                  placeholder="Search items..."
                                  className="w-full px-3 py-3 text-base border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                                />
                                {showItemDropdown && (
                                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto">
                                    {items
                                      .filter(i =>
                                        i.displayName.toLowerCase().includes(itemSearchTerm.toLowerCase()) ||
                                        i.number.toLowerCase().includes(itemSearchTerm.toLowerCase()) ||
                                        i.description?.toLowerCase().includes(itemSearchTerm.toLowerCase())
                                      )
                                      .map((availableItem) => (
                                        <div
                                          key={availableItem.id}
                                          onClick={() => {
                                            handleItemChange(index, availableItem.number);
                                            setItemSearchTerm(availableItem.displayName);
                                            setShowItemDropdown(false);
                                          }}
                                          className="px-3 py-2 hover:bg-indigo-50 cursor-pointer"
                                        >
                                          <div className="font-medium">{availableItem.displayName}</div>
                                          <div className="text-sm text-gray-500">
                                            ${availableItem.unitPrice} - {availableItem.number}
                                          </div>
                                        </div>
                                      ))}
                                  </div>
                                )}
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                  Quantity:
                                </label>
                                <input
                                  type="number"
                                  min="1"
                                  value={item.quantity}
                                  onChange={(e) => handleQuantityChange(index, parseInt(e.target.value) || 0)}
                                  className="w-full px-3 py-3 text-base border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                                />
                              </div>
                            </div>
                            <div className="mt-2 text-sm text-gray-600">
                              Original: {item.itemName}
                            </div>
                          </div>
                        ))
                      ) : (
                        selectedOrder.items.map((item, index) => (
                          <div
                            key={index}
                            className="border border-gray-200 rounded-lg p-3 bg-white hover:border-indigo-300 cursor-pointer transition-colors group"
                            onClick={() => handleEditOrder(selectedOrder)}
                            title="Click to edit this item"
                          >
                            <div className="flex justify-between items-start">
                              <div className="flex-1">
                                <div className="flex items-center space-x-2">
                                  <div className="text-sm font-medium text-gray-900">{item.name}</div>
                                  <Edit className="w-3 h-3 text-gray-400 group-hover:text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                                </div>
                                {item.description && (
                                  <div className="text-xs text-gray-500 mt-1">Item #: {item.description}</div>
                                )}
                                {selectedOrder.analysis_data?.analyzedItems[index] && (
                                  <div className="text-xs text-gray-400 mt-1">
                                    Original: {selectedOrder.analysis_data.analyzedItems[index].itemName}
                                  </div>
                                )}
                              </div>
                              <div className="text-right ml-4">
                                <div className="text-sm font-medium text-gray-900">
                                  Qty: {item.quantity}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
                </div>
                {/* END LEFT COLUMN */}

                {/* RIGHT COLUMN - Source Content */}
                <div className="space-y-6">
                {/* Original Content */}
                <div>
                  <h4 className="text-sm font-medium text-gray-900 mb-3">
                    {selectedOrder.source === 'text' ? 'Original Text Message' : 'Original Email Content'}
                  </h4>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="text-sm text-gray-700 whitespace-pre-wrap break-words">
                      {selectedOrder.original_content}
                    </div>
                  </div>
                </div>

                {/* Attachments Section */}
                {selectedOrder.attachments && selectedOrder.attachments.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-900 mb-3">
                      Attachments ({selectedOrder.attachments.length})
                    </h4>
                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="space-y-4">
                        {selectedOrder.attachments.map((attachment, index) => (
                          <div key={index} className="bg-white rounded-lg border p-4">
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex items-center space-x-3">
                                {getAttachmentIcon(attachment.mimeType)}
                                <div>
                                  <div className="text-sm font-medium text-gray-900">
                                    {attachment.filename}
                                  </div>
                                  <div className="text-xs text-gray-500">
                                    {attachment.mimeType} • {formatFileSize(attachment.size)}
                                    {attachment.hasExtractedText && (
                                      <span className="ml-2 text-green-600">
                                        • Text extracted ({attachment.extractedTextLength} chars)
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center space-x-2">
                                {attachment.hasExtractedText && attachment.extractedText && (
                                  <button
                                    onClick={() => {
                                      const textPreview = attachment.extractedText!.substring(0, 1000);
                                      const fullText = attachment.extractedText!;
                                      if (fullText.length > 1000) {
                                        alert(`Extracted text from ${attachment.filename}:\n\n${textPreview}...\n\n[Text truncated - ${fullText.length} total characters]`);
                                      } else {
                                        alert(`Extracted text from ${attachment.filename}:\n\n${fullText}`);
                                      }
                                    }}
                                    className="text-blue-600 hover:text-blue-800 text-xs px-2 py-1 rounded border border-blue-200 hover:bg-blue-50"
                                    title="View extracted text"
                                  >
                                    <FileText className="w-4 h-4 inline mr-1" />
                                    View Text
                                  </button>
                                )}
                                {attachment.storageUrl && (
                                  <button
                                    onClick={() => {
                                      window.open(attachment.storageUrl, '_blank');
                                    }}
                                    className="text-green-600 hover:text-green-800 text-xs px-2 py-1 rounded border border-green-200 hover:bg-green-50"
                                    title="View/Download file"
                                  >
                                    <Download className="w-4 h-4 inline mr-1" />
                                    Download
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Image Preview - Click to expand */}
                            {attachment.mimeType.startsWith('image/') && attachment.storageUrl && (
                              <div className="mt-3">
                                <img
                                  src={attachment.storageUrl}
                                  alt={attachment.filename}
                                  className="max-w-full max-h-96 rounded-lg border border-gray-200 shadow-sm cursor-pointer hover:opacity-90 transition-opacity"
                                  onClick={() => setExpandedAttachment(attachment)}
                                  title="Click to expand"
                                  onError={(e) => {
                                    e.currentTarget.style.display = 'none';
                                  }}
                                />
                                <p className="text-xs text-gray-400 mt-1 text-center">Click image to expand</p>
                              </div>
                            )}

                            {/* PDF Preview - Click to expand */}
                            {attachment.mimeType === 'application/pdf' && attachment.storageUrl && (
                              <div className="mt-3">
                                <div
                                  className="relative cursor-pointer group"
                                  onClick={() => setExpandedAttachment(attachment)}
                                >
                                  <iframe
                                    src={attachment.storageUrl}
                                    className="w-full h-[400px] rounded-lg border border-gray-300 pointer-events-none"
                                    title={attachment.filename}
                                  />
                                  <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-10 transition-all rounded-lg flex items-center justify-center">
                                    <span className="opacity-0 group-hover:opacity-100 bg-white px-3 py-2 rounded-lg shadow-lg text-sm font-medium text-gray-700 transition-opacity">
                                      Click to expand
                                    </span>
                                  </div>
                                </div>
                                <p className="text-xs text-gray-400 mt-1 text-center">Click to view full size</p>
                              </div>
                            )}

                            {/* Other File Types */}
                            {!attachment.mimeType.startsWith('image/') && attachment.mimeType !== 'application/pdf' && attachment.storageUrl && (
                              <div className="mt-3 p-4 bg-gray-100 rounded-lg border border-gray-200">
                                <div className="flex items-center space-x-2 text-gray-700">
                                  <FileIcon className="w-5 h-5" />
                                  <span className="text-sm font-medium">
                                    {attachment.mimeType.split('/')[1].toUpperCase()} File
                                  </span>
                                </div>
                                <p className="text-xs text-gray-600 mt-1">
                                  Click "Download" above to view the file
                                </p>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Order Status & Dates */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <h4 className="text-sm font-medium text-gray-900 mb-3">Status</h4>
                    <span className={`inline-flex px-3 py-1 text-sm font-semibold rounded-full ${getStatusColor(selectedOrder.status)}`}>
                      {getStatusLabel(selectedOrder.status)}
                    </span>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-gray-900 mb-3">Important Dates</h4>
                    <div className="space-y-1 text-sm text-gray-600">
                      <div>Created: {formatDate(selectedOrder.created_at)}</div>
                      {selectedOrder.processed_at && (
                        <div>Processed: {formatDate(selectedOrder.processed_at)}</div>
                      )}
                    </div>
                  </div>
                </div>
                </div>
                </div>

                {/* Action Buttons */}
                {isEditing ? (
                  <div className="flex flex-col sm:flex-row justify-end space-y-2 sm:space-y-0 sm:space-x-3 pt-4 border-t border-gray-200">
                    <button
                      onClick={handleCancelEdit}
                      disabled={isSaving}
                      className="w-full sm:w-auto px-6 py-3 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 disabled:opacity-50 transition-colors text-base font-medium"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveOrder}
                      disabled={isSaving}
                      className="w-full sm:w-auto flex items-center justify-center space-x-2 px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-base font-medium"
                    >
                      {isSaving ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          <span>Saving...</span>
                        </>
                      ) : (
                        <>
                          <Save className="w-5 h-5" />
                          <span>Save Changes</span>
                        </>
                      )}
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col sm:flex-row justify-end space-y-2 sm:space-y-0 sm:space-x-3 pt-4 border-t border-gray-200">
                    {/* Create ERP Order Button - show for EDI orders or orders with valid analysis data */}
                    {!['exported', 'completed'].includes(selectedOrder.status) && (
                      selectedOrder.source === 'edi' ||
                      (selectedOrder.analysis_data?.matchingCustomer && selectedOrder.analysis_data?.analyzedItems?.length > 0)
                    ) && (
                      <button
                        onClick={() => createERPOrder(selectedOrder)}
                        disabled={isCreatingOrder || erpOrderCreated}
                        className="w-full sm:w-auto flex items-center justify-center space-x-2 px-4 py-2 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                        style={{ backgroundColor: erpOrderCreated ? '#10b981' : '#53AD6D' }}
                        onMouseEnter={(e) => {
                          if (!e.currentTarget.disabled) {
                            e.currentTarget.style.backgroundColor = '#4a9c63';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!e.currentTarget.disabled) {
                            e.currentTarget.style.backgroundColor = erpOrderCreated ? '#10b981' : '#53AD6D';
                          }
                        }}
                      >
                        {isCreatingOrder ? (
                          <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            <span>Creating Order...</span>
                          </>
                        ) : erpOrderCreated ? (
                          <>
                            <CheckCircle className="w-5 h-5" />
                            <span>Created</span>
                          </>
                        ) : (
                          <>
                            <Send className="w-5 h-5" />
                            <span>Create ERP Order</span>
                          </>
                        )}
                      </button>
                    )}
                    {/* Copy ERP Order Number button - show after EDI order is created */}
                    {selectedOrder.source === 'edi' && createdERPOrderNumber && (
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(createdERPOrderNumber);
                          alert(`Copied order number ${createdERPOrderNumber} to clipboard!`);
                        }}
                        className="w-full sm:w-auto flex items-center justify-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                      >
                        <Copy className="w-5 h-5" />
                        <span>Copy Order # {createdERPOrderNumber}</span>
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setSelectedOrder(null);
                        setCreatedERPOrderNumber(null);
                        setErpOrderCreated(false);
                        setViewMode('current');
                      }}
                      className="w-full sm:w-auto px-6 py-3 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition-colors text-base font-medium"
                    >
                      Close
                    </button>
                  </div>
                )}
                </>
              )}

              {/* Side-by-side diff view */}
              {viewMode === 'diff-side-by-side' && selectedOrder.status === 'needs_review' && selectedOrder.analysis_data?.updateEmailDetails && (() => {
                const pendingVersion = createPendingVersion(selectedOrder);
                if (!pendingVersion) return null;

                return (
                  <div className="space-y-4 px-4 md:px-0 pb-4">
                    {/* Email Reference with Full Message */}
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <div className="flex items-start space-x-3">
                        <Mail className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-semibold text-blue-900 mb-2">Change Request Details</h4>
                          <div className="space-y-1 text-sm mb-3">
                            <div className="flex items-start">
                              <span className="font-medium text-blue-800 w-16 flex-shrink-0">From:</span>
                              <span className="text-blue-700">{selectedOrder.analysis_data.updateEmailDetails.from}</span>
                            </div>
                            <div className="flex items-start">
                              <span className="font-medium text-blue-800 w-16 flex-shrink-0">Subject:</span>
                              <span className="text-blue-700">{selectedOrder.analysis_data.updateEmailDetails.subject}</span>
                            </div>
                            <div className="flex items-start">
                              <span className="font-medium text-blue-800 w-16 flex-shrink-0">Received:</span>
                              <span className="text-blue-700">{formatDate(selectedOrder.analysis_data.updateEmailDetails.receivedAt)}</span>
                            </div>
                          </div>

                          {/* Full Email Message with Quotes */}
                          {selectedOrder.customer_name === 'Legal Seafood' && (
                            <div className="mt-3 bg-white border border-blue-200 rounded p-3">
                              <div className="text-sm font-mono whitespace-pre-wrap text-gray-800">
                                <div className="mb-2">Change:</div>
                                <div className="mb-1">Remove the davenport</div>
                                <div className="mb-1">Change the salt bay to 120</div>
                                <div className="mb-3">Add 140 of Collard Greens</div>
                                <div className="text-gray-600">
                                  <div>On Thu, Oct 23, 2025 at 3:11 PM Konstantin Nople &lt;konstantin.nople@gmail.com&gt;</div>
                                  <div>wrote:</div>
                                  <div className="mt-2">&gt; Hey ICO sales team. I need an order!!!</div>
                                  <div>&gt;</div>
                                  <div>&gt;</div>
                                  <div>&gt;</div>
                                  <div>&gt; RESTAURANT NAME: Legal Seafood</div>
                                  <div>&gt;</div>
                                  <div>&gt;</div>
                                  <div>&gt;</div>
                                  <div>&gt; DELIVERY DATE: 09/28</div>
                                  <div>&gt;</div>
                                  <div>&gt;</div>
                                  <div>&gt;</div>
                                  <div>&gt; ITEMS: 200ct Davenport</div>
                                  <div>&gt;</div>
                                  <div>&gt; 100 ct Submarine</div>
                                  <div>&gt;</div>
                                  <div>&gt; 100 ct salt bay</div>
                                  <div>&gt;</div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Column Headers */}
                    <div className="grid grid-cols-2 bg-gray-100 border-b-2 border-gray-300 rounded-t-lg overflow-hidden">
                      <div className="p-3 border-r border-gray-300">
                        <div className="flex items-center space-x-2">
                          <Minus className="w-4 h-4 text-red-600" />
                          <span className="text-sm font-semibold text-gray-700">CURRENT VERSION</span>
                        </div>
                      </div>
                      <div className="p-3">
                        <div className="flex items-center space-x-2">
                          <Plus className="w-4 h-4 text-green-600" />
                          <span className="text-sm font-semibold text-gray-700">PROPOSED VERSION</span>
                        </div>
                      </div>
                    </div>

                    {/* Diff Content */}
                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                      <div className="max-h-[500px] overflow-y-auto">
                        {renderItemsDiff(
                          selectedOrder.analysis_data?.analyzedItems?.map((item: AnalyzedItem) => ({
                            name: item.itemName,
                            quantity: item.quantity,
                            price: item.matchedItem?.unitPrice || 0,
                            description: item.matchedItem?.number
                          })) || [],
                          pendingVersion.items
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Unified diff view */}
              {viewMode === 'diff-unified' && selectedOrder.status === 'needs_review' && selectedOrder.analysis_data?.updateEmailDetails && (() => {
                const diff = getDemoDiffForOrder(selectedOrder);
                if (!diff) return null;

                return (
                  <div className="space-y-4 px-4 md:px-0 pb-4">
                    {/* Email Reference with Full Message */}
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <div className="flex items-start space-x-3">
                        <Mail className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-semibold text-blue-900 mb-2">Change Request Details</h4>
                          <div className="space-y-1 text-sm mb-3">
                            <div className="flex items-start">
                              <span className="font-medium text-blue-800 w-16 flex-shrink-0">From:</span>
                              <span className="text-blue-700">{selectedOrder.analysis_data.updateEmailDetails.from}</span>
                            </div>
                            <div className="flex items-start">
                              <span className="font-medium text-blue-800 w-16 flex-shrink-0">Subject:</span>
                              <span className="text-blue-700">{selectedOrder.analysis_data.updateEmailDetails.subject}</span>
                            </div>
                            <div className="flex items-start">
                              <span className="font-medium text-blue-800 w-16 flex-shrink-0">Received:</span>
                              <span className="text-blue-700">{formatDate(selectedOrder.analysis_data.updateEmailDetails.receivedAt)}</span>
                            </div>
                          </div>

                          {/* Full Email Message with Quotes */}
                          {selectedOrder.customer_name === 'Legal Seafood' && (
                            <div className="mt-3 bg-white border border-blue-200 rounded p-3">
                              <div className="text-sm font-mono whitespace-pre-wrap text-gray-800">
                                <div className="mb-2">Change:</div>
                                <div className="mb-1">Remove the davenport</div>
                                <div className="mb-1">Change the salt bay to 120</div>
                                <div className="mb-3">Add 140 of Collard Greens</div>
                                <div className="text-gray-600">
                                  <div>On Thu, Oct 23, 2025 at 3:11 PM Konstantin Nople &lt;konstantin.nople@gmail.com&gt;</div>
                                  <div>wrote:</div>
                                  <div className="mt-2">&gt; Hey ICO sales team. I need an order!!!</div>
                                  <div>&gt;</div>
                                  <div>&gt;</div>
                                  <div>&gt;</div>
                                  <div>&gt; RESTAURANT NAME: Legal Seafood</div>
                                  <div>&gt;</div>
                                  <div>&gt;</div>
                                  <div>&gt;</div>
                                  <div>&gt; DELIVERY DATE: 09/28</div>
                                  <div>&gt;</div>
                                  <div>&gt;</div>
                                  <div>&gt;</div>
                                  <div>&gt; ITEMS: 200ct Davenport</div>
                                  <div>&gt;</div>
                                  <div>&gt; 100 ct Submarine</div>
                                  <div>&gt;</div>
                                  <div>&gt; 100 ct salt bay</div>
                                  <div>&gt;</div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Unified Diff Display */}
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                      <h4 className="font-semibold text-yellow-900 mb-3">Proposed Changes</h4>
                      <div className="space-y-3">
                        {/* Removed Items */}
                        {diff.items.removed && diff.items.removed.length > 0 && (
                          <div className="bg-red-50 border border-red-200 rounded p-3">
                            <div className="font-medium text-red-900 mb-2">❌ Items to Remove:</div>
                            {diff.items.removed.map((item: any, idx: number) => (
                              <div key={idx} className="text-sm text-red-700">
                                • {item.name} (Qty: {item.quantity})
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Modified Items */}
                        {diff.items.modified && diff.items.modified.length > 0 && (
                          <div className="bg-yellow-100 border border-yellow-300 rounded p-3">
                            <div className="font-medium text-yellow-900 mb-2">✏️ Quantity Changes:</div>
                            {diff.items.modified.map((item: any, idx: number) => (
                              <div key={idx} className="text-sm text-yellow-800">
                                • {item.before.name}: {item.before.quantity} → {item.after.quantity}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Added Items */}
                        {diff.items.added && diff.items.added.length > 0 && (
                          <div className="bg-green-50 border border-green-200 rounded p-3">
                            <div className="font-medium text-green-900 mb-2">✅ Items to Add:</div>
                            {diff.items.added.map((item: any, idx: number) => (
                              <div key={idx} className="text-sm text-green-700">
                                • {item.name} (Qty: {item.quantity})
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Action Buttons - only show in diff views */}
              {selectedOrder.status === 'needs_review' && selectedOrder.analysis_data?.updateEmailDetails && viewMode !== 'current' && (
                <div className="mt-6 px-4 md:px-0 flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-3 pt-4 border-t border-gray-200">
                  <button
                    onClick={() => handleRejectChanges(selectedOrder)}
                    className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
                  >
                    Reject Changes
                  </button>
                  <button
                    onClick={() => handleApproveChanges(selectedOrder)}
                    className="flex-1 px-4 py-2 text-white rounded-lg transition-colors font-medium"
                    style={{ backgroundColor: '#53AD6D' }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#4a9c63';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = '#53AD6D';
                    }}
                  >
                    Approve & Apply Changes
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Expanded Attachment Modal */}
      {expandedAttachment && (
        <div
          className="fixed inset-0 bg-black bg-opacity-75 z-50 flex items-center justify-center p-4"
          onClick={() => setExpandedAttachment(null)}
        >
          <div
            className="relative max-w-[95vw] max-h-[95vh] bg-white rounded-lg shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-gray-100 border-b">
              <div className="flex items-center space-x-2">
                {expandedAttachment.mimeType.startsWith('image/') ? (
                  <ImageIcon className="w-5 h-5 text-blue-500" />
                ) : (
                  <FileText className="w-5 h-5 text-red-500" />
                )}
                <span className="font-medium text-gray-900">{expandedAttachment.filename}</span>
                <span className="text-sm text-gray-500">({formatFileSize(expandedAttachment.size)})</span>
              </div>
              <div className="flex items-center space-x-2">
                {expandedAttachment.storageUrl && (
                  <button
                    onClick={() => window.open(expandedAttachment.storageUrl, '_blank')}
                    className="flex items-center space-x-1 px-3 py-1.5 text-sm bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download</span>
                  </button>
                )}
                <button
                  onClick={() => setExpandedAttachment(null)}
                  className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="overflow-auto" style={{ maxHeight: 'calc(95vh - 60px)' }}>
              {expandedAttachment.mimeType.startsWith('image/') && expandedAttachment.storageUrl && (
                <img
                  src={expandedAttachment.storageUrl}
                  alt={expandedAttachment.filename}
                  className="max-w-full h-auto"
                  style={{ maxHeight: 'calc(95vh - 60px)' }}
                />
              )}
              {expandedAttachment.mimeType === 'application/pdf' && expandedAttachment.storageUrl && (
                <iframe
                  src={expandedAttachment.storageUrl}
                  className="w-[90vw] h-[calc(95vh-60px)]"
                  title={expandedAttachment.filename}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrdersSection;