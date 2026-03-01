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
  Clock,
  Filter,
  Inbox,
  LayoutDashboard,
  LayoutGrid,
  List,
  Loader2,
  LogOut,
  Mail,
  MessageSquare,
  Package,
  Paperclip,
  Phone,
  Plus,
  Printer,
  Search,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  RefreshCw,
  Repeat,
  Settings,
  ShoppingBag,
  Upload,
  User,
  Users,
  X,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Maximize2,
  MoreHorizontal,
  Pencil,
  Trash2,
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabaseClient, getAccessToken } from '../supabaseClient';
import UploadOrdersSection from './UploadOrdersSection';
import AnalyticsDashboard from './AnalyticsDashboard';
import * as XLSX from 'xlsx';

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
  item_id?: string;
  item_variant_id?: string;
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
  source: 'email' | 'text' | 'manual' | 'edi' | 'sms' | 'erp' | 'dashboard';
  delivery_date?: string;
  created_at: string;
  line_count?: number;
  sort_position?: number | null;
}

type ProposalType = 'new_order' | 'change_order' | 'cancel_order';

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
  delivery_date?: string;
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

interface ProposalAttachment {
  id: string;
  filename: string;
  extension: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  storage_path: string;
  processing_status: string;
}

interface Proposal {
  id: string;
  order_id: string | null; // null = new order proposal
  type?: ProposalType;
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
  tags?: { order_frequency?: string; erp_sync_status?: string; source?: string; [key: string]: string | undefined };
  attachments?: ProposalAttachment[];
}

interface Customer {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
  item_notes?: CustomerItemNote[];
}

interface CustomerItemNote {
  id: string;
  item_name: string;
  note: string;
}

interface IntakeHistoryProposalLine {
  id: string;
  change_type: 'add' | 'modify' | 'remove';
  item_name: string;
  proposed_values?: {
    quantity?: number;
    variant_code?: string;
  };
}

interface IntakeHistoryProposal {
  id: string;
  status: 'pending' | 'accepted' | 'rejected' | null;
  type?: ProposalType;
  customer_name: string | null;
  delivery_date: string | null;
  order_id: string | null;
  lines: IntakeHistoryProposalLine[];
  tags?: {
    order_frequency?: 'one-time' | 'recurring';
    erp_sync_status?: 'pending' | 'synced';
  };
}

interface IntakeHistoryItem {
  id: string;
  channel: 'email' | 'sms';
  provider: string;
  created_at: string;
  raw_content: {
    from?: string;
    subject?: string;
    body?: string;
    body_text?: string;
  };
  proposals: IntakeHistoryProposal[];
}

interface HeaderContentProps {
  organization: { id: string; name: string } | null;
  user: { email?: string; user_metadata?: { full_name?: string; avatar_url?: string } } | null;
  isSigningOut: boolean;
  onSignOut: () => void;
  onNavigateSettings: () => void;
}

