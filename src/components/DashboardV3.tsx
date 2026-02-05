import {
  AlertCircle,
  ArrowUpDown,
  BarChart3,
  Bell,
  Building2,
  Calendar as CalendarIcon,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Filter,
  Inbox,
  LayoutGrid,
  List,
  Loader2,
  LogOut,
  Mail,
  MessageSquare,
  Package,
  Printer,
  Search,
  RefreshCw,
  Settings,
  ShoppingBag,
  Smartphone,
  Upload,
  User,
  X
} from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabaseClient } from '../supabaseClient';
import UploadOrdersSection from './UploadOrdersSection';
import AnalyticsDashboard from './AnalyticsDashboard';

// ============================================================================
// TOOLTIP COMPONENT
// ============================================================================

interface TooltipProps {
  text: string;
  children: React.ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

const Tooltip: React.FC<TooltipProps> = ({ text, children, position = 'top' }) => {
  const [show, setShow] = useState(false);

  const positionClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-1',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-1',
    left: 'right-full top-1/2 -translate-y-1/2 mr-1',
    right: 'left-full top-1/2 -translate-y-1/2 ml-1',
  };

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <div className={`absolute ${positionClasses[position]} z-50 px-2 py-1 text-xs font-medium text-white bg-gray-900 rounded shadow-lg whitespace-nowrap pointer-events-none`}>
          {text}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// TYPES
// ============================================================================

interface OrderItem {
  order_line_id?: string;
  name: string;
  size: string; // e.g. 'S', 'L', 'T20'
  quantity: number;
}

interface Order {
  id: string;
  order_number?: string;
  customer_name: string;
  customer_email?: string;
  customer_phone?: string;
  items: OrderItem[];
  status: string;
  source: 'email' | 'text' | 'manual' | 'edi' | 'sms' | 'erp';
  delivery_date?: string;
  created_at: string;
  line_count?: number;
}

interface ProposalLine {
  id: string;
  change_type: 'add' | 'modify' | 'remove';
  order_line_id?: string | null;
  item_id?: string | null;
  item_variant_id?: string | null;
  item_name: string;
  size: string;
  quantity: number;
  original_quantity?: number;
  original_size?: string;
  available_variants?: { id: string; code: string; name: string }[];
}

interface TimelineEvent {
  id: string;
  type: 'communication' | 'event';
  timestamp: string;
  channel?: 'email' | 'sms';
  content?: string;
  subject?: string;
  from?: string;
  eventType?: string;
}

interface Proposal {
  id: string;
  order_id: string | null; // null = new order proposal
  intake_event_id: string; // Reference to the original intake event
  action?: 'create' | 'assign' | 'undetermined'; // AI-determined action. 'create' = AI recommends new order, 'assign' = matched to existing, 'undetermined' = could not determine
  customer_name: string;
  delivery_date: string;
  message_count: number;
  channel: 'email' | 'sms';
  created_at: string;
  message_preview: string;
  message_full: string;
  message_html?: string;
  sender?: string;
  subject?: string;
  email_date?: string;
  lines: ProposalLine[];
  timeline: TimelineEvent[];
  order_frequency?: 'one-time' | 'recurring';
}

interface Customer {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
}

interface HeaderContentProps {
  organization: { id: string; name: string } | null;
  user: { email?: string; user_metadata?: { full_name?: string; avatar_url?: string } } | null;
  isInstallable: boolean;
  isSigningOut: boolean;
  onInstallPWA: () => void;
  onSignOut: () => void;
  onNavigateSettings: () => void;
}

interface DashboardV3Props {
  organizationId: string | null;
  layout?: 'default' | 'sidebar';
  headerContent?: HeaderContentProps;
}

type ViewMode = 'week' | 'list';

// ============================================================================
// PRODUCT CATALOG - Full list of available items
// ============================================================================
const CATALOG_ITEMS = [
  'Anise Hyssop',
  'Arugula, Astro',
  'Basil, Genovese',
  'Basil, Thai',
  'Borage',
  'Broccoli',
  'Cabbage, Red Acre',
  'Celery',
  'Celosia',
  'Chervil',
  'Cilantro',
  'Fennel, Bronze',
  'Fennel, Green',
  'Kale, Red Russian',
  'Lemon Balm',
  'Mustard, Green Mizuna',
  'Mustard, Purple Mizuna',
  'Mustard, Scarlet Frills',
  'Mustard, Wasabi',
  'Nasturtium',
  'Nutrition Mix',
  'Parsley',
  'Passion Mix',
  'Pea, Afila (Tendrils)',
  'Pea, Dwarf Grey Sugar',
  'Popcorn Shoots',
  'Radish, Hong Vit',
  'Radish, Kaiware',
  'Radish, Sango',
  'Radish Mix',
  'Rainbow Mix',
  'Shiso, Green',
  'Shiso, Red',
  'Shungiku',
  'Sorrel, Red Veined',
  'Sunflower',
  'Tokyo Onion',
];

// ============================================================================
// MOCK DATA - For UI development only
// ============================================================================

const TODAY = new Date();
TODAY.setHours(0, 0, 0, 0);
const TOMORROW = new Date(TODAY);
TOMORROW.setDate(TOMORROW.getDate() + 1);
const DAY_AFTER = new Date(TODAY);
DAY_AFTER.setDate(DAY_AFTER.getDate() + 2);
const FEB_3 = new Date(TODAY);
FEB_3.setDate(TODAY.getDate() + 5); // 5 days from today (Feb 3 if today is Jan 29)
const FEB_4 = new Date(TODAY);
FEB_4.setDate(TODAY.getDate() + 6); // 6 days from today (Feb 4 if today is Jan 29)

const MOCK_STANDING_ORDERS: Order[] = [
  // === Friday 1/30 orders ===
  {
    id: 'fri-capo',
    customer_name: 'Capo',
    status: 'pending',
    source: 'erp',
    delivery_date: TOMORROW.toISOString().split('T')[0],
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    items: [{ name: 'Basil, Genovese', size: 'L', quantity: 4 }],
    line_count: 1,
  },
  {
    id: 'fri-hunters',
    customer_name: 'Hunters',
    status: 'pending',
    source: 'erp',
    delivery_date: TOMORROW.toISOString().split('T')[0],
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    items: [{ name: 'Pea, Tendril', size: 'L', quantity: 1 }],
    line_count: 1,
  },
  {
    id: 'fri-fatbaby',
    customer_name: 'Fat Baby',
    status: 'pending',
    source: 'erp',
    delivery_date: TOMORROW.toISOString().split('T')[0],
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    items: [
      { name: 'Shiso, Red', size: 'L', quantity: 1 },
      { name: 'Cilantro', size: 'L', quantity: 2 },
    ],
    line_count: 2,
  },
  {
    id: 'fri-loco',
    customer_name: 'Loco',
    status: 'pending',
    source: 'erp',
    delivery_date: TOMORROW.toISOString().split('T')[0],
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    items: [{ name: 'Cilantro', size: 'L', quantity: 2 }],
    line_count: 1,
  },
  {
    id: 'fri-224boston',
    customer_name: '224 Boston',
    status: 'pending',
    source: 'erp',
    delivery_date: TOMORROW.toISOString().split('T')[0],
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    items: [
      { name: 'Basil, Genovese', size: 'L', quantity: 1 },
      { name: 'Rainbow MIX', size: 'L', quantity: 2 },
    ],
    line_count: 2,
  },
  {
    id: 'fri-petulas',
    customer_name: "Petula's",
    status: 'pending',
    source: 'erp',
    delivery_date: TOMORROW.toISOString().split('T')[0],
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    items: [
      { name: 'Cilantro', size: 'L', quantity: 1 },
      { name: 'Basil, Genovese', size: 'L', quantity: 1 },
    ],
    line_count: 2,
  },
  {
    id: 'fri-chickadee',
    customer_name: 'Chickadee',
    status: 'pending',
    source: 'erp',
    delivery_date: TOMORROW.toISOString().split('T')[0],
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    items: [{ name: 'Sunflower', size: 'T20', quantity: 1 }],
    line_count: 1,
  },
  {
    id: 'fri-coquette',
    customer_name: 'Coquette',
    status: 'pending',
    source: 'erp',
    delivery_date: TOMORROW.toISOString().split('T')[0],
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    items: [{ name: 'Basil, Genovese', size: 'L', quantity: 2 }],
    line_count: 1,
  },
  {
    id: 'fri-nautilus',
    customer_name: 'Nautilus',
    status: 'pending',
    source: 'erp',
    delivery_date: TOMORROW.toISOString().split('T')[0],
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    items: [{ name: 'Shiso, Red', size: 'L', quantity: 2 }],
    line_count: 1,
  },
  {
    id: 'fri-woodshill',
    customer_name: 'Woods Hill Pier 4',
    status: 'pending',
    source: 'erp',
    delivery_date: TOMORROW.toISOString().split('T')[0],
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    items: [
      { name: 'Celery', size: 'L', quantity: 1 },
      { name: 'Arugula', size: 'L', quantity: 1 },
    ],
    line_count: 2,
  },
  {
    id: 'fri-theblock',
    customer_name: 'The Block',
    status: 'pending',
    source: 'erp',
    delivery_date: TOMORROW.toISOString().split('T')[0],
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    items: [
      { name: 'Arugula', size: 'S', quantity: 2 },
      { name: 'Cilantro', size: 'S', quantity: 2 },
      { name: 'Nasturtium', size: 'L', quantity: 1 },
    ],
    line_count: 3,
  },
  {
    id: 'fri-davios',
    customer_name: "Davio's Seaport",
    status: 'pending',
    source: 'erp',
    delivery_date: TOMORROW.toISOString().split('T')[0],
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    items: [{ name: "Davio's MIX", size: 'L', quantity: 4 }],
    line_count: 1,
  },
  {
    id: 'fri-serafina',
    customer_name: 'Serafina Seaport',
    status: 'pending',
    source: 'erp',
    delivery_date: TOMORROW.toISOString().split('T')[0],
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    items: [{ name: 'Basil, Genovese', size: 'T20', quantity: 2 }],
    line_count: 1,
  },
  {
    id: 'fri-row34',
    customer_name: 'Row 34',
    status: 'pending',
    source: 'erp',
    delivery_date: TOMORROW.toISOString().split('T')[0],
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    items: [
      { name: 'Basil, Genovese', size: 'L', quantity: 1 },
      { name: 'Radish Mix', size: 'L', quantity: 1 },
      { name: 'Lemon Balm', size: 'L', quantity: 1 },
      { name: 'Mustard, Wasabi', size: 'L', quantity: 1 },
    ],
    line_count: 4,
  },
  {
    id: 'fri-trade',
    customer_name: 'Trade',
    status: 'pending',
    source: 'erp',
    delivery_date: TOMORROW.toISOString().split('T')[0],
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    items: [
      { name: 'Basil, Thai', size: 'S', quantity: 2 },
      { name: 'Cilantro', size: 'L', quantity: 1 },
    ],
    line_count: 2,
  },
  {
    id: 'fri-oya',
    customer_name: 'O Ya',
    status: 'pending',
    source: 'erp',
    delivery_date: TOMORROW.toISOString().split('T')[0],
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    items: [
      { name: 'Basil, Thai', size: 'S', quantity: 1 },
      { name: 'Shiso, Red', size: 'L', quantity: 1 },
    ],
    line_count: 2,
  },
  {
    id: 'fri-baleia',
    customer_name: 'Baleia',
    status: 'pending',
    source: 'erp',
    delivery_date: TOMORROW.toISOString().split('T')[0],
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    items: [
      { name: 'Cilantro', size: 'L', quantity: 3 },
      { name: 'Basil, Thai', size: 'S', quantity: 3 },
    ],
    line_count: 2,
  },
  {
    id: 'fri-fuji',
    customer_name: 'Fuji at Ink Block',
    status: 'pending',
    source: 'erp',
    delivery_date: TOMORROW.toISOString().split('T')[0],
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    items: [
      { name: 'Mustard, Wasabi', size: 'L', quantity: 2 },
      { name: 'Radish, Sango', size: 'L', quantity: 1 },
    ],
    line_count: 2,
  },
  {
    id: 'fri-capri',
    customer_name: 'Capri Italian Steakhouse',
    status: 'pending',
    source: 'erp',
    delivery_date: TOMORROW.toISOString().split('T')[0],
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    items: [
      { name: 'Basil, Genovese', size: 'L', quantity: 2 },
      { name: 'Lemon Balm', size: 'S', quantity: 1 },
    ],
    line_count: 2,
  },
  {
    id: 'fri-311',
    customer_name: '311',
    status: 'pending',
    source: 'erp',
    delivery_date: TOMORROW.toISOString().split('T')[0],
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    items: [{ name: 'Mustard, Green Mizuna', size: 'S', quantity: 3 }],
    line_count: 1,
  },
  {
    id: 'fri-douzo',
    customer_name: 'Douzo',
    status: 'pending',
    source: 'erp',
    delivery_date: TOMORROW.toISOString().split('T')[0],
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    items: [
      { name: 'Rainbow MIX', size: 'L', quantity: 1 },
      { name: 'Radish, Kaiware', size: 'L', quantity: 3 },
      { name: 'Cilantro', size: 'S', quantity: 1 },
    ],
    line_count: 3,
  },
  {
    id: 'fri-srv',
    customer_name: 'SRV',
    status: 'pending',
    source: 'erp',
    delivery_date: TOMORROW.toISOString().split('T')[0],
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    items: [
      { name: 'Nasturtium', size: 'L', quantity: 1 },
      { name: 'Pea, Tendril', size: 'S', quantity: 1 },
      { name: 'Sorrel, Red Veined', size: 'L', quantity: 1 },
    ],
    line_count: 3,
  },
  {
    id: 'fri-zuma',
    customer_name: 'Zuma',
    status: 'pending',
    source: 'erp',
    delivery_date: TOMORROW.toISOString().split('T')[0],
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    items: [
      { name: 'Rainbow MIX', size: 'L', quantity: 5 },
      { name: 'Shiso, Red', size: 'L', quantity: 4 },
    ],
    line_count: 2,
  },
  {
    id: 'fri-nagomi',
    customer_name: 'Nagomi',
    status: 'pending',
    source: 'erp',
    delivery_date: TOMORROW.toISOString().split('T')[0],
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    items: [
      { name: 'Passion MIX', size: 'L', quantity: 1 },
      { name: 'Rainbow MIX', size: 'L', quantity: 2 },
    ],
    line_count: 2,
  },
  {
    id: 'fri-locofenway',
    customer_name: 'Loco Fenway',
    status: 'pending',
    source: 'erp',
    delivery_date: TOMORROW.toISOString().split('T')[0],
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    items: [
      { name: 'Cilantro', size: 'L', quantity: 2 },
      { name: 'Radish, Sango', size: 'L', quantity: 1 },
    ],
    line_count: 2,
  },
  {
    id: 'fri-asta',
    customer_name: 'Asta',
    status: 'pending',
    source: 'erp',
    delivery_date: TOMORROW.toISOString().split('T')[0],
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    items: [
      { name: 'Pea, Tendril', size: 'T20', quantity: 2 },
      { name: 'Shungiku', size: 'T20', quantity: 1 },
      { name: 'Borage', size: 'T20', quantity: 1 },
      { name: 'Nasturtium', size: 'T20', quantity: 1 },
    ],
    line_count: 4,
  },
  {
    id: 'fri-lapadrona',
    customer_name: 'La Padrona',
    status: 'pending',
    source: 'erp',
    delivery_date: TOMORROW.toISOString().split('T')[0],
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    items: [
      { name: 'Basil, Genovese', size: 'T20', quantity: 5 },
      { name: 'Shiso, Red', size: 'T20', quantity: 2 },
      { name: 'Tokyo Onion', size: 'T20', quantity: 3 },
      { name: 'Lemon Balm', size: 'T20', quantity: 1 },
      { name: 'Pea, Tendril', size: 'T20', quantity: 1 },
    ],
    line_count: 5,
  },
  {
    id: 'fri-banks',
    customer_name: 'The Banks Seafood',
    status: 'pending',
    source: 'erp',
    delivery_date: TOMORROW.toISOString().split('T')[0],
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    items: [
      { name: 'Pea, Tendril', size: 'T20', quantity: 2 },
      { name: 'Sorrel, Red Veined', size: 'S', quantity: 1 },
      { name: 'Cilantro', size: 'L', quantity: 2 },
    ],
    line_count: 3,
  },
  {
    id: 'fri-daviosarlington',
    customer_name: "Davio's Arlington",
    status: 'pending',
    source: 'erp',
    delivery_date: TOMORROW.toISOString().split('T')[0],
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    items: [{ name: 'Radish Mix', size: 'L', quantity: 5 }],
    line_count: 1,
  },
  {
    id: 'fri-cactus',
    customer_name: 'Cactus Club Cafe - Boston',
    status: 'pending',
    source: 'erp',
    delivery_date: TOMORROW.toISOString().split('T')[0],
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    items: [{ name: 'Sunflower', size: 'L', quantity: 3 }],
    line_count: 1,
  },
  {
    id: 'fri-bistro',
    customer_name: 'Bistro Du Midi',
    status: 'pending',
    source: 'erp',
    delivery_date: TOMORROW.toISOString().split('T')[0],
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    items: [
      { name: 'Cilantro', size: 'L', quantity: 1 },
      { name: 'Sunflower', size: 'L', quantity: 1 },
      { name: 'Nutrition MIX', size: 'L', quantity: 1 },
      { name: 'Basil, Genovese', size: 'S', quantity: 1 },
      { name: 'Nasturtium', size: 'S', quantity: 1 },
      { name: 'Anise Hyssop', size: 'S', quantity: 1 },
    ],
    line_count: 6,
  },
  {
    id: 'fri-1928',
    customer_name: '1928',
    status: 'pending',
    source: 'erp',
    delivery_date: TOMORROW.toISOString().split('T')[0],
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    items: [
      { name: 'Cilantro', size: 'S', quantity: 1 },
      { name: 'Cabbage', size: 'S', quantity: 1 },
      { name: 'Basil, Genovese', size: 'S', quantity: 1 },
      { name: 'Lemon Balm', size: 'S', quantity: 1 },
      { name: 'Shiso, Green', size: 'L', quantity: 1 },
    ],
    line_count: 5,
  },
  {
    id: 'fri-ruka',
    customer_name: 'Ruka',
    status: 'pending',
    source: 'erp',
    delivery_date: TOMORROW.toISOString().split('T')[0],
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    items: [
      { name: 'Basil, Thai', size: 'S', quantity: 3 },
      { name: 'Shiso, Red', size: 'S', quantity: 2 },
      { name: 'Cilantro', size: 'S', quantity: 5 },
      { name: 'Basil, Genovese', size: 'S', quantity: 6 },
    ],
    line_count: 4,
  },
  {
    id: 'fri-yvonnes',
    customer_name: "Yvonne's",
    status: 'pending',
    source: 'erp',
    delivery_date: TOMORROW.toISOString().split('T')[0],
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    items: [{ name: 'Lettuce, Crisphead', size: 'L', quantity: 2 }],
    line_count: 1,
  },
  {
    id: 'fri-mariel',
    customer_name: 'Mariel',
    status: 'pending',
    source: 'erp',
    delivery_date: TOMORROW.toISOString().split('T')[0],
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    items: [
      { name: 'Basil, Genovese', size: 'L', quantity: 4 },
      { name: 'Pea, Tendril', size: 'L', quantity: 1 },
      { name: 'Sorrel, Red Veined', size: 'S', quantity: 1 },
      { name: 'Basil, Thai', size: 'L', quantity: 4 },
    ],
    line_count: 4,
  },
  {
    id: 'fri-oceanaire',
    customer_name: 'The Oceanaire',
    status: 'pending',
    source: 'erp',
    delivery_date: TOMORROW.toISOString().split('T')[0],
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    items: [
      { name: 'Radish Mix', size: 'L', quantity: 1 },
      { name: 'Cilantro', size: 'S', quantity: 1 },
      { name: 'Mustard, Wasabi', size: 'S', quantity: 1 },
    ],
    line_count: 3,
  },
  {
    id: 'fri-mammamaria',
    customer_name: 'Mamma Maria',
    status: 'pending',
    source: 'erp',
    delivery_date: TOMORROW.toISOString().split('T')[0],
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    items: [
      { name: 'Basil, Genovese', size: 'L', quantity: 1 },
      { name: 'Sorrel, Red Veined', size: 'S', quantity: 3 },
      { name: 'Radish, Sango', size: 'S', quantity: 1 },
      { name: 'Lemon Balm', size: 'S', quantity: 1 },
    ],
    line_count: 4,
  },
  // === Feb 3 orders ===
  {
    id: 'feb3-capo',
    customer_name: 'Capo',
    status: 'pending',
    source: 'erp',
    delivery_date: FEB_3.toISOString().split('T')[0],
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    items: [{ name: 'Basil, Genovese', size: 'L', quantity: 4 }],
    line_count: 1,
  },
  {
    id: 'feb3-hunters',
    customer_name: 'Hunters',
    status: 'pending',
    source: 'erp',
    delivery_date: FEB_3.toISOString().split('T')[0],
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    items: [{ name: 'Pea, Tendril', size: 'L', quantity: 1 }],
    line_count: 1,
  },
  {
    id: 'feb3-fatbaby',
    customer_name: 'Fat Baby',
    status: 'pending',
    source: 'erp',
    delivery_date: FEB_3.toISOString().split('T')[0],
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    items: [
      { name: 'Cilantro', size: 'L', quantity: 2 },
      { name: 'Amaranth', size: 'L', quantity: 1 },
    ],
    line_count: 2,
  },
  {
    id: 'feb3-loco',
    customer_name: 'Loco',
    status: 'pending',
    source: 'erp',
    delivery_date: FEB_3.toISOString().split('T')[0],
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    items: [
      { name: 'Cilantro', size: 'L', quantity: 2 },
      { name: 'Radish, Sango', size: 'S', quantity: 1 },
    ],
    line_count: 2,
  },
  {
    id: 'feb3-petulas',
    customer_name: "Petula's",
    status: 'pending',
    source: 'erp',
    delivery_date: FEB_3.toISOString().split('T')[0],
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    items: [
      { name: 'Cilantro', size: 'L', quantity: 1 },
      { name: 'Basil, Genovese', size: 'L', quantity: 1 },
    ],
    line_count: 2,
  },
  {
    id: 'feb3-coquette',
    customer_name: 'Coquette',
    status: 'pending',
    source: 'erp',
    delivery_date: FEB_3.toISOString().split('T')[0],
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    items: [{ name: 'Basil, Genovese', size: 'L', quantity: 2 }],
    line_count: 1,
  },
  {
    id: 'feb3-oceanprime',
    customer_name: 'Ocean Prime',
    status: 'pending',
    source: 'erp',
    delivery_date: FEB_3.toISOString().split('T')[0],
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    items: [
      { name: 'Shiso, Green', size: 'L', quantity: 2 },
      { name: 'Radish, Kaiware', size: 'L', quantity: 4 },
      { name: 'Pea, Tendril', size: 'L', quantity: 3 },
    ],
    line_count: 3,
  },
  {
    id: 'feb3-nautilus',
    customer_name: 'Nautilus',
    status: 'pending',
    source: 'erp',
    delivery_date: FEB_3.toISOString().split('T')[0],
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    items: [{ name: 'Shiso, Red', size: 'L', quantity: 2 }],
    line_count: 1,
  },
  {
    id: 'feb3-theblock',
    customer_name: 'The Block',
    status: 'pending',
    source: 'erp',
    delivery_date: FEB_3.toISOString().split('T')[0],
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    items: [
      { name: 'Arugula', size: 'S', quantity: 2 },
      { name: 'Nasturtium', size: 'S', quantity: 1 },
      { name: 'Cilantro', size: 'S', quantity: 2 },
    ],
    line_count: 3,
  },
  {
    id: 'feb3-woodshill',
    customer_name: 'Woods Hill Pier 4',
    status: 'pending',
    source: 'erp',
    delivery_date: FEB_3.toISOString().split('T')[0],
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    items: [
      { name: 'Shiso, Red', size: 'S', quantity: 1 },
      { name: 'Arugula', size: 'L', quantity: 1 },
    ],
    line_count: 2,
  },
  {
    id: 'feb3-davios',
    customer_name: "Davio's Seaport",
    status: 'pending',
    source: 'erp',
    delivery_date: FEB_3.toISOString().split('T')[0],
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    items: [{ name: "Davio's MIX", size: 'L', quantity: 4 }],
    line_count: 1,
  },
  {
    id: 'feb3-serafina',
    customer_name: 'Serafina Seaport',
    status: 'pending',
    source: 'erp',
    delivery_date: FEB_3.toISOString().split('T')[0],
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    items: [{ name: 'Basil, Genovese', size: 'T20', quantity: 1 }],
    line_count: 1,
  },
  {
    id: 'feb3-row34',
    customer_name: 'Row 34',
    status: 'pending',
    source: 'erp',
    delivery_date: FEB_3.toISOString().split('T')[0],
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    items: [
      { name: 'Lemon Balm', size: 'L', quantity: 1 },
      { name: 'Basil, Genovese', size: 'L', quantity: 1 },
      { name: 'Radish Mix', size: 'L', quantity: 1 },
      { name: 'Mustard, Wasabi', size: 'L', quantity: 1 },
    ],
    line_count: 4,
  },
  {
    id: 'feb3-trade',
    customer_name: 'Trade',
    status: 'pending',
    source: 'erp',
    delivery_date: FEB_3.toISOString().split('T')[0],
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    items: [{ name: 'Lemon Balm', size: 'S', quantity: 3 }],
    line_count: 1,
  },
  {
    id: 'feb3-oya',
    customer_name: 'O Ya',
    status: 'pending',
    source: 'erp',
    delivery_date: FEB_3.toISOString().split('T')[0],
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    items: [
      { name: 'Shiso, Red', size: 'S', quantity: 1 },
      { name: 'Basil, Thai', size: 'S', quantity: 2 },
      { name: 'Cilantro', size: 'S', quantity: 1 },
      { name: 'Celery', size: 'S', quantity: 1 },
      { name: 'Lemon Balm', size: 'S', quantity: 1 },
    ],
    line_count: 5,
  },
  {
    id: 'feb3-baleia',
    customer_name: 'Baleia',
    status: 'pending',
    source: 'erp',
    delivery_date: FEB_3.toISOString().split('T')[0],
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    items: [
      { name: 'Cilantro', size: 'L', quantity: 2 },
      { name: 'Basil, Thai', size: 'S', quantity: 2 },
    ],
    line_count: 2,
  },
  {
    id: 'feb3-capri',
    customer_name: 'Capri Italian Steakhouse',
    status: 'pending',
    source: 'erp',
    delivery_date: FEB_3.toISOString().split('T')[0],
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    items: [
      { name: 'Basil, Genovese', size: 'L', quantity: 2 },
      { name: 'Lemon Balm', size: 'S', quantity: 1 },
    ],
    line_count: 2,
  },
  {
    id: 'feb3-311',
    customer_name: '311',
    status: 'pending',
    source: 'erp',
    delivery_date: FEB_3.toISOString().split('T')[0],
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    items: [{ name: 'Mustard, Green Mizuna', size: 'S', quantity: 3 }],
    line_count: 1,
  },
  {
    id: 'feb3-douzo',
    customer_name: 'Douzo',
    status: 'pending',
    source: 'erp',
    delivery_date: FEB_3.toISOString().split('T')[0],
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    items: [
      { name: 'Cilantro', size: 'S', quantity: 1 },
      { name: 'Rainbow MIX', size: 'L', quantity: 1 },
      { name: 'Radish, Kaiware', size: 'L', quantity: 3 },
    ],
    line_count: 3,
  },
  {
    id: 'feb3-gigi',
    customer_name: 'Gigi',
    status: 'pending',
    source: 'erp',
    delivery_date: FEB_3.toISOString().split('T')[0],
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    items: [{ name: 'Basil, Genovese', size: 'S', quantity: 3 }],
    line_count: 1,
  },
  {
    id: 'feb3-srv',
    customer_name: 'SRV',
    status: 'pending',
    source: 'erp',
    delivery_date: FEB_3.toISOString().split('T')[0],
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    items: [
      { name: 'Nasturtium', size: 'S', quantity: 1 },
      { name: 'Lemon Balm', size: 'S', quantity: 1 },
      { name: 'Beets, Bulls Blood', size: 'S', quantity: 1 },
      { name: 'Sorrel, Red Veined', size: 'S', quantity: 1 },
      { name: 'Pea, Tendril', size: 'L', quantity: 1 },
    ],
    line_count: 5,
  },
  {
    id: 'feb3-zuma',
    customer_name: 'Zuma',
    status: 'pending',
    source: 'erp',
    delivery_date: FEB_3.toISOString().split('T')[0],
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    items: [
      { name: 'Rainbow MIX', size: 'L', quantity: 3 },
      { name: 'Shiso, Red', size: 'L', quantity: 3 },
    ],
    line_count: 2,
  },
  {
    id: 'feb3-glasshouse',
    customer_name: 'Glass House',
    status: 'pending',
    source: 'erp',
    delivery_date: FEB_3.toISOString().split('T')[0],
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    items: [{ name: 'Nutrition MIX', size: 'L', quantity: 2 }],
    line_count: 1,
  },
  {
    id: 'feb3-catalyst',
    customer_name: 'Catalyst',
    status: 'pending',
    source: 'erp',
    delivery_date: FEB_3.toISOString().split('T')[0],
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    items: [
      { name: 'Lemon Balm', size: 'S', quantity: 1 },
      { name: 'Shiso, Red', size: 'S', quantity: 1 },
      { name: 'Basil, Genovese', size: 'L', quantity: 1 },
      { name: 'Rainbow MIX', size: 'L', quantity: 2 },
    ],
    line_count: 4,
  },
  {
    id: 'feb3-nagomi',
    customer_name: 'Nagomi',
    status: 'pending',
    source: 'erp',
    delivery_date: FEB_3.toISOString().split('T')[0],
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    items: [
      { name: 'Passion MIX', size: 'L', quantity: 1 },
      { name: 'Rainbow MIX', size: 'L', quantity: 1 },
    ],
    line_count: 2,
  },
  {
    id: 'feb3-locofenway',
    customer_name: 'Loco Fenway',
    status: 'pending',
    source: 'erp',
    delivery_date: FEB_3.toISOString().split('T')[0],
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    items: [
      { name: 'Cilantro', size: 'L', quantity: 2 },
      { name: 'Radish, Sango', size: 'L', quantity: 1 },
    ],
    line_count: 2,
  },
  {
    id: 'feb3-deuxave',
    customer_name: 'Deuxave',
    status: 'pending',
    source: 'erp',
    delivery_date: FEB_3.toISOString().split('T')[0],
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    items: [
      { name: 'Basil, Genovese', size: 'L', quantity: 1 },
      { name: 'Lemon Balm', size: 'S', quantity: 1 },
      { name: 'Shiso, Red', size: 'S', quantity: 1 },
      { name: 'Mustard, Wasabi', size: 'S', quantity: 1 },
      { name: 'Kale', size: 'S', quantity: 1 },
      { name: 'Radish Mix', size: 'L', quantity: 1 },
      { name: 'Sorrel, Red Veined', size: 'S', quantity: 1 },
    ],
    line_count: 7,
  },
  {
    id: 'feb3-uni',
    customer_name: 'Uni',
    status: 'pending',
    source: 'erp',
    delivery_date: FEB_3.toISOString().split('T')[0],
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    items: [
      { name: 'Shiso, Red', size: 'S', quantity: 2 },
      { name: 'Cilantro', size: 'S', quantity: 2 },
    ],
    line_count: 2,
  },
  {
    id: 'feb3-typhoon',
    customer_name: 'Typhoon',
    status: 'pending',
    source: 'erp',
    delivery_date: FEB_3.toISOString().split('T')[0],
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    items: [{ name: 'Radish, Kaiware', size: 'T20', quantity: 1 }],
    line_count: 1,
  },
  {
    id: 'feb3-porto',
    customer_name: 'Porto',
    status: 'pending',
    source: 'erp',
    delivery_date: FEB_3.toISOString().split('T')[0],
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    items: [{ name: 'Shiso, Red', size: 'T20', quantity: 1 }],
    line_count: 1,
  },
  {
    id: 'feb3-lapadrona',
    customer_name: 'La Padrona',
    status: 'pending',
    source: 'erp',
    delivery_date: FEB_3.toISOString().split('T')[0],
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    items: [
      { name: 'Basil, Genovese', size: 'T20', quantity: 4 },
      { name: 'Shiso, Red', size: 'T20', quantity: 3 },
      { name: 'Tokyo Onion', size: 'T20', quantity: 3 },
    ],
    line_count: 3,
  },
  {
    id: 'feb3-banks',
    customer_name: 'The Banks Seafood',
    status: 'pending',
    source: 'erp',
    delivery_date: FEB_3.toISOString().split('T')[0],
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    items: [
      { name: 'Cilantro', size: 'L', quantity: 1 },
      { name: 'Pea, Tendril', size: 'T20', quantity: 1 },
      { name: 'Sorrel, Red Veined', size: 'S', quantity: 1 },
    ],
    line_count: 3,
  },
  {
    id: 'feb3-daviosarlington',
    customer_name: "Davio's Arlington",
    status: 'pending',
    source: 'erp',
    delivery_date: FEB_3.toISOString().split('T')[0],
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    items: [{ name: 'Radish Mix', size: 'L', quantity: 5 }],
    line_count: 1,
  },
  {
    id: 'feb3-cactus',
    customer_name: 'Cactus Club Cafe - Boston',
    status: 'pending',
    source: 'erp',
    delivery_date: FEB_3.toISOString().split('T')[0],
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    items: [{ name: 'Sunflower', size: 'L', quantity: 3 }],
    line_count: 1,
  },
  {
    id: 'feb3-1928',
    customer_name: '1928',
    status: 'pending',
    source: 'erp',
    delivery_date: FEB_3.toISOString().split('T')[0],
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    items: [
      { name: 'Shiso, Green', size: 'L', quantity: 1 },
      { name: 'Lemon Balm', size: 'S', quantity: 1 },
      { name: 'Cabbage', size: 'S', quantity: 1 },
      { name: 'Basil, Genovese', size: 'S', quantity: 1 },
      { name: 'Shiso, Red', size: 'S', quantity: 1 },
      { name: 'Cilantro', size: 'S', quantity: 1 },
    ],
    line_count: 6,
  },
  {
    id: 'feb3-ruka',
    customer_name: 'Ruka',
    status: 'pending',
    source: 'erp',
    delivery_date: FEB_3.toISOString().split('T')[0],
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    items: [
      { name: 'Cilantro', size: 'S', quantity: 5 },
      { name: 'Basil, Thai', size: 'S', quantity: 2 },
      { name: 'Basil, Genovese', size: 'S', quantity: 5 },
      { name: 'Shiso, Red', size: 'S', quantity: 2 },
    ],
    line_count: 4,
  },
  {
    id: 'feb3-mariel',
    customer_name: 'Mariel',
    status: 'pending',
    source: 'erp',
    delivery_date: FEB_3.toISOString().split('T')[0],
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    items: [
      { name: 'Basil, Genovese', size: 'L', quantity: 4 },
      { name: 'Sorrel, Red Veined', size: 'S', quantity: 1 },
      { name: 'Pea, Tendril', size: 'L', quantity: 1 },
      { name: 'Basil, Thai', size: 'L', quantity: 3 },
    ],
    line_count: 4,
  },
  {
    id: 'feb3-oceanaire',
    customer_name: 'The Oceanaire',
    status: 'pending',
    source: 'erp',
    delivery_date: FEB_3.toISOString().split('T')[0],
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    items: [
      { name: 'Radish Mix', size: 'L', quantity: 1 },
      { name: 'Mustard, Wasabi', size: 'S', quantity: 1 },
    ],
    line_count: 2,
  },
  {
    id: 'feb3-mammamaria',
    customer_name: 'Mamma Maria',
    status: 'pending',
    source: 'erp',
    delivery_date: FEB_3.toISOString().split('T')[0],
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    items: [
      { name: 'Sorrel, Red Veined', size: 'S', quantity: 3 },
      { name: 'Basil, Genovese', size: 'L', quantity: 2 },
      { name: 'Radish, Sango', size: 'S', quantity: 1 },
      { name: 'Lemon Balm', size: 'S', quantity: 1 },
    ],
    line_count: 4,
  },
  // === Feb 4 (Wednesday) orders ===
  {
    id: 'feb4-kaia',
    customer_name: 'Kaia South End',
    status: 'pending',
    source: 'erp',
    delivery_date: FEB_4.toISOString().split('T')[0],
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    items: [
      { name: 'Nasturtium', size: 'S', quantity: 1 },
      { name: 'Basil, Genovese', size: 'L', quantity: 1 },
      { name: 'Shiso, Red', size: 'S', quantity: 1 },
    ],
    line_count: 3,
  },
  {
    id: 'feb4-shoreleave',
    customer_name: 'Shore Leave',
    status: 'pending',
    source: 'erp',
    delivery_date: FEB_4.toISOString().split('T')[0],
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    items: [
      { name: 'Shiso, Red', size: 'S', quantity: 1 },
      { name: 'Cilantro', size: 'L', quantity: 1 },
      { name: 'Celery', size: 'S', quantity: 1 },
      { name: 'Mustard, Wasabi', size: 'S', quantity: 1 },
    ],
    line_count: 4,
  },
  {
    id: 'feb4-zuma',
    customer_name: 'Zuma',
    status: 'pending',
    source: 'erp',
    delivery_date: FEB_4.toISOString().split('T')[0],
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    items: [
      { name: 'Rainbow MIX', size: 'L', quantity: 3 },
      { name: 'Shiso, Red', size: 'L', quantity: 3 },
    ],
    line_count: 2,
  },
  {
    id: 'feb4-dovetail',
    customer_name: 'Dovetail Charlestown',
    status: 'pending',
    source: 'erp',
    delivery_date: FEB_4.toISOString().split('T')[0],
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    items: [
      { name: 'Basil, Genovese', size: 'L', quantity: 1 },
      { name: 'Tokyo Onion', size: 'L', quantity: 1 },
    ],
    line_count: 2,
  },
  {
    id: 'feb4-brewersfork',
    customer_name: "Brewer's Fork",
    status: 'pending',
    source: 'erp',
    delivery_date: FEB_4.toISOString().split('T')[0],
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    items: [{ name: 'Cilantro', size: 'L', quantity: 1 }],
    line_count: 1,
  },
  {
    id: 'feb4-prima',
    customer_name: 'Prima',
    status: 'pending',
    source: 'erp',
    delivery_date: FEB_4.toISOString().split('T')[0],
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    items: [{ name: 'Basil, Genovese', size: 'L', quantity: 1 }],
    line_count: 1,
  },
  {
    id: 'feb4-cafesushi',
    customer_name: 'Cafe Sushi',
    status: 'pending',
    source: 'erp',
    delivery_date: FEB_4.toISOString().split('T')[0],
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    items: [{ name: 'Radish, Sango', size: 'T20', quantity: 1 }],
    line_count: 1,
  },
  {
    id: 'feb4-pammys',
    customer_name: "Pammy's",
    status: 'pending',
    source: 'erp',
    delivery_date: FEB_4.toISOString().split('T')[0],
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    items: [{ name: 'Lemon Balm', size: 'T20', quantity: 1 }],
    line_count: 1,
  },
  {
    id: 'feb4-harvest',
    customer_name: 'Harvest',
    status: 'pending',
    source: 'erp',
    delivery_date: FEB_4.toISOString().split('T')[0],
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    items: [{ name: 'Pea, Tendril', size: 'T20', quantity: 2 }],
    line_count: 1,
  },
  {
    id: 'feb4-nine',
    customer_name: 'Nine Restaurant',
    status: 'pending',
    source: 'erp',
    delivery_date: FEB_4.toISOString().split('T')[0],
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    items: [
      { name: 'Rainbow MIX', size: 'L', quantity: 1 },
      { name: 'Sorrel, Red Veined', size: 'S', quantity: 1 },
      { name: 'Mustard, Purple Mizuna', size: 'S', quantity: 1 },
      { name: 'Fennel, Bronze', size: 'T20', quantity: 1 },
    ],
    line_count: 4,
  },
  {
    id: 'feb4-thaiger',
    customer_name: 'Thaiger Den',
    status: 'pending',
    source: 'erp',
    delivery_date: FEB_4.toISOString().split('T')[0],
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    items: [
      { name: 'Sorrel, Red Veined', size: 'T20', quantity: 1 },
      { name: 'Tokyo Onion', size: 'T20', quantity: 1 },
      { name: 'Shiso, Green', size: 'T20', quantity: 1 },
    ],
    line_count: 3,
  },
];

const MOCK_PROPOSALS: Proposal[] = [
  // Change proposal for existing order (Bistro Du Midi - Friday)
  {
    id: 'prop-1',
    order_id: 'fri-bistro',
    action: 'assign',
    order_frequency: 'one-time',
    customer_name: 'Bistro Du Midi',
    delivery_date: TOMORROW.toISOString().split('T')[0],
    message_count: 1,
    channel: 'sms',
    created_at: new Date(Date.now() - 2 * 60 * 1000).toISOString(), // 2 min ago
    message_preview: 'Bistro 1/30\nHey Bennett can we remove the cilantro and sunflower for this Friday. Also like to change Anise to 2 larges and add a 2 large shiso green',
    message_full: 'Bistro 1/30\nHey Bennett can we remove the cilantro and sunflower for this Friday. Also like to change Anise to 2 larges and add a 2 large shiso green',
    lines: [
      { id: 'line-1', change_type: 'remove', item_name: 'Cilantro', size: 'Large', quantity: 1 },
      { id: 'line-2', change_type: 'remove', item_name: 'Sunflower', size: 'Large', quantity: 1 },
      { id: 'line-3', change_type: 'modify', item_name: 'Anise Hyssop', size: 'Large', quantity: 2, original_quantity: 1 },
      { id: 'line-4', change_type: 'add', item_name: 'Shiso, Green', size: 'Large', quantity: 2 },
    ],
    timeline: [
      {
        id: 'tl-1',
        type: 'event',
        timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        eventType: 'order_created',
      },
      {
        id: 'tl-2',
        type: 'communication',
        timestamp: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
        channel: 'sms',
        content: 'Bistro 1/30\nHey Bennett can we remove the cilantro and sunflower for this Friday. Also like to change Anise to 2 larges and add a 2 large shiso green',
        from: 'Bistro Du Midi',
      },
      {
        id: 'tl-3',
        type: 'event',
        timestamp: new Date(Date.now() - 1 * 60 * 1000).toISOString(),
        eventType: 'ai_analysis',
      },
    ]
  },
  // AI incorrectly matched to Ocean Prime (actually from Mamma Maria via chef@mammamia.com)
  {
    id: 'prop-2',
    order_id: 'fri-oceanaire',
    action: 'assign',
    order_frequency: 'one-time',
    customer_name: 'The Oceanaire',
    delivery_date: TOMORROW.toISOString().split('T')[0],
    message_count: 1,
    channel: 'email',
    created_at: new Date(Date.now() - 15 * 60 * 1000).toISOString(), // 15 min ago
    message_preview: 'Hey Bennett, could we modify our order for Sorrel to just 1 instead of 3? Just for this Friday\n\nThanks,\nMarco',
    message_full: 'Hey Bennett, could we modify our order for Sorrel to just 1 instead of 3? Just for this Friday\n\nThanks,\nMarco',
    message_html: '<p>Hey Bennett,</p><p>Could we modify our order for Sorrel to just 1 instead of 3? Just for this Friday.</p><p>Thanks,<br/>Marco</p><div style="color:#888;font-size:12px;margin-top:16px;border-top:1px solid #eee;padding-top:8px"><b>Marco Rossi</b> | Executive Chef<br/>The Oceanaire Restaurant<br/>Phone: (617) 555-0142</div>',
    sender: 'Marco <chef@mammamia.com>',
    subject: 'Modification 1/30',
    email_date: 'Thu, Jan 30, 2025 at 9:15 AM',
    lines: [
      { id: 'line-3', change_type: 'modify', item_name: 'Sorrel, Red Veined', size: 'Small', quantity: 1, original_quantity: 3 },
    ],
    timeline: [
      {
        id: 'tl-4',
        type: 'event',
        timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        eventType: 'order_created',
      },
      {
        id: 'tl-5',
        type: 'communication',
        timestamp: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
        channel: 'email',
        content: 'Hey Bennett, could we modify our order for Sorrel to just 1 instead of 3? Just for this Friday\n\nThanks,\nMarco',
        subject: 'Modification 1/30',
        from: 'Marco <chef@mammamia.com>',
      },
      {
        id: 'tl-7',
        type: 'event',
        timestamp: new Date(Date.now() - 14 * 60 * 1000).toISOString(),
        eventType: 'ai_analysis',
      },
    ]
  },
  // Recurring add proposal (Uni - Friday, new standing order)
  {
    id: 'prop-3',
    order_id: null,
    action: 'create',
    order_frequency: 'recurring',
    customer_name: 'Uni',
    delivery_date: TOMORROW.toISOString().split('T')[0],
    message_count: 1,
    channel: 'sms',
    created_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // 5 min ago
    message_preview: 'Uni 1/30\nHey guys can we add on a 2oz micro cilantro and a micro shiso 2pm for fridays?\nThis would be weekly',
    message_full: 'Uni 1/30\nHey guys can we add on a 2oz micro cilantro and a micro shiso 2pm for fridays?\nThis would be weekly',
    lines: [
      { id: 'line-6', change_type: 'add', item_name: 'Cilantro', size: 'Small', quantity: 1 },
      { id: 'line-7', change_type: 'add', item_name: 'Shiso, Green', size: 'Small', quantity: 1 },
    ],
    timeline: [
      {
        id: 'tl-8',
        type: 'communication',
        timestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
        channel: 'sms',
        content: ' add on a 2oz micro cilantro and a micro shiso 2pm for fridays?\nThis would be weekly',
        from: 'Uni',
      },
      {
        id: 'tl-9',
        type: 'event',
        timestamp: new Date(Date.now() - 4 * 60 * 1000).toISOString(),
        eventType: 'ai_analysis',
      },
    ]
  },
  // Undetermined action (Ruka - day after)
  {
    id: 'prop-4',
    order_id: null,
    action: 'undetermined',
    order_frequency: 'one-time',
    customer_name: 'Ruka',
    delivery_date: DAY_AFTER.toISOString().split('T')[0],
    message_count: 1,
    channel: 'email',
    created_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(), // 30 min ago
    message_preview: 'Order for Wednesday: 5 cilantro small, 2 thai basil small',
    message_full: 'Order for Wednesday: 5 cilantro small, 2 thai basil small',
    lines: [
      { id: 'line-8', change_type: 'add', item_name: 'Cilantro', size: 'Small', quantity: 5 },
      { id: 'line-9', change_type: 'add', item_name: 'Basil, Thai', size: 'Small', quantity: 2 },
    ],
    timeline: [
      {
        id: 'tl-10',
        type: 'communication',
        timestamp: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
        channel: 'email',
        content: 'Order for Wednesday: 5 cilantro small, 2 thai basil small',
        subject: 'Wednesday order',
        from: 'Ruka <chef@ruka.com>',
      },
      {
        id: 'tl-11',
        type: 'event',
        timestamp: new Date(Date.now() - 29 * 60 * 1000).toISOString(),
        eventType: 'ai_analysis',
      },
    ]
  },
  // AI determined: create new order (Desnuda - tomorrow)
  {
    id: 'prop-desnuda',
    order_id: null,
    action: 'create',
    order_frequency: 'one-time',
    customer_name: 'Desnuda',
    delivery_date: TOMORROW.toISOString().split('T')[0],
    message_count: 1,
    channel: 'sms',
    created_at: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    message_preview: 'Desnuda 1/30\n1 large cilantro\n1 large Tokyo\n1 large Thai basil',
    message_full: 'Desnuda 1/30\n1 large cilantro\n1 large Tokyo\n1 large Thai basil',
    lines: [
      { id: 'line-d1', change_type: 'add', item_name: 'Cilantro', size: 'Small', quantity: 2 },
      { id: 'line-d2', change_type: 'add', item_name: 'Tokyo Onion', size: 'Large', quantity: 1 },
      { id: 'line-d3', change_type: 'add', item_name: 'Basil, Thai', size: 'Large', quantity: 1 },
      { id: 'line-d4', change_type: 'add', item_name: 'Anise Hyssop', size: 'Small', quantity: 2 },
    ],
    timeline: [
      {
        id: 'tl-d1',
        type: 'communication',
        timestamp: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
        channel: 'sms',
        content: 'Desnuda 1/30\n1 large cilantro\n1 large Tokyo\n1 large Thai basil',
        from: 'Desnuda',
      },
      {
        id: 'tl-d2',
        type: 'event',
        timestamp: new Date(Date.now() - 44 * 60 * 1000).toISOString(),
        eventType: 'ai_analysis',
      },
    ]
  },
];

// ============================================================================
// SHARED UTILITIES
// ============================================================================

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

// Searchable item dropdown for adding/editing items
interface ItemSearchDropdownProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

const ItemSearchDropdown: React.FC<ItemSearchDropdownProps> = ({ value, onChange, className }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSearch(value);
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filtered = CATALOG_ITEMS.filter(item =>
    item.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="relative" ref={dropdownRef}>
      <input
        ref={inputRef}
        type="text"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setIsOpen(true);
          onChange(e.target.value);
        }}
        onFocus={() => setIsOpen(true)}
        placeholder="Search items..."
        className={className || "w-full px-2 py-0.5 text-sm border border-green-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-green-500"}
      />
      {isOpen && filtered.length > 0 && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {filtered.map(item => (
            <button
              key={item}
              type="button"
              className={`w-full text-left px-3 py-1.5 text-sm hover:bg-green-50 transition-colors ${
                item === value ? 'bg-green-50 text-green-700 font-medium' : 'text-gray-700'
              }`}
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(item);
                setSearch(item);
                setIsOpen(false);
              }}
            >
              {item}
            </button>
          ))}
        </div>
      )}
      {isOpen && filtered.length === 0 && search && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-sm text-gray-400">
          No items found
        </div>
      )}
    </div>
  );
};