interface DashboardProps {
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
const DAY_3 = new Date(TODAY);
DAY_3.setDate(TODAY.getDate() + 3);
const DAY_4 = new Date(TODAY);
DAY_4.setDate(TODAY.getDate() + 4);
const FEB_3 = new Date(TODAY);
FEB_3.setDate(TODAY.getDate() + 5);
const FEB_4 = new Date(TODAY);
FEB_4.setDate(TODAY.getDate() + 6);

// Helper to build timeline entries concisely
const mkTl = (id: string, minsAgo: number, ch: 'sms' | 'email', content: string, from: string, subject?: string): TimelineEvent[] => [
  { id: `${id}-msg`, type: 'communication', timestamp: new Date(Date.now() - minsAgo * 60 * 1000).toISOString(), channel: ch, content, from, subject },
  { id: `${id}-ai`, type: 'event', timestamp: new Date(Date.now() - (minsAgo - 1) * 60 * 1000).toISOString(), eventType: 'ai_analysis' },
];

const d = (dt: Date) => dt.toISOString().split('T')[0];
const ago = (mins: number) => new Date(Date.now() - mins * 60 * 1000).toISOString();

const MOCK_STANDING_ORDERS: Order[] = [
  // 1. Orange Flower Connect — PO #61203 Rainbow Dianthus (from 1081.png)
  {
    id: 'order-1',
    order_number: 'ORD-61203',
    customer_name: 'Orange Flower Connect',
    customer_email: 'sales@orangeflower.co',
    items: [
      { name: 'Rainbow Dianthus 8 Stem Mix Bunch x12', size: 'Large', quantity: 34 },
    ],
    status: 'ready',
    source: 'email',
    delivery_date: d(TOMORROW),
    created_at: ago(45),
  },
  // 2. 121 — PO027985 Raffines/Solomios (from 1142.png)
  {
    id: 'order-2',
    order_number: 'ORD-027985',
    customer_name: '121',
    customer_email: null,
    items: [
      { name: 'Raffines/Solomios Combo Box', size: 'Large', quantity: 4 },
    ],
    status: 'ready',
    source: 'email',
    delivery_date: d(TOMORROW),
    created_at: ago(30),
  },
  // 3. Flower Buyer — Novelty Mini Carnations (from 15266.png)
  {
    id: 'order-3',
    order_number: 'ORD-467881',
    customer_name: 'Flower Buyer',
    customer_email: 'sales@orangeflower.co',
    items: [
      { name: 'Consumer Novelty Mini Carnations', size: 'Large', quantity: 30 },
    ],
    status: 'ready',
    source: 'email',
    delivery_date: d(DAY_AFTER),
    created_at: ago(20),
  },
  // 4. Flores del Valle — standing order (SMS modify target)
  {
    id: 'order-4',
    order_number: 'ORD-9934',
    customer_name: 'Flores del Valle',
    customer_email: 'pedidos@floresdelvalle.co',
    customer_phone: '+57 310 555 4422',
    items: [
      { name: 'Moonlight', size: 'S', quantity: 10 },
      { name: 'Zeppelin', size: 'S', quantity: 8 },
      { name: 'Don Pedro', size: 'S', quantity: 5 },
      { name: 'Halo', size: 'S', quantity: 6 },
    ],
    status: 'ready',
    source: 'email',
    delivery_date: d(DAY_AFTER),
    created_at: ago(120),
  },
  // 5. 71001 — Mini Carn Rainbow (from 1622.png)
  {
    id: 'order-5',
    order_number: 'ORD-2006546',
    customer_name: '71001',
    customer_email: null,
    items: [
      { name: 'Mini Carn Rainbow', size: 'Large', quantity: 40 },
    ],
    status: 'ready',
    source: 'email',
    delivery_date: '2026-04-17',
    created_at: ago(10),
  },
  // 6. Bloom Distribution — Carnations & Mini Carnations (from 865.xlsx)
  {
    id: 'order-6',
    order_number: 'ORD-8651',
    customer_name: 'Bloom Distribution',
    customer_email: 'gaotioncapital@gmail.com',
    items: [
      // Carnations
      { name: 'Moonlight', size: 'S', quantity: 3 },
      { name: 'Olympia', size: 'S', quantity: 3 },
      { name: 'Polar Route', size: 'S', quantity: 3 },
      { name: 'Damascus', size: 'S', quantity: 3 },
      { name: 'Kino', size: 'S', quantity: 2 },
      { name: 'Zurigo', size: 'S', quantity: 3 },
      { name: 'Zeppelin', size: 'S', quantity: 10 },
      { name: 'Zafiro', size: 'S', quantity: 3 },
      { name: 'Mwetalica', size: 'S', quantity: 2 },
      { name: 'Clearwater', size: 'S', quantity: 4 },
      { name: 'Farida', size: 'S', quantity: 2 },
      { name: 'Antigua', size: 'S', quantity: 1 },
      { name: 'Don Pedro', size: 'S', quantity: 8 },
      { name: 'Lege Pink', size: 'S', quantity: 3 },
      { name: 'Zenith', size: 'S', quantity: 3 },
      { name: 'Verona', size: 'S', quantity: 4 },
      { name: 'Doncel', size: 'S', quantity: 10 },
      { name: 'Orange Flame', size: 'S', quantity: 2 },
      { name: 'Brut', size: 'S', quantity: 4 },
      { name: 'Novia / Lizzy', size: 'S', quantity: 2 },
      { name: 'Caroline Gold', size: 'S', quantity: 2 },
      { name: 'Lege Marone', size: 'S', quantity: 2 },
      { name: 'Spritz', size: 'S', quantity: 2 },
      { name: 'Halo', size: 'S', quantity: 4 },
      { name: 'Polimnia', size: 'S', quantity: 2 },
      { name: 'Diletta', size: 'S', quantity: 1 },
      { name: 'Gobi', size: 'S', quantity: 3 },
      { name: 'Greenshot', size: 'S', quantity: 3 },
      { name: 'Yucari Violet', size: 'S', quantity: 1 },
      // Mini Carnations
      { name: 'Aragon', size: 'S', quantity: 6 },
      { name: 'Nimbus Select', size: 'S', quantity: 5 },
      { name: 'Chateux', size: 'S', quantity: 4 },
      { name: 'Pigeon', size: 'S', quantity: 5 },
      { name: 'Lorenzo', size: 'S', quantity: 0 },
      { name: 'Nenufar', size: 'S', quantity: 6 },
      { name: 'Mocha Sweet', size: 'S', quantity: 2 },
      { name: 'Epsilon', size: 'S', quantity: 2 },
      { name: 'Atlantis', size: 'S', quantity: 2 },
      { name: 'Lava', size: 'S', quantity: 4 },
      { name: 'Tuna', size: 'S', quantity: 4 },
      { name: 'Tuparo', size: 'S', quantity: 3 },
      { name: 'Valentine', size: 'S', quantity: 4 },
      { name: 'Academy', size: 'S', quantity: 10 },
      { name: 'Zagara', size: 'S', quantity: 4 },
      { name: 'Dino', size: 'S', quantity: 1 },
      { name: 'Cesar', size: 'S', quantity: 1 },
      { name: 'Kumquat', size: 'S', quantity: 2 },
    ],
    status: 'ready',
    source: 'email',
    delivery_date: d(TOMORROW),
    created_at: ago(5),
  },
];

const MOCK_PROPOSALS: Proposal[] = [
  // 1. Email order — Intl Purchase Order #61203 (1081.png) — already created as order-1
  {
    id: 'prop-1', intake_event_id: 'intake-1', order_id: null, action: 'create',
    order_frequency: 'one-time', customer_name: 'Flower Buyer', delivery_date: d(TOMORROW),
    message_count: 1, channel: 'email', created_at: ago(45),
    message_preview: 'Hi Bennett,\n\nPlease find attached our international purchase order #61203 for Rainbow Dianthus 8 Stem Mix Bunch x12.\n\nQty: 34 bunches\nDelivery: 1/15/2026 via Miami Jan 34 flight\nVendor: Cota, Cundinamarca, Colombia\n\nPlease confirm receipt.\n\nBest,\nKM Handling',
    message_full: 'Hi Bennett,\n\nPlease find attached our international purchase order #61203 for Rainbow Dianthus 8 Stem Mix Bunch x12.\n\nQty: 34 bunches\nDelivery: 1/15/2026 via Miami Jan 34 flight\nVendor: Cota, Cundinamarca, Colombia\n\nPlease confirm receipt.\n\nBest,\nKM Handling',
    message_html: '<p>Hi Bennett,</p><p>Please find attached our international purchase order #61203 for Rainbow Dianthus 8 Stem Mix Bunch x12.</p><p>Qty: 34 bunches<br/>Delivery: 1/15/2026 via Miami Jan 34 flight<br/>Vendor: Cota, Cundinamarca, Colombia</p><p>Please confirm receipt.</p><p>Best,<br/>KM Handling</p>',
    sender: 'Orders <orders@kmhandling.com>', subject: 'PO #61203 — Rainbow Dianthus', email_date: ago(45),
    lines: [
      { id: 'l-1a', change_type: 'add', item_name: 'Rainbow Dianthus 8 Stem Mix Bunch x12', size: 'Large', quantity: 34 },
    ],
    timeline: mkTl('t1', 45, 'email', 'Please find attached our international purchase order #61203 for Rainbow Dianthus 8 Stem Mix Bunch x12. Qty: 34 bunches.', 'Orders <orders@kmhandling.com>', 'PO #61203 — Rainbow Dianthus'),
    attachments: [
      { id: 'att-1a', filename: 'intl_purchase_order_61203.png', extension: 'png', mime_type: 'image/png', size_bytes: 48427, storage_path: '/demo/1081.png', processing_status: 'completed' },
    ],
  },

  // 2. Email order — PO027985 Raffines/Solomios (1142.png) — already created as order-2
  {
    id: 'prop-2', intake_event_id: 'intake-2', order_id: null, action: 'create',
    order_frequency: 'one-time', customer_name: '121', delivery_date: d(TOMORROW),
    message_count: 1, channel: 'email', created_at: ago(30),
    message_preview: 'Bennett,\n\nAttached is PO027985 from Farm Export Co.\n\n4 cases Raffines/Solomios Combo Box\nConsolidation: MBOGOTA, 02-18-2026\nArrive: 02-20-2026\nShipment: PASSION, Truck 02-23-2026\n\nTotal: 4 cases, 48 qty, $83.52\n\nThanks',
    message_full: 'Bennett,\n\nAttached is PO027985 from Farm Export Co.\n\n4 cases Raffines/Solomios Combo Box\nConsolidation: MBOGOTA, 02-18-2026\nArrive: 02-20-2026\nShipment: PASSION, Truck 02-23-2026\n\nTotal: 4 cases, 48 qty, $83.52\n\nThanks',
    message_html: '<p>Bennett,</p><p>Attached is PO027985 from Farm Export Co.</p><p>4 cases Raffines/Solomios Combo Box<br/>Consolidation: MBOGOTA, 02-18-2026<br/>Arrive: 02-20-2026<br/>Shipment: PASSION, Truck 02-23-2026</p><p>Total: 4 cases, 48 qty, $83.52</p><p>Thanks</p>',
    sender: 'Logistics <logistics@farmexport.co>', subject: 'PO027985 — Raffines/Solomios Combo', email_date: ago(30),
    lines: [
      { id: 'l-2a', change_type: 'add', item_name: 'Raffines/Solomios Combo Box', size: 'Large', quantity: 4 },
    ],
    timeline: mkTl('t2', 30, 'email', 'Attached is PO027985 from Farm Export Co. 4 cases Raffines/Solomios Combo Box. Total: $83.52', 'Logistics <logistics@farmexport.co>', 'PO027985 — Raffines/Solomios Combo'),
    attachments: [
      { id: 'att-2a', filename: 'PO027985_consolidated.png', extension: 'png', mime_type: 'image/png', size_bytes: 70500, storage_path: '/demo/1142.png', processing_status: 'completed' },
    ],
  },

  // 3. Email order — Novelty Mini Carnations (15266.png) — already created as order-3
  {
    id: 'prop-3', intake_event_id: 'intake-3', order_id: null, action: 'create',
    order_frequency: 'one-time', customer_name: 'Flower Buyer', delivery_date: d(DAY_AFTER),
    message_count: 1, channel: 'email', created_at: ago(20),
    message_preview: 'Hi Bennett,\n\nPlease see attached order for Consumer Novelty Mini Carnations.\n\n30 boxes, D Quarter G, 15 per box\nClient: 27510\nFecha Finca: 02/21/2026\nCodigo Flor: CB-X30310\nPO Cliente: 467881\n\nRegards,\nFlower Buyer',
    message_full: 'Hi Bennett,\n\nPlease see attached order for Consumer Novelty Mini Carnations.\n\n30 boxes, D Quarter G, 15 per box\nClient: 27510\nFecha Finca: 02/21/2026\nCodigo Flor: CB-X30310\nPO Cliente: 467881\n\nRegards,\nFlower Buyer',
    message_html: '<p>Hi Bennett,</p><p>Please see attached order for Consumer Novelty Mini Carnations.</p><p>30 boxes, D Quarter G, 15 per box<br/>Client: 27510<br/>Fecha Finca: 02/21/2026<br/>Codigo Flor: CB-X30310<br/>PO Cliente: 467881</p><p>Regards,<br/>Flower Buyer</p>',
    sender: 'Sales <sales@orangeflower.co>', subject: 'Order — Novelty Mini Carnations x30', email_date: ago(20),
    lines: [
      { id: 'l-3a', change_type: 'add', item_name: 'Consumer Novelty Mini Carnations', size: 'Large', quantity: 30 },
    ],
    timeline: mkTl('t3', 20, 'email', 'Please see attached order for Consumer Novelty Mini Carnations. 30 boxes, D Quarter G.', 'Sales <sales@orangeflower.co>', 'Order — Novelty Mini Carnations x30'),
    attachments: [
      { id: 'att-3a', filename: 'novelty_mini_carnations_order.png', extension: 'png', mime_type: 'image/png', size_bytes: 30218, storage_path: '/demo/15266.png', processing_status: 'completed' },
    ],
  },

  // 4. Email order — Farm PO #2006546 Mini Carn Rainbow (1622.png)
  {
    id: 'prop-4', intake_event_id: 'intake-4', order_id: null, action: 'create',
    order_frequency: 'one-time', customer_name: '71001', delivery_date: '2026-02-23',
    message_count: 1, channel: 'email', created_at: ago(10),
    message_preview: 'Bennett,\n\nAttached is Purchase Order for Farm #2006546.\n\nItem: Mini Carn Rainbow\nQty: 40\nBox: HB, Pack: 26, Stems: 17680\nFarm Ship: 04/17/2026\nCustomer PO: 329026\nUnit Cost: $3.57\nTotal: $3,712.80\n\nFarm: Farm Export Co\nClient: 71001',
    message_full: 'Bennett,\n\nAttached is Purchase Order for Farm #2006546.\n\nItem: Mini Carn Rainbow\nQty: 40\nBox: HB, Pack: 26, Stems: 17680\nFarm Ship: 04/17/2026\nCustomer PO: 329026\nUnit Cost: $3.57\nTotal: $3,712.80\n\nFarm: Farm Export Co\nClient: 71001',
    message_html: '<p>Bennett,</p><p>Attached is Purchase Order for Farm #2006546.</p><p>Item: Mini Carn Rainbow<br/>Qty: 40<br/>Box: HB, Pack: 26, Stems: 17680<br/>Farm Ship: 04/17/2026<br/>Customer PO: 329026<br/>Unit Cost: $3.57<br/>Total: $3,712.80</p><p>Farm: Farm Export Co<br/>Client: 71001</p>',
    sender: 'Purchasing <purchasing@farmexport.co>', subject: 'Farm PO #2006546 — Mini Carn Rainbow', email_date: ago(10),
    lines: [
      { id: 'l-4a', change_type: 'add', item_name: 'Mini Carn Rainbow', size: 'Large', quantity: 40 },
    ],
    timeline: mkTl('t4', 10, 'email', 'Attached is Purchase Order for Farm #2006546. Mini Carn Rainbow, Qty: 40. Total: $3,712.80', 'Purchasing <purchasing@farmexport.co>', 'Farm PO #2006546 — Mini Carn Rainbow'),
    attachments: [
      { id: 'att-4a', filename: 'farm_PO_2006546.png', extension: 'png', mime_type: 'image/png', size_bytes: 46083, storage_path: '/demo/1622.png', processing_status: 'completed' },
    ],
  },

  // 5. Email order — Line items detail spreadsheet (865.xlsx)
  {
    id: 'prop-5', intake_event_id: 'intake-5', order_id: null, action: 'create',
    order_frequency: 'one-time', customer_name: 'Bloom Distribution', delivery_date: '2026-01-15',
    message_count: 1, channel: 'email', created_at: ago(5),
    message_preview: '---------- Forwarded message ---------\nFrom: Konstantin Nople <konstantin.nople@gmail.com>\nSubject: Weekly Order -- Line Items Attached\nTo: Gaotion <gaotioncapital@gmail.com>\n\nHi Bennett,\n\nAttached is our weekly line items breakdown for this week. Please review quantities and confirm.\n\nLet me know if anything needs adjusting.\n\nBest,\nBloom Distribution',
    message_full: '---------- Forwarded message ---------\nFrom: Konstantin Nople <konstantin.nople@gmail.com>\nSubject: Weekly Order -- Line Items Attached\nTo: Gaotion <gaotioncapital@gmail.com>\n\nHi Bennett,\n\nAttached is our weekly line items breakdown for this week. Please review quantities and confirm.\n\nLet me know if anything needs adjusting.\n\nBest,\nBloom Distribution',
    message_html: '<p>---------- Forwarded message ---------<br/>From: Konstantin Nople &lt;konstantin.nople@gmail.com&gt;<br/>Subject: Weekly Order -- Line Items Attached<br/>To: Gaotion &lt;gaotioncapital@gmail.com&gt;</p><hr/><p>Hi Bennett,</p><p>Attached is our weekly line items breakdown for this week. Please review quantities and confirm.</p><p>Let me know if anything needs adjusting.</p><p>Best,<br/>Bloom Distribution</p>',
    sender: 'Orders <gaotioncapital@gmail.com>', subject: 'Weekly Order — Line Items Attached', email_date: ago(5),
    lines: [
      // Carnations
      { id: 'l-5-c01', change_type: 'add', item_name: 'Moonlight', size: 'S', quantity: 3 },
      { id: 'l-5-c02', change_type: 'add', item_name: 'Olympia', size: 'S', quantity: 3 },
      { id: 'l-5-c03', change_type: 'add', item_name: 'Polar Route', size: 'S', quantity: 3 },
      { id: 'l-5-c04', change_type: 'add', item_name: 'Damascus', size: 'S', quantity: 3 },
      { id: 'l-5-c05', change_type: 'add', item_name: 'Kino', size: 'S', quantity: 2 },
      { id: 'l-5-c06', change_type: 'add', item_name: 'Zurigo', size: 'S', quantity: 3 },
      { id: 'l-5-c07', change_type: 'add', item_name: 'Zeppelin', size: 'S', quantity: 10 },
      { id: 'l-5-c08', change_type: 'add', item_name: 'Zafiro', size: 'S', quantity: 3 },
      { id: 'l-5-c09', change_type: 'add', item_name: 'Mwetalica', size: 'S', quantity: 2 },
      { id: 'l-5-c10', change_type: 'add', item_name: 'Clearwater', size: 'S', quantity: 4 },
      { id: 'l-5-c11', change_type: 'add', item_name: 'Farida', size: 'S', quantity: 2 },
      { id: 'l-5-c12', change_type: 'add', item_name: 'Antigua', size: 'S', quantity: 1 },
      { id: 'l-5-c13', change_type: 'add', item_name: 'Don Pedro', size: 'S', quantity: 8 },
      { id: 'l-5-c14', change_type: 'add', item_name: 'Lege Pink', size: 'S', quantity: 3 },
      { id: 'l-5-c15', change_type: 'add', item_name: 'Zenith', size: 'S', quantity: 3 },
      { id: 'l-5-c16', change_type: 'add', item_name: 'Verona', size: 'S', quantity: 4 },
      { id: 'l-5-c17', change_type: 'add', item_name: 'Doncel', size: 'S', quantity: 10 },
      { id: 'l-5-c18', change_type: 'add', item_name: 'Orange Flame', size: 'S', quantity: 2 },
      { id: 'l-5-c19', change_type: 'add', item_name: 'Brut', size: 'S', quantity: 4 },
      { id: 'l-5-c20', change_type: 'add', item_name: 'Novia / Lizzy', size: 'S', quantity: 2 },
      { id: 'l-5-c21', change_type: 'add', item_name: 'Caroline Gold', size: 'S', quantity: 2 },
      { id: 'l-5-c22', change_type: 'add', item_name: 'Lege Marone', size: 'S', quantity: 2 },
      { id: 'l-5-c23', change_type: 'add', item_name: 'Spritz', size: 'S', quantity: 2 },
      { id: 'l-5-c24', change_type: 'add', item_name: 'Halo', size: 'S', quantity: 4 },
      { id: 'l-5-c25', change_type: 'add', item_name: 'Polimnia', size: 'S', quantity: 2 },
      { id: 'l-5-c26', change_type: 'add', item_name: 'Diletta', size: 'S', quantity: 1 },
      { id: 'l-5-c27', change_type: 'add', item_name: 'Gobi', size: 'S', quantity: 3 },
      { id: 'l-5-c28', change_type: 'add', item_name: 'Greenshot', size: 'S', quantity: 3 },
      { id: 'l-5-c29', change_type: 'add', item_name: 'Yucari Violet', size: 'S', quantity: 1 },
      // Mini Carnations
      { id: 'l-5-m01', change_type: 'add', item_name: 'Aragon', size: 'S', quantity: 6 },
      { id: 'l-5-m02', change_type: 'add', item_name: 'Nimbus Select', size: 'S', quantity: 5 },
      { id: 'l-5-m03', change_type: 'add', item_name: 'Chateux', size: 'S', quantity: 4 },
      { id: 'l-5-m04', change_type: 'add', item_name: 'Pigeon', size: 'S', quantity: 5 },
      { id: 'l-5-m05', change_type: 'add', item_name: 'Lorenzo', size: 'S', quantity: 0 },
      { id: 'l-5-m06', change_type: 'add', item_name: 'Nenufar', size: 'S', quantity: 6 },
      { id: 'l-5-m07', change_type: 'add', item_name: 'Mocha Sweet', size: 'S', quantity: 2 },
      { id: 'l-5-m08', change_type: 'add', item_name: 'Epsilon', size: 'S', quantity: 2 },
      { id: 'l-5-m09', change_type: 'add', item_name: 'Atlantis', size: 'S', quantity: 2 },
      { id: 'l-5-m10', change_type: 'add', item_name: 'Lava', size: 'S', quantity: 4 },
      { id: 'l-5-m11', change_type: 'add', item_name: 'Tuna', size: 'S', quantity: 4 },
      { id: 'l-5-m12', change_type: 'add', item_name: 'Tuparo', size: 'S', quantity: 3 },
      { id: 'l-5-m13', change_type: 'add', item_name: 'Valentine', size: 'S', quantity: 4 },
      { id: 'l-5-m14', change_type: 'add', item_name: 'Academy', size: 'S', quantity: 10 },
      { id: 'l-5-m15', change_type: 'add', item_name: 'Zagara', size: 'S', quantity: 4 },
      { id: 'l-5-m16', change_type: 'add', item_name: 'Dino', size: 'S', quantity: 1 },
      { id: 'l-5-m17', change_type: 'add', item_name: 'Cesar', size: 'S', quantity: 1 },
      { id: 'l-5-m18', change_type: 'add', item_name: 'Kumquat', size: 'S', quantity: 2 },
    ],
    timeline: mkTl('t5', 5, 'email', 'Attached is our weekly line items breakdown for this week. Please review quantities and confirm.', 'Orders <gaotioncapital@gmail.com>', 'Weekly Order — Line Items Attached'),
    attachments: [
      { id: 'att-5a', filename: 'line_items_detail.xlsx', extension: 'xlsx', mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', size_bytes: 13122, storage_path: '/demo/865.xlsx', processing_status: 'completed' },
    ],
  },

  // 6. SMS modify — Flores del Valle texts to change quantities on order-4
  {
    id: 'prop-6', intake_event_id: 'intake-6', order_id: 'order-4', action: 'assign',
    order_frequency: 'one-time', customer_name: 'Flores del Valle', delivery_date: d(DAY_AFTER),
    message_count: 1, channel: 'sms', created_at: ago(120),
    message_preview: 'Hey Bennett, can you bump the Moonlight up to 15 and drop the Don Pedro to 2? Also add 4 boxes of Farida. Thanks!',
    message_full: 'Hey Bennett, can you bump the Moonlight up to 15 and drop the Don Pedro to 2? Also add 4 boxes of Farida. Thanks!',
    sender: '+57 310 555 4422',
    lines: [
      { id: 'l-6a', change_type: 'modify', item_name: 'Moonlight', size: 'S', quantity: 15, original_quantity: 10, original_size: 'S' },
      { id: 'l-6b', change_type: 'modify', item_name: 'Don Pedro', size: 'S', quantity: 2, original_quantity: 5, original_size: 'S' },
      { id: 'l-6c', change_type: 'add', item_name: 'Farida', size: 'S', quantity: 4 },
    ],
    timeline: [
      { id: 't6-msg', type: 'communication', timestamp: ago(120), channel: 'sms', content: 'Hey Bennett, can you bump the Moonlight up to 15 and drop the Don Pedro to 2? Also add 4 boxes of Farida. Thanks!', from: '+57 310 555 4422' },
      { id: 't6-ai', type: 'event', timestamp: ago(119), eventType: 'ai_analysis' },
    ],
    attachments: [],
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
  items?: string[];
  className?: string;
}

const ItemSearchDropdown: React.FC<ItemSearchDropdownProps> = ({ value, onChange, items, className }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState(value);
  const [fetchedItems, setFetchedItems] = useState<string[]>([]);
  const [hasFetched, setHasFetched] = useState(false);
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

  // Fetch catalog items from DB if no items prop provided
  useEffect(() => {
    if (items && items.length > 0) return;
    if (hasFetched) return;
    const fetchItems = async () => {
      const { data } = await supabaseClient
        .from('items')
        .select('name')
        .eq('active', true)
        .order('name');
      if (data) setFetchedItems(data.map(d => d.name));
      setHasFetched(true);
    };
    fetchItems();
  }, [items, hasFetched]);

  const searchList = items && items.length > 0 ? items : (fetchedItems.length > 0 ? fetchedItems : CATALOG_ITEMS);
  const filtered = searchList.filter(item =>
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

// Inline spreadsheet preview using SheetJS
const SpreadsheetPreview: React.FC<{ url: string }> = ({ url }) => {
  const [rows, setRows] = useState<string[][]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch(url);
        const buf = await response.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        if (!cancelled) setRows(data.slice(0, 50)); // limit to 50 rows for preview
      } catch (e: any) {
        if (!cancelled) setError(e.message || 'Failed to load spreadsheet');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [url]);

  if (loading) return <div className="px-3 pb-2 text-xs text-gray-400 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Loading spreadsheet...</div>;
  if (error) return <div className="px-3 pb-2 text-xs text-red-400">Failed to preview: {error}</div>;
  if (rows.length === 0) return <div className="px-3 pb-2 text-xs text-gray-400">Empty spreadsheet</div>;

  return (
    <div className="px-3 pb-2">
      <div className="border border-gray-200 rounded overflow-auto max-h-64 text-xs">
        <table className="min-w-full border-collapse">
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri} className={ri === 0 ? 'bg-gray-100 font-semibold sticky top-0' : ri % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                {row.map((cell, ci) => (
                  <td key={ci} className="px-2 py-1 border-r border-b border-gray-200 whitespace-nowrap">{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length >= 50 && <div className="text-xs text-gray-400 mt-1">Showing first 50 rows</div>}
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
      const accessToken = await getAccessToken();
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-proposal`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
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

function printPackingSummary(dateStr: string, orders: Order[], customers: Customer[]) {
  const summary = buildPackingSummary(orders);
  const dateDisplay = new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  // Build customer order rows sorted by sort_position
  const sortedOrders = [...orders].sort((a, b) => {
    const aSort = a.sort_position ?? Number.MAX_SAFE_INTEGER;
    const bSort = b.sort_position ?? Number.MAX_SAFE_INTEGER;
    if (aSort !== bSort) return aSort - bSort;
    return a.customer_name.localeCompare(b.customer_name);
  });

  const orderRows = sortedOrders.flatMap(order =>
    order.items.map(item => ({
      customer: order.customer_name,
      product: item.name,
      size: item.size,
      quantity: item.quantity,
    }))
  );

  // Collect all size codes used across all items
  const allSizes = new Set<string>();
  summary.forEach(row => Object.keys(row.sizes).forEach(s => allSizes.add(s)));
  const sizeColumns = ['S', 'M', 'L', 'T20'].filter(s => allSizes.has(s));
  // Add any other sizes not in the standard list
  allSizes.forEach(s => { if (!sizeColumns.includes(s)) sizeColumns.push(s); });

  const html = `<!DOCTYPE html>
<html>
<head>
  <title>Order Sheet - ${dateDisplay}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 24px; color: #1a1a1a; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    h1 { font-size: 22px; font-weight: 700; margin-bottom: 20px; }

    /* Customer Order Sheet */
    .order-table { width: 100%; border-collapse: collapse; font-size: 14px; }
    .order-table th { background: #8cb878; color: #1a1a1a; padding: 10px 16px; text-align: left; font-weight: 600; border: 1px solid #7aa866; }
    .order-table th.size-col, .order-table th.qty-col { text-align: center; width: 60px; }
    .order-table td { padding: 8px 16px; border: 1px solid #ccc; }
    .order-table td.size-col, .order-table td.qty-col { text-align: center; width: 60px; }
    .order-table tr.even td { background: #e8f0e0; }
    .order-table tr.odd td { background: #fff; }

    /* Crop Packing Summary */
    .packing-table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .packing-table th { background: #d4a574; color: #1a1a1a; padding: 8px 12px; text-align: center; font-weight: 600; border: 1px solid #b8956a; }
    .packing-table th.crop-header { text-align: left; background: #c4956a; min-width: 180px; }
    .packing-table th.size-header { background: #b8c4d8; }
    .packing-table th.total-header { background: #e8c87a; }
    .packing-table td { padding: 6px 12px; border: 1px solid #ddd; }
    .packing-table td.crop-name { font-weight: 500; background: #f9f5f0; }
    .packing-table td.size-cell { text-align: center; background: #f0f4fa; }
    .packing-table td.size-cell.has-value { font-weight: 600; color: #1a1a1a; }
    .packing-table td.size-cell.empty { color: #ccc; }
    .packing-table td.total-cell { text-align: center; font-weight: 700; background: #fdf6e3; }
    .packing-table tr:nth-child(even) td.crop-name { background: #f4efe8; }
    .packing-table tr:nth-child(even) td.size-cell { background: #eaeff5; }
    .packing-table tr:nth-child(even) td.total-cell { background: #f8f0d8; }
    .packing-table .totals-row td { font-weight: 700; background: #e8e0d4 !important; border-top: 2px solid #999; }
    .packing-table .totals-row td.size-cell { background: #d8e0ec !important; }
    .packing-table .totals-row td.total-cell { background: #f0e4c0 !important; }

    .subtitle { font-size: 14px; color: #666; margin-bottom: 16px; }
    .page-break { page-break-before: always; margin-top: 24px; }
    .footer { margin-top: 16px; font-size: 11px; color: #999; }

    @media print {
      body { padding: 0; }
      @page { margin: 0.5in; }
      .page-break { page-break-before: always; }
    }
  </style>
</head>
<body>
  <!-- Page 1: Customer Order Sheet -->
  <h1>${dateDisplay}</h1>
  <table class="order-table">
    <thead>
      <tr>
        <th>Customer</th>
        <th>Product</th>
        <th class="size-col">Size</th>
        <th class="qty-col">Qty</th>
      </tr>
    </thead>
    <tbody>
      ${orderRows.map((row, i) => `
        <tr class="${i % 2 === 0 ? 'even' : 'odd'}">
          <td>${row.customer}</td>
          <td>${row.product}</td>
          <td class="size-col">${row.size}</td>
          <td class="qty-col">${row.quantity}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <!-- Page 2: Crop Packing Summary -->
  <div class="page-break">
    <h1>Crop Packing Summary and Harvest Records</h1>
    <div class="subtitle">${dateDisplay} &mdash; ${summary.length} crop${summary.length !== 1 ? 's' : ''} &middot; ${orders.length} order${orders.length !== 1 ? 's' : ''}</div>
    <table class="packing-table">
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
  </div>
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

// Sub-component: one "Create New Order" section for a single proposal within a grouped card
const CreateOrderSection: React.FC<{
  proposal: Proposal;
  customers: Customer[];
  showMultiLabel: boolean;
  onCreateOrder: (proposalId: string, lines: ProposalLine[], customerName?: string, deliveryDate?: string) => Promise<void>;
  onDismiss: (proposalId: string) => void;
  onUpdateOrderFrequency: (proposalId: string, value: 'one-time' | 'recurring') => void;
  isDismissing?: boolean;
}> = ({ proposal, customers, showMultiLabel, onCreateOrder, onDismiss, onUpdateOrderFrequency, isDismissing }) => {
  const [editableLines, setEditableLines] = useState<ProposalLine[]>(proposal.lines);
  const [isCreating, setIsCreating] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [customerName, setCustomerName] = useState(proposal.customer_name);
  const [orderFrequency, setOrderFrequency] = useState<'one-time' | 'recurring'>(
    proposal.order_frequency || 'one-time'
  );
  const [deliveryDate, setDeliveryDate] = useState(() => {
    if (proposal.delivery_date) return proposal.delivery_date;
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  });

  const formattedDate = proposal.delivery_date
    ? new Date(proposal.delivery_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    : 'No date specified';

  const removeEditableLine = (lineId: string) => {
    setEditableLines(prev => prev.filter(l => l.id !== lineId));
  };

  const updateEditableLine = (lineId: string, updates: Partial<ProposalLine>) => {
    setEditableLines(prev => prev.map(l => l.id === lineId ? { ...l, ...updates } : l));
  };

  const addNewItemLine = () => {
    const id = `user-add-${Date.now()}`;
    setEditableLines(prev => [...prev, { id, change_type: 'add' as const, item_name: '', size: '', quantity: 1 }]);
  };

  const getVariantsForLine = (line: ProposalLine) => {
    if (line.available_variants && line.available_variants.length > 0) {
      return line.available_variants;
    }
    return [{ id: 'default', code: line.size || 'S', name: line.size || 'Small' }];
  };

  // If the order was already created, show a compact "Order Created" view
  if (proposal.order_id) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2.5">
          <p className="text-xs text-green-700 uppercase tracking-wider font-semibold">
            {showMultiLabel ? `Order Created — ${formattedDate}` : 'Order Created'}
          </p>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
            <Check className="w-3 h-3" /> Created
          </span>
        </div>
        <div className="px-3 pb-3">
          <div className="flex items-center gap-3 px-3 py-2 bg-white border border-green-200 rounded-lg">
            <div className="flex items-center gap-2 flex-1">
              <User className="w-4 h-4 text-green-500 flex-shrink-0" />
              <span className="text-sm font-medium text-gray-900">{customerName}</span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <CalendarIcon className="w-4 h-4 text-green-500" />
              <span className="text-xs text-gray-600">{formattedDate}</span>
            </div>
          </div>
          <div className="border-t border-green-200 mt-3 pt-2">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-green-600/60 uppercase tracking-wider">
                  <th className="py-1 text-left font-medium">Item</th>
                  <th className="py-1 text-center font-medium">Size</th>
                  <th className="py-1 text-center font-medium">Qty</th>
                </tr>
              </thead>
              <tbody>
                {editableLines.filter(l => l.change_type === 'add').map(line => (
                  <tr key={line.id} className="text-green-800">
                    <td className="py-1 text-left text-xs">{line.item_name}</td>
                    <td className="py-1 text-center text-xs">{line.size}</td>
                    <td className="py-1 text-center text-xs font-medium">{line.quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-green-50 border border-green-200 rounded-lg overflow-hidden">
      <div
        className="flex items-center justify-between px-3 py-2.5 cursor-pointer select-none hover:bg-green-100/50 transition-colors border-b border-green-200"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <p className="text-xs text-green-700 uppercase tracking-wider font-semibold">
          {showMultiLabel ? `Create New Order — ${formattedDate}` : 'Create New Order'}
        </p>
        {isCollapsed ? <ChevronDown className="w-3.5 h-3.5 text-green-500" /> : <ChevronUp className="w-3.5 h-3.5 text-green-500" />}
      </div>
      {!isCollapsed && (
        <div className="px-3 pb-3">
          <div className="flex items-center gap-3 px-3 py-2 bg-white border border-green-200 rounded-lg mt-2">
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
          {/* Order frequency toggle */}
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
                ? 'This is a one-time order and will not recur.'
                : 'This will create a recurring standing order for this day of the week.'}
            </div>
          </div>
          {/* Items table */}
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
          {/* Action buttons */}
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
              <X className="w-4 h-4" /> Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// Sub-component: one "Assign to Existing Order" section for a single assign-type proposal
const AssignOrderSection: React.FC<{
  proposal: Proposal;
  matchedOrder: Order | null;
  orders: Order[];
  customers: Customer[];
  showMultiLabel: boolean;
  onApplyChange: (proposalId: string, lines: ProposalLine[]) => void;
  onDismiss: (proposalId: string) => void;
  onOpenCreateNewOrderModal: (proposalId: string) => void;
  onOpenAssignToOrderModal: (proposalId: string, sourceOrderId: string | null) => void;
  onUpdateOrderFrequency: (proposalId: string, value: 'one-time' | 'recurring') => void;
  isDismissing?: boolean;
  isApplying?: boolean;
}> = ({ proposal, matchedOrder, orders, customers, showMultiLabel, onApplyChange, onDismiss, onOpenCreateNewOrderModal, onOpenAssignToOrderModal, onUpdateOrderFrequency, isDismissing, isApplying }) => {
  const [editableLines, setEditableLines] = useState<ProposalLine[]>(proposal.lines);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [showOrderItems, setShowOrderItems] = useState(false);
  const [showCorrection, setShowCorrection] = useState(false);
  const [orderFrequency, setOrderFrequency] = useState<'one-time' | 'recurring'>(
    proposal.order_frequency || 'one-time'
  );

  const formattedDate = proposal.delivery_date
    ? new Date(proposal.delivery_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    : 'No date specified';

  const removeEditableLine = (lineId: string) => {
    setEditableLines(prev => prev.filter(l => l.id !== lineId));
  };

  const updateEditableLine = (lineId: string, updates: Partial<ProposalLine>) => {
    setEditableLines(prev => prev.map(l => l.id === lineId ? { ...l, ...updates } : l));
  };

  const addNewItemLine = () => {
    const id = `user-add-${Date.now()}`;
    setEditableLines(prev => [...prev, { id, change_type: 'add' as const, item_name: '', size: 'Small', quantity: 1 }]);
  };

  const addRemovalForItem = (item: OrderItem) => {
    const id = `user-remove-${Date.now()}`;
    setEditableLines(prev => [...prev, { id, change_type: 'remove' as const, order_line_id: item.order_line_id, item_name: item.name, size: item.size, quantity: item.quantity }]);
  };

  const addModificationForItem = (item: OrderItem) => {
    const id = `user-modify-${Date.now()}`;
    setEditableLines(prev => [...prev, { id, change_type: 'modify' as const, order_line_id: item.order_line_id, item_name: item.name, size: item.size, quantity: item.quantity, original_quantity: item.quantity, original_size: item.size }]);
  };

  return (
    <div className={`${proposal.type === 'cancel_order' ? 'bg-red-50 border border-red-200' : 'bg-blue-50 border border-blue-200'} rounded-lg overflow-hidden`}>
      <div
        className={`flex items-center justify-between px-3 py-2.5 cursor-pointer select-none transition-colors ${proposal.type === 'cancel_order' ? 'hover:bg-red-100/50 border-b border-red-200' : 'hover:bg-blue-100/50 border-b border-blue-200'}`}
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <p className={`text-xs uppercase tracking-wider font-semibold ${proposal.type === 'cancel_order' ? 'text-red-700' : 'text-blue-700'}`}>
          {proposal.type === 'cancel_order'
            ? (showMultiLabel ? `Cancel Order — ${formattedDate}` : 'Cancel Order')
            : (showMultiLabel ? `Modify Order — ${formattedDate}` : 'Modify Order')}
        </p>
        {isCollapsed ? <ChevronDown className={`w-3.5 h-3.5 ${proposal.type === 'cancel_order' ? 'text-red-500' : 'text-blue-500'}`} /> : <ChevronUp className={`w-3.5 h-3.5 ${proposal.type === 'cancel_order' ? 'text-red-500' : 'text-blue-500'}`} />}
      </div>
      {!isCollapsed && (
        <div className="px-3 pb-3">
          {/* Matched order card */}
          <div
            className="flex items-center gap-3 px-3 py-2 bg-white border border-blue-200 rounded-lg cursor-pointer hover:bg-blue-50 transition-colors mt-2"
            onClick={() => setShowOrderItems(!showOrderItems)}
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-sm font-medium">
              {proposal.customer_name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900">{proposal.customer_name}</p>
              <p className="text-xs text-gray-500">{formattedDate}</p>
            </div>
            {matchedOrder && matchedOrder.items.length > 0 && proposal.type !== 'cancel_order' && (
              showOrderItems ? <ChevronUp className="w-4 h-4 text-blue-400" /> : <ChevronDown className="w-4 h-4 text-blue-400" />
            )}
          </div>
          {/* Order frequency toggle */}
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
          {showOrderItems && matchedOrder && matchedOrder.items.length > 0 && proposal.type !== 'cancel_order' && (
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
          {/* Changes table */}
          <div className={`border-t mt-3 pt-2 ${proposal.type === 'cancel_order' ? 'border-red-200' : 'border-blue-200'}`}>
            {proposal.type !== 'cancel_order' && (
              <p className="text-[11px] text-blue-500 uppercase tracking-widest font-semibold mb-2">Changes</p>
            )}
            {/* Cancel Order proposal */}
            {proposal.type === 'cancel_order' && (
              <div className="mb-2 px-3 py-2 bg-red-100 border border-red-300 rounded-lg">
                <p className="text-sm font-semibold text-red-700">Cancel Order</p>
                <p className="text-xs text-red-600">Customer requested to cancel this entire order.</p>
              </div>
            )}
            {/* Delete Order label - all existing order items are being removed */}
            {matchedOrder && proposal.type !== 'cancel_order' && editableLines.length > 0 && editableLines.every(l => l.change_type === 'remove') && matchedOrder.items.length > 0 && matchedOrder.items.every(item => editableLines.some(l => l.change_type === 'remove' && (l.order_line_id ? l.order_line_id === item.order_line_id : l.item_name === item.name))) && (
              <div className="mb-2 px-3 py-2 bg-red-100 border border-red-300 rounded-lg">
                <p className="text-sm font-semibold text-red-700">Cancel Order</p>
                <p className="text-xs text-red-600">This order will be cancelled.</p>
              </div>
            )}
            {/* Changes table */}
            {proposal.type !== 'cancel_order' && (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] text-blue-400/70 uppercase tracking-wider">
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
                        onDoubleClick={() => { if (!removal && !modification) addModificationForItem(item); }}
                        title={!removal && !modification ? 'Double-click to modify' : undefined}
                      >
                        <td className={`py-1.5 text-gray-700 ${removal || modification ? 'line-through' : ''}`}>{item.name}</td>
                        <td className={`py-1.5 text-center text-gray-500 ${removal || modification ? 'line-through' : ''}`}>{item.size}</td>
                        <td className={`py-1.5 text-center text-gray-700 font-medium ${removal || modification ? 'line-through' : ''}`}>{item.quantity}</td>
                        <td className="py-1.5">
                          {!removal && !modification && (
                            <button onClick={() => addRemovalForItem(item)} className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity" title="Remove item">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                      {modification && (
                        <tr className="bg-blue-50">
                          <td className="py-1.5 pl-5 text-blue-700 text-sm">
                            <span className="text-blue-400 mr-1">&#8627;</span>{modification.item_name}
                          </td>
                          <td className="py-1.5 text-center">
                            <select value={modification.size} onChange={(e) => updateEditableLine(modification.id, { size: e.target.value })} className="px-1 py-0.5 text-xs border border-blue-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-500">
                              {getVariantsForLine(modification).map(v => (<option key={v.code} value={v.code}>{v.code}</option>))}
                            </select>
                          </td>
                          <td className="py-1.5 text-center">
                            <input type="number" min="1" value={modification.quantity} onChange={(e) => updateEditableLine(modification.id, { quantity: parseInt(e.target.value) || 1 })} className="w-12 px-1 py-0.5 text-sm text-center border border-blue-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 font-semibold" />
                          </td>
                          <td className="py-1.5">
                            <button onClick={() => removeEditableLine(modification.id)} className="text-gray-400 hover:text-red-500"><X className="w-3.5 h-3.5" /></button>
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
                            <button onClick={() => removeEditableLine(removal.id)} className="text-gray-400 hover:text-red-500"><X className="w-3.5 h-3.5" /></button>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
                {/* Separator before add rows */}
                {editableLines.filter(l => l.change_type === 'add').length > 0 && (
                  <tr><td colSpan={4} className="py-1"><div className="border-t border-dashed border-blue-200"></div></td></tr>
                )}
                {/* Add/new item rows */}
                {editableLines.filter(l => l.change_type === 'add').map(line => (
                  <tr key={line.id} className="bg-green-50">
                    <td className="py-1.5 pl-1">
                      <div className="flex items-center gap-1">
                        <span className="text-green-600 text-xs font-bold">+</span>
                        <ItemSearchDropdown value={line.item_name} onChange={(val) => updateEditableLine(line.id, { item_name: val })} />
                      </div>
                    </td>
                    <td className="py-1.5 text-center">
                      <select value={line.size} onChange={(e) => updateEditableLine(line.id, { size: e.target.value })} className="px-1 py-0.5 text-xs border border-green-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-green-500">
                        {getVariantsForLine(line).map(v => (<option key={v.code} value={v.code}>{v.code}</option>))}
                      </select>
                    </td>
                    <td className="py-1.5 text-center">
                      <input type="number" min="1" value={line.quantity} onChange={(e) => updateEditableLine(line.id, { quantity: parseInt(e.target.value) || 1 })} className="w-12 px-1 py-0.5 text-sm text-center border border-green-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-green-500" />
                    </td>
                    <td className="py-1.5">
                      <button onClick={() => removeEditableLine(line.id)} className="text-gray-400 hover:text-red-500"><X className="w-3.5 h-3.5" /></button>
                    </td>
                  </tr>
                ))}
                {/* Add new item button */}
                <tr>
                  <td colSpan={4} className="pt-1">
                    <button onClick={addNewItemLine} className="flex items-center gap-1 text-xs text-green-600 hover:text-green-700 hover:bg-green-100/50 px-2 py-1 rounded transition-colors">
                      <span className="text-sm font-bold">+</span> Add item
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
            )}
          </div>
          {/* Action buttons */}
          <div className={`flex items-center gap-2 mt-3 pt-3 border-t ${proposal.type === 'cancel_order' ? 'border-red-200' : 'border-blue-200'}`}>
            <button
              onClick={() => onApplyChange(proposal.id, editableLines)}
              disabled={isApplying || isDismissing}
              className={`flex items-center gap-1 px-4 py-2 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 ${
                proposal.type === 'cancel_order' ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'
              }`}
            >
              {isApplying ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> {proposal.type === 'cancel_order' ? 'Cancelling...' : 'Applying...'}</>
              ) : proposal.type === 'cancel_order' ? (
                <><X className="w-4 h-4" /> Cancel Order</>
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
      )}
    </div>
  );
};

// Sub-component: one "Undetermined" section for a single undetermined proposal
const UndeterminedSection: React.FC<{
  proposal: Proposal;
  showMultiLabel: boolean;
  onOpenCreateNewOrderModal: (proposalId: string) => void;
  onOpenAssignToOrderModal: (proposalId: string, sourceOrderId: string | null) => void;
  onDismiss: (proposalId: string) => void;
  isDismissing?: boolean;
}> = ({ proposal, showMultiLabel, onOpenCreateNewOrderModal, onOpenAssignToOrderModal, onDismiss, isDismissing }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const formattedDate = proposal.delivery_date
    ? new Date(proposal.delivery_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    : 'No date specified';

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg overflow-hidden">
      <div
        className="flex items-center justify-between px-3 py-2.5 cursor-pointer select-none hover:bg-amber-100/50 transition-colors border-b border-amber-200"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <p className="text-xs text-amber-700 uppercase tracking-wider font-semibold">
          {showMultiLabel ? `Needs Input — ${formattedDate}` : 'Needs Input'}
        </p>
        {isCollapsed ? <ChevronDown className="w-3.5 h-3.5 text-amber-500" /> : <ChevronUp className="w-3.5 h-3.5 text-amber-500" />}
      </div>
      {!isCollapsed && (
        <div className="px-3 py-3">
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
          <div className="mt-2">
            <button
              onClick={() => onDismiss(proposal.id)}
              disabled={isDismissing}
              className="flex items-center gap-1 px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors disabled:opacity-50"
            >
              {isDismissing ? (
                <><Loader2 className="w-3 h-3 animate-spin" /> Dismissing...</>
              ) : (
                <><X className="w-3 h-3" /> Dismiss</>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

interface InboxCardProps {
  proposal: Proposal;
  siblingProposals: Proposal[]; // All proposals from the same intake event (including this one)
  matchedOrder: Order | null;
  orders: Order[];
  customers: Customer[];
  onApplyChange: (proposalId: string, lines: ProposalLine[]) => void;
  onCreateOrder: (proposalId: string, lines: ProposalLine[], customerName?: string, deliveryDate?: string) => Promise<void>;
  onDismiss: (proposalId: string) => void;
  onOpenCreateNewOrderModal: (proposalId: string) => void;
  onOpenAssignToOrderModal: (proposalId: string, sourceOrderId: string | null) => void;
  onUpdateOrderFrequency: (proposalId: string, value: 'one-time' | 'recurring') => void;
  dismissingProposalId?: string | null;
  applyingProposalId?: string | null;
}

const InboxCard: React.FC<InboxCardProps> = ({
  proposal, siblingProposals, matchedOrder, orders, customers, onApplyChange, onCreateOrder, onDismiss,
  onOpenCreateNewOrderModal, onOpenAssignToOrderModal, onUpdateOrderFrequency, dismissingProposalId, applyingProposalId
}) => {
  // Use first proposal for card-level display (header, message, channel, etc.)
  // All siblingProposals share the same intake event / message
  const hasMultipleProposals = siblingProposals.length > 1;

  // Card-level state (shared across all proposals in the group)
  const [showAllMessages, setShowAllMessages] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [messageExpanded, setMessageExpanded] = useState(false);
  const [contentNeedsExpand, setContentNeedsExpand] = useState(false);
  const hasAttachments = !!(proposal.attachments && proposal.attachments.length > 0);
  const [attachmentsExpanded, setAttachmentsExpanded] = useState(hasAttachments);
  const [attachmentUrls, setAttachmentUrls] = useState<Record<string, string>>({});
  // Inline viewer state — all image attachments auto-expanded, each with own zoom/pan
  const allImageAttIds = useMemo(() => {
    if (!proposal.attachments) return new Set<string>();
    return new Set(proposal.attachments.filter(a => a.mime_type?.startsWith('image/')).map(a => a.id));
  }, [proposal.attachments]);
  const [expandedAttIds, setExpandedAttIds] = useState<Set<string>>(allImageAttIds);
  const [viewerStates, setViewerStates] = useState<Record<string, { zoom: number; pan: { x: number; y: number } }>>({});
  const inlineDragRef = useRef<{ dragging: boolean; startX: number; startY: number; startPanX: number; startPanY: number }>({ dragging: false, startX: 0, startY: 0, startPanX: 0, startPanY: 0 });

  const getViewerState = (attId: string) => viewerStates[attId] || { zoom: 1, pan: { x: 0, y: 0 } };
  const setViewerZoom = (attId: string, fn: (z: number) => number) => {
    setViewerStates(prev => {
      const cur = prev[attId] || { zoom: 1, pan: { x: 0, y: 0 } };
      return { ...prev, [attId]: { ...cur, zoom: fn(cur.zoom) } };
    });
  };
  const setViewerPan = (attId: string, pan: { x: number; y: number }) => {
    setViewerStates(prev => {
      const cur = prev[attId] || { zoom: 1, pan: { x: 0, y: 0 } };
      return { ...prev, [attId]: { ...cur, pan } };
    });
  };
  const resetViewer = (attId: string) => {
    setViewerStates(prev => ({ ...prev, [attId]: { zoom: 1, pan: { x: 0, y: 0 } } }));
  };
  // Full-screen lightbox state (opened via dedicated button)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [lightboxZoom, setLightboxZoom] = useState(1);
  const [lightboxPan, setLightboxPan] = useState({ x: 0, y: 0 });
  const lightboxDragRef = useRef<{ dragging: boolean; startX: number; startY: number; startPanX: number; startPanY: number }>({ dragging: false, startX: 0, startY: 0, startPanX: 0, startPanY: 0 });
  const lightboxOpenedAt = useRef(0);

  const toggleInlineViewer = useCallback((attId: string) => {
    setExpandedAttIds(prev => {
      const next = new Set(prev);
      if (next.has(attId)) {
        next.delete(attId);
      } else {
        next.add(attId);
        resetViewer(attId);
      }
      return next;
    });
  }, []);

  const openLightbox = useCallback((url: string) => {
    lightboxOpenedAt.current = Date.now();
    setLightboxUrl(url);
    setLightboxZoom(1);
    setLightboxPan({ x: 0, y: 0 });
  }, []);

  const closeLightbox = useCallback(() => {
    if (Date.now() - lightboxOpenedAt.current < 200) return;
    setLightboxUrl(null);
  }, []);

  // Eagerly load attachment URLs when attachments are present
  useEffect(() => {
    if (!hasAttachments) return;
    const loadUrls = async () => {
      const urls: Record<string, string> = {};
      const viewable = ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'];
      for (const att of proposal.attachments!) {
        if (att.storage_path.startsWith('/demo/')) {
          urls[att.id] = att.storage_path;
        } else if (att.extension && viewable.includes(att.extension.toLowerCase())) {
          const { data: signedUrlData } = await supabaseClient
            .storage.from('intake-files')
            .createSignedUrl(att.storage_path, 3600);
          if (signedUrlData?.signedUrl) urls[att.id] = signedUrlData.signedUrl;
        }
      }
      setAttachmentUrls(urls);
    };
    loadUrls();
  }, [hasAttachments]);

  const allMessages = useMemo(() => {
    return proposal.timeline
      .filter(t => t.type === 'communication')
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }, [proposal.timeline]);

  // Determine card border color based on the primary proposal's action (or mixed)
  const primaryAction = proposal.action;
  const borderColorClass = primaryAction === 'undetermined' || (!primaryAction && proposal.order_id === null)
    ? 'border-l-amber-400'
    : primaryAction === 'create'
    ? 'border-l-green-400'
    : 'border-l-blue-400';

  return (
    <div className={`rounded-lg border bg-white shadow-sm transition-all duration-300 ${siblingProposals.some(p => dismissingProposalId === p.id || applyingProposalId === p.id) ? 'opacity-50 scale-98 pointer-events-none' : ''} border-l-4 ${borderColorClass} border-t border-r border-b border-gray-200`}>
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
          {proposal.attachments && proposal.attachments.length > 0 && (
            <span className="inline-flex items-center gap-1 text-xs text-gray-400 flex-shrink-0">
              <Paperclip className="w-3 h-3" />
              {proposal.attachments.length}
            </span>
          )}
          {proposal.message_count > 1 && (
            <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full flex-shrink-0">
              {proposal.message_count}
            </span>
          )}
          {siblingProposals.some(p => p.action === 'undetermined' || (!p.action && p.order_id === null)) && (
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

      {/* Collapsible body - side by side on desktop, stacked on mobile */}
      {!collapsed && (
        <div className="px-4 pb-4">
          <div className="flex flex-col lg:flex-row lg:gap-3 lg:items-start">
      {/* LEFT SIDE: Message — email-style viewer */}
      <div className="lg:w-1/2 lg:flex-shrink-0 mb-4 lg:mb-0">
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
              <span>Message</span>
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

          {/* Attachments bar */}
          {proposal.attachments && proposal.attachments.length > 0 && (
            <div className="border-t border-gray-200">
              <button
                onClick={() => setAttachmentsExpanded(!attachmentsExpanded)}
                className="w-full px-3 py-2 flex items-center gap-2 text-xs text-gray-500 hover:bg-gray-50 transition-colors"
              >
                <Paperclip className="w-3.5 h-3.5" />
                <span>{proposal.attachments.length} attachment{proposal.attachments.length > 1 ? 's' : ''}</span>
                {attachmentsExpanded ? <ChevronUp className="w-3 h-3 ml-auto" /> : <ChevronDown className="w-3 h-3 ml-auto" />}
              </button>
              {attachmentsExpanded && (
                <div className="px-3 pb-3 space-y-2">
                  {proposal.attachments.map(att => {
                    const isImage = att.mime_type?.startsWith('image/');
                    const isPdf = att.extension?.toLowerCase() === 'pdf';
                    const isSpreadsheet = ['xlsx', 'xls', 'csv'].includes(att.extension?.toLowerCase() || '');
                    const sizeLabel = att.size_bytes
                      ? att.size_bytes > 1024 * 1024
                        ? `${(att.size_bytes / (1024 * 1024)).toFixed(1)} MB`
                        : `${Math.round(att.size_bytes / 1024)} KB`
                      : '';
                    const url = attachmentUrls[att.id];
                    return (
                      <div key={att.id} className="border border-gray-200 rounded-lg overflow-hidden bg-gray-50">
                        <div className="flex items-center gap-2 px-3 py-2">
                          {isImage ? <ImageIcon className="w-4 h-4 text-blue-500" /> : isPdf ? <FileText className="w-4 h-4 text-red-500" /> : isSpreadsheet ? <FileSpreadsheet className="w-4 h-4 text-green-600" /> : <FileText className="w-4 h-4 text-gray-400" />}
                          <span className="text-xs font-medium text-gray-700 truncate">{att.filename}</span>
                          {sizeLabel && <span className="text-xs text-gray-400 flex-shrink-0">{sizeLabel}</span>}
                          {url && (
                            <a href={url} target="_blank" rel="noopener noreferrer" className="ml-auto text-xs text-blue-600 hover:text-blue-800 flex-shrink-0">
                              Open
                            </a>
                          )}
                        </div>
                        {isImage && url && expandedAttIds.has(att.id) ? (() => {
                          const vs = getViewerState(att.id);
                          return (
                          <div className="relative border-t border-gray-200">
                            <div className="flex items-center gap-1 px-2 py-1 bg-gray-100 border-b border-gray-200">
                              <button onClick={() => setViewerZoom(att.id, z => Math.max(0.25, z - 0.25))} className="p-1 rounded hover:bg-gray-200 text-gray-600" title="Zoom out"><ZoomOut className="w-3.5 h-3.5" /></button>
                              <span className="text-xs text-gray-500 min-w-[2.5rem] text-center">{Math.round(vs.zoom * 100)}%</span>
                              <button onClick={() => setViewerZoom(att.id, z => Math.min(5, z + 0.25))} className="p-1 rounded hover:bg-gray-200 text-gray-600" title="Zoom in"><ZoomIn className="w-3.5 h-3.5" /></button>
                              <button onClick={() => resetViewer(att.id)} className="p-1 rounded hover:bg-gray-200 text-gray-600" title="Reset"><RotateCcw className="w-3.5 h-3.5" /></button>
                              <div className="flex-1" />
                              <button onClick={(e) => { e.stopPropagation(); openLightbox(url); }} className="p-1 rounded hover:bg-gray-200 text-gray-600" title="Full screen"><Maximize2 className="w-3.5 h-3.5" /></button>
                              <button onClick={() => toggleInlineViewer(att.id)} className="p-1 rounded hover:bg-gray-200 text-gray-600" title="Collapse"><ChevronUp className="w-3.5 h-3.5" /></button>
                            </div>
                            <div
                              className="overflow-hidden cursor-grab active:cursor-grabbing select-none bg-gray-800"
                              style={{ height: '20rem' }}
                              onWheel={e => {
                                e.stopPropagation();
                                setViewerZoom(att.id, z => Math.min(5, Math.max(0.25, z + (e.deltaY < 0 ? 0.15 : -0.15))));
                              }}
                              onMouseDown={e => {
                                const curPan = getViewerState(att.id).pan;
                                inlineDragRef.current = { dragging: true, startX: e.clientX, startY: e.clientY, startPanX: curPan.x, startPanY: curPan.y };
                                const onMove = (ev: MouseEvent) => {
                                  if (!inlineDragRef.current.dragging) return;
                                  setViewerPan(att.id, {
                                    x: inlineDragRef.current.startPanX + (ev.clientX - inlineDragRef.current.startX),
                                    y: inlineDragRef.current.startPanY + (ev.clientY - inlineDragRef.current.startY),
                                  });
                                };
                                const onUp = () => {
                                  inlineDragRef.current.dragging = false;
                                  window.removeEventListener('mousemove', onMove);
                                  window.removeEventListener('mouseup', onUp);
                                };
                                window.addEventListener('mousemove', onMove);
                                window.addEventListener('mouseup', onUp);
                              }}
                            >
                              <img
                                src={url}
                                alt={att.filename}
                                className="pointer-events-none w-full h-full object-contain"
                                style={{
                                  transform: `translate(${vs.pan.x}px, ${vs.pan.y}px) scale(${vs.zoom})`,
                                  transformOrigin: 'center center',
                                }}
                                draggable={false}
                              />
                            </div>
                          </div>
                          );
                        })() : isImage && url ? (
                          <div className="px-3 pb-2">
                            <img
                              src={url}
                              alt={att.filename}
                              className="max-h-48 rounded border border-gray-200 object-contain cursor-pointer hover:opacity-90 transition-opacity"
                              onClick={(e) => { e.stopPropagation(); toggleInlineViewer(att.id); }}
                            />
                          </div>
                        ) : null}
                        {isPdf && url && (
                          <div className="px-3 pb-2">
                            <iframe src={url} className="w-full h-48 rounded border border-gray-200" title={att.filename} />
                          </div>
                        )}
                        {isSpreadsheet && url && (
                          <SpreadsheetPreview url={url} />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
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

      {/* RIGHT SIDE: Recommendations — renders per-proposal sections based on action type */}
      <div className="lg:w-1/2 lg:flex-shrink-0">
      {/* Render each sibling proposal with the appropriate section */}
      <div className="space-y-3">
        {siblingProposals.map(p => {
          const action = p.action;
          const isUndet = action === 'undetermined' || (!action && p.order_id === null);
          const isCreate = action === 'create';

          if (isUndet) {
            return (
              <UndeterminedSection
                key={p.id}
                proposal={p}
                showMultiLabel={hasMultipleProposals}
                onOpenCreateNewOrderModal={onOpenCreateNewOrderModal}
                onOpenAssignToOrderModal={onOpenAssignToOrderModal}
                onDismiss={onDismiss}
                isDismissing={dismissingProposalId === p.id}
              />
            );
          } else if (isCreate) {
            return (
              <CreateOrderSection
                key={p.id}
                proposal={p}
                customers={customers}
                showMultiLabel={hasMultipleProposals}
                onCreateOrder={onCreateOrder}
                onDismiss={onDismiss}
                onUpdateOrderFrequency={onUpdateOrderFrequency}
                isDismissing={dismissingProposalId === p.id}
              />
            );
          } else {
            // assign action
            const pMatchedOrder = orders.find(o => o.id === p.order_id) || null;
            return (
              <AssignOrderSection
                key={p.id}
                proposal={p}
                matchedOrder={pMatchedOrder}
                orders={orders}
                customers={customers}
                showMultiLabel={hasMultipleProposals}
                onApplyChange={onApplyChange}
                onDismiss={onDismiss}
                onOpenCreateNewOrderModal={onOpenCreateNewOrderModal}
                onOpenAssignToOrderModal={onOpenAssignToOrderModal}
                onUpdateOrderFrequency={onUpdateOrderFrequency}
                isDismissing={dismissingProposalId === p.id}
                isApplying={applyingProposalId === p.id}
              />
            );
          }
        })}
      </div>
      </div>
      {/* End RIGHT SIDE */}
          </div>
          {/* End flex container */}
        </div>
      )}

      {/* Image lightbox overlay — portaled to body to escape overflow clipping */}
      {lightboxUrl && createPortal(
        <div
          className="fixed inset-0 z-[9999] bg-black/80 flex items-center justify-center"
          onClick={closeLightbox}
        >
          {/* Toolbar */}
          <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-1 z-10 bg-gray-900/90 backdrop-blur-sm rounded-full px-3 py-2 shadow-lg" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setLightboxZoom(z => Math.max(0.25, z - 0.25))}
              className="p-1.5 rounded-full hover:bg-white/20 text-white transition-colors"
              title="Zoom out"
            >
              <ZoomOut className="w-5 h-5" />
            </button>
            <span className="text-white text-sm font-medium min-w-[3.5rem] text-center">{Math.round(lightboxZoom * 100)}%</span>
            <button
              onClick={() => setLightboxZoom(z => Math.min(5, z + 0.25))}
              className="p-1.5 rounded-full hover:bg-white/20 text-white transition-colors"
              title="Zoom in"
            >
              <ZoomIn className="w-5 h-5" />
            </button>
            <div className="w-px h-5 bg-white/20 mx-1" />
            <button
              onClick={() => { setLightboxZoom(1); setLightboxPan({ x: 0, y: 0 }); }}
              className="p-1.5 rounded-full hover:bg-white/20 text-white transition-colors"
              title="Reset view"
            >
              <RotateCcw className="w-5 h-5" />
            </button>
            <div className="w-px h-5 bg-white/20 mx-1" />
            <button
              onClick={closeLightbox}
              className="p-1.5 rounded-full hover:bg-white/20 text-white transition-colors"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Image with pan & zoom */}
          <div
            className="overflow-hidden cursor-grab active:cursor-grabbing select-none"
            style={{ maxWidth: '90vw', maxHeight: '90vh' }}
            onClick={e => e.stopPropagation()}
            onWheel={e => {
              e.stopPropagation();
              setLightboxZoom(z => Math.min(5, Math.max(0.25, z + (e.deltaY < 0 ? 0.15 : -0.15))));
            }}
            onMouseDown={e => {
              lightboxDragRef.current = { dragging: true, startX: e.clientX, startY: e.clientY, startPanX: lightboxPan.x, startPanY: lightboxPan.y };
              const onMove = (ev: MouseEvent) => {
                if (!lightboxDragRef.current.dragging) return;
                setLightboxPan({
                  x: lightboxDragRef.current.startPanX + (ev.clientX - lightboxDragRef.current.startX),
                  y: lightboxDragRef.current.startPanY + (ev.clientY - lightboxDragRef.current.startY),
                });
              };
              const onUp = () => {
                lightboxDragRef.current.dragging = false;
                window.removeEventListener('mousemove', onMove);
                window.removeEventListener('mouseup', onUp);
              };
              window.addEventListener('mousemove', onMove);
              window.addEventListener('mouseup', onUp);
            }}
          >
            <img
              src={lightboxUrl}
              alt="Attachment preview"
              className="pointer-events-none"
              style={{
                transform: `translate(${lightboxPan.x}px, ${lightboxPan.y}px) scale(${lightboxZoom})`,
                transformOrigin: 'center center',
                maxWidth: '90vw',
                maxHeight: '90vh',
                objectFit: 'contain',
              }}
              draggable={false}
            />
          </div>
        </div>,
        document.body
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

  // Group proposals by intake_event_id so one card = one message
  const groupedProposals = useMemo(() => {
    const groups: Record<string, Proposal[]> = {};
    for (const p of proposals) {
      const key = p.intake_event_id;
      if (!groups[key]) groups[key] = [];
      groups[key].push(p);
    }
    // Sort each group's proposals by delivery_date
    for (const key of Object.keys(groups)) {
      groups[key].sort((a, b) => a.delivery_date.localeCompare(b.delivery_date));
    }
    return groups;
  }, [proposals]);

  // Sort groups (by the primary/first proposal in each group)
  const sortedGroups = useMemo(() => {
    const entries = Object.entries(groupedProposals);
    const sortByPrimary = (a: [string, Proposal[]], b: [string, Proposal[]]) => {
      const pa = a[1][0], pb = b[1][0];
      switch (sortMode) {
        case 'urgent': {
          const dateA = new Date(pa.delivery_date + 'T00:00:00').getTime();
          const dateB = new Date(pb.delivery_date + 'T00:00:00').getTime();
          if (dateA !== dateB) return dateA - dateB;
          return new Date(pb.created_at).getTime() - new Date(pa.created_at).getTime();
        }
        case 'channel':
          if (pa.channel !== pb.channel) return pa.channel === 'sms' ? -1 : 1;
          return new Date(pb.created_at).getTime() - new Date(pa.created_at).getTime();
        case 'needs-input': {
          const aU = pa.action === 'undetermined' ? 0 : 1;
          const bU = pb.action === 'undetermined' ? 0 : 1;
          if (aU !== bU) return aU - bU;
          return new Date(pb.created_at).getTime() - new Date(pa.created_at).getTime();
        }
        case 'recent':
        default:
          return new Date(pb.created_at).getTime() - new Date(pa.created_at).getTime();
      }
    };
    return entries.sort(sortByPrimary);
  }, [groupedProposals, sortMode]);

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
            {sortedGroups.length} message{sortedGroups.length !== 1 ? 's' : ''} to review
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
        {sortedGroups.map(([intakeEventId, groupProposals]) => {
          const primary = groupProposals[0];
          return (
            <InboxCard
              key={intakeEventId}
              proposal={primary}
              siblingProposals={groupProposals}
              matchedOrder={orders.find(o => o.id === primary.order_id) || null}
              orders={orders}
              customers={customers}
              onApplyChange={onApplyChange}
              onCreateOrder={onCreateOrder}
              onDismiss={onDismiss}
              onOpenCreateNewOrderModal={onOpenCreateNewOrderModal}
              onOpenAssignToOrderModal={onOpenAssignToOrderModal}
              onUpdateOrderFrequency={onUpdateOrderFrequency}
              dismissingProposalId={dismissingProposalId}
              applyingProposalId={applyingProposalId}
            />
          );
        })}
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

const Dashboard: React.FC<DashboardProps> = ({ organizationId, layout = 'default', headerContent }) => {
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [sidebarTab, setSidebarTab] = useState<'inbox' | 'orders' | 'upload' | 'analytics' | 'catalog' | 'history' | 'customers'>('inbox');
  const [orders, setOrders] = useState<Order[]>([]);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [editableOrderLines, setEditableOrderLines] = useState<(OrderItem & { _action?: 'add' | 'modify' | 'remove' })[]>([]);
  const [savingOrderId, setSavingOrderId] = useState<string | null>(null);
  const [creatingNewOrder, setCreatingNewOrder] = useState(false);
  const [newOrderCustomer, setNewOrderCustomer] = useState('');
  const [newOrderDeliveryDate, setNewOrderDeliveryDate] = useState('');
  const [newOrderLines, setNewOrderLines] = useState<{ name: string; size: string; quantity: number }[]>([{ name: '', size: 'S', quantity: 1 }]);
  const [savingNewOrder, setSavingNewOrder] = useState(false);
  const [deletingOrderId, setDeletingOrderId] = useState<string | null>(null);
  const [orderActionsMenuId, setOrderActionsMenuId] = useState<string | null>(null);
  const [customerActionsMenuId, setCustomerActionsMenuId] = useState<string | null>(null);
  const orderActionsRef = useRef<HTMLDivElement>(null);
  const customerActionsRef = useRef<HTMLDivElement>(null);
  const [proposals, setProposals] = useState<Proposal[]>(MOCK_PROPOSALS);
  const inboxMessageCount = useMemo(() => {
    const seen = new Set<string>();
    for (const p of proposals) seen.add(p.intake_event_id);
    return seen.size;
  }, [proposals]);
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
  const catalogItemNames = useMemo(() => catalogItems.map(i => i.name), [catalogItems]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [expandedCatalogItems, setExpandedCatalogItems] = useState<Set<string>>(new Set());

  // Customers state (for searchable customer dropdown)
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [expandedCustomerId, setExpandedCustomerId] = useState<string | null>(null);
  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null);
  const [editCustomerName, setEditCustomerName] = useState('');
  const [editCustomerEmail, setEditCustomerEmail] = useState('');
  const [editCustomerPhone, setEditCustomerPhone] = useState('');
  const [editCustomerNotes, setEditCustomerNotes] = useState('');
  const [savingCustomerId, setSavingCustomerId] = useState<string | null>(null);
  const [newItemNoteName, setNewItemNoteName] = useState('');
  const [newItemNoteText, setNewItemNoteText] = useState('');
  const [itemNameDropdownOpen, setItemNameDropdownOpen] = useState(false);
  const itemNameDropdownRef = useRef<HTMLDivElement>(null);
  const [editingItemNoteId, setEditingItemNoteId] = useState<string | null>(null);
  const [editItemNoteText, setEditItemNoteText] = useState('');
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // History state
  const [intakeHistory, setIntakeHistory] = useState<IntakeHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [expandedHistoryItems, setExpandedHistoryItems] = useState<Set<string>>(new Set());
  const [historyFilter, setHistoryFilter] = useState<'7d' | '30d'>('7d');

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

  // Close user menu and item name dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
      if (itemNameDropdownRef.current && !itemNameDropdownRef.current.contains(e.target as Node)) {
        setItemNameDropdownOpen(false);
      }
      if (orderActionsRef.current && !orderActionsRef.current.contains(e.target as Node)) {
        setOrderActionsMenuId(null);
      }
      if (customerActionsRef.current && !customerActionsRef.current.contains(e.target as Node)) {
        setCustomerActionsMenuId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Load orders, proposals, and customers
  useEffect(() => {
    if (organizationId) {
      loadOrders();
      loadProposals();
      loadCustomers();
      loadCatalog();
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

  // Load history when switching to history tab or changing filter
  useEffect(() => {
    if (sidebarTab === 'history' && organizationId) {
      loadHistory();
    }
  }, [sidebarTab, organizationId, historyFilter]);

  const USE_MOCK_INBOX = import.meta.env.DEV && organizationId === 'test-org-id'; // Use mock data for demo org (dev only)

  const loadOrders = async (showFullPageLoading = true) => {
    if (!organizationId) return;
    if (USE_MOCK_INBOX) {
      setOrders(MOCK_STANDING_ORDERS);
      setIsLoading(false);
      return;
    }

    if (showFullPageLoading) setIsLoading(true);
    try {
      const accessToken = await getAccessToken();
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-orders`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ organization_id: organizationId }),
        }
      );
      const result = await response.json();
      if (!result.success) {
        console.error('Error loading orders:', result.error);
        return;
      }
      const transformedOrders: Order[] = (result.orders || []).map((order: any) => {
        const activeLines = (order.order_lines || []).filter((l: any) => l.status === 'active');
        return {
          id: order.id,
          customer_name: order.customer_name || 'Unknown Customer',
          status: order.status || 'pending',
          source: order.source_channel || 'manual',
          delivery_date: order.delivery_date,
          created_at: order.created_at,
          sort_position: order.sort_position ?? null,
          items: activeLines.map((line: any) => ({
            order_line_id: line.id,
            item_id: line.item_id || undefined,
            item_variant_id: line.item_variant_id || undefined,
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
    if (USE_MOCK_INBOX) return; // Keep MOCK_PROPOSALS for demo
    if (!organizationId) return;

    const { data, error } = await supabaseClient
      .from('order_change_proposals')
      .select(`
        id,
        order_id,
        status,
        type,
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

    // Fetch attachments for all intake events in one query
    const intakeEventIds = [...new Set((data || []).map((r: any) => r.intake_event_id).filter(Boolean))];
    let attachmentsByEvent: Record<string, ProposalAttachment[]> = {};
    if (intakeEventIds.length > 0) {
      const { data: filesData } = await supabaseClient
        .from('intake_files')
        .select('id, intake_event_id, filename, extension, mime_type, size_bytes, storage_path, processing_status')
        .in('intake_event_id', intakeEventIds);
      if (filesData) {
        for (const f of filesData) {
          const evId = (f as any).intake_event_id as string;
          if (!attachmentsByEvent[evId]) attachmentsByEvent[evId] = [];
          attachmentsByEvent[evId].push({
            id: f.id,
            filename: f.filename,
            extension: f.extension,
            mime_type: f.mime_type,
            size_bytes: f.size_bytes,
            storage_path: f.storage_path,
            processing_status: f.processing_status,
          });
        }
      }
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
        delivery_date: pl.proposed_values?.delivery_date,
      }));

      // Derive order_frequency from tags if present
      const tags: Record<string, string> = row.tags || {};
      const orderType = (tags.order_frequency === 'recurring' ? 'recurring' : tags.order_frequency === 'one-time' ? 'one-time' : undefined) as Proposal['order_frequency'];

      return {
        id: row.id,
        order_id: row.order_id,
        type: row.type || undefined,
        intake_event_id: row.intake_event_id,
        action: row.order_id ? 'assign' : 'create',
        order_frequency: orderType,
        tags: row.tags || undefined,
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
        attachments: attachmentsByEvent[row.intake_event_id] || undefined,
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
    if (USE_MOCK_INBOX) {
      setCatalogItems([
        { id: 'cat-1', sku: 'RD-8MIX', name: 'Rainbow Dianthus 8 Stem Mix Bunch x12', item_variants: [{ id: 'v1', variant_code: 'L', variant_name: 'Large' }] },
        { id: 'cat-2', sku: 'RS-COMBO', name: 'Raffines/Solomios Combo Box', item_variants: [{ id: 'v2', variant_code: 'L', variant_name: 'Large' }] },
        { id: 'cat-3', sku: 'SOL-001', name: 'Solomio', item_variants: [{ id: 'v3', variant_code: 'L', variant_name: 'Large' }] },
        { id: 'cat-4', sku: 'RAF-001', name: 'Raffine', item_variants: [{ id: 'v4', variant_code: 'L', variant_name: 'Large' }] },
        { id: 'cat-5', sku: 'NMC-001', name: 'Consumer Novelty Mini Carnations', item_variants: [{ id: 'v5', variant_code: 'L', variant_name: 'Large' }] },
        { id: 'cat-6', sku: 'MCR-001', name: 'Mini Carn Rainbow', item_variants: [{ id: 'v6', variant_code: 'L', variant_name: 'Large' }, { id: 'v6b', variant_code: 'HB', variant_name: 'Half Box' }] },
        { id: 'cat-7', sku: 'AA-001', name: 'Assorted Arrangements', item_variants: [{ id: 'v7', variant_code: 'L', variant_name: 'Large' }, { id: 'v7b', variant_code: 'S', variant_name: 'Small' }] },
        { id: 'cat-8', sku: 'PRB-001', name: 'Premium Rose Bundle', item_variants: [{ id: 'v8', variant_code: 'S', variant_name: 'Small' }, { id: 'v8b', variant_code: 'L', variant_name: 'Large' }] },
        { id: 'cat-9', sku: 'SWM-001', name: 'Seasonal Wildflower Mix', item_variants: [{ id: 'v9', variant_code: 'L', variant_name: 'Large' }] },
      ]);
      setCatalogLoading(false);
      return;
    }
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
    if (USE_MOCK_INBOX) {
      setCustomers([
        { id: 'cust-1', name: 'KM Handling', email: 'orders@kmhandling.com', notes: 'Preferred carrier: FedEx. Always confirm delivery window 24hrs ahead.' },
        { id: 'cust-2', name: 'Farm Export Co', email: 'logistics@farmexport.co', notes: 'Ships from Bogotá. Requires phytosanitary cert on every order.' },
        { id: 'cust-3', name: 'Flower Buyer', email: 'sales@orangeflower.co' },
        { id: 'cust-4', name: 'Bloom Distribution', email: 'gaotioncapital@gmail.com', notes: 'High volume account. Net 30 payment terms.', item_notes: [
          { id: 'in-1', item_name: 'Moonlight', note: 'HB 4×18, 18 bunches/box, $0.25/stem, La Gaitana Farms, clear sleeve for carnations 12' },
          { id: 'in-2', item_name: 'Zeppelin', note: 'HB 4×18, 18 bunches/box, $0.25/stem, high volume — always confirm availability 48hrs ahead' },
          { id: 'in-3', item_name: 'Don Pedro', note: 'HB 4×18, 18 bunches/box, $0.25/stem, high volume' },
          { id: 'in-4', item_name: 'Academy', note: 'QB 5×20, 20 bunches/box, $0.17/stem, mini carn, high volume — often orders 10+ boxes' },
          { id: 'in-5', item_name: 'Doncel', note: 'HB 4×18, 18 bunches/box, $0.23/stem, high volume' },
        ] },
        { id: 'cust-5', name: '71001', email: null, notes: 'Internal customer code — verify mapping before shipment.' },
        { id: 'cust-6', name: 'Flores del Valle', email: 'pedidos@floresdelvalle.co', phone: '+57 310 555 4422', notes: 'Spanish-speaking contact. Prefers SMS for order confirmations.', item_notes: [
          { id: 'in-6', item_name: 'Moonlight', note: 'Standard box, 10 units default. Customer usually orders by name only.' },
          { id: 'in-7', item_name: 'Farida', note: 'New addition — started ordering Feb 2026' },
        ] },
      ]);
      return;
    }
    const { data, error } = await supabaseClient
      .from('customers')
      .select('id, name, email, phone, notes, customer_item_notes(id, item_name, note)')
      .eq('organization_id', organizationId)
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('name');

    if (error) {
      console.error('Error loading customers:', error);
    } else {
      setCustomers((data || []).map((c: any) => ({
        ...c,
        item_notes: c.customer_item_notes || [],
        customer_item_notes: undefined,
      })));
    }
  };

  // Save customer edits
  const handleSaveCustomer = async (customerId: string) => {
    setSavingCustomerId(customerId);
    try {
      const customer = customers.find(c => c.id === customerId);
      if (USE_MOCK_INBOX) {
        setCustomers(prev => prev.map(c =>
          c.id === customerId
            ? { ...c, name: editCustomerName, email: editCustomerEmail || null, phone: editCustomerPhone || null, notes: editCustomerNotes || null }
            : c
        ));
        showToast('Customer updated');
        setEditingCustomerId(null);
        return;
      }
      const accessToken = await getAccessToken();
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/update-customer`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            customer_id: customerId,
            name: editCustomerName,
            email: editCustomerEmail || null,
            phone: editCustomerPhone || null,
            notes: editCustomerNotes || null,
            item_notes: customer?.item_notes || [],
          }),
        }
      );
      const result = await response.json();
      if (result.success) {
        showToast('Customer updated');
        setEditingCustomerId(null);
        loadCustomers();
      } else {
        console.error('Error updating customer:', result.error);
        showToast('Failed to update customer', 'error');
      }
    } finally {
      setSavingCustomerId(null);
    }
  };

  // Load intake history
  const loadHistory = async () => {
    if (!organizationId) return;
    setHistoryLoading(true);

    // Calculate date threshold based on filter
    const now = new Date();
    const daysAgo = historyFilter === '7d' ? 7 : 30;
    const dateThreshold = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000).toISOString();

    // Get intake events with their proposal assignments and proposal lines
    const { data, error } = await supabaseClient
      .from('intake_events')
      .select(`
        id,
        channel,
        provider,
        created_at,
        raw_content,
        order_change_proposals (
          id,
          status,
          type,
          order_id,
          tags,
          orders ( id, customer_name, delivery_date ),
          order_change_proposal_lines ( id, change_type, item_name, proposed_values )
        )
      `)
      .eq('organization_id', organizationId)
      .gte('created_at', dateThreshold)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error loading history:', error);
    } else {
      const transformed: IntakeHistoryItem[] = (data || []).map((item: any) => {
        const proposals: IntakeHistoryProposal[] = (item.order_change_proposals || []).map((p: any) => ({
          id: p.id,
          status: p.status || null,
          type: p.type || undefined,
          customer_name: p.orders?.customer_name || null,
          delivery_date: p.orders?.delivery_date || null,
          order_id: p.orders?.id || null,
          lines: (p.order_change_proposal_lines || []).map((l: any) => ({
            id: l.id,
            change_type: l.change_type,
            item_name: l.item_name,
            proposed_values: l.proposed_values,
          })),
          tags: p.tags || null,
        }));

        return {
          id: item.id,
          channel: item.channel,
          provider: item.provider,
          created_at: item.created_at,
          raw_content: item.raw_content,
          proposals,
        };
      });
      setIntakeHistory(transformed);
    }
    setHistoryLoading(false);
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

  // Handler — create a new order manually
  const handleCreateNewOrder = async () => {
    if (!newOrderCustomer.trim() || !newOrderDeliveryDate || !organizationId) return;
    const validLines = newOrderLines.filter(l => l.name.trim());
    if (validLines.length === 0) return;

    setSavingNewOrder(true);
    try {
      const accessToken = await getAccessToken();

      // Create the order
      const { data: newOrder, error: orderError } = await supabaseClient
        .from('orders')
        .insert({
          organization_id: organizationId,
          customer_name: newOrderCustomer.trim(),
          delivery_date: newOrderDeliveryDate,
          status: 'ready',
          source_channel: 'dashboard',
        })
        .select('id')
        .single();

      if (orderError || !newOrder) {
        console.error('Failed to create order:', orderError);
        return;
      }

      // Add lines via the update-order edge function
      const lines = validLines.map(l => ({
        action: 'add' as const,
        item_name: l.name,
        variant_code: l.size || undefined,
        quantity: l.quantity,
      }));

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/update-order`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ orderId: newOrder.id, lines }),
      });

      if (!response.ok) {
        console.error('Failed to add order lines:', await response.json());
      }

      // Reset form and reload
      setCreatingNewOrder(false);
      setNewOrderCustomer('');
      setNewOrderDeliveryDate('');
      setNewOrderLines([{ name: '', size: 'S', quantity: 1 }]);
      await loadOrders(false);
    } catch (error) {
      console.error('Error creating order:', error);
    } finally {
      setSavingNewOrder(false);
    }
  };

  // Handler — save direct order edits via update-order edge function
  const handleSaveOrderEdit = async (orderId: string) => {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;

    setSavingOrderId(orderId);
    try {
      const accessToken = await getAccessToken();

      // Build the change lines by comparing editableOrderLines to original
      const changeLines: { action: string; order_line_id?: string; item_name: string; item_id?: string; item_variant_id?: string; variant_code?: string; quantity: number }[] = [];

      for (const line of editableOrderLines) {
        if (line._action === 'remove' && line.order_line_id) {
          changeLines.push({ action: 'remove', order_line_id: line.order_line_id, item_name: line.name, quantity: line.quantity });
        } else if (line._action === 'add') {
          if (!line.name.trim()) continue;
          changeLines.push({ action: 'add', item_name: line.name, variant_code: line.size || undefined, quantity: line.quantity });
        } else if (line._action === 'modify' && line.order_line_id) {
          changeLines.push({ action: 'modify', order_line_id: line.order_line_id, item_name: line.name, item_id: line.item_id, variant_code: line.size || undefined, quantity: line.quantity });
        }
      }

      if (changeLines.length === 0) {
        setEditingOrderId(null);
        setEditableOrderLines([]);
        return;
      }

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/update-order`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ orderId, lines: changeLines }),
      });

      if (!response.ok) {
        const err = await response.json();
        console.error('Failed to update order:', err);
        return;
      }

      setEditingOrderId(null);
      setEditableOrderLines([]);
      await loadOrders(false);
    } catch (error) {
      console.error('Error saving order edit:', error);
    } finally {
      setSavingOrderId(null);
    }
  };

  // Handler — delete (cancel) an entire order
  const handleDeleteOrder = async (orderId: string) => {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;

    setDeletingOrderId(orderId);
    try {
      const accessToken = await getAccessToken();
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/update-order`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ orderId, cancel_entire_order: true }),
      });

      if (!response.ok) {
        const err = await response.json();
        console.error('Failed to delete order:', err);
        showToast('Failed to delete order', 'error');
        return;
      }

      setEditingOrderId(null);
      setEditableOrderLines([]);
      await loadOrders(false);
      showToast('Order deleted');
    } catch (error) {
      console.error('Error deleting order:', error);
      showToast('Failed to delete order', 'error');
    } finally {
      setDeletingOrderId(null);
    }
  };

  // Handler — delete all orders for a customer on a given date
  const handleDeleteCustomerOrders = async (customerOrders: Order[], customerName: string) => {
    if (customerOrders.length === 0) return;

    try {
      const accessToken = await getAccessToken();
      for (const order of customerOrders) {
        setDeletingOrderId(order.id);
        const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/update-order`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ orderId: order.id, cancel_entire_order: true }),
        });

        if (!response.ok) {
          const err = await response.json();
          console.error('Failed to delete order:', err);
          showToast(`Failed to delete order for ${customerName}`, 'error');
          return;
        }
      }

      setEditingOrderId(null);
      setEditableOrderLines([]);
      await loadOrders(false);
      showToast(customerOrders.length === 1 ? 'Order deleted' : `${customerOrders.length} orders deleted`);
    } catch (error) {
      console.error('Error deleting customer orders:', error);
      showToast('Failed to delete orders', 'error');
    } finally {
      setDeletingOrderId(null);
    }
  };

  // Handlers — apply changes to order via resolve-proposal API, then remove from local state
  const handleApplyChange = async (proposalId: string, lines: ProposalLine[]) => {
    const proposal = proposals.find(p => p.id === proposalId);
    if (!proposal) return;

    if (USE_MOCK_INBOX) {
      setProposals(prev => prev.filter(p => p.id !== proposalId));
      showToast('Changes applied');
      return;
    }

    setApplyingProposalId(proposalId);

    try {
      const accessToken = await getAccessToken();

      // Build submitted lines for the API
      const submittedLines = lines
        .filter(line => !(line.change_type === 'add' && (!line.item_name || !line.item_name.trim())))
        .map(l => ({
          change_type: l.change_type,
          item_name: l.item_name,
          item_id: l.item_id || null,
          item_variant_id: l.item_variant_id || null,
          quantity: l.quantity,
          variant_code: l.size || null,
          order_line_id: l.order_line_id || null,
        }));

      // Look up customer_id for new orders
      const matchedCustomer = !proposal.order_id
        ? customers.find(c => c.name.toLowerCase() === proposal.customer_name.toLowerCase())
        : null;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/resolve-proposal`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            proposalId,
            action: 'accept',
            submittedLines,
            customerName: proposal.customer_name,
            customerId: matchedCustomer?.id || null,
            deliveryDate: proposal.delivery_date,
          })
        }
      );

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to apply changes');
      }

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
    if (USE_MOCK_INBOX) {
      setProposals(prev => prev.filter(p => p.id !== proposalId));
      showToast('Proposal dismissed');
      return;
    }

    setDismissingProposalId(proposalId);
    try {
      const accessToken = await getAccessToken();

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/resolve-proposal`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            proposalId,
            action: 'reject',
          })
        }
      );

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to dismiss proposal');
      }

      setProposals(prev => prev.filter(p => p.id !== proposalId));
      showToast('Proposal dismissed');
    } catch (error) {
      console.error('Error dismissing proposal:', error);
      showToast('Failed to dismiss proposal', 'error');
    } finally {
      setDismissingProposalId(null);
    }
  };

  // Toggle ERP sync status for a proposal in History tab (admin only)
  const handleToggleErpSync = async (proposalId: string, currentTags: IntakeHistoryProposal['tags']) => {
    const currentStatus = currentTags?.erp_sync_status || 'pending';
    const newStatus = currentStatus === 'synced' ? 'pending' : 'synced';

    const updatedTags = {
      ...currentTags,
      erp_sync_status: newStatus as 'pending' | 'synced'
    };

    const { error } = await supabaseClient
      .from('order_change_proposals')
      .update({ tags: updatedTags })
      .eq('id', proposalId);

    if (!error) {
      loadHistory();
      showToast(newStatus === 'synced' ? 'Marked as synced to ERP' : 'Marked as pending ERP sync');
    } else {
      console.error('Error updating ERP sync status:', error);
      showToast('Failed to update ERP status', 'error');
    }
  };

  const handleCreateOrder = async (proposalId: string, lines: ProposalLine[], overrideCustomerName?: string, overrideDeliveryDate?: string) => {
    const proposal = proposals.find(p => p.id === proposalId);
    if (!proposal || !organizationId) return;

    if (USE_MOCK_INBOX) {
      setProposals(prev => prev.filter(p => p.id !== proposalId));
      setCreateNewOrderModal(null);
      showToast('Order created');
      return;
    }

    try {
      const accessToken = await getAccessToken();
      const customerName = overrideCustomerName || proposal.customer_name;
      const matchedCustomer = customers.find(c => c.name.toLowerCase() === customerName.toLowerCase());

      const submittedLines = lines.map(l => ({
        change_type: l.change_type as 'add' | 'remove' | 'modify',
        item_name: l.item_name,
        item_id: l.item_id || null,
        item_variant_id: l.item_variant_id || null,
        quantity: l.quantity,
        variant_code: l.size || null,
        order_line_id: l.order_line_id || null,
      }));

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/resolve-proposal`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            proposalId,
            action: 'accept',
            submittedLines,
            customerName,
            customerId: matchedCustomer?.id || null,
            deliveryDate: overrideDeliveryDate || proposal.delivery_date,
          })
        }
      );

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to create order');
      }

      setProposals(prev => prev.filter(p => p.id !== proposalId));
      setCreateNewOrderModal(null);
      loadOrders(false);
      showToast('Order created');
    } catch (error) {
      console.error('Error creating order:', error);
      showToast('Failed to create order', 'error');
    }
  };

  const handleUpdateOrderFrequency = async (proposalId: string, value: 'one-time' | 'recurring') => {
    // Find the proposal to get existing tags
    const proposal = proposals.find(p => p.id === proposalId);
    const existingTags = proposal?.tags || {};

    // Merge with existing tags to preserve other fields
    await supabaseClient
      .from('order_change_proposals')
      .update({ tags: { ...existingTags, order_frequency: value } })
      .eq('id', proposalId);

    // Update local state
    setProposals(prev => prev.map(p =>
      p.id === proposalId
        ? { ...p, tags: { ...p.tags, order_frequency: value }, order_frequency: value }
        : p
    ));
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
    const query = searchQuery.toLowerCase();

    orders.forEach(order => {
      if (query) {
        const matchesCustomer = order.customer_name.toLowerCase().includes(query);
        const matchesItem = order.items?.some(item => item.name.toLowerCase().includes(query));
        if (!matchesCustomer && !matchesItem) return;
      }

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
  }, [orders, searchQuery]);

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
      const query = searchQuery.toLowerCase();
      const matchesSearch = !query ||
        order.customer_name.toLowerCase().includes(query) ||
        order.items?.some(item => item.name.toLowerCase().includes(query));
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
      case 'dashboard':
        return <LayoutDashboard className="w-4 h-4" />;
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
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search orders..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-48 pl-8 pr-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
          />
        </div>
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
        {/* New Order */}
        <button
          onClick={() => setCreatingNewOrder(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Order
        </button>
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
                {inboxMessageCount > 0 && (
                  <span className={`${sidebarCollapsed ? 'absolute -top-1 -right-1' : 'ml-auto'} min-w-[20px] h-5 flex items-center justify-center bg-red-500 text-white text-xs font-bold rounded-full px-1`}>
                    {inboxMessageCount > 99 ? '99+' : inboxMessageCount}
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
                onClick={() => setSidebarTab('history')}
                className={`w-full flex items-center ${sidebarCollapsed ? 'justify-center' : ''} gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                  sidebarTab === 'history'
                    ? 'text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
                style={sidebarTab === 'history' ? { backgroundColor: frootfulGreen } : undefined}
                title="History"
              >
                <Clock className="w-5 h-5 flex-shrink-0" />
                {!sidebarCollapsed && <span className="font-medium">History</span>}
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
              <button
                onClick={() => setSidebarTab('customers')}
                className={`w-full flex items-center ${sidebarCollapsed ? 'justify-center' : ''} gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                  sidebarTab === 'customers'
                    ? 'text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
                style={sidebarTab === 'customers' ? { backgroundColor: frootfulGreen } : undefined}
                title="Customers"
              >
                <Users className="w-5 h-5 flex-shrink-0" />
                {!sidebarCollapsed && <span className="font-medium">Customers</span>}
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

              {headerContent.user && (
                <div className="relative" ref={userMenuRef}>
                  <button
                    onClick={() => setUserMenuOpen(!userMenuOpen)}
                    className="flex items-center space-x-2 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    {headerContent.user.user_metadata?.avatar_url ? (
                      <img
                        src={headerContent.user.user_metadata.avatar_url}
                        alt="Profile"
                        className="w-7 h-7 rounded-full"
                      />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center">
                        <User className="w-4 h-4 text-green-700" />
                      </div>
                    )}
                    <span className="text-sm font-medium text-gray-700">{headerContent.user.user_metadata?.full_name || headerContent.user.email}</span>
                    <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {userMenuOpen && (
                    <div className="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-lg py-1 z-50 border border-gray-200">
                      <button
                        onClick={() => { setUserMenuOpen(false); headerContent.onNavigateSettings(); }}
                        className="flex items-center gap-2 w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                      >
                        <Settings className="w-4 h-4" />
                        <span>Settings</span>
                      </button>
                      <div className="border-t border-gray-100 my-1" />
                      <button
                        onClick={() => { setUserMenuOpen(false); headerContent.onSignOut(); }}
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
                  )}
                </div>
              )}
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
          {sidebarTab === 'upload' && <UploadOrdersSection />}

          {/* Analytics content - hidden for now */}
          {sidebarTab === 'analytics' && <AnalyticsDashboard />}

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

          {sidebarTab === 'customers' && (
            <div className="bg-white rounded-xl border border-gray-200">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-green-600" />
                  <h3 className="text-lg font-semibold text-gray-900">Customers ({customers.length})</h3>
                </div>
                <button
                  onClick={loadCustomers}
                  className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                  title="Refresh customers"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>

              {/* Search */}
              <div className="px-6 py-3 border-b border-gray-100">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search customers..."
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
                  />
                </div>
              </div>

              {customers.length === 0 ? (
                <div className="p-12 text-center text-gray-500">
                  <Users className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p className="text-lg font-medium text-gray-900 mb-1">No customers yet</p>
                  <p>Customers will appear here once added to your organization.</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100 max-h-[calc(100vh-280px)] overflow-y-auto">
                  {customers
                    .filter(c =>
                      customerSearch === '' ||
                      c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
                      (c.email && c.email.toLowerCase().includes(customerSearch.toLowerCase())) ||
                      (c.phone && c.phone.toLowerCase().includes(customerSearch.toLowerCase())) ||
                      (c.notes && c.notes.toLowerCase().includes(customerSearch.toLowerCase()))
                    )
                    .map((customer) => {
                      const isExpanded = expandedCustomerId === customer.id;
                      const isEditing = editingCustomerId === customer.id;
                      const isSaving = savingCustomerId === customer.id;

                      return (
                        <div key={customer.id}>
                          {/* Compact row — double-click to expand */}
                          <button
                            onDoubleClick={() => {
                              setExpandedCustomerId(isExpanded ? null : customer.id);
                              if (isEditing) setEditingCustomerId(null);
                            }}
                            onClick={() => {
                              if (!isExpanded) {
                                setExpandedCustomerId(customer.id);
                                if (editingCustomerId && editingCustomerId !== customer.id) setEditingCustomerId(null);
                              } else {
                                setExpandedCustomerId(null);
                                if (isEditing) setEditingCustomerId(null);
                              }
                            }}
                            className={`w-full px-6 py-3 text-left flex items-center gap-3 transition-colors ${isExpanded ? 'bg-gray-50' : 'hover:bg-gray-50'}`}
                          >
                            <div className="w-4 h-4 flex items-center justify-center text-gray-400">
                              {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                            </div>
                            <div className="w-8 h-8 rounded-full bg-green-100 text-green-700 flex items-center justify-center font-semibold text-xs flex-shrink-0">
                              {customer.name.charAt(0).toUpperCase()}
                            </div>
                            <span className="font-medium text-sm text-gray-900 flex-1">{customer.name}</span>
                          </button>

                          {/* Expanded detail view */}
                          {isExpanded && (
                            <div className="bg-gray-50 border-t border-gray-100 px-6 py-4 pl-[4.25rem]">
                              {isEditing ? (
                                /* Editing mode */
                                <div className="space-y-3">
                                  <div>
                                    <label className="block text-xs text-gray-500 mb-1">Name</label>
                                    <input
                                      type="text"
                                      value={editCustomerName}
                                      onChange={(e) => setEditCustomerName(e.target.value)}
                                      className="w-full px-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm bg-white"
                                      autoFocus
                                    />
                                  </div>
                                  <div className="grid grid-cols-2 gap-3">
                                    <div>
                                      <label className="block text-xs text-gray-500 mb-1">Email</label>
                                      <input
                                        type="email"
                                        value={editCustomerEmail}
                                        onChange={(e) => setEditCustomerEmail(e.target.value)}
                                        placeholder="—"
                                        className="w-full px-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm bg-white"
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-xs text-gray-500 mb-1">Phone</label>
                                      <input
                                        type="tel"
                                        value={editCustomerPhone}
                                        onChange={(e) => setEditCustomerPhone(e.target.value)}
                                        placeholder="—"
                                        className="w-full px-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm bg-white"
                                      />
                                    </div>
                                  </div>
                                  <div>
                                    <label className="relative group inline-flex items-center gap-1 text-xs text-gray-500 mb-1 cursor-help">Notes &#9432;<span className="absolute bottom-full left-0 mb-1 hidden group-hover:block w-64 px-2.5 py-1.5 text-xs text-white bg-gray-800 rounded-lg shadow-lg z-10">General notes about this customer that apply to all orders (e.g. delivery day restrictions, shipping preferences, payment terms).</span></label>
                                    <textarea
                                      value={editCustomerNotes}
                                      onChange={(e) => setEditCustomerNotes(e.target.value)}
                                      placeholder="Add notes about this customer..."
                                      rows={2}
                                      className="w-full px-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm bg-white resize-none"
                                    />
                                  </div>
                                  {/* Item-specific notes (editable) */}
                                  <div className="pt-2 border-t border-gray-200">
                                    <span className="relative group inline-flex items-center gap-1 text-xs text-gray-400 font-medium uppercase tracking-wider cursor-help">Item Notes &#9432;<span className="absolute bottom-full left-0 mb-1 hidden group-hover:block w-64 px-2.5 py-1.5 text-xs text-white bg-gray-800 rounded-lg shadow-lg z-10 normal-case tracking-normal font-normal">Item-specific notes for this customer (e.g. packaging type, box size, pricing, brand preferences). Used by AI to expand shorthand orders.</span></span>
                                    {customer.item_notes && customer.item_notes.length > 0 ? (
                                      <div className="mt-1.5 space-y-1">
                                        {customer.item_notes.map(itemNote => (
                                          <div key={itemNote.id} className="flex items-start gap-2 bg-white rounded-lg border border-gray-100 px-3 py-2">
                                            {editingItemNoteId === itemNote.id ? (
                                              <div className="flex-1 space-y-1.5">
                                                <p className="text-xs font-medium text-gray-900">{itemNote.item_name}</p>
                                                <textarea
                                                  value={editItemNoteText}
                                                  onChange={(e) => setEditItemNoteText(e.target.value)}
                                                  rows={4}
                                                  className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-green-500 resize-none leading-relaxed"
                                                  autoFocus
                                                />
                                                <div className="flex gap-1.5">
                                                  <button
                                                    onClick={() => {
                                                      setCustomers(prev => prev.map(c =>
                                                        c.id === customer.id
                                                          ? { ...c, item_notes: c.item_notes?.map(n => n.id === itemNote.id ? { ...n, note: editItemNoteText } : n) }
                                                          : c
                                                      ));
                                                      setEditingItemNoteId(null);
                                                    }}
                                                    className="px-2 py-0.5 text-[11px] text-white rounded transition-colors"
                                                    style={{ backgroundColor: frootfulGreen }}
                                                  >Save</button>
                                                  <button
                                                    onClick={() => setEditingItemNoteId(null)}
                                                    className="px-2 py-0.5 text-[11px] text-gray-500 hover:text-gray-700"
                                                  >Cancel</button>
                                                </div>
                                              </div>
                                            ) : (
                                              <>
                                                <div className="flex-1 min-w-0">
                                                  <p className="text-xs font-medium text-gray-900">{itemNote.item_name}</p>
                                                  <p className="text-xs text-gray-500 mt-0.5">{itemNote.note}</p>
                                                </div>
                                                <div className="flex items-center gap-1 flex-shrink-0">
                                                  <button
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      setEditingItemNoteId(itemNote.id);
                                                      setEditItemNoteText(itemNote.note);
                                                    }}
                                                    className="text-[11px] text-gray-400 hover:text-gray-600 px-1.5 py-0.5 rounded hover:bg-gray-50"
                                                  >Edit</button>
                                                  <button
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      setCustomers(prev => prev.map(c =>
                                                        c.id === customer.id
                                                          ? { ...c, item_notes: c.item_notes?.filter(n => n.id !== itemNote.id) }
                                                          : c
                                                      ));
                                                    }}
                                                    className="text-[11px] text-gray-400 hover:text-red-500 px-1.5 py-0.5 rounded hover:bg-gray-50"
                                                  ><X className="w-3 h-3" /></button>
                                                </div>
                                              </>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    ) : (
                                      <p className="text-xs text-gray-300 mt-1">No item-specific notes</p>
                                    )}
                                    {/* Add new item note */}
                                    <div className="mt-2 space-y-2 bg-white rounded-lg border border-gray-200 p-3">
                                      <div className="relative" ref={itemNameDropdownRef}>
                                        <label className="block text-[11px] text-gray-400 mb-0.5">Item</label>
                                        <input
                                          type="text"
                                          placeholder="Search items..."
                                          value={expandedCustomerId === customer.id ? newItemNoteName : ''}
                                          onChange={(e) => { setNewItemNoteName(e.target.value); setItemNameDropdownOpen(true); }}
                                          onFocus={() => setItemNameDropdownOpen(true)}
                                          onClick={(e) => e.stopPropagation()}
                                          className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-green-500"
                                        />
                                        {itemNameDropdownOpen && (() => {
                                          const q = newItemNoteName.toLowerCase();
                                          const filtered = catalogItemNames.filter(n => n.toLowerCase().includes(q)).slice(0, 8);
                                          if (filtered.length === 0) return null;
                                          return (
                                            <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                                              {filtered.map(name => (
                                                <button
                                                  key={name}
                                                  onClick={(e) => { e.stopPropagation(); setNewItemNoteName(name); setItemNameDropdownOpen(false); }}
                                                  className="w-full text-left px-2.5 py-1.5 text-xs text-gray-700 hover:bg-green-50 hover:text-green-700"
                                                >
                                                  {name}
                                                </button>
                                              ))}
                                            </div>
                                          );
                                        })()}
                                      </div>
                                      <div>
                                        <label className="block text-[11px] text-gray-400 mb-0.5">Note</label>
                                        <textarea
                                          placeholder="Describe how this customer orders this item (e.g. packaging, box size, pricing, brand)..."
                                          value={expandedCustomerId === customer.id ? newItemNoteText : ''}
                                          onChange={(e) => setNewItemNoteText(e.target.value)}
                                          onClick={(e) => e.stopPropagation()}
                                          rows={3}
                                          className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-green-500 resize-none leading-relaxed"
                                        />
                                      </div>
                                      <div className="flex justify-end">
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            if (newItemNoteName.trim() && newItemNoteText.trim()) {
                                              const newNote: CustomerItemNote = { id: `in-${Date.now()}`, item_name: newItemNoteName.trim(), note: newItemNoteText.trim() };
                                              setCustomers(prev => prev.map(c =>
                                                c.id === customer.id
                                                  ? { ...c, item_notes: [...(c.item_notes || []), newNote] }
                                                  : c
                                              ));
                                              setNewItemNoteName('');
                                              setNewItemNoteText('');
                                            }
                                          }}
                                          disabled={!newItemNoteName.trim() || !newItemNoteText.trim()}
                                          className="px-3 py-1 text-xs text-white rounded-lg transition-colors disabled:opacity-30 flex items-center gap-1"
                                          style={{ backgroundColor: frootfulGreen }}
                                        >
                                          <Plus className="w-3 h-3" />
                                          Add Note
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex justify-end gap-2">
                                    <button
                                      onClick={() => setEditingCustomerId(null)}
                                      disabled={isSaving}
                                      className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
                                    >
                                      Cancel
                                    </button>
                                    <button
                                      onClick={() => handleSaveCustomer(customer.id)}
                                      disabled={isSaving || !editCustomerName.trim()}
                                      className="px-3 py-1.5 text-sm text-white rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
                                      style={{ backgroundColor: frootfulGreen }}
                                    >
                                      {isSaving ? (
                                        <>
                                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                          Saving...
                                        </>
                                      ) : (
                                        <>
                                          <Check className="w-3.5 h-3.5" />
                                          Save
                                        </>
                                      )}
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                /* Read-only expanded view */
                                <div className="space-y-2">
                                  <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                                    <div>
                                      <span className="text-xs text-gray-400">Email</span>
                                      <p className={`flex items-center gap-1.5 ${customer.email ? 'text-gray-700' : 'text-gray-300'}`}>
                                        <Mail className="w-3.5 h-3.5 text-gray-400" />
                                        {customer.email || '—'}
                                      </p>
                                    </div>
                                    <div>
                                      <span className="text-xs text-gray-400">Phone</span>
                                      <p className={`flex items-center gap-1.5 ${customer.phone ? 'text-gray-700' : 'text-gray-300'}`}>
                                        <Phone className="w-3.5 h-3.5 text-gray-400" />
                                        {customer.phone || '—'}
                                      </p>
                                    </div>
                                  </div>
                                  <div>
                                    <span className="relative group inline-flex items-center gap-1 text-xs text-gray-400 cursor-help">Notes &#9432;<span className="absolute bottom-full left-0 mb-1 hidden group-hover:block w-64 px-2.5 py-1.5 text-xs text-white bg-gray-800 rounded-lg shadow-lg z-10">General notes about this customer that apply to all orders (e.g. delivery day restrictions, shipping preferences, payment terms).</span></span>
                                    <p className={`text-sm mt-0.5 ${customer.notes ? 'text-gray-700' : 'text-gray-300'}`}>{customer.notes || '—'}</p>
                                  </div>
                                  {/* Item-specific notes (read-only) */}
                                  {customer.item_notes && customer.item_notes.length > 0 && (
                                    <div className="pt-2 border-t border-gray-200 mt-2">
                                      <span className="relative group inline-flex items-center gap-1 text-xs text-gray-400 font-medium uppercase tracking-wider cursor-help">Item Notes &#9432;<span className="absolute bottom-full left-0 mb-1 hidden group-hover:block w-64 px-2.5 py-1.5 text-xs text-white bg-gray-800 rounded-lg shadow-lg z-10 normal-case tracking-normal font-normal">Item-specific notes for this customer (e.g. packaging type, box size, pricing, brand preferences). Used by AI to expand shorthand orders.</span></span>
                                      <div className="mt-1.5 space-y-1">
                                        {customer.item_notes.map(itemNote => (
                                          <div key={itemNote.id} className="flex items-start gap-2 bg-white rounded-lg border border-gray-100 px-3 py-2">
                                            <div className="flex-1 min-w-0">
                                              <p className="text-xs font-medium text-gray-900">{itemNote.item_name}</p>
                                              <p className="text-xs text-gray-500 mt-0.5">{itemNote.note}</p>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                  <div className="pt-1">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setEditingCustomerId(customer.id);
                                        setEditCustomerName(customer.name);
                                        setEditCustomerEmail(customer.email || '');
                                        setEditCustomerPhone(customer.phone || '');
                                        setEditCustomerNotes(customer.notes || '');
                                      }}
                                      className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 hover:bg-white border border-gray-200 rounded-lg transition-colors"
                                    >
                                      Edit
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          )}

          {sidebarTab === 'history' && (
            <div className="bg-white rounded-xl border border-gray-200">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-blue-600" />
                  <h3 className="text-lg font-semibold text-gray-900">Message History</h3>
                </div>
                <div className="flex items-center gap-2">
                  {/* Date filter toggle */}
                  <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
                    <button
                      onClick={() => setHistoryFilter('7d')}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                        historyFilter === '7d'
                          ? 'bg-white text-gray-900 shadow-sm'
                          : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      7 days
                    </button>
                    <button
                      onClick={() => setHistoryFilter('30d')}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                        historyFilter === '30d'
                          ? 'bg-white text-gray-900 shadow-sm'
                          : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      30 days
                    </button>
                  </div>
                  <button
                    onClick={loadHistory}
                    disabled={historyLoading}
                    className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
                    title="Refresh history"
                  >
                    <RefreshCw className={`w-4 h-4 ${historyLoading ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>

              {historyLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                </div>
              ) : intakeHistory.length === 0 ? (
                <div className="p-12 text-center text-gray-500">
                  <Clock className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p className="text-lg font-medium text-gray-900 mb-1">No messages yet</p>
                  <p>Incoming messages will appear here.</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100 max-h-[calc(100vh-200px)] overflow-y-auto">
                  {intakeHistory.map((item) => {
                    const isEmail = item.channel === 'email';
                    const from = item.raw_content.from || 'Unknown sender';
                    const subject = item.raw_content.subject || '';
                    const body = isEmail ? (item.raw_content.body_text || '') : (item.raw_content.body || '');
                    const preview = body.substring(0, 150).trim() + (body.length > 150 ? '...' : '');
                    const date = new Date(item.created_at);
                    const formattedDate = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                    const formattedTime = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
                    const isExpanded = expandedHistoryItems.has(item.id);

                    const toggleExpand = () => {
                      const newExpanded = new Set(expandedHistoryItems);
                      if (isExpanded) {
                        newExpanded.delete(item.id);
                      } else {
                        newExpanded.add(item.id);
                      }
                      setExpandedHistoryItems(newExpanded);
                    };

                    return (
                      <div key={item.id} className="border-b border-gray-100 last:border-b-0">
                        {/* Clickable header */}
                        <button
                          onClick={toggleExpand}
                          className="w-full px-6 py-4 hover:bg-gray-50 text-left"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex items-start gap-3 min-w-0 flex-1">
                              {/* Expand/collapse icon */}
                              <div className="flex-shrink-0 mt-1">
                                {isExpanded ? (
                                  <ChevronDown className="w-4 h-4 text-gray-400" />
                                ) : (
                                  <ChevronRight className="w-4 h-4 text-gray-400" />
                                )}
                              </div>

                              {/* Channel icon */}
                              <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                                isEmail ? 'bg-purple-100' : 'bg-green-100'
                              }`}>
                                {isEmail ? (
                                  <Mail className="w-4 h-4 text-purple-600" />
                                ) : (
                                  <MessageSquare className="w-4 h-4 text-green-600" />
                                )}
                              </div>

                              {/* Content */}
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  {isEmail ? (
                                    <span className="text-sm font-medium text-gray-900 truncate">{from}</span>
                                  ) : (
                                    <span className="text-xs text-gray-400">SMS</span>
                                  )}
                                  <span className="text-xs text-gray-400">{formattedDate} at {formattedTime}</span>
                                </div>
                                {subject && (
                                  <p className="text-sm text-gray-700 font-medium truncate mb-1">{subject}</p>
                                )}
                                {!isExpanded && (
                                  <p className="text-sm text-gray-500 line-clamp-2">{preview}</p>
                                )}

                                {/* Assignment status with tooltips */}
                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                  {item.proposals.length > 0 ? item.proposals.map((proposal) => (
                                    <Tooltip
                                      key={proposal.id}
                                      text={
                                        proposal.status === 'accepted'
                                          ? 'Changes applied to order'
                                          : proposal.status === 'rejected'
                                          ? 'Proposal was rejected'
                                          : 'Pending review'
                                      }
                                      position="bottom"
                                    >
                                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                                        proposal.status === 'accepted'
                                          ? 'bg-green-100 text-green-700'
                                          : proposal.status === 'rejected'
                                          ? 'bg-red-100 text-red-700'
                                          : 'bg-amber-100 text-amber-700'
                                      }`}>
                                        {proposal.status === 'accepted' ? (
                                          <Check className="w-3 h-3" />
                                        ) : proposal.status === 'rejected' ? (
                                          <X className="w-3 h-3" />
                                        ) : (
                                          <Clock className="w-3 h-3" />
                                        )}
                                        {proposal.customer_name}
                                        {proposal.delivery_date && ` (${proposal.delivery_date})`}
                                      </span>
                                    </Tooltip>
                                  )) : (
                                    <Tooltip text="No order proposal was created for this message" position="bottom">
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                                        <AlertCircle className="w-3 h-3" />
                                        Not assigned
                                      </span>
                                    </Tooltip>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        </button>

                        {/* Expanded content */}
                        {isExpanded && (
                          <div className="px-6 pb-4 pl-20 space-y-3">
                            {/* Sender details */}
                            {!isEmail && from && (
                              <div className="text-xs text-gray-500">
                                From: <span className="font-medium text-gray-700">{from}</span>
                              </div>
                            )}

                            {/* Original message */}
                            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                              <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Original Message</h4>
                              <p className="text-sm text-gray-700 whitespace-pre-wrap">{body}</p>
                            </div>

                            {/* Proposals */}
                            {item.proposals.length > 0 ? (
                              <div className="space-y-3">
                                {item.proposals.map((proposal) => {
                                  const statusColor = proposal.status === 'accepted'
                                    ? { bg: 'bg-green-50', border: 'border-green-200', label: 'text-green-600' }
                                    : proposal.status === 'rejected'
                                    ? { bg: 'bg-red-50', border: 'border-red-200', label: 'text-red-600' }
                                    : { bg: 'bg-blue-50', border: 'border-blue-200', label: 'text-blue-600' };
                                  const statusLabel = proposal.status === 'accepted'
                                    ? 'Changes Applied'
                                    : proposal.status === 'rejected'
                                    ? 'Rejected'
                                    : 'Pending Review';
                                  const dateLabel = proposal.delivery_date
                                    ? new Date(proposal.delivery_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
                                    : '';
                                  return (
                                    <div key={proposal.id} className={`${statusColor.bg} rounded-lg p-4 border ${statusColor.border}`}>
                                      <div className="flex items-center justify-between mb-2">
                                        <h4 className={`text-xs font-semibold ${statusColor.label} uppercase`}>
                                          {proposal.type === 'cancel_order'
                                            ? 'Order Cancelled'
                                            : statusLabel}
                                          {proposal.customer_name && ` — ${proposal.customer_name}`}
                                          {dateLabel && ` · ${dateLabel}`}
                                        </h4>
                                        <div className="flex items-center gap-1.5">
                                          {proposal.status === 'accepted' && proposal.tags?.order_frequency && (
                                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                                              proposal.tags.order_frequency === 'recurring'
                                                ? 'bg-purple-100 text-purple-700'
                                                : 'bg-gray-100 text-gray-600'
                                            }`}>
                                              {proposal.tags.order_frequency === 'recurring' ? (
                                                <><Repeat className="w-3 h-3" /> Recurring</>
                                              ) : (
                                                'One-time'
                                              )}
                                            </span>
                                          )}
                                          {proposal.status === 'accepted' && proposal.tags?.order_frequency === 'recurring' && (
                                            <Tooltip
                                              text={proposal.tags.erp_sync_status === 'synced' ? 'Synced to ERP' : 'Pending ERP sync'}
                                              position="bottom"
                                            >
                                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                                                proposal.tags.erp_sync_status === 'synced'
                                                  ? 'bg-green-100 text-green-700'
                                                  : 'bg-amber-100 text-amber-700'
                                              }`}>
                                                {proposal.tags.erp_sync_status === 'synced' ? (
                                                  <><Check className="w-3 h-3" /> ERP</>
                                                ) : (
                                                  <><RefreshCw className="w-3 h-3" /> Syncing</>
                                                )}
                                              </span>
                                            </Tooltip>
                                          )}
                                        </div>
                                      </div>
                                      {proposal.type === 'cancel_order' ? (
                                        <p className="text-sm text-gray-700">
                                          Cancel entire order for {proposal.customer_name}
                                        </p>
                                      ) : (
                                        <div className="space-y-1">
                                          {proposal.lines.map((line) => (
                                            <div key={line.id} className="flex items-center gap-2 text-sm">
                                              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
                                                line.change_type === 'add'
                                                  ? 'bg-green-100 text-green-700'
                                                  : line.change_type === 'remove'
                                                  ? 'bg-red-100 text-red-700'
                                                  : 'bg-amber-100 text-amber-700'
                                              }`}>
                                                {line.change_type === 'add' ? '+' : line.change_type === 'remove' ? '-' : '~'}
                                              </span>
                                              <span className="text-gray-700">{line.item_name}</span>
                                              {line.proposed_values?.quantity && (
                                                <span className="text-gray-500">× {line.proposed_values.quantity}</span>
                                              )}
                                              {line.proposed_values?.variant_code && (
                                                <span className="text-xs bg-gray-200 text-gray-600 px-1 rounded">
                                                  {line.proposed_values.variant_code}
                                                </span>
                                              )}
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <div className="bg-gray-100 rounded-lg p-4 border border-gray-200">
                                <p className="text-sm text-gray-500 italic">No proposal was created for this message</p>
                              </div>
                            )}
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

              {/* Create New Order Form */}
              {creatingNewOrder && (
                <div className="bg-white border border-green-200 rounded-xl p-5 shadow-sm">
                  <h3 className="text-sm font-semibold text-gray-900 mb-4">Create New Order</h3>

                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Customer</label>
                      <CustomerSearchDropdown
                        value={newOrderCustomer}
                        onChange={setNewOrderCustomer}
                        customers={customers}
                        className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-green-500 focus:border-green-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Delivery Date</label>
                      <input
                        type="date"
                        value={newOrderDeliveryDate}
                        onChange={(e) => setNewOrderDeliveryDate(e.target.value)}
                        className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-green-500 focus:border-green-500"
                      />
                    </div>
                  </div>

                  <table className="w-full text-sm mb-2">
                    <thead>
                      <tr className="text-left text-xs text-gray-400 uppercase tracking-wider">
                        <th className="pb-2 font-medium">Item</th>
                        <th className="pb-2 font-medium w-20 text-center">Size</th>
                        <th className="pb-2 font-medium w-16 text-center">Qty</th>
                        <th className="pb-2 w-8"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {newOrderLines.map((line, idx) => (
                        <tr key={idx} className="bg-green-50">
                          <td className="py-1.5">
                            <ItemSearchDropdown
                              value={line.name}
                              onChange={(name) => setNewOrderLines(prev => prev.map((l, i) => i === idx ? { ...l, name } : l))}
                              items={catalogItemNames}
                              className="w-full px-2 py-0.5 text-sm border border-green-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-green-500"
                            />
                          </td>
                          <td className="py-1.5 text-center">
                            <select
                              value={line.size}
                              onChange={(e) => setNewOrderLines(prev => prev.map((l, i) => i === idx ? { ...l, size: e.target.value } : l))}
                              className="px-1 py-0.5 text-sm border border-green-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-green-500"
                            >
                              <option value="">-</option>
                              {DEFAULT_VARIANTS.map(v => (
                                <option key={v.code} value={v.code}>{v.code}</option>
                              ))}
                            </select>
                          </td>
                          <td className="py-1.5 text-center">
                            <input
                              type="number"
                              min="1"
                              value={line.quantity}
                              onChange={(e) => setNewOrderLines(prev => prev.map((l, i) => i === idx ? { ...l, quantity: parseInt(e.target.value) || 1 } : l))}
                              className="w-12 px-1 py-0.5 text-sm text-center border border-green-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-green-500 font-semibold"
                            />
                          </td>
                          <td className="py-1.5 text-center">
                            {newOrderLines.length > 1 && (
                              <button
                                onClick={() => setNewOrderLines(prev => prev.filter((_, i) => i !== idx))}
                                className="text-gray-400 hover:text-red-500"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <button
                    onClick={() => setNewOrderLines(prev => [...prev, { name: '', size: 'S', quantity: 1 }])}
                    className="flex items-center gap-1 text-xs text-green-600 hover:text-green-700 font-medium mb-3"
                  >
                    <Plus className="w-3 h-3" />
                    Add item
                  </button>

                  <div className="flex items-center gap-2 border-t border-gray-100 pt-3">
                    <button
                      onClick={handleCreateNewOrder}
                      disabled={savingNewOrder || !newOrderCustomer.trim() || !newOrderDeliveryDate}
                      className="flex items-center gap-1 px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                    >
                      {savingNewOrder ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Check className="w-3.5 h-3.5" />
                      )}
                      Create Order
                    </button>
                    <button
                      onClick={() => { setCreatingNewOrder(false); setNewOrderCustomer(''); setNewOrderDeliveryDate(''); setNewOrderLines([{ name: '', size: 'S', quantity: 1 }]); }}
                      className="flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                      Cancel
                    </button>
                  </div>
                </div>
              )}

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
                      const aSort = customersForDate[a]?.[0]?.sort_position ?? Number.MAX_SAFE_INTEGER;
                      const bSort = customersForDate[b]?.[0]?.sort_position ?? Number.MAX_SAFE_INTEGER;
                      if (aSort !== bSort) return aSort - bSort;
                      return a.localeCompare(b);
                    });
                    const totalOrders = getTotalOrdersForDate(date);
                    const isExpanded = expandedDates.has(dateKey);
                    const today = isToday(date);

                    return (
                      <div
                        key={dateKey}
                        className={`bg-white rounded-xl shadow-sm border transition-all ${
                          today ? 'border-green-300 ring-2 ring-green-100' : 'border-gray-200'
                        }`}
                      >
                        <button
                          onClick={() => toggleDateExpanded(dateKey)}
                          className={`w-full flex items-center justify-between p-4 rounded-t-xl hover:bg-gray-50 transition-colors ${
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
                                  printPackingSummary(dateKey, allOrdersForDate, customers);
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
                                                text={`${source === 'sms' || source === 'text' ? 'SMS' : source === 'erp' ? 'ERP' : source === 'edi' ? 'EDI' : source === 'dashboard' ? 'Dashboard' : 'Email'} order`}
                                                position="bottom"
                                              >
                                                <div
                                                  className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
                                                    source === 'email' ? 'bg-blue-100 text-blue-600' :
                                                    source === 'sms' || source === 'text' ? 'bg-purple-100 text-purple-600' :
                                                    source === 'edi' ? 'bg-orange-100 text-orange-600' :
                                                    source === 'erp' ? 'bg-teal-100 text-teal-600' :
                                                    source === 'dashboard' ? 'bg-green-100 text-green-600' :
                                                    'bg-gray-100 text-gray-600'
                                                  }`}
                                                >
                                                  {getSourceIcon(source)}
                                                  <span>{source === 'sms' || source === 'text' ? 'SMS' : source === 'erp' ? 'ERP' : source === 'edi' ? 'EDI' : source === 'dashboard' ? 'Dashboard' : 'Email'}</span>
                                                </div>
                                              </Tooltip>
                                            ))}
                                          </div>
                                          {/* Customer-level actions menu */}
                                          <div
                                            className="relative"
                                            ref={customerActionsMenuId === `${dateKey}:${customerName}` ? customerActionsRef : undefined}
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            <div
                                              role="button"
                                              onClick={() => setCustomerActionsMenuId(prev => prev === `${dateKey}:${customerName}` ? null : `${dateKey}:${customerName}`)}
                                              className="p-1 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100 transition-colors"
                                            >
                                              <MoreHorizontal className="w-4 h-4" />
                                            </div>
                                            {customerActionsMenuId === `${dateKey}:${customerName}` && (
                                              <div className="absolute right-0 top-full mt-1 w-36 bg-white border border-gray-200 rounded-lg shadow-lg z-10 py-1">
                                                <div
                                                  role="button"
                                                  onClick={() => {
                                                    setCustomerActionsMenuId(null);
                                                    if (!isCustomerSelected) {
                                                      setSelectedCustomer({ date: dateKey, customer: customerName });
                                                    }
                                                    const firstOrder = customerOrders[0];
                                                    if (firstOrder) {
                                                      setEditingOrderId(firstOrder.id);
                                                      setEditableOrderLines(firstOrder.items.map(item => ({ ...item })));
                                                    }
                                                  }}
                                                  className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer transition-colors"
                                                >
                                                  <Pencil className="w-3.5 h-3.5" />
                                                  Edit
                                                </div>
                                                <div
                                                  role="button"
                                                  onClick={() => {
                                                    setCustomerActionsMenuId(null);
                                                    handleDeleteCustomerOrders(customerOrders, customerName);
                                                  }}
                                                  className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 cursor-pointer transition-colors"
                                                >
                                                  <Trash2 className="w-3.5 h-3.5" />
                                                  Delete{customerOrders.length > 1 ? ` all (${customerOrders.length})` : ''}
                                                </div>
                                              </div>
                                            )}
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
                                            {customerOrders.map(order => {
                                              const isEditing = editingOrderId === order.id;
                                              return (
                                                <div
                                                  key={order.id}
                                                  className={`group/order relative rounded-lg border bg-white p-4 ${isEditing ? 'border-indigo-300 ring-1 ring-indigo-200' : 'border-gray-200'}`}
                                                >
                                                  {isEditing ? (
                                                    /* ---- EDITABLE VIEW ---- */
                                                    <div>
                                                      <table className="w-full text-sm">
                                                        <thead>
                                                          <tr className="text-left text-xs text-gray-400 uppercase tracking-wider">
                                                            <th className="pb-2 font-medium">Item</th>
                                                            <th className="pb-2 font-medium w-20 text-center">Size</th>
                                                            <th className="pb-2 font-medium w-16 text-center">Qty</th>
                                                            <th className="pb-2 w-8"></th>
                                                          </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-gray-100">
                                                          {editableOrderLines.map((item, idx) => (
                                                            item._action === 'remove' ? (
                                                              <tr key={idx} className="bg-red-50">
                                                                <td className="py-1.5 text-red-400 line-through">{item.name}</td>
                                                                <td className="py-1.5 text-center text-red-300 line-through">{item.size}</td>
                                                                <td className="py-1.5 text-center text-red-400 line-through">{item.quantity}</td>
                                                                <td className="py-1.5 text-center">
                                                                  <button
                                                                    onClick={() => setEditableOrderLines(prev => prev.map((l, i) => i === idx ? { ...l, _action: undefined } : l))}
                                                                    className="text-gray-400 hover:text-green-600"
                                                                    title="Undo remove"
                                                                  >
                                                                    <RotateCcw className="w-3.5 h-3.5" />
                                                                  </button>
                                                                </td>
                                                              </tr>
                                                            ) : item._action === 'add' ? (
                                                              <tr key={idx} className="bg-green-50">
                                                                <td className="py-1.5">
                                                                  <ItemSearchDropdown
                                                                    value={item.name}
                                                                    onChange={(name) => setEditableOrderLines(prev => prev.map((l, i) => i === idx ? { ...l, name } : l))}
                                                                    items={catalogItemNames}
                                                                    className="w-full px-2 py-0.5 text-sm border border-green-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-green-500"
                                                                  />
                                                                </td>
                                                                <td className="py-1.5 text-center">
                                                                  <select
                                                                    value={item.size}
                                                                    onChange={(e) => setEditableOrderLines(prev => prev.map((l, i) => i === idx ? { ...l, size: e.target.value } : l))}
                                                                    className="px-1 py-0.5 text-sm border border-green-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-green-500"
                                                                  >
                                                                    <option value="">-</option>
                                                                    {DEFAULT_VARIANTS.map(v => (
                                                                      <option key={v.code} value={v.code}>{v.code}</option>
                                                                    ))}
                                                                  </select>
                                                                </td>
                                                                <td className="py-1.5 text-center">
                                                                  <input
                                                                    type="number"
                                                                    min="1"
                                                                    value={item.quantity}
                                                                    onChange={(e) => setEditableOrderLines(prev => prev.map((l, i) => i === idx ? { ...l, quantity: parseInt(e.target.value) || 1 } : l))}
                                                                    className="w-12 px-1 py-0.5 text-sm text-center border border-green-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-green-500 font-semibold"
                                                                  />
                                                                </td>
                                                                <td className="py-1.5 text-center">
                                                                  <button
                                                                    onClick={() => setEditableOrderLines(prev => prev.filter((_, i) => i !== idx))}
                                                                    className="text-gray-400 hover:text-red-500"
                                                                  >
                                                                    <X className="w-3.5 h-3.5" />
                                                                  </button>
                                                                </td>
                                                              </tr>
                                                            ) : (
                                                              <tr key={idx} className={item._action === 'modify' ? 'bg-blue-50' : ''}>
                                                                <td className="py-1.5 text-gray-700">{item.name}</td>
                                                                <td className="py-1.5 text-center">
                                                                  <select
                                                                    value={item.size}
                                                                    onChange={(e) => setEditableOrderLines(prev => prev.map((l, i) => i === idx ? { ...l, size: e.target.value, _action: 'modify' as const } : l))}
                                                                    className="px-1 py-0.5 text-sm border border-gray-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                                                  >
                                                                    <option value="">-</option>
                                                                    {DEFAULT_VARIANTS.map(v => (
                                                                      <option key={v.code} value={v.code}>{v.code}</option>
                                                                    ))}
                                                                  </select>
                                                                </td>
                                                                <td className="py-1.5 text-center">
                                                                  <input
                                                                    type="number"
                                                                    min="1"
                                                                    value={item.quantity}
                                                                    onChange={(e) => setEditableOrderLines(prev => prev.map((l, i) => i === idx ? { ...l, quantity: parseInt(e.target.value) || 1, _action: 'modify' as const } : l))}
                                                                    className="w-12 px-1 py-0.5 text-sm text-center border border-gray-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 font-semibold"
                                                                  />
                                                                </td>
                                                                <td className="py-1.5 text-center">
                                                                  <button
                                                                    onClick={() => setEditableOrderLines(prev => prev.map((l, i) => i === idx ? { ...l, _action: 'remove' as const } : l))}
                                                                    className="text-gray-400 hover:text-red-500"
                                                                  >
                                                                    <X className="w-3.5 h-3.5" />
                                                                  </button>
                                                                </td>
                                                              </tr>
                                                            )
                                                          ))}
                                                        </tbody>
                                                      </table>

                                                      {/* Add item button */}
                                                      <button
                                                        onClick={() => setEditableOrderLines(prev => [...prev, { name: '', size: 'S', quantity: 1, _action: 'add' as const }])}
                                                        className="mt-2 flex items-center gap-1 text-xs text-green-600 hover:text-green-700 font-medium"
                                                      >
                                                        <Plus className="w-3 h-3" />
                                                        Add item
                                                      </button>

                                                      {/* Save / Cancel / Delete */}
                                                      <div className="mt-3 flex items-center gap-2 border-t border-gray-100 pt-3">
                                                        <button
                                                          onClick={() => handleSaveOrderEdit(order.id)}
                                                          disabled={savingOrderId === order.id}
                                                          className="flex items-center gap-1 px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                                                        >
                                                          {savingOrderId === order.id ? (
                                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                          ) : (
                                                            <Check className="w-3.5 h-3.5" />
                                                          )}
                                                          Save
                                                        </button>
                                                        <button
                                                          onClick={() => { setEditingOrderId(null); setEditableOrderLines([]); }}
                                                          className="flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
                                                        >
                                                          <X className="w-3.5 h-3.5" />
                                                          Cancel
                                                        </button>
                                                        <div className="flex-1" />
                                                        <button
                                                          onClick={() => handleDeleteOrder(order.id)}
                                                          disabled={deletingOrderId === order.id}
                                                          className="flex items-center gap-1 px-3 py-1.5 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors"
                                                        >
                                                          {deletingOrderId === order.id ? (
                                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                          ) : (
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                          )}
                                                          Delete
                                                        </button>
                                                      </div>
                                                    </div>
                                                  ) : (
                                                    /* ---- READ-ONLY VIEW ---- */
                                                    <div>
                                                      {/* Actions menu — click to toggle */}
                                                      <div className="absolute top-2 right-2" ref={orderActionsMenuId === order.id ? orderActionsRef : undefined}>
                                                        <button
                                                          onClick={(e) => { e.stopPropagation(); setOrderActionsMenuId(prev => prev === order.id ? null : order.id); }}
                                                          className="p-1 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100 transition-colors"
                                                        >
                                                          <MoreHorizontal className="w-4 h-4" />
                                                        </button>
                                                        {orderActionsMenuId === order.id && (
                                                          <div className="absolute right-0 top-full mt-1 w-32 bg-white border border-gray-200 rounded-lg shadow-lg z-10 py-1">
                                                            <button
                                                              onClick={() => {
                                                                setOrderActionsMenuId(null);
                                                                setEditingOrderId(order.id);
                                                                setEditableOrderLines(order.items.map(item => ({ ...item })));
                                                              }}
                                                              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                                                            >
                                                              <Pencil className="w-3.5 h-3.5" />
                                                              Edit
                                                            </button>
                                                            <button
                                                              onClick={() => { setOrderActionsMenuId(null); handleDeleteOrder(order.id); }}
                                                              disabled={deletingOrderId === order.id}
                                                              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors"
                                                            >
                                                              {deletingOrderId === order.id ? (
                                                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                              ) : (
                                                                <Trash2 className="w-3.5 h-3.5" />
                                                              )}
                                                              Delete
                                                            </button>
                                                          </div>
                                                        )}
                                                      </div>
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
                                                  )}
                                                </div>
                                              );
                                            })}
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
                                  order.source === 'dashboard' ? 'bg-green-100 text-green-600' :
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
                const aSort = customersForDate[a]?.[0]?.sort_position ?? Number.MAX_SAFE_INTEGER;
                const bSort = customersForDate[b]?.[0]?.sort_position ?? Number.MAX_SAFE_INTEGER;
                if (aSort !== bSort) return aSort - bSort;
                return a.localeCompare(b);
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
                            printPackingSummary(dateKey, allOrdersForDate, customers);
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
                                          text={`${source === 'sms' || source === 'text' ? 'SMS' : source === 'erp' ? 'ERP' : source === 'edi' ? 'EDI' : source === 'dashboard' ? 'Dashboard' : 'Email'} order`}
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
                                            <span>{source === 'sms' || source === 'text' ? 'SMS' : source === 'erp' ? 'ERP' : source === 'edi' ? 'EDI' : source === 'dashboard' ? 'Dashboard' : 'Email'}</span>
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
                          order.source === 'dashboard' ? 'bg-green-100 text-green-600' :
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

export default Dashboard;