// Searchable customer dropdown for selecting customers
interface CustomerSearchDropdownProps {
  value: string;
  onChange: (value: string) => void;
  customers: Customer[];
  className?: string;
}

const CustomerSearchDropdown: React.FC<CustomerSearchDropdownProps> = ({ value, onChange, customers, className }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSearch(value);
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filtered = customers.filter(customer =>
    customer.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="relative" ref={dropdownRef}>
      <input
        ref={inputRef}
        type="text"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setIsOpen(true);
          onChange(e.target.value);
        }}
        onFocus={() => setIsOpen(true)}
        placeholder="Search customers..."
        className={className || "w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"}
      />
      {isOpen && filtered.length > 0 && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {filtered.map(customer => (
            <button
              key={customer.id}
              type="button"
              className={`w-full text-left px-3 py-1.5 text-sm hover:bg-blue-50 transition-colors ${
                customer.name === value ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'
              }`}
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(customer.name);
                setSearch(customer.name);
                setIsOpen(false);
              }}
            >
              {customer.name}
            </button>
          ))}
        </div>
      )}
      {isOpen && filtered.length === 0 && search && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-sm text-gray-400">
          No customers found
        </div>
      )}
    </div>
  );
};

// Inline compact diff view - integrated into the items table with annotations
interface InlineCompactDiffProps {
  order: Order;
  proposal: Proposal;
  onApply: (id: string, lines: ProposalLine[]) => void;
  onDismiss: (id: string) => void;
  onOpenCreateNewOrderModal: (id: string) => void;
  onOpenAssignToOrderModal: (id: string) => void;
  isDismissing?: boolean;
}

const InlineCompactDiff: React.FC<InlineCompactDiffProps> = ({ order, proposal, onApply, onDismiss, onOpenCreateNewOrderModal, onOpenAssignToOrderModal, isDismissing }) => {
  const [editableLines, setEditableLines] = useState<ProposalLine[]>(proposal.lines);
  const [showAllMessages, setShowAllMessages] = useState(false);

  // Get all communication messages from timeline, chronologically
  const allMessages = useMemo(() => {
    return proposal.timeline
      .filter(t => t.type === 'communication')
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }, [proposal.timeline]);

  const removeEditableLine = (lineId: string) => {
    setEditableLines(prev => prev.filter(l => l.id !== lineId));
  };

  const updateEditableLine = (lineId: string, updates: Partial<ProposalLine>) => {
    setEditableLines(prev => prev.map(l => l.id === lineId ? { ...l, ...updates } : l));
  };

  const addRemovalForItem = (item: OrderItem) => {
    const id = `user-remove-${Date.now()}`;
    setEditableLines(prev => [...prev, {
      id,
      change_type: 'remove' as const,
      order_line_id: item.order_line_id,
      item_name: item.name,
      size: item.size,
      quantity: item.quantity,
    }]);
  };

  const addModificationForItem = (item: OrderItem) => {
    const id = `user-modify-${Date.now()}`;
    setEditableLines(prev => [...prev, {
      id,
      change_type: 'modify' as const,
      order_line_id: item.order_line_id,
      item_name: item.name,
      size: item.size,
      quantity: item.quantity,
      original_quantity: item.quantity,
      original_size: item.size,
    }]);
  };

  const addNewItemLine = () => {
    const id = `user-add-${Date.now()}`;
    setEditableLines(prev => [...prev, {
      id,
      change_type: 'add' as const,
      item_name: '',
      size: 'Small',
      quantity: 1,
    }]);
  };

  return (
    <div>
      {/* 1. Message header */}
      <div className="mb-3">
        <div className="flex items-center gap-2 mb-1.5 text-sm text-gray-500">
          {proposal.channel === 'email' ? (
            <Mail className="w-4 h-4 text-gray-400" />
          ) : (
            <MessageSquare className="w-4 h-4 text-gray-400" />
          )}
          <span className="font-medium text-gray-700">
            {proposal.channel === 'sms' ? 'SMS' : 'Email'}
          </span>
          <span>&middot;</span>
          <span>{formatTime(proposal.created_at)}</span>
          {proposal.message_count > 1 && (
            <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">
              {proposal.message_count} messages
            </span>
          )}
        </div>

        {/* Quoted message */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 italic whitespace-pre-line">
          {proposal.message_preview}
        </div>

        {/* Multi-message expansion */}
        {proposal.message_count > 1 && (
          <>
            <button
              onClick={() => setShowAllMessages(!showAllMessages)}
              className="text-xs text-blue-600 hover:text-blue-800 mt-1.5"
            >
              {showAllMessages ? 'Hide messages' : `View all ${proposal.message_count} messages`}
            </button>
            {showAllMessages && (
              <div className="mt-2 space-y-2">
                {allMessages.map(msg => (
                  <div key={msg.id} className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm">
                    <div className="flex items-center gap-2 mb-1 text-xs text-gray-400">
                      {msg.channel === 'email' ? (
                        <Mail className="w-3 h-3" />
                      ) : (
                        <MessageSquare className="w-3 h-3" />
                      )}
                      <span>{msg.from}</span>
                      <span>&middot;</span>
                      <span>{formatTime(msg.timestamp)}</span>
                    </div>
                    {msg.subject && (
                      <p className="text-xs font-medium text-gray-800 mb-0.5">{msg.subject}</p>
                    )}
                    <p className="text-gray-700 italic whitespace-pre-line">{msg.content}</p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* 2. AI match label + reclassify links */}
      <div className="flex items-center justify-between mb-3 text-sm">
        <span className="text-gray-400">AI match</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onOpenCreateNewOrderModal(proposal.id)}
            className="px-3 py-1 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-full hover:bg-blue-100 transition-colors"
          >
            Create new order instead
          </button>
          <button
            onClick={() => onOpenAssignToOrderModal(proposal.id)}
            className="px-3 py-1 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-full hover:bg-blue-100 transition-colors"
          >
            Assign to different order
          </button>
        </div>
      </div>

      {/* 3. Annotated items table */}
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-gray-400 uppercase tracking-wider">
            <th className="pb-2 font-medium">Item</th>
            <th className="pb-2 font-medium w-20 text-center">Size</th>
            <th className="pb-2 font-medium w-16 text-center">Qty</th>
            <th className="pb-2 w-8"></th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((item, idx) => {
            const modification = editableLines.find(l => l.change_type === 'modify' && (l.order_line_id ? l.order_line_id === item.order_line_id : l.item_name === item.name && l.original_size === item.size));
            const removal = editableLines.find(l => l.change_type === 'remove' && (l.order_line_id ? l.order_line_id === item.order_line_id : l.item_name === item.name && l.size === item.size));

            return (
              <React.Fragment key={idx}>
                {/* Original item row */}
                <tr
                  className={`${removal || modification ? 'opacity-50' : 'group hover:bg-gray-50 cursor-pointer'}`}
                  onDoubleClick={() => {
                    if (!removal && !modification) addModificationForItem(item);
                  }}
                  title={!removal && !modification ? 'Double-click to modify' : undefined}
                >
                  <td className={`py-1.5 text-gray-700 ${removal || modification ? 'line-through' : ''}`}>{item.name}</td>
                  <td className={`py-1.5 text-center text-gray-500 ${removal || modification ? 'line-through' : ''}`}>{item.size}</td>
                  <td className={`py-1.5 text-center text-gray-700 font-medium ${removal || modification ? 'line-through' : ''}`}>{item.quantity}</td>
                  <td className="py-1.5">
                    {!removal && !modification && (
                      <button
                        onClick={() => addRemovalForItem(item)}
                        className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Remove item"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
                {/* Modify annotation sub-row — full proposed row, editable */}
                {modification && (
                  <tr className="bg-blue-50">
                    <td className="py-1.5 pl-5 text-blue-700 text-sm">
                      <span className="text-blue-400 mr-1">&#8627;</span>
                      {modification.item_name}
                    </td>
                    <td className="py-1.5 text-center">
                      <select
                        value={modification.size}
                        onChange={(e) => updateEditableLine(modification.id, { size: e.target.value })}
                        className="px-1 py-0.5 text-xs border border-blue-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                      >
                        {getVariantsForLine(modification).map(v => (
                          <option key={v.code} value={v.code}>{v.code}</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-1.5 text-center">
                      <input
                        type="number"
                        min="1"
                        value={modification.quantity}
                        onChange={(e) => updateEditableLine(modification.id, { quantity: parseInt(e.target.value) || 1 })}
                        className="w-12 px-1 py-0.5 text-sm text-center border border-blue-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 font-semibold"
                      />
                    </td>
                    <td className="py-1.5">
                      <button onClick={() => removeEditableLine(modification.id)} className="text-gray-400 hover:text-red-500">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                )}
                {/* Remove annotation sub-row */}
                {removal && (
                  <tr>
                    <td colSpan={3} className="pb-1.5">
                      <div className="ml-4 px-2 py-1 bg-red-50 border border-red-200 rounded text-xs text-red-600 inline-flex items-center gap-2">
                        <span>&#8627; remove</span>
                      </div>
                    </td>
                    <td className="pb-1.5">
                      <button onClick={() => removeEditableLine(removal.id)} className="text-gray-400 hover:text-red-500">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}

          {/* Separator before add rows */}
          {editableLines.filter(l => l.change_type === 'add').length > 0 && (
            <tr>
              <td colSpan={4} className="py-1">
                <div className="border-t border-dashed border-gray-300"></div>
              </td>
            </tr>
          )}

          {/* Add rows - editable */}
          {editableLines
            .filter(l => l.change_type === 'add')
            .map(line => (
              <tr key={line.id} className="bg-green-50">
                <td className="py-1.5 pl-1">
                  <div className="flex items-center gap-1">
                    <span className="text-green-600 text-xs font-bold">+</span>
                    <ItemSearchDropdown
                      value={line.item_name}
                      onChange={(val) => updateEditableLine(line.id, { item_name: val })}
                    />
                  </div>
                </td>
                <td className="py-1.5 text-center">
                  <select
                    value={line.size}
                    onChange={(e) => updateEditableLine(line.id, { size: e.target.value })}
                    className="px-1 py-0.5 text-xs border border-green-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-green-500"
                  >
                    {getVariantsForLine(line).map(v => (
                      <option key={v.code} value={v.code}>{v.code}</option>
                    ))}
                  </select>
                </td>
                <td className="py-1.5 text-center">
                  <input
                    type="number"
                    min="1"
                    value={line.quantity}
                    onChange={(e) => updateEditableLine(line.id, { quantity: parseInt(e.target.value) || 1 })}
                    className="w-12 px-1 py-0.5 text-sm text-center border border-green-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-green-500"
                  />
                </td>
                <td className="py-1.5">
                  <button onClick={() => removeEditableLine(line.id)} className="text-gray-400 hover:text-red-500">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}

          {/* Add new item button row */}
          <tr>
            <td colSpan={4} className="pt-1">
              <button
                onClick={addNewItemLine}
                className="flex items-center gap-1 text-xs text-green-600 hover:text-green-700 hover:bg-green-50 px-2 py-1 rounded transition-colors"
              >
                <span className="text-sm font-bold">+</span> Add item
              </button>
            </td>
          </tr>
        </tbody>
      </table>

      {/* 4. Actions */}
      <div className="flex items-center gap-2 mt-3">
        <button
          onClick={() => onApply(proposal.id, editableLines)}
          className="flex items-center gap-1 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors"
        >
          <Check className="w-4 h-4" />
          Apply All
        </button>
        <button
          onClick={() => onDismiss(proposal.id)}
          disabled={isDismissing}
          className="flex items-center gap-1 px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
        >
          {isDismissing ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Dismissing...</>
          ) : (
            <><X className="w-4 h-4" /> Dismiss</>
          )}
        </button>
      </div>
    </div>
  );
};

interface NewOrderProposalCardProps {
  proposal: Proposal;
  customers: Customer[];
  onCreateOrder: (id: string, lines: ProposalLine[], customerName?: string, deliveryDate?: string) => Promise<void>;
  onDismiss: (id: string) => void;
  onOpenCreateNewOrderModal: (id: string) => void;
  onOpenAssignToOrderModal: (id: string) => void;
  isDismissing?: boolean;
}

const NewOrderProposalCard: React.FC<NewOrderProposalCardProps> = ({ proposal, customers, onCreateOrder, onDismiss, onOpenCreateNewOrderModal, onOpenAssignToOrderModal, isDismissing }) => {
  const [editableLines, setEditableLines] = useState<ProposalLine[]>(proposal.lines);
  const [customerName, setCustomerName] = useState(proposal.customer_name);
  const [deliveryDate, setDeliveryDate] = useState(() => {
    // Default to tomorrow if no date parsed
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  });
  const [showAllMessages, setShowAllMessages] = useState(false);

  const allMessages = useMemo(() => {
    return proposal.timeline
      .filter(t => t.type === 'communication')
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }, [proposal.timeline]);

  const removeEditableLine = (lineId: string) => {
    setEditableLines(prev => prev.filter(l => l.id !== lineId));
  };

  const updateEditableLine = (lineId: string, updates: Partial<ProposalLine>) => {
    setEditableLines(prev => prev.map(l => l.id === lineId ? { ...l, ...updates } : l));
  };

  const addNewItemLine = () => {
    const id = `user-add-${Date.now()}`;
    setEditableLines(prev => [...prev, {
      id,
      change_type: 'add' as const,
      item_name: '',
      size: 'Small',
      quantity: 1,
    }]);
  };

  return (
    <div className="rounded-lg border border-amber-200 bg-white p-4">
      {/* 1. Message header */}
      <div className="mb-3">
        <div className="flex items-center gap-2 mb-1.5 text-sm text-gray-500">
          {proposal.channel === 'email' ? (
            <Mail className="w-4 h-4 text-gray-400" />
          ) : (
            <MessageSquare className="w-4 h-4 text-gray-400" />
          )}
          <span className="font-medium text-gray-700">
            {proposal.channel === 'sms' ? 'SMS' : 'Email'}
          </span>
          <span>&middot;</span>
          <span>{formatTime(proposal.created_at)}</span>
          {proposal.message_count > 1 && (
            <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">
              {proposal.message_count} messages
            </span>
          )}
        </div>

        {/* Quoted message */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 italic whitespace-pre-line">
          {proposal.message_preview}
        </div>

        {/* Multi-message expansion */}
        {proposal.message_count > 1 && (
          <>
            <button
              onClick={() => setShowAllMessages(!showAllMessages)}
              className="text-xs text-blue-600 hover:text-blue-800 mt-1.5"
            >
              {showAllMessages ? 'Hide messages' : `View all ${proposal.message_count} messages`}
            </button>
            {showAllMessages && (
              <div className="mt-2 space-y-2">
                {allMessages.map(msg => (
                  <div key={msg.id} className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm">
                    <div className="flex items-center gap-2 mb-1 text-xs text-gray-400">
                      {msg.channel === 'email' ? (
                        <Mail className="w-3 h-3" />
                      ) : (
                        <MessageSquare className="w-3 h-3" />
                      )}
                      <span>{msg.from}</span>
                      <span>&middot;</span>
                      <span>{formatTime(msg.timestamp)}</span>
                    </div>
                    {msg.subject && (
                      <p className="text-xs font-medium text-gray-800 mb-0.5">{msg.subject}</p>
                    )}
                    <p className="text-gray-700 italic whitespace-pre-line">{msg.content}</p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* 2. New order label + action pills */}
      <div className="flex items-center justify-between mb-3 text-sm">
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-semibold rounded-full">New order</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onOpenAssignToOrderModal(proposal.id)}
            className="px-3 py-1 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-full hover:bg-blue-100 transition-colors"
          >
            Assign to existing order instead
          </button>
        </div>
      </div>

      {/* 3. Customer & delivery date fields */}
      <div className="flex items-center gap-4 mb-3">
        <div className="flex-1">
          <label className="block text-xs text-gray-400 uppercase tracking-wider mb-1">Customer</label>
          <CustomerSearchDropdown
            value={customerName}
            onChange={setCustomerName}
            customers={customers}
          />
        </div>
        <div className="w-44">
          <label className="block text-xs text-gray-400 uppercase tracking-wider mb-1">Delivery date</label>
          <input
            type="date"
            value={deliveryDate}
            onChange={(e) => setDeliveryDate(e.target.value)}
            className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      </div>

      {/* 4. Items table — all editable add rows */}
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-gray-400 uppercase tracking-wider">
            <th className="pb-2 font-medium">Item</th>
            <th className="pb-2 font-medium w-20 text-center">Size</th>
            <th className="pb-2 font-medium w-16 text-center">Qty</th>
            <th className="pb-2 w-8"></th>
          </tr>
        </thead>
        <tbody>
          {editableLines.map(line => (
            <tr key={line.id} className="bg-green-50">
              <td className="py-1.5 pl-1">
                <div className="flex items-center gap-1">
                  <span className="text-green-600 text-xs font-bold">+</span>
                  <ItemSearchDropdown
                    value={line.item_name}
                    onChange={(val) => updateEditableLine(line.id, { item_name: val })}
                  />
                </div>
              </td>
              <td className="py-1.5 text-center">
                <select
                  value={line.size}
                  onChange={(e) => updateEditableLine(line.id, { size: e.target.value })}
                  className="px-1 py-0.5 text-xs border border-green-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-green-500"
                >
                  {getVariantsForLine(line).map(v => (
                    <option key={v.code} value={v.code}>{v.code}</option>
                  ))}
                </select>
              </td>
              <td className="py-1.5 text-center">
                <input
                  type="number"
                  min="1"
                  value={line.quantity}
                  onChange={(e) => updateEditableLine(line.id, { quantity: parseInt(e.target.value) || 1 })}
                  className="w-12 px-1 py-0.5 text-sm text-center border border-green-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-green-500"
                />
              </td>
              <td className="py-1.5">
                <button onClick={() => removeEditableLine(line.id)} className="text-gray-400 hover:text-red-500">
                  <X className="w-3.5 h-3.5" />
                </button>
              </td>
            </tr>
          ))}

          {/* Add new item button row */}
          <tr>
            <td colSpan={4} className="pt-1">
              <button
                onClick={addNewItemLine}
                className="flex items-center gap-1 text-xs text-green-600 hover:text-green-700 hover:bg-green-50 px-2 py-1 rounded transition-colors"
              >
                <span className="text-sm font-bold">+</span> Add item
              </button>
            </td>
          </tr>
        </tbody>
      </table>

      {/* 5. Actions */}
      <div className="flex items-center gap-2 mt-3">
        <button
          onClick={() => onCreateOrder(proposal.id, editableLines)}
          className="flex items-center gap-1 px-4 py-2 bg-amber-500 text-white text-sm font-medium rounded-lg hover:bg-amber-600 transition-colors"
        >
          <Check className="w-4 h-4" />
          Create Order
        </button>
        <button
          onClick={() => onDismiss(proposal.id)}
          disabled={isDismissing}
          className="flex items-center gap-1 px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
        >
          {isDismissing ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Dismissing...</>
          ) : (
            <><X className="w-4 h-4" /> Dismiss</>
          )}
        </button>
      </div>
    </div>
  );
};

// ============================================================================
// MODALS
// ============================================================================

interface CreateNewOrderModalProps {
  proposal: Proposal;
  customers: Customer[];
  onCreateOrder: (id: string, lines: ProposalLine[], customerName?: string, deliveryDate?: string) => Promise<void>;
  onClose: () => void;
}

const CreateNewOrderModal: React.FC<CreateNewOrderModalProps> = ({ proposal, customers, onCreateOrder, onClose }) => {
  const [editableLines, setEditableLines] = useState<ProposalLine[]>(proposal.lines);
  const [customerName, setCustomerName] = useState(proposal.customer_name);
  const [deliveryDate, setDeliveryDate] = useState(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  });
  const [showAllMessages, setShowAllMessages] = useState(false);

  const allMessages = useMemo(() => {
    return proposal.timeline
      .filter(t => t.type === 'communication')
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }, [proposal.timeline]);

  const removeEditableLine = (lineId: string) => {
    setEditableLines(prev => prev.filter(l => l.id !== lineId));
  };

  const updateEditableLine = (lineId: string, updates: Partial<ProposalLine>) => {
    setEditableLines(prev => prev.map(l => l.id === lineId ? { ...l, ...updates } : l));
  };

  const addNewItemLine = () => {
    const id = `user-add-${Date.now()}`;
    setEditableLines(prev => [...prev, {
      id,
      change_type: 'add' as const,
      item_name: '',
      size: 'Small',
      quantity: 1,
    }]);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Create New Order</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto px-6 py-4 space-y-4">
          {/* Message header */}
          <div>
            <div className="flex items-center gap-2 mb-1.5 text-sm text-gray-500">
              {proposal.channel === 'email' ? (
                <Mail className="w-4 h-4 text-gray-400" />
              ) : (
                <MessageSquare className="w-4 h-4 text-gray-400" />
              )}
              <span className="font-medium text-gray-700">
                {proposal.channel === 'sms' ? 'SMS' : 'Email'}
              </span>
              <span>&middot;</span>
              <span>{formatTime(proposal.created_at)}</span>
              {proposal.message_count > 1 && (
                <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">
                  {proposal.message_count} messages
                </span>
              )}
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 italic">
              {proposal.message_preview}
            </div>
            {proposal.message_count > 1 && (
              <>
                <button
                  onClick={() => setShowAllMessages(!showAllMessages)}
                  className="text-xs text-blue-600 hover:text-blue-800 mt-1.5"
                >
                  {showAllMessages ? 'Hide messages' : `View all ${proposal.message_count} messages`}
                </button>
                {showAllMessages && (
                  <div className="mt-2 space-y-2">
                    {allMessages.map(msg => (
                      <div key={msg.id} className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm">
                        <div className="flex items-center gap-2 mb-1 text-xs text-gray-400">
                          {msg.channel === 'email' ? <Mail className="w-3 h-3" /> : <MessageSquare className="w-3 h-3" />}
                          <span>{msg.from}</span>
                          <span>&middot;</span>
                          <span>{formatTime(msg.timestamp)}</span>
                        </div>
                        {msg.subject && <p className="text-xs font-medium text-gray-800 mb-0.5">{msg.subject}</p>}
                        <p className="text-gray-700 italic whitespace-pre-line">{msg.content}</p>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Customer & delivery date fields */}
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <label className="block text-xs text-gray-400 uppercase tracking-wider mb-1">Customer</label>
              <CustomerSearchDropdown
                value={customerName}
                onChange={setCustomerName}
                customers={customers}
              />
            </div>
            <div className="w-44">
              <label className="block text-xs text-gray-400 uppercase tracking-wider mb-1">Delivery date</label>
              <input
                type="date"
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          {/* Items table */}
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-400 uppercase tracking-wider">
                <th className="pb-2 font-medium">Item</th>
                <th className="pb-2 font-medium w-20 text-center">Size</th>
                <th className="pb-2 font-medium w-16 text-center">Qty</th>
                <th className="pb-2 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {editableLines.map(line => (
                <tr key={line.id} className="bg-green-50">
                  <td className="py-1.5 pl-1">
                    <div className="flex items-center gap-1">
                      <span className="text-green-600 text-xs font-bold">+</span>
                      <ItemSearchDropdown
                        value={line.item_name}
                        onChange={(val) => updateEditableLine(line.id, { item_name: val })}
                      />
                    </div>
                  </td>
                  <td className="py-1.5 text-center">
                    <select
                      value={line.size}
                      onChange={(e) => updateEditableLine(line.id, { size: e.target.value })}
                      className="px-1 py-0.5 text-xs border border-green-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-green-500"
                    >
                      {getVariantsForLine(line).map(v => (
                        <option key={v.code} value={v.code}>{v.code}</option>
                      ))}
                    </select>
                  </td>
                  <td className="py-1.5 text-center">
                    <input
                      type="number"
                      min="1"
                      value={line.quantity}
                      onChange={(e) => updateEditableLine(line.id, { quantity: parseInt(e.target.value) || 1 })}
                      className="w-12 px-1 py-0.5 text-sm text-center border border-green-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-green-500"
                    />
                  </td>
                  <td className="py-1.5">
                    <button onClick={() => removeEditableLine(line.id)} className="text-gray-400 hover:text-red-500">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
              <tr>
                <td colSpan={4} className="pt-1">
                  <button
                    onClick={addNewItemLine}
                    className="flex items-center gap-1 text-xs text-green-600 hover:text-green-700 hover:bg-green-50 px-2 py-1 rounded transition-colors"
                  >
                    <span className="text-sm font-bold">+</span> Add item
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 px-6 py-4 border-t border-gray-200">
          <button
            onClick={() => onCreateOrder(proposal.id, editableLines)}
            className="flex items-center gap-1 px-4 py-2 bg-amber-500 text-white text-sm font-medium rounded-lg hover:bg-amber-600 transition-colors"
          >
            <Check className="w-4 h-4" />
            Create Order
          </button>
          <button
            onClick={onClose}
            className="flex items-center gap-1 px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

interface AssignToOrderModalProps {
  proposal: Proposal;
  sourceOrderId: string | null;
  allOrders: Order[];
  onClose: () => void;
  onRefresh: () => Promise<void>;
}

const AssignToOrderModal: React.FC<AssignToOrderModalProps> = ({ proposal, sourceOrderId, allOrders, onClose, onRefresh }) => {
  const [step, setStep] = useState<'pick' | 'preview'>('pick');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [editableLines, setEditableLines] = useState<ProposalLine[]>(proposal.lines);
  const [newProposalId, setNewProposalId] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState(false);

  const filteredOrders = useMemo(() => {
    return allOrders
      .filter(o => o.id !== sourceOrderId)
      .filter(o => !searchQuery || o.customer_name.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [allOrders, sourceOrderId, searchQuery]);

  const handlePickOrder = async (order: Order) => {
    if (!proposal.intake_event_id) {
      console.error('Missing intake_event_id');
      return;
    }

    setSelectedOrder(order);
    setStep('preview');
    setIsAnalyzing(true);

    try {
      const session = await supabaseClient.auth.getSession();
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-proposal`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.data.session?.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            intake_event_id: proposal.intake_event_id,
            target_order_id: order.id
          })
        }
      );

      const result = await response.json();

      if (result.success && result.proposal) {
        setNewProposalId(result.proposal_id);
        // Transform lines to match our ProposalLine format
        const lines: ProposalLine[] = result.proposal.lines.map((line: any) => ({
          id: line.id,
          change_type: line.change_type,
          item_name: line.item_name,
          size: line.size || line.proposed_values?.variant_code || '',
          quantity: line.quantity || line.proposed_values?.quantity || 0,
          order_line_id: line.order_line_id,
          original_quantity: line.original_quantity || line.proposed_values?.original_quantity,
          original_size: line.original_size || line.proposed_values?.original_variant_code,
        }));
        setEditableLines(lines);
      } else {
        console.error('Failed to create proposal:', result.error);
        // Fallback to original lines
        setEditableLines(proposal.lines);
      }
    } catch (error) {
      console.error('Error creating proposal:', error);
      setEditableLines(proposal.lines);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleApplyChanges = async () => {
    if (!newProposalId || !selectedOrder) return;

    setIsApplying(true);
    try {
      // Accept new proposal
      await (supabaseClient as any)
        .from('order_change_proposals')
        .update({ status: 'accepted', reviewed_at: new Date().toISOString() })
        .eq('id', newProposalId);

      // Reject old proposal
      await (supabaseClient as any)
        .from('order_change_proposals')
        .update({ status: 'rejected', reviewed_at: new Date().toISOString() })
        .eq('id', proposal.id);

      // Apply the changes to the order (add/modify/remove lines)
      for (const line of editableLines) {
        if (line.change_type === 'add') {
          await (supabaseClient as any).from('order_lines').insert({
            order_id: selectedOrder.id,
            product_name: line.item_name,
            quantity: line.quantity,
            item_id: line.item_id || null,
            item_variant_id: line.item_variant_id || null,
            status: 'active'
          });
        } else if (line.change_type === 'modify' && line.order_line_id) {
          await (supabaseClient as any)
            .from('order_lines')
            .update({ quantity: line.quantity })
            .eq('id', line.order_line_id);
        } else if (line.change_type === 'remove' && line.order_line_id) {
          await (supabaseClient as any)
            .from('order_lines')
            .update({ status: 'deleted' })
            .eq('id', line.order_line_id);
        }
      }

      await onRefresh();
      onClose();
    } catch (error) {
      console.error('Error applying changes:', error);
    } finally {
      setIsApplying(false);
    }
  };

  const handleCancel = async () => {
    // If we created a new proposal, reject it
    if (newProposalId) {
      try {
        await (supabaseClient as any)
          .from('order_change_proposals')
          .update({ status: 'rejected', reviewed_at: new Date().toISOString() })
          .eq('id', newProposalId);
      } catch (error) {
        console.error('Error rejecting proposal:', error);
      }
    }
    onClose();
  };

  const removeEditableLine = (lineId: string) => {
    setEditableLines(prev => prev.filter(l => l.id !== lineId));
  };

  const updateEditableLine = (lineId: string, updates: Partial<ProposalLine>) => {
    setEditableLines(prev => prev.map(l => l.id === lineId ? { ...l, ...updates } : l));
  };

  const addNewItemLine = () => {
    const id = `user-add-${Date.now()}`;
    setEditableLines(prev => [...prev, {
      id,
      change_type: 'add' as const,
      item_name: '',
      size: 'Small',
      quantity: 1,
    }]);
  };

  const addRemovalForItem = (item: OrderItem) => {
    const id = `user-remove-${Date.now()}`;
    setEditableLines(prev => [...prev, {
      id,
      change_type: 'remove' as const,
      order_line_id: item.order_line_id,
      item_name: item.name,
      size: item.size,
      quantity: item.quantity,
    }]);
  };

  const addModificationForItem = (item: OrderItem) => {
    const id = `user-modify-${Date.now()}`;
    setEditableLines(prev => [...prev, {
      id,
      change_type: 'modify' as const,
      order_line_id: item.order_line_id,
      item_name: item.name,
      size: item.size,
      quantity: item.quantity,
      original_quantity: item.quantity,
      original_size: item.size,
    }]);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {step === 'pick' ? (
          <>
            {/* Step 1: Pick an order */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Assign to Order</h3>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Original message */}
            <div className="px-6 pt-4 pb-2">
              <div className="flex items-center gap-2 mb-1.5 text-sm text-gray-500">
                {proposal.channel === 'email' ? (
                  <Mail className="w-4 h-4 text-gray-400" />
                ) : (
                  <MessageSquare className="w-4 h-4 text-gray-400" />
                )}
                <span className="font-medium text-gray-700">
                  {proposal.channel === 'sms' ? 'SMS' : 'Email'}
                </span>
                <span>&middot;</span>
                <span>{formatTime(proposal.created_at)}</span>
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 italic">
                {proposal.message_preview}
              </div>
            </div>

            <div className="px-6 py-3">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search customers..."
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                autoFocus
              />
            </div>
            <div className="flex-1 overflow-auto px-6 pb-4">
              <div className="space-y-0.5">
                {filteredOrders.map(o => (
                  <button
                    key={o.id}
                    onClick={() => handlePickOrder(o)}
                    className="w-full text-left px-3 py-2.5 hover:bg-gray-50 rounded-lg transition-colors"
                  >
                    <div className="font-medium text-gray-900">{o.customer_name}</div>
                    <div className="text-xs text-gray-500">
                      {o.items.length} item{o.items.length !== 1 ? 's' : ''}
                      {o.delivery_date && ` · ${new Date(o.delivery_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                    </div>
                  </button>
                ))}
                {filteredOrders.length === 0 && (
                  <p className="text-sm text-gray-500 text-center py-4">No matching orders</p>
                )}
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200">
              <button
                onClick={onClose}
                className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Step 2: Editable preview — same interface as InboxCard */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  Assign to {selectedOrder?.customer_name}
                </h3>
                {selectedOrder?.delivery_date && (
                  <p className="text-xs text-gray-500">
                    {new Date(selectedOrder.delivery_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  </p>
                )}
              </div>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-auto px-6 py-4">
              {/* Original message */}
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-1.5 text-sm text-gray-500">
                  {proposal.channel === 'email' ? (
                    <Mail className="w-4 h-4 text-gray-400" />
                  ) : (
                    <MessageSquare className="w-4 h-4 text-gray-400" />
                  )}
                  <span className="font-medium text-gray-700">
                    {proposal.channel === 'sms' ? 'SMS' : 'Email'}
                  </span>
                  <span>&middot;</span>
                  <span>{formatTime(proposal.created_at)}</span>
                </div>
                <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 italic">
                  {proposal.message_preview}
                </div>
              </div>

              {isAnalyzing ? (
                <div className="py-8 text-center">
                  <Loader2 className="w-8 h-8 animate-spin text-green-600 mx-auto mb-3" />
                  <p className="text-sm font-medium text-gray-900">Analyzing order...</p>
                  <p className="text-xs text-gray-500 mt-1">Generating recommended changes</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-400 uppercase tracking-wider">
                      <th className="pb-2 font-medium">Item</th>
                      <th className="pb-2 font-medium w-20 text-center">Size</th>
                      <th className="pb-2 font-medium w-16 text-center">Qty</th>
                      <th className="pb-2 w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Existing order items with diff annotations */}
                    {selectedOrder && selectedOrder.items.map((item, idx) => {
                      const modification = editableLines.find(l => l.change_type === 'modify' && (l.order_line_id ? l.order_line_id === item.order_line_id : l.item_name === item.name && l.original_size === item.size));
                      const removal = editableLines.find(l => l.change_type === 'remove' && (l.order_line_id ? l.order_line_id === item.order_line_id : l.item_name === item.name && l.size === item.size));

                      return (
                        <React.Fragment key={idx}>
                          <tr
                            className={`${removal || modification ? 'opacity-50' : 'group hover:bg-gray-50 cursor-pointer'}`}
                            onDoubleClick={() => {
                              if (!removal && !modification) addModificationForItem(item);
                            }}
                            title={!removal && !modification ? 'Double-click to modify' : undefined}
                          >
                            <td className={`py-1.5 text-gray-700 ${removal || modification ? 'line-through' : ''}`}>{item.name}</td>
                            <td className={`py-1.5 text-center text-gray-500 ${removal || modification ? 'line-through' : ''}`}>{item.size}</td>
                            <td className={`py-1.5 text-center text-gray-700 font-medium ${removal || modification ? 'line-through' : ''}`}>{item.quantity}</td>
                            <td className="py-1.5">
                              {!removal && !modification && (
                                <button
                                  onClick={() => addRemovalForItem(item)}
                                  className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                  title="Remove item"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </td>
                          </tr>
                          {modification && (
                            <tr className="bg-blue-50">
                              <td className="py-1.5 pl-5 text-blue-700 text-sm">
                                <span className="text-blue-400 mr-1">&#8627;</span>
                                {modification.item_name}
                              </td>
                              <td className="py-1.5 text-center">
                                <select
                                  value={modification.size}
                                  onChange={(e) => updateEditableLine(modification.id, { size: e.target.value })}
                                  className="px-1 py-0.5 text-xs border border-blue-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                                >
                                  {getVariantsForLine(modification).map(v => (
                                    <option key={v.code} value={v.code}>{v.code}</option>
                                  ))}
                                </select>
                              </td>
                              <td className="py-1.5 text-center">
                                <input
                                  type="number"
                                  min="1"
                                  value={modification.quantity}
                                  onChange={(e) => updateEditableLine(modification.id, { quantity: parseInt(e.target.value) || 1 })}
                                  className="w-12 px-1 py-0.5 text-sm text-center border border-blue-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 font-semibold"
                                />
                              </td>
                              <td className="py-1.5">
                                <button onClick={() => removeEditableLine(modification.id)} className="text-gray-400 hover:text-red-500">
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          )}
                          {removal && (
                            <tr>
                              <td colSpan={3} className="pb-1.5">
                                <div className="ml-4 px-2 py-1 bg-red-50 border border-red-200 rounded text-xs text-red-600 inline-flex items-center gap-2">
                                  <span>&#8627; remove</span>
                                </div>
                              </td>
                              <td className="pb-1.5">
                                <button onClick={() => removeEditableLine(removal.id)} className="text-gray-400 hover:text-red-500">
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}

                    {/* Separator before add rows */}
                    {editableLines.filter(l => l.change_type === 'add').length > 0 && (
                      <tr>
                        <td colSpan={4} className="py-1">
                          <div className="border-t border-dashed border-gray-300"></div>
                        </td>
                      </tr>
                    )}

                    {/* Add/new item rows — editable green rows */}
                    {editableLines
                      .filter(l => l.change_type === 'add')
                      .map(line => (
                        <tr key={line.id} className="bg-green-50">
                          <td className="py-1.5 pl-1">
                            <div className="flex items-center gap-1">
                              <span className="text-green-600 text-xs font-bold">+</span>
                              <ItemSearchDropdown
                                value={line.item_name}
                                onChange={(val) => updateEditableLine(line.id, { item_name: val })}
                              />
                            </div>
                          </td>
                          <td className="py-1.5 text-center">
                            <select
                              value={line.size}
                              onChange={(e) => updateEditableLine(line.id, { size: e.target.value })}
                              className="px-1 py-0.5 text-xs border border-green-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-green-500"
                            >
                              {getVariantsForLine(line).map(v => (
                                <option key={v.code} value={v.code}>{v.code}</option>
                              ))}
                            </select>
                          </td>
                          <td className="py-1.5 text-center">
                            <input
                              type="number"
                              min="1"
                              value={line.quantity}
                              onChange={(e) => updateEditableLine(line.id, { quantity: parseInt(e.target.value) || 1 })}
                              className="w-12 px-1 py-0.5 text-sm text-center border border-green-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-green-500"
                            />
                          </td>
                          <td className="py-1.5">
                            <button onClick={() => removeEditableLine(line.id)} className="text-gray-400 hover:text-red-500">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}

                    {/* Add new item button row */}
                    <tr>
                      <td colSpan={4} className="pt-1">
                        <button
                          onClick={addNewItemLine}
                          className="flex items-center gap-1 text-xs text-green-600 hover:text-green-700 hover:bg-green-50 px-2 py-1 rounded transition-colors"
                        >
                          <span className="text-sm font-bold">+</span> Add item
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              )}
            </div>
            <div className="flex items-center gap-2 px-6 py-4 border-t border-gray-200">
              <button
                onClick={handleApplyChanges}
                disabled={isAnalyzing || isApplying || !newProposalId}
                className="flex items-center gap-1 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isApplying ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
                Apply Changes
              </button>
              <button
                onClick={handleCancel}
                disabled={isApplying}
                className="flex items-center gap-1 px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// Size categories for packing summary columns
const SIZE_CATEGORIES = ['S', 'L', 'T20'] as const;
const SIZE_LABELS: Record<string, string> = {
  'S': 'Small',
  'M': 'Medium',
  'L': 'Large',
  'T20': '10x20 Trays',
};

// Default variants to use when available_variants is not present
const DEFAULT_VARIANTS = [
  { code: 'S', name: 'Small' },
  { code: 'L', name: 'Large' },
  { code: 'T20', name: '10x20 Tray' }
];

// Helper to get variants for a line (uses available_variants if present, otherwise default)
const getVariantsForLine = (line: { available_variants?: { code: string; name: string }[] }) =>
  line.available_variants && line.available_variants.length > 0 ? line.available_variants : DEFAULT_VARIANTS;

function buildPackingSummary(orders: Order[]): { crop: string; sizes: Record<string, number>; total: number }[] {
  // Aggregate: crop -> size -> total quantity
  const agg: Record<string, Record<string, number>> = {};

  orders.forEach(order => {
    order.items.forEach(item => {
      if (!agg[item.name]) agg[item.name] = {};
      agg[item.name][item.size] = (agg[item.name][item.size] || 0) + item.quantity;
    });
  });

  // Sort by crop name A-Z
  return Object.keys(agg)
    .sort((a, b) => a.localeCompare(b))
    .map(crop => {
      const sizes = agg[crop];
      const total = Object.values(sizes).reduce((sum, qty) => sum + qty, 0);
      return { crop, sizes, total };
    });
}

function printPackingSummary(dateStr: string, orders: Order[]) {
  const summary = buildPackingSummary(orders);
  const dateDisplay = new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  // Collect all size codes used across all items
  const allSizes = new Set<string>();
  summary.forEach(row => Object.keys(row.sizes).forEach(s => allSizes.add(s)));
  const sizeColumns = ['S', 'M', 'L', 'T20'].filter(s => allSizes.has(s));
  // Add any other sizes not in the standard list
  allSizes.forEach(s => { if (!sizeColumns.includes(s)) sizeColumns.push(s); });

  const html = `<!DOCTYPE html>
<html>
<head>
  <title>Crop Packing Summary - ${dateDisplay}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 24px; color: #1a1a1a; }
    h1 { font-size: 20px; margin-bottom: 4px; }
    .subtitle { font-size: 14px; color: #666; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { background: #d4a574; color: #1a1a1a; padding: 8px 12px; text-align: center; font-weight: 600; border: 1px solid #b8956a; }
    th.crop-header { text-align: left; background: #c4956a; min-width: 180px; }
    th.size-header { background: #b8c4d8; }
    th.total-header { background: #e8c87a; }
    td { padding: 6px 12px; border: 1px solid #ddd; }
    td.crop-name { font-weight: 500; background: #f9f5f0; }
    td.size-cell { text-align: center; background: #f0f4fa; }
    td.size-cell.has-value { font-weight: 600; color: #1a1a1a; }
    td.size-cell.empty { color: #ccc; }
    td.total-cell { text-align: center; font-weight: 700; background: #fdf6e3; }
    tr:nth-child(even) td.crop-name { background: #f4efe8; }
    tr:nth-child(even) td.size-cell { background: #eaeff5; }
    tr:nth-child(even) td.total-cell { background: #f8f0d8; }
    .footer { margin-top: 16px; font-size: 11px; color: #999; }
    .totals-row td { font-weight: 700; background: #e8e0d4 !important; border-top: 2px solid #999; }
    .totals-row td.size-cell { background: #d8e0ec !important; }
    .totals-row td.total-cell { background: #f0e4c0 !important; }
    @media print {
      body { padding: 0; }
      @page { margin: 0.5in; }
    }
  </style>
</head>
<body>
  <h1>Crop Packing Summary and Harvest Records</h1>
  <div class="subtitle">${dateDisplay} &mdash; ${summary.length} crop${summary.length !== 1 ? 's' : ''} &middot; ${orders.length} order${orders.length !== 1 ? 's' : ''}</div>
  <table>
    <thead>
      <tr>
        <th class="crop-header">Crop/Product (A-Z)</th>
        ${sizeColumns.map(s => `<th class="size-header">${SIZE_LABELS[s] || s}<br><span style="font-size:11px;font-weight:400">Units</span></th>`).join('')}
        <th class="total-header">Total Units</th>
      </tr>
    </thead>
    <tbody>
      ${summary.map(row => `
        <tr>
          <td class="crop-name">${row.crop}</td>
          ${sizeColumns.map(s => {
            const val = row.sizes[s] || 0;
            return `<td class="size-cell ${val > 0 ? 'has-value' : 'empty'}">${val > 0 ? val : ''}</td>`;
          }).join('')}
          <td class="total-cell">${row.total}</td>
        </tr>
      `).join('')}
      <tr class="totals-row">
        <td class="crop-name">TOTALS</td>
        ${sizeColumns.map(s => {
          const colTotal = summary.reduce((sum, row) => sum + (row.sizes[s] || 0), 0);
          return `<td class="size-cell">${colTotal > 0 ? colTotal : ''}</td>`;
        }).join('')}
        <td class="total-cell">${summary.reduce((sum, row) => sum + row.total, 0)}</td>
      </tr>
    </tbody>
  </table>
  <div class="footer">Generated from Frootful</div>
  <script>window.onload = function() { window.print(); }</script>
</body>
</html>`;

  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
  }
}

// ============================================================================
// INBOX COMPONENTS
// ============================================================================

interface InboxCardProps {
  proposal: Proposal;
  matchedOrder: Order | null;
  orders: Order[];
  customers: Customer[];
  onApplyChange: (proposalId: string, lines: ProposalLine[]) => void;
  onCreateOrder: (proposalId: string, lines: ProposalLine[], customerName?: string, deliveryDate?: string) => Promise<void>;
  onDismiss: (proposalId: string) => void;
  onOpenCreateNewOrderModal: (proposalId: string) => void;
  onOpenAssignToOrderModal: (proposalId: string, sourceOrderId: string | null) => void;
  onUpdateOrderFrequency: (proposalId: string, value: 'one-time' | 'recurring') => void;
  isDismissing?: boolean;
  isApplying?: boolean;
}

const InboxCard: React.FC<InboxCardProps> = ({
  proposal, matchedOrder, orders, customers, onApplyChange, onCreateOrder, onDismiss,
  onOpenCreateNewOrderModal, onOpenAssignToOrderModal, onUpdateOrderFrequency, isDismissing, isApplying
}) => {
  const isUndetermined = proposal.action === 'undetermined' || (!proposal.action && proposal.order_id === null);
  const isCreateNew = proposal.action === 'create';
  const isAssignExisting = !isUndetermined && !isCreateNew;
  const [editableLines, setEditableLines] = useState<ProposalLine[]>(proposal.lines);
  const [showAllMessages, setShowAllMessages] = useState(false);
  const [showCorrection, setShowCorrection] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [showOrderItems, setShowOrderItems] = useState(false);
  const [messageExpanded, setMessageExpanded] = useState(false);
  const [contentNeedsExpand, setContentNeedsExpand] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [orderFrequency, setOrderFrequency] = useState<'one-time' | 'recurring'>(
    proposal.order_frequency || 'one-time'
  );
  const [customerName, setCustomerName] = useState(proposal.customer_name);
  const [deliveryDate, setDeliveryDate] = useState(() => {
    if (proposal.delivery_date) return proposal.delivery_date;
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  });

  const allMessages = useMemo(() => {
    return proposal.timeline
      .filter(t => t.type === 'communication')
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }, [proposal.timeline]);

  const removeEditableLine = (lineId: string) => {
    setEditableLines(prev => prev.filter(l => l.id !== lineId));
  };

  const updateEditableLine = (lineId: string, updates: Partial<ProposalLine>) => {
    setEditableLines(prev => prev.map(l => l.id === lineId ? { ...l, ...updates } : l));
  };

  const addNewItemLine = () => {
    const id = `user-add-${Date.now()}`;
    setEditableLines(prev => [...prev, {
      id,
      change_type: 'add' as const,
      item_name: '',
      size: 'Small',
      quantity: 1,
    }]);
  };

  const addRemovalForItem = (item: OrderItem) => {
    const id = `user-remove-${Date.now()}`;
    setEditableLines(prev => [...prev, {
      id,
      change_type: 'remove' as const,
      order_line_id: item.order_line_id,
      item_name: item.name,
      size: item.size,
      quantity: item.quantity,
    }]);
  };

  const addModificationForItem = (item: OrderItem) => {
    const id = `user-modify-${Date.now()}`;
    setEditableLines(prev => [...prev, {
      id,
      change_type: 'modify' as const,
      order_line_id: item.order_line_id,
      item_name: item.name,
      size: item.size,
      quantity: item.quantity,
      original_quantity: item.quantity,
      original_size: item.size,
    }]);
  };

  return (
    <div className={`rounded-lg border bg-white shadow-sm transition-all duration-300 ${(isDismissing || isApplying) ? 'opacity-50 scale-98 pointer-events-none' : ''} ${isUndetermined ? 'border-l-4 border-l-amber-400 border-t border-r border-b border-gray-200' : isCreateNew ? 'border-l-4 border-l-green-400 border-t border-r border-b border-gray-200' : 'border-l-4 border-l-blue-400 border-t border-r border-b border-gray-200'}`}>
      {/* Collapsible header */}
      <div
        className="flex items-center justify-between px-5 py-3 cursor-pointer select-none hover:bg-gray-50 transition-colors"
        onClick={() => setCollapsed(!collapsed)}
      >
        <div className="flex items-center gap-2 text-sm min-w-0">
          {proposal.channel === 'email' ? (
            <Mail className="w-4 h-4 text-gray-400 flex-shrink-0" />
          ) : (
            <MessageSquare className="w-4 h-4 text-gray-400 flex-shrink-0" />
          )}
          <span className="font-medium text-gray-900 truncate">{proposal.channel === 'email' ? 'Email' : 'SMS'}</span>
          <span className="text-gray-400">&middot;</span>
          <span className="text-gray-500 flex-shrink-0">Received by Frootful {formatTime(proposal.created_at)}</span>
          {proposal.message_count > 1 && (
            <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full flex-shrink-0">
              {proposal.message_count}
            </span>
          )}
          {isUndetermined && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800 flex-shrink-0">
              Needs input
            </span>
          )}
        </div>
        <div className="flex-shrink-0 ml-2">
          {collapsed ? (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronUp className="w-4 h-4 text-gray-400" />
          )}
        </div>
      </div>

      {/* Collapsible body */}
      {!collapsed && (
        <div className="px-5 pb-5">
      {/* 1. Message — email-style viewer */}
      <div className="mb-3">
        <div className="border border-gray-200 rounded-lg overflow-hidden bg-white shadow-sm">
          {/* Email header */}
          {proposal.channel === 'email' ? (
            <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 space-y-1">
              {proposal.sender && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-gray-400 text-xs w-12 text-right shrink-0">From</span>
                  <span className="text-gray-800 font-medium">{proposal.sender}</span>
                </div>
              )}
              {proposal.subject && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-gray-400 text-xs w-12 text-right shrink-0">Subject</span>
                  <span className="text-gray-700">{proposal.subject}</span>
                </div>
              )}
              {proposal.email_date && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-gray-400 text-xs w-12 text-right shrink-0">Date</span>
                  <span className="text-gray-500 text-xs">{proposal.email_date}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 flex items-center gap-2 text-xs text-gray-500">
              <MessageSquare className="w-3 h-3" />
              <span>SMS</span>
              <span className="text-gray-300">&middot;</span>
              <span>{formatTime(proposal.created_at)}</span>
            </div>
          )}

          {/* Collapse toggle at top when expanded */}
          {messageExpanded && contentNeedsExpand && (
            <div className="border-b border-gray-100 px-3 py-1.5">
              <button
                onClick={() => setMessageExpanded(false)}
                className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
              >
                <ChevronUp className="w-3 h-3" /> Show less
              </button>
            </div>
          )}

          {/* Email body — always render via iframe for proper encoding */}
          <div className={`relative ${!messageExpanded ? 'max-h-40 overflow-hidden' : ''}`}>
            <iframe
              ref={(el) => {
                if (!el) return;
                const doc = el.contentDocument;
                if (!doc) return;
                // Legacy cleanup for emails stored before the UTF-8 decode fix.
                // New emails are decoded correctly at ingest time.
                const cleanText = (s: string) => s
                  .replace(/\u00c2(?=[\u00a0\s]|[A-Z]|$)/g, '')  // Â artifact
                  .replace(/\u00a0/g, ' ');
                const rawHtml = proposal.message_html;
                const htmlContent = rawHtml
                  ? cleanText(rawHtml)
                  : `<pre style="font-family:inherit;white-space:pre-wrap;margin:0">${cleanText(proposal.message_full || proposal.message_preview).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</pre>`;
                doc.open();
                doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><style>
                  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 13px; line-height: 1.5; color: #374151; margin: 0; padding: 12px 16px; word-wrap: break-word; overflow-wrap: break-word; }
                  a { color: #2563eb; text-decoration: none; }
                  a:hover { text-decoration: underline; }
                  blockquote { border-left: 3px solid #d1d5db; margin: 8px 0; padding: 4px 0 4px 12px; color: #6b7280; }
                  img { max-width: 100%; height: auto; }
                  pre { white-space: pre-wrap; word-wrap: break-word; font-family: inherit; }
                  table { border-collapse: collapse; max-width: 100%; }
                  td, th { padding: 4px 8px; }
                  hr { border: none; border-top: 1px solid #e5e7eb; margin: 12px 0; }
                  .gmail_quote { margin: 8px 0 0; padding-left: 12px; border-left: 3px solid #d1d5db; color: #6b7280; }
                </style></head><body>${htmlContent}</body></html>`);
                doc.close();
                // Auto-resize iframe to content height
                const resize = () => {
                  if (doc.body) {
                    const contentHeight = doc.body.scrollHeight;
                    el.style.height = contentHeight + 'px';
                    // Only show expand/collapse if content exceeds 160px (max-h-40)
                    setContentNeedsExpand(contentHeight > 160);
                  }
                };
                el.addEventListener('load', resize);
                setTimeout(resize, 50);
                setTimeout(resize, 200);
              }}
              sandbox="allow-same-origin"
              className="w-full border-0"
              style={{ minHeight: '60px' }}
              title="Email content"
            />
            {/* Fade overlay when collapsed and content needs expand */}
            {!messageExpanded && contentNeedsExpand && (
              <div className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-white to-transparent pointer-events-none"></div>
            )}
          </div>

          {/* Expand/collapse toggle - only show if content is large enough to need it */}
          {contentNeedsExpand && (
            <div className="border-t border-gray-100 px-3 py-1.5">
              <button
                onClick={() => setMessageExpanded(!messageExpanded)}
                className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
              >
                {messageExpanded ? (
                  <><ChevronUp className="w-3 h-3" /> Show less</>
                ) : (
                  <><ChevronDown className="w-3 h-3" /> Show more</>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Multi-message expansion */}
        {proposal.message_count > 1 && (
          <>
            <button
              onClick={() => setShowAllMessages(!showAllMessages)}
              className="text-xs text-blue-600 hover:text-blue-800 mt-1.5"
            >
              {showAllMessages ? 'Hide messages' : `View all ${proposal.message_count} messages`}
            </button>
            {showAllMessages && (
              <div className="mt-2 space-y-2">
                {allMessages.map(msg => (
                  <div key={msg.id} className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm">
                    <div className="flex items-center gap-2 mb-1 text-xs text-gray-400">
                      {msg.channel === 'email' ? <Mail className="w-3 h-3" /> : <MessageSquare className="w-3 h-3" />}
                      <span>{msg.from}</span>
                      <span>&middot;</span>
                      <span>{formatTime(msg.timestamp)}</span>
                    </div>
                    {msg.subject && <p className="text-xs font-medium text-gray-800 mb-0.5">{msg.subject}</p>}
                    <p className="text-gray-700 whitespace-pre-line">{msg.content}</p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* 2. System suggestion banner */}
      {isUndetermined ? (
        /* Undetermined — could not determine action */
        <div className="mb-3 px-3 py-3 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-sm text-amber-800 mb-3">Could not determine correct action. Please select:</p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onOpenCreateNewOrderModal(proposal.id)}
              className="flex-1 px-3 py-2 text-sm font-medium text-amber-800 bg-white border border-amber-300 rounded-lg hover:bg-amber-100 transition-colors text-center"
            >
              Create New Order
            </button>
            <button
              onClick={() => onOpenAssignToOrderModal(proposal.id, null)}
              className="flex-1 px-3 py-2 text-sm font-medium text-amber-800 bg-white border border-amber-300 rounded-lg hover:bg-amber-100 transition-colors text-center"
            >
              Assign to Existing Order
            </button>
          </div>
        </div>
      ) : isCreateNew ? (
        /* AI determined: create new order */
        <div className="mb-3">
          <div className="px-3 py-3 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-xs text-green-600 uppercase tracking-wider font-medium mb-2">AI Recommended: Create New Order</p>
            <div className="flex items-center gap-3 px-3 py-2 bg-white border border-green-200 rounded-lg">
              <div className="flex items-center gap-2 flex-1" onClick={(e) => e.stopPropagation()}>
                <User className="w-4 h-4 text-green-500 flex-shrink-0" />
                <CustomerSearchDropdown
                  value={customerName}
                  onChange={setCustomerName}
                  customers={customers}
                  className="text-sm font-medium text-gray-900 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-green-500 focus:outline-none px-0 py-0.5 w-full"
                />
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <CalendarIcon className="w-4 h-4 text-green-500" />
                <input
                  type="date"
                  value={deliveryDate}
                  onChange={(e) => setDeliveryDate(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  className="text-xs text-gray-600 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-green-500 focus:outline-none px-0 py-0.5"
                />
              </div>
            </div>
            <div className="mt-2 relative group/tag">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const newVal = orderFrequency === 'one-time' ? 'recurring' : 'one-time';
                  setOrderFrequency(newVal);
                  onUpdateOrderFrequency(proposal.id, newVal);
                }}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all duration-200 active:scale-95 ${
                  orderFrequency === 'one-time'
                    ? 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                    : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                }`}
              >
                {orderFrequency === 'one-time' ? 'One-time' : 'Recurring'}
                <ArrowUpDown className="w-3 h-3 opacity-40" />
              </button>
              <div className="absolute left-0 bottom-full mb-1 w-56 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg shadow-lg opacity-0 invisible group-hover/tag:opacity-100 group-hover/tag:visible transition-all duration-200 z-50 pointer-events-none">
                {orderFrequency === 'one-time'
                  ? 'This is a one-time order update and will not affect recurring standing orders.'
                  : 'This will update the customer\u2019s standing order for this day of the week.'}
              </div>
            </div>
            {/* Items table inside recommendation box */}
            <div className="border-t border-green-200 mt-3 pt-2">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-green-600/60 uppercase tracking-wider">
                    <th className="py-1 text-left font-medium">Item</th>
                    <th className="py-1 text-center font-medium">Size</th>
                    <th className="py-1 text-center font-medium">Qty</th>
                    <th className="py-1 w-6"></th>
                  </tr>
                </thead>
                <tbody>
                  {editableLines
                    .filter(l => l.change_type === 'add')
                    .map(line => (
                      <tr key={line.id} className="bg-green-50/50">
                        <td className="py-1.5 pl-1">
                          <div className="flex items-center gap-1">
                            <span className="text-green-600 text-xs font-bold">+</span>
                            <ItemSearchDropdown
                              value={line.item_name}
                              onChange={(val) => updateEditableLine(line.id, { item_name: val })}
                            />
                          </div>
                        </td>
                        <td className="py-1.5 text-center">
                          <select
                            value={line.size}
                            onChange={(e) => updateEditableLine(line.id, { size: e.target.value })}
                            className="px-1 py-0.5 text-xs border border-green-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-green-500"
                          >
                            {getVariantsForLine(line).map(v => (
                              <option key={v.code} value={v.code}>{v.code}</option>
                            ))}
                          </select>
                        </td>
                        <td className="py-1.5 text-center">
                          <input
                            type="number"
                            min="1"
                            value={line.quantity}
                            onChange={(e) => updateEditableLine(line.id, { quantity: parseInt(e.target.value) || 1 })}
                            className="w-12 px-1 py-0.5 text-sm text-center border border-green-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-green-500"
                          />
                        </td>
                        <td className="py-1.5">
                          <button onClick={() => removeEditableLine(line.id)} className="text-gray-400 hover:text-red-500">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  <tr>
                    <td colSpan={4} className="pt-1">
                      <button
                        onClick={addNewItemLine}
                        className="flex items-center gap-1 text-xs text-green-600 hover:text-green-700 hover:bg-green-100/50 px-2 py-1 rounded transition-colors"
                      >
                        <span className="text-sm font-bold">+</span> Add item
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            {/* Action buttons inside recommendation box */}
            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-green-200">
              <button
                onClick={async () => {
                  setIsCreating(true);
                  await onCreateOrder(proposal.id, editableLines, customerName, deliveryDate);
                  setIsCreating(false);
                }}
                disabled={isCreating}
                className="flex items-center gap-1 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCreating ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Creating...</>
                ) : (
                  <><Check className="w-4 h-4" /> Create Order</>
                )}
              </button>
              <button
                onClick={() => onDismiss(proposal.id)}
                disabled={isCreating || isDismissing}
                className="flex items-center gap-1 px-4 py-2 bg-white text-gray-600 text-sm font-medium rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                {isDismissing ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Dismissing...</>
                ) : (
                  <><X className="w-4 h-4" /> Dismiss</>
                )}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setShowCorrection(!showCorrection); }}
                className="ml-auto text-xs text-gray-400 hover:text-gray-600 transition-colors"
              >
                Something wrong?
              </button>
            </div>
            {showCorrection && (
              <div className="flex items-center gap-2 mt-2">
                <button
                  onClick={() => onOpenAssignToOrderModal(proposal.id, null)}
                  className="flex-1 px-3 py-2 text-sm font-medium text-green-700 bg-white border border-green-200 rounded-lg hover:bg-green-100 transition-colors text-center"
                >
                  Assign to existing order instead
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* AI matched to existing order */
        <div className="mb-3">
          <div className="px-3 py-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-xs text-blue-600 uppercase tracking-wider font-medium mb-2">AI Matched Order To</p>
            <div
              className="flex items-center gap-3 px-3 py-2 bg-white border border-blue-200 rounded-lg cursor-pointer hover:bg-blue-50 transition-colors"
              onClick={() => setShowOrderItems(!showOrderItems)}
            >
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-sm font-medium">
                {proposal.customer_name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">{proposal.customer_name}</p>
                <p className="text-xs text-gray-500">
                  {new Date(proposal.delivery_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                </p>
              </div>
              {matchedOrder && matchedOrder.items.length > 0 && (
                showOrderItems ? <ChevronUp className="w-4 h-4 text-blue-400" /> : <ChevronDown className="w-4 h-4 text-blue-400" />
              )}
            </div>
            <div className="mt-2 relative group/tag">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const newVal = orderFrequency === 'one-time' ? 'recurring' : 'one-time';
                  setOrderFrequency(newVal);
                  onUpdateOrderFrequency(proposal.id, newVal);
                }}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all duration-200 active:scale-95 ${
                  orderFrequency === 'one-time'
                    ? 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                    : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                }`}
              >
                {orderFrequency === 'one-time' ? 'One-time' : 'Recurring'}
                <ArrowUpDown className="w-3 h-3 opacity-40" />
              </button>
              <div className="absolute left-0 bottom-full mb-1 w-56 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg shadow-lg opacity-0 invisible group-hover/tag:opacity-100 group-hover/tag:visible transition-all duration-200 z-50 pointer-events-none">
                {orderFrequency === 'one-time'
                  ? 'This is a one-time order update for this order only and will not affect future orders.'
                  : 'This will update the customer\u2019s standing order for this day of the week.'}
              </div>
            </div>
            {/* Expandable current order items */}
            {showOrderItems && matchedOrder && matchedOrder.items.length > 0 && (
              <div className="mt-2 px-3 py-2 bg-white border border-blue-200 rounded-lg">
                <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Current order items</p>
                <div className="text-sm text-gray-600 space-y-0.5">
                  {matchedOrder.items.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <span>{item.name}</span>
                      <span className="text-gray-400">{item.size}</span>
                      <span className="font-medium">&times;{item.quantity}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {/* Changes table inside recommendation box */}
            <div className="border-t border-blue-200 mt-3 pt-2">
              <p className="text-xs text-blue-600/70 uppercase tracking-wider font-medium mb-1.5">Changes</p>
              {/* Delete Order label - shown when all lines are removals with no adds */}
              {matchedOrder &&
               editableLines.length > 0 &&
               editableLines.every(l => l.change_type === 'remove') && (
                <div className="mb-2 px-3 py-2 bg-red-100 border border-red-300 rounded-lg">
                  <p className="text-sm font-semibold text-red-700">Cancel Order</p>
                  <p className="text-xs text-red-600">This order will be cancelled.</p>
                </div>
              )}
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-blue-600/60 uppercase tracking-wider">
                    <th className="py-1 text-left font-medium">Item</th>
                    <th className="py-1 text-center font-medium">Size</th>
                    <th className="py-1 text-center font-medium">Qty</th>
                    <th className="py-1 w-6"></th>
                  </tr>
                </thead>
                <tbody>
                  {/* Existing order items with diff annotations */}
                  {matchedOrder && matchedOrder.items.map((item, idx) => {
                    const modification = editableLines.find(l => l.change_type === 'modify' && (l.order_line_id ? l.order_line_id === item.order_line_id : l.item_name === item.name && l.original_size === item.size));
                    const removal = editableLines.find(l => l.change_type === 'remove' && (l.order_line_id ? l.order_line_id === item.order_line_id : l.item_name === item.name && l.size === item.size));

                    return (
                      <React.Fragment key={idx}>
                        <tr
                          className={`${removal || modification ? 'opacity-50' : 'group hover:bg-gray-50 cursor-pointer'}`}
                          onDoubleClick={() => {
                            if (!removal && !modification) addModificationForItem(item);
                          }}
                          title={!removal && !modification ? 'Double-click to modify' : undefined}
                        >
                          <td className={`py-1.5 text-gray-700 ${removal || modification ? 'line-through' : ''}`}>{item.name}</td>
                          <td className={`py-1.5 text-center text-gray-500 ${removal || modification ? 'line-through' : ''}`}>{item.size}</td>
                          <td className={`py-1.5 text-center text-gray-700 font-medium ${removal || modification ? 'line-through' : ''}`}>{item.quantity}</td>
                          <td className="py-1.5">
                            {!removal && !modification && (
                              <button
                                onClick={() => addRemovalForItem(item)}
                                className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                title="Remove item"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                        {modification && (
                          <tr className="bg-blue-50">
                            <td className="py-1.5 pl-5 text-blue-700 text-sm">
                              <span className="text-blue-400 mr-1">&#8627;</span>
                              {modification.item_name}
                            </td>
                            <td className="py-1.5 text-center">
                              <select
                                value={modification.size}
                                onChange={(e) => updateEditableLine(modification.id, { size: e.target.value })}
                                className="px-1 py-0.5 text-xs border border-blue-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                              >
                                {getVariantsForLine(modification).map(v => (
                                  <option key={v.code} value={v.code}>{v.code}</option>
                                ))}
                              </select>
                            </td>
                            <td className="py-1.5 text-center">
                              <input
                                type="number"
                                min="1"
                                value={modification.quantity}
                                onChange={(e) => updateEditableLine(modification.id, { quantity: parseInt(e.target.value) || 1 })}
                                className="w-12 px-1 py-0.5 text-sm text-center border border-blue-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 font-semibold"
                              />
                            </td>
                            <td className="py-1.5">
                              <button onClick={() => removeEditableLine(modification.id)} className="text-gray-400 hover:text-red-500">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        )}
                        {removal && (
                          <tr>
                            <td colSpan={3} className="pb-1.5">
                              <div className="ml-4 px-2 py-1 bg-red-50 border border-red-200 rounded text-xs text-red-600 inline-flex items-center gap-2">
                                <span>&#8627; remove</span>
                              </div>
                            </td>
                            <td className="pb-1.5">
                              <button onClick={() => removeEditableLine(removal.id)} className="text-gray-400 hover:text-red-500">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}

                  {/* Separator before add rows */}
                  {editableLines.filter(l => l.change_type === 'add').length > 0 && (
                    <tr>
                      <td colSpan={4} className="py-1">
                        <div className="border-t border-dashed border-blue-200"></div>
                      </td>
                    </tr>
                  )}

                  {/* Add/new item rows */}
                  {editableLines
                    .filter(l => l.change_type === 'add')
                    .map(line => (
                      <tr key={line.id} className="bg-green-50">
                        <td className="py-1.5 pl-1">
                          <div className="flex items-center gap-1">
                            <span className="text-green-600 text-xs font-bold">+</span>
                            <ItemSearchDropdown
                              value={line.item_name}
                              onChange={(val) => updateEditableLine(line.id, { item_name: val })}
                            />
                          </div>
                        </td>
                        <td className="py-1.5 text-center">
                          <select
                            value={line.size}
                            onChange={(e) => updateEditableLine(line.id, { size: e.target.value })}
                            className="px-1 py-0.5 text-xs border border-green-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-green-500"
                          >
                            {getVariantsForLine(line).map(v => (
                              <option key={v.code} value={v.code}>{v.code}</option>
                            ))}
                          </select>
                        </td>
                        <td className="py-1.5 text-center">
                          <input
                            type="number"
                            min="1"
                            value={line.quantity}
                            onChange={(e) => updateEditableLine(line.id, { quantity: parseInt(e.target.value) || 1 })}
                            className="w-12 px-1 py-0.5 text-sm text-center border border-green-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-green-500"
                          />
                        </td>
                        <td className="py-1.5">
                          <button onClick={() => removeEditableLine(line.id)} className="text-gray-400 hover:text-red-500">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}

                  {/* Add new item button row */}
                  <tr>
                    <td colSpan={4} className="pt-1">
                      <button
                        onClick={addNewItemLine}
                        className="flex items-center gap-1 text-xs text-green-600 hover:text-green-700 hover:bg-green-100/50 px-2 py-1 rounded transition-colors"
                      >
                        <span className="text-sm font-bold">+</span> Add item
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            {/* Action buttons inside recommendation box */}
            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-blue-200">
              <button
                onClick={() => onApplyChange(proposal.id, editableLines)}
                disabled={isApplying || isDismissing}
                className="flex items-center gap-1 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
              >
                {isApplying ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Applying...</>
                ) : (
                  <><Check className="w-4 h-4" /> Apply Changes</>
                )}
              </button>
              <button
                onClick={() => onDismiss(proposal.id)}
                disabled={isDismissing || isApplying}
                className="flex items-center gap-1 px-4 py-2 bg-white text-gray-600 text-sm font-medium rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                {isDismissing ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Dismissing...</>
                ) : (
                  <><X className="w-4 h-4" /> Dismiss</>
                )}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setShowCorrection(!showCorrection); }}
                className="ml-auto text-xs text-gray-400 hover:text-gray-600 transition-colors"
              >
                Something wrong?
              </button>
            </div>
            {showCorrection && (
              <div className="flex items-center gap-2 mt-2">
                <button
                  onClick={() => onOpenCreateNewOrderModal(proposal.id)}
                  className="flex-1 px-3 py-2 text-sm font-medium text-blue-700 bg-white border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors text-center"
                >
                  Create new order instead
                </button>
                <button
                  onClick={() => onOpenAssignToOrderModal(proposal.id, matchedOrder?.id || null)}
                  className="flex-1 px-3 py-2 text-sm font-medium text-blue-700 bg-white border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors text-center"
                >
                  Assign to different order
                </button>
              </div>
            )}
          </div>
        </div>
      )}
        </div>
      )}
    </div>
  );
};

interface InboxFeedProps {
  proposals: Proposal[];
  orders: Order[];
  customers: Customer[];
  onApplyChange: (proposalId: string, lines: ProposalLine[]) => void;
  onCreateOrder: (proposalId: string, lines: ProposalLine[], customerName?: string, deliveryDate?: string) => Promise<void>;
  onDismiss: (proposalId: string) => void;
  onOpenCreateNewOrderModal: (proposalId: string) => void;
  onOpenAssignToOrderModal: (proposalId: string, sourceOrderId: string | null) => void;
  onUpdateOrderFrequency: (proposalId: string, value: 'one-time' | 'recurring') => void;
  onRefresh?: () => Promise<void>;
  isRefreshing?: boolean;
  dismissingProposalId?: string | null;
  applyingProposalId?: string | null;
}

type InboxSortMode = 'recent' | 'urgent' | 'channel' | 'needs-input';

const InboxFeed: React.FC<InboxFeedProps> = ({
  proposals, orders, customers, onApplyChange, onCreateOrder, onDismiss,
  onOpenCreateNewOrderModal, onOpenAssignToOrderModal, onUpdateOrderFrequency, onRefresh, isRefreshing, dismissingProposalId, applyingProposalId
}) => {
  const [sortMode, setSortMode] = useState<InboxSortMode>('recent');

  const sortedProposals = useMemo(() => {
    const sorted = [...proposals];
    switch (sortMode) {
      case 'urgent':
        return sorted.sort((a, b) => {
          const dateA = new Date(a.delivery_date + 'T00:00:00').getTime();
          const dateB = new Date(b.delivery_date + 'T00:00:00').getTime();
          if (dateA !== dateB) return dateA - dateB;
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });
      case 'channel':
        return sorted.sort((a, b) => {
          if (a.channel !== b.channel) return a.channel === 'sms' ? -1 : 1;
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });
      case 'needs-input':
        return sorted.sort((a, b) => {
          const aUndetermined = a.action === 'undetermined' ? 0 : 1;
          const bUndetermined = b.action === 'undetermined' ? 0 : 1;
          if (aUndetermined !== bUndetermined) return aUndetermined - bUndetermined;
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });
      case 'recent':
      default:
        return sorted.sort((a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
    }
  }, [proposals, sortMode]);

  const sortButtons: { mode: InboxSortMode; label: string }[] = [
    { mode: 'urgent', label: 'Most Urgent' },
    { mode: 'recent', label: 'Most Recent' },
    { mode: 'needs-input', label: 'Needs Input' },
    { mode: 'channel', label: 'By Channel' },
  ];

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-amber-600" />
            <h3 className="text-lg font-semibold text-gray-900">Inbox</h3>
          </div>
          <span className="text-sm text-gray-500">
            {proposals.length} message{proposals.length !== 1 ? 's' : ''} to review
          </span>
        </div>
        <div className="flex items-center gap-1">
          {sortButtons.map(({ mode, label }) => (
            <button
              key={mode}
              onClick={() => setSortMode(mode)}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                sortMode === mode
                  ? 'bg-amber-100 text-amber-800'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
              }`}
            >
              {label}
            </button>
          ))}
          {/* Refresh button temporarily disabled - use page reload instead
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              className="ml-1 p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
              title="Refresh inbox"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
          )}
          */}
        </div>
      </div>
      <div className="space-y-4">
        {sortedProposals.map(proposal => (
          <InboxCard
            key={proposal.id}
            proposal={proposal}
            matchedOrder={orders.find(o => o.id === proposal.order_id) || null}
            orders={orders}
            customers={customers}
            onApplyChange={onApplyChange}
            onCreateOrder={onCreateOrder}
            onDismiss={onDismiss}
            onOpenCreateNewOrderModal={onOpenCreateNewOrderModal}
            onOpenAssignToOrderModal={onOpenAssignToOrderModal}
            onUpdateOrderFrequency={onUpdateOrderFrequency}
            isDismissing={dismissingProposalId === proposal.id}
            isApplying={applyingProposalId === proposal.id}
          />
        ))}
      </div>
    </div>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

interface CatalogItem {
  id: string;
  sku: string;
  name: string;
  item_variants: { id: string; variant_code: string; variant_name: string }[];
}

const DashboardV3: React.FC<DashboardV3Props> = ({ organizationId, layout = 'default', headerContent }) => {
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [sidebarTab, setSidebarTab] = useState<'inbox' | 'orders' | 'upload' | 'analytics' | 'catalog'>('inbox');
  const [orders, setOrders] = useState<Order[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>(MOCK_PROPOSALS);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshingInbox, setIsRefreshingInbox] = useState(false);
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());
  const [selectedCustomer, setSelectedCustomer] = useState<{ date: string; customer: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [hideEmptyDays, setHideEmptyDays] = useState(true);
  const [createNewOrderModal, setCreateNewOrderModal] = useState<{ proposal: Proposal } | null>(null);
  const [assignToOrderModal, setAssignToOrderModal] = useState<{ proposal: Proposal; sourceOrderId: string | null } | null>(null);

  // Catalog state
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [expandedCatalogItems, setExpandedCatalogItems] = useState<Set<string>>(new Set());

  // Customers state (for searchable customer dropdown)
  const [customers, setCustomers] = useState<Customer[]>([]);

  // Sidebar collapsed state
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Toast state
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Dismissing proposal state (tracks which proposal is being dismissed)
  const [dismissingProposalId, setDismissingProposalId] = useState<string | null>(null);

  // Applying proposal state (tracks which proposal is being applied)
  const [applyingProposalId, setApplyingProposalId] = useState<string | null>(null);

  // Show toast helper
  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Load orders, proposals, and customers
  useEffect(() => {
    if (organizationId) {
      loadOrders();
      loadProposals();
      loadCustomers();
    } else {
      setIsLoading(false);
    }
  }, [organizationId]);

  // Auto-expand dates with proposals
  useEffect(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    // Also expand dates that have proposals
    const proposalDates = new Set(proposals.map(p => p.delivery_date));

    setExpandedDates(new Set([todayStr, tomorrowStr, ...proposalDates]));
  }, [proposals]);

  // Load catalog when switching to catalog tab
  useEffect(() => {
    if (sidebarTab === 'catalog' && catalogItems.length === 0 && organizationId) {
      loadCatalog();
    }
  }, [sidebarTab, organizationId]);

  const loadOrders = async (showFullPageLoading = true) => {
    if (!organizationId) return;

    if (showFullPageLoading) setIsLoading(true);
    try {
      const { data, error } = await supabaseClient
        .from('orders')
        .select(`
          id,
          customer_name,
          status,
          delivery_date,
          created_at,
          updated_at,
          source_channel,
          order_lines (
            id,
            product_name,
            quantity,
            status,
            item_id,
            item_variant_id,
            items ( name ),
            item_variants ( variant_code )
          )
        `)
        .eq('organization_id', organizationId)
        .neq('status', 'cancelled')
        .order('delivery_date', { ascending: true })
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error loading orders:', error);
        return;
      }
      const transformedOrders: Order[] = (data || []).map((order: any) => {
        const activeLines = (order.order_lines || []).filter((l: any) => l.status === 'active');
        return {
          id: order.id,
          customer_name: order.customer_name || 'Unknown Customer',
          status: order.status || 'pending',
          source: order.source_channel || 'manual',
          delivery_date: order.delivery_date,
          created_at: order.created_at,
          items: activeLines.map((line: any) => ({
            order_line_id: line.id,
            name: line.items?.name || line.product_name || 'Unknown',
            size: line.item_variants?.variant_code || '',
            quantity: line.quantity || 0,
          })),
          line_count: activeLines.length,
        };
      });

      setOrders(transformedOrders);
    } catch (error) {
      console.error('Error loading orders:', error);
    } finally {
      if (showFullPageLoading) setIsLoading(false);
    }
  };

  // Helper to refresh both orders and proposals together, awaiting both
  // This ensures both complete before the loading spinner stops
  const refreshAll = async (showFullPageLoading = false) => {
    setIsRefreshingInbox(true);
    try {
      await Promise.all([loadOrders(showFullPageLoading), loadProposalsInternal()]);
    } finally {
      setIsRefreshingInbox(false);
    }
  };

  // Internal function that loads proposals without managing loading state
  const loadProposalsInternal = async () => {
    if (!organizationId) return;

    const { data, error } = await supabaseClient
      .from('order_change_proposals')
      .select(`
        id,
        order_id,
        status,
        intake_event_id,
        created_at,
        tags,
        orders ( customer_name, delivery_date ),
        intake_events ( channel, raw_content, created_at ),
        order_change_proposal_lines (
          id, change_type, item_name, item_id, item_variant_id,
          proposed_values, order_line_id,
          items ( id, item_variants ( id, variant_code, variant_name ) )
        )
      `)
      .eq('organization_id', organizationId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error loading proposals:', error);
      return;
    }

    const transformed: Proposal[] = (data || []).map((row: any) => {
      const ie = row.intake_events;
      const order = row.orders;
      const channel = ie?.channel || 'email';
      const rawContent = ie?.raw_content || {};

      // Build message preview from raw_content
      // Legacy cleanup for emails stored before UTF-8 decode fix
      const sanitizeText = (text: string) => text
        .replace(/\u00c2(?=[\u00a0\s]|[A-Z]|$)/g, '')
        .replace(/\u00a0/g, ' ');
      let messagePreview = '';
      if (channel === 'sms') {
        messagePreview = rawContent.body || '';
      } else {
        messagePreview = sanitizeText(rawContent.body_text || rawContent.subject || '');
      }

      // Build timeline from intake event
      const timeline: TimelineEvent[] = [];
      if (ie) {
        timeline.push({
          id: `comm-${row.id}`,
          type: 'communication',
          timestamp: ie.created_at,
          channel: channel as 'email' | 'sms',
          content: channel === 'sms' ? rawContent.body : (rawContent.body_text || ''),
          subject: rawContent.subject,
          from: rawContent.from,
        });
      }
      timeline.push({
        id: `ai-${row.id}`,
        type: 'event',
        timestamp: row.created_at,
        eventType: 'ai_analysis',
      });

      // Map proposal lines with available variants from joined items
      const lines: ProposalLine[] = (row.order_change_proposal_lines || []).map((pl: any) => ({
        id: pl.id,
        change_type: pl.change_type,
        order_line_id: pl.order_line_id,
        item_id: pl.item_id,
        item_variant_id: pl.item_variant_id,
        item_name: pl.item_name,
        size: pl.proposed_values?.variant_code || '',
        quantity: pl.proposed_values?.quantity || 0,
        original_quantity: pl.proposed_values?.original_quantity,
        original_size: pl.proposed_values?.original_variant_code,
        available_variants: pl.items?.item_variants?.map((v: { id: string; variant_code: string; variant_name: string }) => ({
          id: v.id,
          code: v.variant_code,
          name: v.variant_name
        })) || [],
      }));

      // Derive order_frequency from tags if present
      const tags: Record<string, string> = row.tags || {};
      const orderType = (tags.order_frequency === 'recurring' ? 'recurring' : tags.order_frequency === 'one-time' ? 'one-time' : undefined) as Proposal['order_frequency'];

      return {
        id: row.id,
        order_id: row.order_id,
        intake_event_id: row.intake_event_id,
        action: row.order_id ? 'assign' : 'create',
        order_frequency: orderType,
        customer_name: order?.customer_name
          || (row.order_change_proposal_lines || [])[0]?.proposed_values?.customer_name
          || rawContent.from
          || 'Unknown',
        delivery_date: order?.delivery_date
          || (row.order_change_proposal_lines || [])[0]?.proposed_values?.delivery_date
          || new Date().toISOString().split('T')[0],
        message_count: 1,
        channel: channel as 'email' | 'sms',
        created_at: row.created_at,
        message_preview: messagePreview.substring(0, 200),
        message_full: messagePreview,
        message_html: rawContent.body_html || undefined,
        sender: rawContent.from || undefined,
        subject: rawContent.subject || undefined,
        email_date: rawContent.date || undefined,
        lines,
        timeline,
      } as Proposal;
    });

    setProposals(transformed);
  };

  // Wrapper that manages loading state for standalone calls
  const loadProposals = async () => {
    setIsRefreshingInbox(true);
    try {
      await loadProposalsInternal();
    } finally {
      setIsRefreshingInbox(false);
    }
  };

  // Load catalog items
  const loadCatalog = async () => {
    if (!organizationId) return;
    setCatalogLoading(true);
    const { data, error } = await supabaseClient
      .from('items')
      .select('id, sku, name, item_variants(id, variant_code, variant_name)')
      .eq('organization_id', organizationId)
      .eq('active', true)
      .order('name');

    if (error) {
      console.error('Error loading catalog:', error);
    } else {
      setCatalogItems(data || []);
    }
    setCatalogLoading(false);
  };

  // Load customers for searchable dropdown
  const loadCustomers = async () => {
    if (!organizationId) return;
    const { data, error } = await supabaseClient
      .from('customers')
      .select('id, name, email, phone')
      .eq('organization_id', organizationId)
      .order('name');

    if (error) {
      console.error('Error loading customers:', error);
    } else {
      setCustomers(data || []);
    }
  };

  // Get proposals for a specific order
  const getProposalsForOrder = (orderId: string, customerName: string, deliveryDate: string) => {
    return proposals.filter(p =>
      p.order_id === orderId ||
      (p.order_id !== null && p.customer_name === customerName && p.delivery_date === deliveryDate)
    );
  };

  // Get new order proposals for a date
  const getNewOrderProposalsForDate = (dateKey: string) => {
    return proposals.filter(p => p.order_id === null && p.delivery_date === dateKey);
  };

  // Handlers — apply changes to order, update DB, then remove from local state
  const handleApplyChange = async (proposalId: string, lines: ProposalLine[]) => {
    // Find the proposal to get the order_id
    const proposal = proposals.find(p => p.id === proposalId);
    if (!proposal) return;

    setApplyingProposalId(proposalId);
    let orderId = proposal.order_id;

    try {
      // Check if this is a "delete order" scenario (all proposal lines are removals, no adds/modifies)
      // This check must happen BEFORE creating a new order
      const removeLines = lines.filter(l => l.change_type === 'remove');
      const addLines = lines.filter(l => l.change_type === 'add');
      const modifyLines = lines.filter(l => l.change_type === 'modify');

      // Only allow delete if there's an existing order AND all lines are removals
      const isDeleteOrder = orderId && lines.length > 0 &&
        removeLines.length === lines.length &&
        addLines.length === 0 &&
        modifyLines.length === 0;

      if (isDeleteOrder) {
        // Cancel the existing order
        const { error: cancelError } = await supabaseClient
          .from('orders')
          .update({ status: 'cancelled' })
          .eq('id', orderId);

        if (cancelError) {
          console.error('Error cancelling order:', cancelError);
          showToast('Failed to cancel order', 'error');
          return;
        }

        await supabaseClient
          .from('order_change_proposals')
          .update({ status: 'accepted', order_id: orderId })
          .eq('id', proposalId);

        setProposals(prev => prev.filter(p => p.id !== proposalId));
        loadOrders(false);
        showToast('Order cancelled');
        return;
      }

      // If no order_id, this is a new order - create it first
      if (!orderId) {
        // Look up customer_id from customer name
        const matchedCustomer = customers.find(c => c.name.toLowerCase() === proposal.customer_name.toLowerCase());

        const { data: newOrder, error: createError } = await supabaseClient
          .from('orders')
          .insert({
            organization_id: organizationId,
            customer_id: matchedCustomer?.id || null,
            customer_name: proposal.customer_name,
            status: 'pending_review',
            source_channel: proposal.channel,
            delivery_date: proposal.delivery_date,
          })
          .select()
          .single();

        if (createError || !newOrder) {
          console.error('Error creating order:', createError);
          showToast('Failed to create order', 'error');
          return;
        }

        orderId = newOrder.id;
      }

      // Get max line_number for new lines
      const { data: existingLines } = await supabaseClient
        .from('order_lines')
        .select('line_number')
        .eq('order_id', orderId)
        .order('line_number', { ascending: false })
        .limit(1);
      let nextLineNumber = (existingLines?.[0]?.line_number || 0) + 1;

      for (const line of lines) {
        if (line.change_type === 'add') {
          // Look up item_variant_id from available_variants on the line (loaded with proposal)
          let variantId = line.item_variant_id || null;
          if (line.size && line.available_variants?.length && !variantId) {
            const variant = line.available_variants.find(v => v.code === line.size);
            if (variant) {
              variantId = variant.id;
            }
          }

          await supabaseClient.from('order_lines').insert({
            order_id: orderId,
            line_number: nextLineNumber++,
            product_name: line.item_name,
            quantity: line.quantity,
            item_id: line.item_id || null,
            item_variant_id: variantId,
            status: 'active',
          });
        } else if (line.change_type === 'remove' && line.order_line_id) {
          await supabaseClient
            .from('order_lines')
            .update({ status: 'deleted' })
            .eq('id', line.order_line_id);
        } else if (line.change_type === 'modify' && line.order_line_id) {
          const updates: Record<string, unknown> = { quantity: line.quantity };

          // Look up item_variant_id from available_variants on the line (loaded with proposal)
          if (line.size && line.available_variants?.length) {
            const variant = line.available_variants.find(v => v.code === line.size);
            if (variant) {
              updates.item_variant_id = variant.id;
            }
          } else if (line.item_variant_id) {
            // Fallback to existing item_variant_id if no lookup possible
            updates.item_variant_id = line.item_variant_id;
          }

          await supabaseClient
            .from('order_lines')
            .update(updates)
            .eq('id', line.order_line_id);
        }
      }

      await supabaseClient
        .from('order_change_proposals')
        .update({ status: 'accepted', order_id: orderId })
        .eq('id', proposalId);
      setProposals(prev => prev.filter(p => p.id !== proposalId));
      loadOrders(false);
      showToast('Changes applied');
    } catch (error) {
      console.error('Error applying changes:', error);
      showToast('Failed to apply changes', 'error');
    } finally {
      setApplyingProposalId(null);
    }
  };

  const handleDismiss = async (proposalId: string) => {
    setDismissingProposalId(proposalId);
    try {
      await supabaseClient
        .from('order_change_proposals')
        .update({ status: 'rejected' })
        .eq('id', proposalId);
      setProposals(prev => prev.filter(p => p.id !== proposalId));
      showToast('Proposal dismissed');
    } catch (error) {
      console.error('Error dismissing proposal:', error);
      showToast('Failed to dismiss proposal', 'error');
    } finally {
      setDismissingProposalId(null);
    }
  };

  const handleCreateOrder = async (proposalId: string, lines: ProposalLine[], overrideCustomerName?: string, overrideDeliveryDate?: string) => {
    const proposal = proposals.find(p => p.id === proposalId);
    if (!proposal || !organizationId) return;

    try {
      // Look up customer_id from customer name
      const customerName = overrideCustomerName || proposal.customer_name;
      const matchedCustomer = customers.find(c => c.name.toLowerCase() === customerName.toLowerCase());

      // 1. Create the order in the database
      const { data: newOrderData, error: orderError } = await supabaseClient
        .from('orders')
        .insert({
          organization_id: organizationId,
          customer_id: matchedCustomer?.id || null,
          customer_name: customerName,
          status: 'ready',
          source_channel: proposal.channel,
          delivery_date: overrideDeliveryDate || proposal.delivery_date,
        })
        .select()
        .single();

      if (orderError) {
        console.error('Error creating order:', orderError);
        return;
      }

      // 2. Create order lines
      const orderLines = lines.map((line, index) => ({
        order_id: newOrderData.id,
        line_number: index + 1,
        item_id: line.item_id || null,
        item_variant_id: line.item_variant_id || null,
        product_name: line.item_name,
        quantity: line.quantity,
        status: 'active',
      }));

      const { error: linesError } = await supabaseClient
        .from('order_lines')
        .insert(orderLines);

      if (linesError) {
        console.error('Error creating order lines:', linesError);
        // Optionally rollback order creation here
        return;
      }

      // 3. Update proposal status to accepted
      await supabaseClient
        .from('order_change_proposals')
        .update({ status: 'accepted', order_id: newOrderData.id })
        .eq('id', proposalId);

      // 4. Update local state
      const newOrder: Order = {
        id: newOrderData.id,
        customer_name: overrideCustomerName || proposal.customer_name,
        status: 'ready',
        source: proposal.channel,
        delivery_date: overrideDeliveryDate || proposal.delivery_date,
        created_at: newOrderData.created_at,
        items: lines.map(line => ({
          order_line_id: line.id,
          name: line.item_name,
          size: line.size || '',
          quantity: line.quantity,
        })),
        line_count: lines.length,
      };
      setOrders(prev => [...prev, newOrder]);
      setProposals(prev => prev.filter(p => p.id !== proposalId));
      setCreateNewOrderModal(null);
      showToast('Order created');
    } catch (error) {
      console.error('Error creating order:', error);
      showToast('Failed to create order', 'error');
    }
  };

  const handleUpdateOrderFrequency = async (proposalId: string, value: 'one-time' | 'recurring') => {
    await supabaseClient
      .from('order_change_proposals')
      .update({ tags: { order_frequency: value } })
      .eq('id', proposalId);
  };

  const handleOpenCreateNewOrderModal = (proposalId: string) => {
    const proposal = proposals.find(p => p.id === proposalId);
    if (proposal) setCreateNewOrderModal({ proposal });
  };

  const handleOpenAssignToOrderModal = (proposalId: string, sourceOrderId: string | null) => {
    const proposal = proposals.find(p => p.id === proposalId);
    if (proposal) setAssignToOrderModal({ proposal, sourceOrderId });
  };

  // Get dates: today + next 7 days (8 days total)
  const displayDates = useMemo(() => {
    const dates: Date[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 0; i < 8; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      dates.push(date);
    }
    return dates;
  }, []);

  // Get orders grouped by date, then by customer
  const ordersByDateAndCustomer = useMemo(() => {
    const grouped: Record<string, Record<string, Order[]>> = {};

    orders.forEach(order => {
      const dateKey = order.delivery_date || order.created_at.split('T')[0];
      if (!grouped[dateKey]) {
        grouped[dateKey] = {};
      }
      if (!grouped[dateKey][order.customer_name]) {
        grouped[dateKey][order.customer_name] = [];
      }
      grouped[dateKey][order.customer_name].push(order);
    });

    return grouped;
  }, [orders]);

  const filteredDisplayDates = useMemo(() => {
    if (!hideEmptyDays) return displayDates;
    return displayDates.filter(date => {
      const dateKey = date.toISOString().split('T')[0];
      const customers = ordersByDateAndCustomer[dateKey] || {};
      return Object.values(customers).reduce((sum, o) => sum + o.length, 0) > 0;
    });
  }, [displayDates, hideEmptyDays, ordersByDateAndCustomer]);

  // Filter orders for list view
  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      const matchesSearch = searchQuery === '' ||
        order.customer_name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
      const matchesDate = !selectedDate || order.delivery_date === selectedDate;
      return matchesSearch && matchesStatus && matchesDate;
    });
  }, [orders, searchQuery, statusFilter, selectedDate]);

  const isToday = (date: Date) => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  const toggleDateExpanded = (dateKey: string) => {
    setExpandedDates(prev => {
      const next = new Set(prev);
      if (next.has(dateKey)) {
        next.delete(dateKey);
      } else {
        next.add(dateKey);
      }
      return next;
    });
  };


  const getSourceIcon = (source: string) => {
    switch (source) {
      case 'email':
        return <Mail className="w-4 h-4" />;
      case 'text':
      case 'sms':
        return <MessageSquare className="w-4 h-4" />;
      case 'edi':
        return <Package className="w-4 h-4" />;
      case 'erp':
        return <LayoutGrid className="w-4 h-4" />;
      default:
        return <Package className="w-4 h-4" />;
    }
  };

  const formatDateHeader = (date: Date) => {
    const today = new Date();
    const datePart = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    if (date.toDateString() === today.toDateString()) {
      return `Today · ${datePart}`;
    }
    return datePart;
  };

  const getOrdersForDate = (date: Date) => {
    const dateKey = date.toISOString().split('T')[0];
    return ordersByDateAndCustomer[dateKey] || {};
  };

  const getTotalOrdersForDate = (date: Date) => {
    const dateKey = date.toISOString().split('T')[0];
    const customers = ordersByDateAndCustomer[dateKey] || {};
    return Object.values(customers).reduce((sum, orders) => sum + orders.length, 0);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-green-600" />
        <span className="ml-3 text-gray-600">Loading orders...</span>
      </div>
    );
  }

  const inboxFeedElement = proposals.length > 0 ? (
    <InboxFeed
      proposals={proposals}
      orders={orders}
      customers={customers}
      onApplyChange={handleApplyChange}
      onCreateOrder={handleCreateOrder}
      onDismiss={handleDismiss}
      onOpenCreateNewOrderModal={handleOpenCreateNewOrderModal}
      onOpenAssignToOrderModal={handleOpenAssignToOrderModal}
      onUpdateOrderFrequency={handleUpdateOrderFrequency}
      onRefresh={refreshAll}
      isRefreshing={isRefreshingInbox}
      dismissingProposalId={dismissingProposalId}
      applyingProposalId={applyingProposalId}
    />
  ) : (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-amber-600" />
            <h3 className="text-lg font-semibold text-gray-900">Inbox</h3>
          </div>
        </div>
        {/* Refresh button temporarily disabled - use page reload instead
        <button
          onClick={refreshAll}
          disabled={isRefreshingInbox}
          className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
          title="Refresh inbox"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshingInbox ? 'animate-spin' : ''}`} />
        </button>
        */}
      </div>
      <div className="flex flex-col items-center justify-center py-12 text-gray-400">
        <Check className="w-8 h-8 mb-2" />
        <p className="text-sm">All caught up!</p>
      </div>
    </div>
  );

  const headerElement = (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Upcoming Orders</h2>
        <p className="text-gray-600">Today and the next 7 days</p>
      </div>

      <div className="flex items-center space-x-4">
        {viewMode === 'week' && (
          <label className="flex items-center space-x-2 text-sm text-gray-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={hideEmptyDays}
              onChange={(e) => setHideEmptyDays(e.target.checked)}
              className="rounded border-gray-300 text-green-600 focus:ring-green-500"
            />
            <span>Hide days with no orders</span>
          </label>
        )}
        {/* Reload */}
        <button
          onClick={() => { loadOrders(); loadProposals(); }}
          disabled={isLoading}
          className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
          title="Reload orders & proposals"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
        {/* View Toggle */}
        <div className="flex items-center bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setViewMode('week')}
            className={`flex items-center space-x-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              viewMode === 'week'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <LayoutGrid className="w-4 h-4" />
            <span>By Date</span>
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`flex items-center space-x-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              viewMode === 'list'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <List className="w-4 h-4" />
            <span>All Orders</span>
          </button>
        </div>
      </div>
    </div>
  );

  const modalsElement = (
    <>
      {createNewOrderModal && (
        <CreateNewOrderModal
          proposal={createNewOrderModal.proposal}
          customers={customers}
          onCreateOrder={handleCreateOrder}
          onClose={() => setCreateNewOrderModal(null)}
        />
      )}
      {assignToOrderModal && (
        <AssignToOrderModal
          proposal={assignToOrderModal.proposal}
          sourceOrderId={assignToOrderModal.sourceOrderId}
          allOrders={orders}
          onClose={() => setAssignToOrderModal(null)}
          onRefresh={refreshAll}
        />
      )}
    </>
  );

  // Frootful brand color
  const frootfulGreen = '#53AD6D';

  if (layout === 'sidebar') {
    return (
      <div className="flex h-screen">
        {/* Side Nav - Frootful style (light theme) */}
        <nav className={`${sidebarCollapsed ? 'w-16' : 'w-56'} flex-shrink-0 bg-white border-r border-gray-200 flex flex-col transition-all duration-200`}>
          {/* Logo / Brand area with collapse toggle */}
          <div className={`h-16 flex items-center justify-between ${sidebarCollapsed ? 'px-2' : 'px-4'} border-b border-gray-100`}>
            {sidebarCollapsed ? (
              /* Collapsed: just the logo icon, clickable to expand */
              <button
                onClick={() => setSidebarCollapsed(false)}
                className="w-full flex justify-center p-2 rounded-lg hover:bg-gray-100 transition-colors"
                title="Expand sidebar"
              >
                <svg width="28" height="28" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M50 10 L85 45 L75 55 L50 30 L25 55 L15 45 Z" fill={frootfulGreen} rx="8"/>
                  <path d="M50 35 L75 60 L65 70 L50 55 L35 70 L25 60 Z" fill={frootfulGreen} rx="8"/>
                </svg>
              </button>
            ) : (
              /* Expanded: logo + text + collapse button */
              <>
                <div className="flex items-center gap-2">
                  <svg width="28" height="28" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M50 10 L85 45 L75 55 L50 30 L25 55 L15 45 Z" fill={frootfulGreen} rx="8"/>
                    <path d="M50 35 L75 60 L65 70 L50 55 L35 70 L25 60 Z" fill={frootfulGreen} rx="8"/>
                  </svg>
                  <span className="text-2xl font-bold" style={{ color: frootfulGreen }}>Frootful</span>
                </div>
                <button
                  onClick={() => setSidebarCollapsed(true)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                  title="Collapse sidebar"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
              </>
            )}
          </div>

          {/* Nav items */}
          <div className="flex-1 py-4">
            <div className={`space-y-1 ${sidebarCollapsed ? 'px-2' : 'px-3'}`}>
              <button
                onClick={() => setSidebarTab('inbox')}
                className={`relative w-full flex items-center ${sidebarCollapsed ? 'justify-center' : ''} gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                  sidebarTab === 'inbox'
                    ? 'text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
                style={sidebarTab === 'inbox' ? { backgroundColor: frootfulGreen } : undefined}
                title="Inbox"
              >
                <Inbox className="w-5 h-5 flex-shrink-0" />
                {!sidebarCollapsed && <span className="font-medium">Inbox</span>}
                {proposals.length > 0 && (
                  <span className={`${sidebarCollapsed ? 'absolute -top-1 -right-1' : 'ml-auto'} min-w-[20px] h-5 flex items-center justify-center bg-red-500 text-white text-xs font-bold rounded-full px-1`}>
                    {proposals.length > 99 ? '99+' : proposals.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setSidebarTab('orders')}
                className={`w-full flex items-center ${sidebarCollapsed ? 'justify-center' : ''} gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                  sidebarTab === 'orders'
                    ? 'text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
                style={sidebarTab === 'orders' ? { backgroundColor: frootfulGreen } : undefined}
                title="Orders"
              >
                <Package className="w-5 h-5 flex-shrink-0" />
                {!sidebarCollapsed && <span className="font-medium">Orders</span>}
              </button>
              <button
                onClick={() => setSidebarTab('catalog')}
                className={`w-full flex items-center ${sidebarCollapsed ? 'justify-center' : ''} gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                  sidebarTab === 'catalog'
                    ? 'text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
                style={sidebarTab === 'catalog' ? { backgroundColor: frootfulGreen } : undefined}
                title="Catalog"
              >
                <ShoppingBag className="w-5 h-5 flex-shrink-0" />
                {!sidebarCollapsed && <span className="font-medium">Catalog</span>}
              </button>
            </div>
          </div>

          {/* Bottom collapse/expand arrow */}
          <div className={`border-t border-gray-100 p-2 ${sidebarCollapsed ? 'px-2' : 'px-3'}`}>
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="w-full flex items-center justify-center p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              title={sidebarCollapsed ? 'Expand navigation' : 'Collapse navigation'}
            >
              {sidebarCollapsed ? (
                <ChevronRight className="w-5 h-5" />
              ) : (
                <ChevronLeft className="w-5 h-5" />
              )}
            </button>
          </div>

        </nav>

        {/* Right side: Header + Content */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          {headerContent && (
            <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 flex-shrink-0">
              <div className="flex items-center space-x-3">
                {headerContent.organization ? (
                  <div className="flex items-center space-x-2 px-3 py-1 bg-green-50 rounded-lg border border-green-200">
                    <Building2 className="w-4 h-4 text-green-600" />
                    <span className="text-sm font-medium text-green-900">{headerContent.organization.name}</span>
                  </div>
                ) : (
                  <div className="flex items-center space-x-2 px-3 py-1 bg-red-50 rounded-lg border border-red-200">
                    <AlertCircle className="w-4 h-4 text-red-600" />
                    <span className="text-sm font-medium text-red-900">No Organization</span>
                  </div>
                )}
              </div>

              <div className="flex items-center space-x-4">
                {/* PWA Install Button */}
                {headerContent.isInstallable && (
                  <button
                    onClick={headerContent.onInstallPWA}
                    className="flex items-center space-x-2 px-3 py-1.5 text-sm bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors"
                  >
                    <Smartphone className="w-4 h-4" />
                    <span>Install App</span>
                  </button>
                )}

                {headerContent.user && (
                  <div className="flex items-center space-x-3">
                    <div className="text-right">
                      <p className="text-sm font-medium text-gray-900">{headerContent.user.user_metadata?.full_name || headerContent.user.email}</p>
                      <p className="text-xs text-gray-500">Connected to Gmail</p>
                    </div>
                    {headerContent.user.user_metadata?.avatar_url && (
                      <img
                        src={headerContent.user.user_metadata.avatar_url}
                        alt="Profile"
                        className="w-8 h-8 rounded-full"
                      />
                    )}
                  </div>
                )}
                <div className="relative group">
                  <button className="p-2 text-gray-400 hover:text-gray-600 transition-colors rounded-lg hover:bg-gray-100">
                    <Settings className="w-5 h-5" />
                  </button>
                  <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg py-1 z-10 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 border border-gray-200">
                    <button
                      onClick={headerContent.onNavigateSettings}
                      className="flex items-center gap-2 w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                    >
                      <Settings className="w-4 h-4" />
                      Settings
                    </button>
                    <button
                      onClick={headerContent.onSignOut}
                      disabled={headerContent.isSigningOut}
                      className="flex items-center gap-2 w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {headerContent.isSigningOut ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Signing out...</span>
                        </>
                      ) : (
                        <>
                          <LogOut className="w-4 h-4" />
                          <span>Sign Out</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </header>
          )}

          {/* Main Content */}
          <main className="flex-1 min-w-0 p-6 overflow-y-auto bg-gray-50">
            {sidebarTab === 'inbox' && (
            <div className="space-y-4">
              {proposals.length > 0 ? (
                inboxFeedElement
              ) : (
                <div className="bg-white rounded-xl border border-gray-200">
                  <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                    <div className="flex items-center gap-2">
                      <Bell className="w-5 h-5 text-amber-600" />
                      <h3 className="text-lg font-semibold text-gray-900">Inbox</h3>
                    </div>
                    {/* Refresh button temporarily disabled - use page reload instead
                    <button
                      onClick={loadProposals}
                      disabled={isRefreshingInbox}
                      className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
                      title="Refresh inbox"
                    >
                      <RefreshCw className={`w-4 h-4 ${isRefreshingInbox ? 'animate-spin' : ''}`} />
                    </button>
                    */}
                  </div>
                  <div className="p-12 text-center text-gray-500">
                    <Inbox className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                    <p className="text-lg font-medium text-gray-900 mb-1">All caught up</p>
                    <p>No new messages to review</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Upload content - hidden for now */}
          {/* {sidebarTab === 'upload' && <UploadOrdersSection />} */}

          {/* Analytics content - hidden for now */}
          {/* {sidebarTab === 'analytics' && <AnalyticsDashboard />} */}

          {sidebarTab === 'catalog' && (
            <div className="bg-white rounded-xl border border-gray-200">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <ShoppingBag className="w-5 h-5 text-green-600" />
                  <h3 className="text-lg font-semibold text-gray-900">Catalog ({catalogItems.length} items)</h3>
                </div>
                <button
                  onClick={loadCatalog}
                  disabled={catalogLoading}
                  className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
                  title="Refresh catalog"
                >
                  <RefreshCw className={`w-4 h-4 ${catalogLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>

              {/* Search */}
              <div className="px-6 py-3 border-b border-gray-100">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search items..."
                    value={catalogSearch}
                    onChange={(e) => setCatalogSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
                  />
                </div>
              </div>

              {catalogLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-green-600" />
                </div>
              ) : catalogItems.length === 0 ? (
                <div className="p-12 text-center text-gray-500">
                  <ShoppingBag className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p className="text-lg font-medium text-gray-900 mb-1">No items in catalog</p>
                  <p>Items will appear here once added to your organization.</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100 max-h-[calc(100vh-280px)] overflow-y-auto">
                  {catalogItems
                    .filter(item =>
                      catalogSearch === '' ||
                      item.name.toLowerCase().includes(catalogSearch.toLowerCase()) ||
                      item.sku.toLowerCase().includes(catalogSearch.toLowerCase())
                    )
                    .map((item) => {
                      const isExpanded = expandedCatalogItems.has(item.id);
                      const hasVariants = item.item_variants && item.item_variants.length > 0;

                      return (
                        <div key={item.id}>
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
                            className={`w-full px-6 py-3 text-left flex items-center justify-between hover:bg-gray-50 ${hasVariants ? 'cursor-pointer' : 'cursor-default'}`}
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
                            <div className="bg-gray-50 border-t border-gray-100">
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="text-xs text-gray-500 border-b border-gray-200">
                                    <th className="text-left px-6 py-2 pl-14">Variant</th>
                                    <th className="text-left px-4 py-2">Code</th>
                                    <th className="text-left px-4 py-2">Full SKU</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {item.item_variants.map((variant) => (
                                    <tr key={variant.id} className="border-b border-gray-100 last:border-b-0">
                                      <td className="px-6 py-2 pl-14 text-gray-700">{variant.variant_name}</td>
                                      <td className="px-4 py-2">
                                        <span className="inline-block px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs font-medium">
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

          {sidebarTab === 'orders' && (
            <div className="space-y-6">
              {headerElement}

              {!isLoading && (
                (viewMode === 'week' && filteredDisplayDates.length === 0) ||
                (viewMode === 'list' && filteredOrders.length === 0)
              ) && (
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-8 text-center">
                  <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  <h3 className="text-lg font-medium text-gray-900 mb-1">No orders found</h3>
                  <p className="text-sm text-gray-500">No orders found for the next 7 days. Orders will appear here once they are created or imported.</p>
                </div>
              )}

              {viewMode === 'week' ? (
                <div className="space-y-4">
                  {filteredDisplayDates.map(date => {
                    const dateKey = date.toISOString().split('T')[0];
                    const customersForDate = getOrdersForDate(date);
                    const customerNames = Object.keys(customersForDate).sort((a, b) => {
                      const aFirst = customersForDate[a][0]?.created_at || '';
                      const bFirst = customersForDate[b][0]?.created_at || '';
                      return aFirst.localeCompare(bFirst);
                    });
                    const totalOrders = getTotalOrdersForDate(date);
                    const isExpanded = expandedDates.has(dateKey);
                    const today = isToday(date);

                    return (
                      <div
                        key={dateKey}
                        className={`bg-white rounded-xl shadow-sm border overflow-hidden transition-all ${
                          today ? 'border-green-300 ring-2 ring-green-100' : 'border-gray-200'
                        }`}
                      >
                        <button
                          onClick={() => toggleDateExpanded(dateKey)}
                          className={`w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors ${
                            today ? 'bg-green-50' : ''
                          }`}
                        >
                          <div className="flex items-center space-x-4">
                            <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                              today ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-700'
                            }`}>
                              <span className="text-sm font-bold">{date.toLocaleDateString('en-US', { weekday: 'short' })}</span>
                            </div>
                            <div className="text-left">
                              <h4 className={`text-lg font-semibold ${today ? 'text-green-700' : 'text-gray-900'}`}>
                                {formatDateHeader(date)}
                              </h4>
                              <p className="text-sm text-gray-500">
                                {totalOrders > 0
                                  ? `${customerNames.length} customer${customerNames.length !== 1 ? 's' : ''} · ${totalOrders} order${totalOrders !== 1 ? 's' : ''}`
                                  : 'No orders scheduled'
                                }
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center space-x-3">
                            {totalOrders > 0 && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const allOrdersForDate = Object.values(customersForDate).flat();
                                  printPackingSummary(dateKey, allOrdersForDate);
                                }}
                                className="flex items-center gap-1 px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-sm font-medium hover:bg-gray-200 transition-colors"
                                title="Print packing summary"
                              >
                                <Printer className="w-4 h-4" />
                                Print
                              </button>
                            )}
                            {totalOrders > 0 && (
                              <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm font-medium">
                                {totalOrders} order{totalOrders !== 1 ? 's' : ''}
                              </span>
                            )}
                            {isExpanded ? (
                              <ChevronUp className="w-5 h-5 text-gray-400" />
                            ) : (
                              <ChevronDown className="w-5 h-5 text-gray-400" />
                            )}
                          </div>
                        </button>

                        {isExpanded && (
                          <div className="border-t border-gray-200">
                            {customerNames.length > 0 ? (
                              <div className="divide-y divide-gray-100">
                                {customerNames.map(customerName => {
                                  const customerOrders = customersForDate[customerName];
                                  const isCustomerSelected = selectedCustomer?.date === dateKey && selectedCustomer?.customer === customerName;
                                  const totalItems = customerOrders.reduce((sum, o) => sum + (o.items?.length || o.line_count || 0), 0);

                                  return (
                                    <div key={customerName}>
                                      <button
                                        onClick={() => setSelectedCustomer(
                                          isCustomerSelected ? null : { date: dateKey, customer: customerName }
                                        )}
                                        className={`w-full flex items-center justify-between p-4 pl-8 hover:bg-gray-50 transition-colors ${
                                          isCustomerSelected ? 'bg-blue-50' : ''
                                        }`}
                                      >
                                        <div className="flex items-center space-x-3">
                                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-medium">
                                            {customerName.charAt(0).toUpperCase()}
                                          </div>
                                          <div className="text-left">
                                            <h5 className="font-medium text-gray-900">{customerName}</h5>
                                            <p className="text-sm text-gray-500">
                                              {totalItems} item{totalItems !== 1 ? 's' : ''}
                                            </p>
                                          </div>
                                        </div>
                                        <div className="flex items-center space-x-3">
                                          {/* Source labels for this customer's orders */}
                                          <div className="flex items-center gap-1">
                                            {[...new Set(customerOrders.map(o => o.source))].map(source => (
                                              <Tooltip
                                                key={source}
                                                text={`${source === 'sms' || source === 'text' ? 'SMS' : source === 'erp' ? 'ERP' : source === 'edi' ? 'EDI' : 'Email'} order`}
                                                position="bottom"
                                              >
                                                <div
                                                  className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
                                                    source === 'email' ? 'bg-blue-100 text-blue-600' :
                                                    source === 'sms' || source === 'text' ? 'bg-purple-100 text-purple-600' :
                                                    source === 'edi' ? 'bg-orange-100 text-orange-600' :
                                                    source === 'erp' ? 'bg-teal-100 text-teal-600' :
                                                    'bg-gray-100 text-gray-600'
                                                  }`}
                                                >
                                                  {getSourceIcon(source)}
                                                  <span>{source === 'sms' || source === 'text' ? 'SMS' : source === 'erp' ? 'ERP' : source === 'edi' ? 'EDI' : 'Email'}</span>
                                                </div>
                                              </Tooltip>
                                            ))}
                                          </div>
                                          {isCustomerSelected ? (
                                            <ChevronUp className="w-4 h-4 text-gray-400" />
                                          ) : (
                                            <ChevronDown className="w-4 h-4 text-gray-400" />
                                          )}
                                        </div>
                                      </button>

                                      {isCustomerSelected && (
                                        <div className="bg-gray-50 border-t border-gray-200 p-4 pl-12">
                                          <div className="space-y-3">
                                            {customerOrders.map(order => (
                                                <div
                                                  key={order.id}
                                                  className="rounded-lg border bg-white border-gray-200 p-4"
                                                >
                                                  {order.items.length > 0 && (
                                                    <table className="w-full text-sm">
                                                      <thead>
                                                        <tr className="text-left text-xs text-gray-400 uppercase tracking-wider">
                                                          <th className="pb-2 font-medium">Item</th>
                                                          <th className="pb-2 font-medium w-16 text-center">Size</th>
                                                          <th className="pb-2 font-medium w-12 text-center">Qty</th>
                                                        </tr>
                                                      </thead>
                                                      <tbody className="divide-y divide-gray-100">
                                                        {order.items.map((item, idx) => (
                                                          <tr key={idx}>
                                                            <td className="py-1.5 text-gray-700">{item.name}</td>
                                                            <td className="py-1.5 text-center text-gray-500">{item.size}</td>
                                                            <td className="py-1.5 text-center text-gray-700 font-medium">{item.quantity}</td>
                                                          </tr>
                                                        ))}
                                                      </tbody>
                                                    </table>
                                                  )}
                                                </div>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <div className="p-8 text-center text-gray-500">
                                <Package className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                                <p>No orders scheduled for this day</p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                    <div className="flex flex-col sm:flex-row gap-4">
                      <div className="flex-1 relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <input
                          type="text"
                          placeholder="Search by customer name..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                        />
                      </div>
                      <div className="flex items-center space-x-2">
                        <Filter className="w-5 h-5 text-gray-400" />
                        <select
                          value={statusFilter}
                          onChange={(e) => setStatusFilter(e.target.value)}
                          className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                        >
                          <option value="all">All Statuses</option>
                          <option value="processing">Processing</option>
                          <option value="analyzed">Analyzed</option>
                          <option value="pushed_to_erp">Exported</option>
                          <option value="needs_review">Needs Review</option>
                          <option value="failed">Failed</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-200">
                      <h3 className="text-lg font-semibold text-gray-900">
                        All Orders
                        <span className="ml-2 text-sm font-normal text-gray-500">
                          ({filteredOrders.length} orders)
                        </span>
                      </h3>
                    </div>
                    {filteredOrders.length === 0 ? (
                      <div className="p-12 text-center text-gray-500">
                        <Package className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                        <p>No orders found matching your criteria</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-gray-200">
                        {filteredOrders.map(order => (
                          <div key={order.id} className="p-4 hover:bg-gray-50 transition-colors cursor-pointer">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center space-x-4">
                                <div className={`p-2 rounded-lg ${
                                  order.source === 'email' ? 'bg-blue-100 text-blue-600' :
                                  order.source === 'sms' || order.source === 'text' ? 'bg-purple-100 text-purple-600' :
                                  order.source === 'edi' ? 'bg-orange-100 text-orange-600' :
                                  order.source === 'erp' ? 'bg-teal-100 text-teal-600' :
                                  'bg-gray-100 text-gray-600'
                                }`}>
                                  {getSourceIcon(order.source)}
                                </div>
                                <div>
                                  <div className="font-medium text-gray-900">{order.customer_name}</div>
                                  <div className="flex items-center space-x-3 text-sm text-gray-500">
                                    <span className="flex items-center space-x-1">
                                      <CalendarIcon className="w-4 h-4" />
                                      <span>
                                        {order.delivery_date
                                          ? new Date(order.delivery_date + 'T00:00:00').toLocaleDateString('en-US', {
                                              weekday: 'short', month: 'short', day: 'numeric'
                                            })
                                          : 'No delivery date'}
                                      </span>
                                    </span>
                                    <span>&middot;</span>
                                    <span>{order.line_count || 0} items</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
          </main>
        </div>

        {modalsElement}

        {/* Toast notification */}
        {toast && (
          <div className={`fixed bottom-4 right-4 px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 z-50 ${
            toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
          }`}>
            {toast.type === 'success' ? (
              <Check className="w-4 h-4" />
            ) : (
              <X className="w-4 h-4" />
            )}
            {toast.message}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {headerElement}

      {viewMode === 'week' ? (
        <>
          {/* Inbox Feed */}
          {proposals.length > 0 && inboxFeedElement}

          {/* Days List */}
          <div className="space-y-4">
            {filteredDisplayDates.map(date => {
              const dateKey = date.toISOString().split('T')[0];
              const customersForDate = getOrdersForDate(date);
              const customerNames = Object.keys(customersForDate).sort((a, b) => {
                const aFirst = customersForDate[a][0]?.created_at || '';
                const bFirst = customersForDate[b][0]?.created_at || '';
                return aFirst.localeCompare(bFirst);
              });
              const totalOrders = getTotalOrdersForDate(date);
              const isExpanded = expandedDates.has(dateKey);
              const today = isToday(date);

              return (
                <div
                  key={dateKey}
                  className={`bg-white rounded-xl shadow-sm border overflow-hidden transition-all ${
                    today ? 'border-green-300 ring-2 ring-green-100' : 'border-gray-200'
                  }`}
                >
                  {/* Date Header */}
                  <button
                    onClick={() => toggleDateExpanded(dateKey)}
                    className={`w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors ${
                      today ? 'bg-green-50' : ''
                    }`}
                  >
                    <div className="flex items-center space-x-4">
                      <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                        today ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-700'
                      }`}>
                        <span className="text-sm font-bold">{date.toLocaleDateString('en-US', { weekday: 'short' })}</span>
                      </div>
                      <div className="text-left">
                        <h4 className={`text-lg font-semibold ${today ? 'text-green-700' : 'text-gray-900'}`}>
                          {formatDateHeader(date)}
                        </h4>
                        <p className="text-sm text-gray-500">
                          {totalOrders > 0
                            ? `${customerNames.length} customer${customerNames.length !== 1 ? 's' : ''} · ${totalOrders} order${totalOrders !== 1 ? 's' : ''}`
                            : 'No orders scheduled'
                          }
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-3">
                      {totalOrders > 0 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const allOrdersForDate = Object.values(customersForDate).flat();
                            printPackingSummary(dateKey, allOrdersForDate);
                          }}
                          className="flex items-center gap-1 px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-sm font-medium hover:bg-gray-200 transition-colors"
                          title="Print packing summary"
                        >
                          <Printer className="w-4 h-4" />
                          Print
                        </button>
                      )}
                      {totalOrders > 0 && (
                        <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm font-medium">
                          {totalOrders} order{totalOrders !== 1 ? 's' : ''}
                        </span>
                      )}
                      {isExpanded ? (
                        <ChevronUp className="w-5 h-5 text-gray-400" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-gray-400" />
                      )}
                    </div>
                  </button>

                  {/* Expanded Content */}
                  {isExpanded && (
                    <div className="border-t border-gray-200">
                      {/* Existing Customers */}
                      {customerNames.length > 0 && (
                        <div className="divide-y divide-gray-100">
                          {customerNames.map(customerName => {
                            const customerOrders = customersForDate[customerName];
                            const isCustomerSelected = selectedCustomer?.date === dateKey && selectedCustomer?.customer === customerName;
                            const totalItems = customerOrders.reduce((sum, o) => sum + (o.items?.length || o.line_count || 0), 0);

                            return (
                              <div key={customerName}>
                                {/* Customer Row */}
                                <button
                                  onClick={() => setSelectedCustomer(
                                    isCustomerSelected ? null : { date: dateKey, customer: customerName }
                                  )}
                                  className={`w-full flex items-center justify-between p-4 pl-8 hover:bg-gray-50 transition-colors ${
                                    isCustomerSelected ? 'bg-blue-50' : ''
                                  }`}
                                >
                                  <div className="flex items-center space-x-3">
                                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-medium">
                                      {customerName.charAt(0).toUpperCase()}
                                    </div>
                                    <div className="text-left">
                                      <h5 className="font-medium text-gray-900">{customerName}</h5>
                                      <p className="text-sm text-gray-500">
                                        {totalItems} item{totalItems !== 1 ? 's' : ''}
                                      </p>
                                    </div>
                                  </div>

                                  <div className="flex items-center space-x-3">
                                    {/* Source labels for this customer's orders */}
                                    <div className="flex items-center gap-1">
                                      {[...new Set(customerOrders.map(o => o.source))].map(source => (
                                        <Tooltip
                                          key={source}
                                          text={`${source === 'sms' || source === 'text' ? 'SMS' : source === 'erp' ? 'ERP' : source === 'edi' ? 'EDI' : 'Email'} order`}
                                          position="bottom"
                                        >
                                          <div
                                            className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
                                              source === 'email' ? 'bg-blue-100 text-blue-600' :
                                              source === 'sms' || source === 'text' ? 'bg-purple-100 text-purple-600' :
                                              source === 'edi' ? 'bg-orange-100 text-orange-600' :
                                              source === 'erp' ? 'bg-teal-100 text-teal-600' :
                                              'bg-gray-100 text-gray-600'
                                            }`}
                                          >
                                            {getSourceIcon(source)}
                                            <span>{source === 'sms' || source === 'text' ? 'SMS' : source === 'erp' ? 'ERP' : source === 'edi' ? 'EDI' : 'Email'}</span>
                                          </div>
                                        </Tooltip>
                                      ))}
                                    </div>
                                    {isCustomerSelected ? (
                                      <ChevronUp className="w-4 h-4 text-gray-400" />
                                    ) : (
                                      <ChevronDown className="w-4 h-4 text-gray-400" />
                                    )}
                                  </div>
                                </button>

                                {/* Customer Orders (expanded) */}
                                {isCustomerSelected && (
                                  <div className="bg-gray-50 border-t border-gray-200 p-4 pl-12">
                                    <div className="space-y-3">
                                      {customerOrders.map(order => (
                                          <div
                                            key={order.id}
                                            className="rounded-lg border bg-white border-gray-200 p-4"
                                          >
                                            {order.items.length > 0 && (
                                              <table className="w-full text-sm">
                                                <thead>
                                                  <tr className="text-left text-xs text-gray-400 uppercase tracking-wider">
                                                    <th className="pb-2 font-medium">Item</th>
                                                    <th className="pb-2 font-medium w-16 text-center">Size</th>
                                                    <th className="pb-2 font-medium w-12 text-center">Qty</th>
                                                  </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-100">
                                                  {order.items.map((item, idx) => (
                                                    <tr key={idx}>
                                                      <td className="py-1.5 text-gray-700">{item.name}</td>
                                                      <td className="py-1.5 text-center text-gray-500">{item.size}</td>
                                                      <td className="py-1.5 text-center text-gray-700 font-medium">{item.quantity}</td>
                                                    </tr>
                                                  ))}
                                                </tbody>
                                              </table>
                                            )}
                                          </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Empty State */}
                      {customerNames.length === 0 && (
                        <div className="p-8 text-center text-gray-500">
                          <Package className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                          <p>No orders scheduled for this day</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      ) : (
        /* List View */
        <div className="space-y-4">
          {/* Filters */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by customer name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                />
              </div>

              <div className="flex items-center space-x-2">
                <Filter className="w-5 h-5 text-gray-400" />
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                >
                  <option value="all">All Statuses</option>
                  <option value="pending">Pending</option>
                  <option value="processing">Processing</option>
                  <option value="analyzed">Analyzed</option>
                  <option value="pushed_to_erp">Exported</option>
                  <option value="needs_review">Needs Review</option>
                  <option value="failed">Failed</option>
                </select>
              </div>

              {/* Date Picker */}
              <div className="flex items-center space-x-2">
                <CalendarIcon className="w-5 h-5 text-gray-400" />
                <input
                  type="date"
                  value={selectedDate || ''}
                  onChange={(e) => setSelectedDate(e.target.value || null)}
                  className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                />
                {selectedDate && (
                  <button
                    onClick={() => setSelectedDate(null)}
                    className="p-2 text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Orders List */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">
                All Orders
                <span className="ml-2 text-sm font-normal text-gray-500">
                  ({filteredOrders.length} orders)
                </span>
              </h3>
            </div>

            {filteredOrders.length === 0 ? (
              <div className="p-12 text-center text-gray-500">
                <Package className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p>No orders found matching your criteria</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {filteredOrders.map(order => (
                  <div
                    key={order.id}
                    className="p-4 hover:bg-gray-50 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <div className={`p-2 rounded-lg ${
                          order.source === 'email' ? 'bg-blue-100 text-blue-600' :
                          order.source === 'sms' || order.source === 'text' ? 'bg-purple-100 text-purple-600' :
                          order.source === 'edi' ? 'bg-orange-100 text-orange-600' :
                          order.source === 'erp' ? 'bg-teal-100 text-teal-600' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {getSourceIcon(order.source)}
                        </div>

                        <div>
                          <div className="font-medium text-gray-900">{order.customer_name}</div>
                          <div className="flex items-center space-x-3 text-sm text-gray-500">
                            <span className="flex items-center space-x-1">
                              <CalendarIcon className="w-4 h-4" />
                              <span>
                                {order.delivery_date
                                  ? new Date(order.delivery_date + 'T00:00:00').toLocaleDateString('en-US', {
                                      weekday: 'short',
                                      month: 'short',
                                      day: 'numeric'
                                    })
                                  : 'No delivery date'}
                              </span>
                            </span>
                            <span>&middot;</span>
                            <span>{order.line_count || 0} items</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center space-x-4">
                        <div className="text-right text-sm text-gray-500">
                          <div>Created</div>
                          <div>
                            {new Date(order.created_at).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric'
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {modalsElement}

      {/* Toast notification */}
      {toast && (
        <div className={`fixed bottom-4 right-4 px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 z-50 ${
          toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {toast.type === 'success' ? (
            <Check className="w-4 h-4" />
          ) : (
            <X className="w-4 h-4" />
          )}
          {toast.message}
        </div>
      )}
    </div>
  );
};

export default DashboardV3;
