import React, { useEffect, useState, useMemo } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronDown,
  ChevronUp,
  List,
  LayoutGrid,
  Package,
  Mail,
  MessageSquare,
  Loader2,
  Filter,
  Search,
  X,
  Check,
  Bell,
  Sparkles,
  Clock,
  Printer,
  RefreshCw,
  MoreHorizontal
} from 'lucide-react';
import { supabaseClient } from '../supabaseClient';

// ============================================================================
// TYPES
// ============================================================================

interface OrderItem {
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
  item_name: string;
  size: string;
  quantity: number;
  original_quantity?: number;
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
  customer_name: string;
  delivery_date: string;
  message_count: number;
  channel: 'email' | 'sms';
  created_at: string;
  message_preview: string;
  lines: ProposalLine[];
  timeline: TimelineEvent[];
}

interface DashboardV2Props {
  organizationId: string | null;
}

type ViewMode = 'week' | 'list';

// ============================================================================
// MOCK DATA - For UI development only
// ============================================================================

const TODAY = new Date();
TODAY.setHours(0, 0, 0, 0);
const TOMORROW = new Date(TODAY);
TOMORROW.setDate(TOMORROW.getDate() + 1);
const DAY_AFTER = new Date(TODAY);
DAY_AFTER.setDate(DAY_AFTER.getDate() + 2);

// Mock orders with line items visible
const MOCK_STANDING_ORDERS: Order[] = [
  // Capo - has a proposal with changes
  {
    id: 'order-capo-1',
    customer_name: 'Capo',
    status: 'pending',
    source: 'erp',
    delivery_date: TODAY.toISOString().split('T')[0],

    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    items: [
      { name: 'Basil, Genovese', size: 'L', quantity: 4},
    ],
    line_count: 1,
  },
  // Davio's Seaport - no changes
  {
    id: 'standing-davios-1',
    customer_name: "Davio's Seaport",
    status: 'pending',
    source: 'erp',
    delivery_date: TODAY.toISOString().split('T')[0],

    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    items: [
      { name: "Davio's MIX", size: 'L', quantity: 4},
    ],
    line_count: 1,
  },
  // Row 34 - no changes
  {
    id: 'standing-row34-1',
    customer_name: 'Row 34',
    status: 'pending',
    source: 'erp',
    delivery_date: TODAY.toISOString().split('T')[0],

    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    items: [
      { name: 'Lemon Balm', size: 'L', quantity: 1},
      { name: 'Basil, Genovese', size: 'L', quantity: 1},
      { name: 'Radish Mix', size: 'L', quantity: 1},
      { name: 'Mustard, Wasabi', size: 'L', quantity: 1},
    ],
    line_count: 4,
  },
  // Ocean Prime - has a proposal with changes
  {
    id: 'order-ocean-1',
    customer_name: 'Ocean Prime',
    status: 'pending',
    source: 'erp',
    delivery_date: TOMORROW.toISOString().split('T')[0],

    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    items: [
      { name: 'Shiso, Green', size: 'L', quantity: 2},
      { name: 'Radish, Kaiware', size: 'L', quantity: 4},
      { name: 'Pea, Tendril', size: 'L', quantity: 3},
    ],
    line_count: 3,
  },
  // Mamma Maria - no changes
  {
    id: 'standing-mamma-1',
    customer_name: 'Mamma Maria',
    status: 'pending',
    source: 'erp',
    delivery_date: TOMORROW.toISOString().split('T')[0],

    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    items: [
      { name: 'Sorrel, Red Veined', size: 'S', quantity: 3},
      { name: 'Basil, Genovese', size: 'L', quantity: 2},
      { name: 'Radish, Sango', size: 'S', quantity: 1},
      { name: 'Lemon Balm', size: 'S', quantity: 1},
    ],
    line_count: 4,
  },
  // Zuma - no changes
  {
    id: 'standing-zuma-1',
    customer_name: 'Zuma',
    status: 'pending',
    source: 'erp',
    delivery_date: TOMORROW.toISOString().split('T')[0],

    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    items: [
      { name: 'Rainbow MIX', size: 'L', quantity: 3},
      { name: 'Shiso, Red', size: 'L', quantity: 3},
    ],
    line_count: 2,
  },
  // Deuxave - no changes
  {
    id: 'standing-deuxave-1',
    customer_name: 'Deuxave',
    status: 'pending',
    source: 'erp',
    delivery_date: DAY_AFTER.toISOString().split('T')[0],

    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    items: [
      { name: 'Basil, Genovese', size: 'L', quantity: 1},
      { name: 'Lemon Balm', size: 'S', quantity: 1},
      { name: 'Shiso, Red', size: 'S', quantity: 1},
      { name: 'Mustard, Wasabi', size: 'S', quantity: 1},
      { name: 'Kale', size: 'S', quantity: 1},
      { name: 'Radish Mix', size: 'L', quantity: 1},
      { name: 'Sorrel, Red Veined', size: 'S', quantity: 1},
    ],
    line_count: 7,
  },
];

const MOCK_PROPOSALS: Proposal[] = [
  // Change proposal for existing order (Capo - today)
  {
    id: 'prop-1',
    order_id: 'order-capo-1',
    customer_name: 'Capo',
    delivery_date: TODAY.toISOString().split('T')[0],
    message_count: 1,
    channel: 'sms',
    created_at: new Date(Date.now() - 2 * 60 * 1000).toISOString(), // 2 min ago
    message_preview: 'Actually make it 6 basil and add 2 cilantro please',
    lines: [
      { id: 'line-1', change_type: 'modify', item_name: 'Basil, Genovese', size: 'Large', quantity: 6, original_quantity: 4 },
      { id: 'line-2', change_type: 'add', item_name: 'Cilantro', size: 'Large', quantity: 2 },
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
        content: 'Actually make it 6 basil and add 2 cilantro please',
        from: 'Capo',
      },
      {
        id: 'tl-3',
        type: 'event',
        timestamp: new Date(Date.now() - 1 * 60 * 1000).toISOString(),
        eventType: 'ai_analysis',
      },
    ]
  },
  // Multiple messages merged (Ocean Prime - tomorrow)
  {
    id: 'prop-2',
    order_id: 'order-ocean-1',
    customer_name: 'Ocean Prime',
    delivery_date: TOMORROW.toISOString().split('T')[0],
    message_count: 2,
    channel: 'email',
    created_at: new Date(Date.now() - 15 * 60 * 1000).toISOString(), // 15 min ago
    message_preview: 'Also add 1 radish sango',
    lines: [
      { id: 'line-3', change_type: 'add', item_name: 'Shiso, Red', size: 'Small', quantity: 3 },
      { id: 'line-4', change_type: 'add', item_name: 'Radish, Sango', size: 'Large', quantity: 1 },
      { id: 'line-5', change_type: 'remove', item_name: 'Pea, Tendril', size: 'Large', quantity: 2 },
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
        timestamp: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
        channel: 'email',
        content: 'Hi, for tomorrow can you add 3 shiso red small and 1 radish sango? Thanks!',
        subject: 'Re: Tomorrow order',
        from: 'Ocean Prime <orders@oceanprime.com>',
      },
      {
        id: 'tl-6',
        type: 'communication',
        timestamp: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
        channel: 'email',
        content: 'Also add 1 radish sango and remove 2 pea tendril from the order',
        subject: 'Re: Tomorrow order',
        from: 'Ocean Prime <orders@oceanprime.com>',
      },
      {
        id: 'tl-7',
        type: 'event',
        timestamp: new Date(Date.now() - 14 * 60 * 1000).toISOString(),
        eventType: 'ai_analysis',
      },
    ]
  },
  // New order proposal (Fat Baby - tomorrow, no existing order)
  {
    id: 'prop-3',
    order_id: null, // NEW ORDER
    customer_name: 'Fat Baby',
    delivery_date: TOMORROW.toISOString().split('T')[0],
    message_count: 1,
    channel: 'sms',
    created_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // 5 min ago
    message_preview: 'Hey can I get 3 cilantro large and 2 basil for tomorrow?',
    lines: [
      { id: 'line-6', change_type: 'add', item_name: 'Cilantro', size: 'Large', quantity: 3 },
      { id: 'line-7', change_type: 'add', item_name: 'Basil, Genovese', size: 'Large', quantity: 2 },
    ],
    timeline: [
      {
        id: 'tl-8',
        type: 'communication',
        timestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
        channel: 'sms',
        content: 'Hey can I get 3 cilantro large and 2 basil for tomorrow?',
        from: 'Fat Baby',
      },
      {
        id: 'tl-9',
        type: 'event',
        timestamp: new Date(Date.now() - 4 * 60 * 1000).toISOString(),
        eventType: 'ai_analysis',
      },
    ]
  },
  // New order proposal (Ruka - day after)
  {
    id: 'prop-4',
    order_id: null, // NEW ORDER
    customer_name: 'Ruka',
    delivery_date: DAY_AFTER.toISOString().split('T')[0],
    message_count: 1,
    channel: 'email',
    created_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(), // 30 min ago
    message_preview: 'Order for Wednesday: 5 cilantro small, 2 thai basil small',
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
];

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

// Inline side-by-side diff view (embedded in order card, not a popup)
interface InlineOrderDiffProps {
  order: Order;
  proposal: Proposal;
  allOrders: Order[];
  onApply: (id: string, lines: ProposalLine[]) => void;
  onDismiss: (id: string) => void;
  onReclassifyAsNew: (id: string) => void;
  onReanalyze: (id: string) => void;
  onReassignToOrder: (proposalId: string, targetOrderId: string) => void;
}

type DiffRow = {
  left: { name: string; size: string; quantity: number } | null;
  right: { name: string; size: string; quantity: number } | null;
  changeType: 'add' | 'remove' | 'modify' | 'none';
};

const InlineOrderDiff: React.FC<InlineOrderDiffProps> = ({ order, proposal, allOrders, onApply, onDismiss, onReclassifyAsNew, onReanalyze, onReassignToOrder }) => {
  const [reclassifyView, setReclassifyView] = useState<'closed' | 'menu' | 'pick-order'>('closed');
  const [reassignSearch, setReassignSearch] = useState('');

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString();
  };

  // Build diff rows from order items + proposal lines
  const diffRows: DiffRow[] = useMemo(() => {
    const rows: DiffRow[] = [];

    // Process existing order items
    order.items.forEach(item => {
      const modification = proposal.lines.find(
        pl => pl.change_type === 'modify' && pl.item_name === item.name
      );
      const removal = proposal.lines.find(
        pl => pl.change_type === 'remove' && pl.item_name === item.name
      );

      if (removal) {
        rows.push({
          left: { name: item.name, size: item.size, quantity: item.quantity },
          right: null,
          changeType: 'remove',
        });
      } else if (modification) {
        rows.push({
          left: { name: item.name, size: item.size, quantity: item.quantity },
          right: {
            name: modification.item_name,
            size: modification.size || item.size,
            quantity: modification.quantity,
          },
          changeType: 'modify',
        });
      } else {
        rows.push({
          left: { name: item.name, size: item.size, quantity: item.quantity },
          right: { name: item.name, size: item.size, quantity: item.quantity },
          changeType: 'none',
        });
      }
    });

    // Add new items (additions)
    proposal.lines
      .filter(pl => pl.change_type === 'add')
      .forEach(addition => {
        rows.push({
          left: null,
          right: {
            name: addition.item_name,
            size: addition.size,
            quantity: addition.quantity,
          },
          changeType: 'add',
        });
      });

    return rows;
  }, [order.items, proposal.lines]);

  const sortedTimeline = useMemo(() => {
    return [...proposal.timeline].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }, [proposal.timeline]);

  const formatEventType = (eventType?: string) => {
    switch (eventType) {
      case 'order_created': return 'Order created';
      case 'ai_analysis': return 'AI analyzed changes';
      default: return eventType?.replace(/_/g, ' ') || 'Event';
    }
  };

  return (
    <div className="mt-3 border-t border-amber-200 pt-3">
      <div className="flex gap-4">
        {/* Left: Diff view */}
        <div className="flex-1 min-w-0">
          {/* Side-by-side diff */}
          <div className="grid grid-cols-2 gap-4 mb-2">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Current Order</h4>
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Proposed Changes</h4>
          </div>

          <div className="space-y-1.5">
            {diffRows.map((row, idx) => (
              <div key={idx} className="grid grid-cols-2 gap-4">
                {/* Left side - current */}
                <div>
                  {row.left ? (
                    <div
                      className={`p-2.5 rounded-lg border text-sm ${
                        row.changeType === 'remove'
                          ? 'bg-red-50 border-red-200'
                          : row.changeType === 'modify'
                          ? 'bg-blue-50 border-blue-200'
                          : 'bg-gray-50 border-gray-200'
                      }`}
                    >
                      <div className="flex justify-between items-center">
                        <span
                          className={`font-medium ${
                            row.changeType === 'remove' ? 'line-through text-gray-500' : 'text-gray-900'
                          }`}
                        >
                          {row.left.name}
                        </span>
                        {row.changeType === 'remove' && (
                          <span className="text-xs font-semibold text-red-600 bg-red-100 px-1.5 py-0.5 rounded">
                            REMOVED
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {row.left.size} &middot; Qty: {row.left.quantity}
                      </div>
                    </div>
                  ) : (
                    <div className="p-2.5 rounded-lg border border-dashed border-gray-300 bg-gray-50 opacity-40">
                      <div className="text-xs text-gray-400 text-center">&mdash;</div>
                    </div>
                  )}
                </div>

                {/* Right side - proposed */}
                <div>
                  {row.right ? (
                    <div
                      className={`p-2.5 rounded-lg border text-sm ${
                        row.changeType === 'add'
                          ? 'bg-green-50 border-green-200'
                          : row.changeType === 'modify'
                          ? 'bg-blue-50 border-blue-200'
                          : 'bg-gray-50 border-gray-200'
                      }`}
                    >
                      <div className="flex justify-between items-center">
                        <span className="font-medium text-gray-900">{row.right.name}</span>
                        {row.changeType === 'add' && (
                          <span className="text-xs font-semibold text-green-600 bg-green-100 px-1.5 py-0.5 rounded">
                            NEW
                          </span>
                        )}
                        {row.changeType === 'modify' && (
                          <span className="text-xs font-semibold text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded">
                            MODIFIED
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {row.right.size} &middot; Qty: {row.right.quantity}
                      </div>
                    </div>
                  ) : (
                    <div className="p-2.5 rounded-lg border border-dashed border-gray-300 bg-gray-50 opacity-40">
                      <div className="text-xs text-gray-400 text-center">&mdash;</div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={() => onApply(proposal.id, proposal.lines)}
              className="flex items-center gap-1 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors"
            >
              <Check className="w-4 h-4" />
              Apply Changes
            </button>
            <button
              onClick={() => onDismiss(proposal.id)}
              className="flex items-center gap-1 px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors"
            >
              <X className="w-4 h-4" />
              Dismiss
            </button>

            {/* Reclassify menu */}
            <div className="relative ml-auto">
              <button
                onClick={() => setReclassifyView(reclassifyView === 'closed' ? 'menu' : 'closed')}
                className="flex items-center gap-1 px-3 py-2 text-gray-500 text-sm rounded-lg hover:bg-gray-100 transition-colors"
              >
                <MoreHorizontal className="w-4 h-4" />
                Wrong?
              </button>
              {reclassifyView === 'menu' && (
                <div className="absolute right-0 bottom-full mb-1 w-56 bg-white border border-gray-200 rounded-lg shadow-lg z-20 py-1">
                  <button
                    onClick={() => { onReclassifyAsNew(proposal.id); setReclassifyView('closed'); }}
                    className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50"
                  >
                    <div className="font-medium text-gray-900">Convert to new order</div>
                    <div className="text-xs text-gray-500">Wrong customer or order</div>
                  </button>
                  <button
                    onClick={() => { setReclassifyView('pick-order'); setReassignSearch(''); }}
                    className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50"
                  >
                    <div className="font-medium text-gray-900">Reassign to different customer</div>
                    <div className="text-xs text-gray-500">Move changes to another order</div>
                  </button>
                  <button
                    onClick={() => { onReanalyze(proposal.id); setReclassifyView('closed'); }}
                    className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50"
                  >
                    <div className="font-medium text-gray-900">Re-analyze</div>
                    <div className="text-xs text-gray-500">Ask AI to try again</div>
                  </button>
                </div>
              )}
              {reclassifyView === 'pick-order' && (
                <div className="absolute right-0 bottom-full mb-1 w-72 bg-white border border-gray-200 rounded-lg shadow-lg z-20 py-1">
                  <div className="px-3 py-2 border-b border-gray-100">
                    <input
                      type="text"
                      value={reassignSearch}
                      onChange={(e) => setReassignSearch(e.target.value)}
                      placeholder="Search customers..."
                      className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                      autoFocus
                    />
                  </div>
                  <div className="max-h-48 overflow-auto">
                    {allOrders
                      .filter(o => o.id !== order.id)
                      .filter(o => !reassignSearch || o.customer_name.toLowerCase().includes(reassignSearch.toLowerCase()))
                      .map(o => (
                        <button
                          key={o.id}
                          onClick={() => {
                            if (confirm(`Reassign this proposal to ${o.customer_name}'s order?`)) {
                              onReassignToOrder(proposal.id, o.id);
                              setReclassifyView('closed');
                            }
                          }}
                          className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50"
                        >
                          <div className="font-medium text-gray-900">{o.customer_name}</div>
                          <div className="text-xs text-gray-500">
                            {o.items.length} item{o.items.length !== 1 ? 's' : ''}
                            {o.delivery_date && ` · ${new Date(o.delivery_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                          </div>
                        </button>
                      ))}
                  </div>
                  <button
                    onClick={() => setReclassifyView('menu')}
                    className="w-full text-left px-4 py-2 text-xs text-gray-500 hover:bg-gray-50 border-t border-gray-100"
                  >
                    ← Back
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: Timeline */}
        <div className="w-64 flex-shrink-0 bg-gray-50 rounded-lg border border-gray-200 p-3">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4 text-gray-500" />
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Timeline</h4>
          </div>

          <div className="space-y-0 relative">
            {/* Vertical timeline line */}
            <div className="absolute left-[7px] top-2 bottom-2 w-0.5 bg-gray-300"></div>

            {sortedTimeline.map((item) => (
              <div key={item.id} className="relative pl-6 pb-3 last:pb-0">
                {/* Timeline dot */}
                <div className={`absolute left-0 top-1.5 w-[15px] h-[15px] rounded-full border-2 ${
                  item.type === 'communication'
                    ? 'bg-blue-500 border-blue-200'
                    : 'bg-green-500 border-green-200'
                }`}></div>

                <div className="bg-white rounded-md p-2 border border-gray-200 shadow-sm">
                  <div className="text-[10px] text-gray-400 mb-0.5">
                    {formatTime(item.timestamp)}
                  </div>

                  {item.type === 'communication' ? (
                    <>
                      <div className="flex items-center gap-1 mb-1">
                        {item.channel === 'email' ? (
                          <Mail className="w-3 h-3 text-gray-400" />
                        ) : (
                          <MessageSquare className="w-3 h-3 text-gray-400" />
                        )}
                        <span className="text-[10px] font-medium text-gray-500 uppercase">{item.channel}</span>
                      </div>
                      {item.from && (
                        <p className="text-[10px] text-gray-400 mb-0.5">From: {item.from}</p>
                      )}
                      {item.subject && (
                        <p className="text-xs font-medium text-gray-800 mb-0.5">{item.subject}</p>
                      )}
                      <p className="text-xs text-gray-600 line-clamp-3">{item.content}</p>
                    </>
                  ) : (
                    <p className="text-xs font-medium text-gray-700 capitalize">
                      {formatEventType(item.eventType)}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

interface NewOrderProposalCardProps {
  proposal: Proposal;
  allOrders: Order[];
  onCreateOrder: (id: string, lines: ProposalLine[]) => void;
  onDismiss: (id: string) => void;
  onReanalyze: (id: string) => void;
  onReassignToOrder: (proposalId: string, targetOrderId: string) => void;
}

const NewOrderProposalCard: React.FC<NewOrderProposalCardProps> = ({ proposal, allOrders, onCreateOrder, onDismiss, onReanalyze, onReassignToOrder }) => {
  const [showMessage, setShowMessage] = useState(false);
  const [reclassifyView, setReclassifyView] = useState<'closed' | 'menu' | 'pick-order'>('closed');
  const [reassignSearch, setReassignSearch] = useState('');

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl border-2 border-amber-200 p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="px-2 py-1 bg-amber-500 text-white text-xs font-bold rounded-md flex items-center gap-1">
            <Sparkles className="w-3 h-3" />
            NEW ORDER
          </div>
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white font-medium">
            {proposal.customer_name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h5 className="font-semibold text-gray-900">{proposal.customer_name}</h5>
            <p className="text-sm text-gray-500">{formatTime(proposal.created_at)}</p>
          </div>
        </div>
        <div className={`p-2 rounded-lg ${proposal.channel === 'email' ? 'bg-blue-100 text-blue-600' : 'bg-purple-100 text-purple-600'}`}>
          {proposal.channel === 'email' ? <Mail className="w-5 h-5" /> : <MessageSquare className="w-5 h-5" />}
        </div>
      </div>

      {/* Message Toggle */}
      <button
        onClick={() => setShowMessage(!showMessage)}
        className="text-sm text-gray-500 hover:text-gray-700 mb-3"
      >
        {showMessage ? 'Hide message' : 'View message'} ▾
      </button>

      {/* Message Preview */}
      {showMessage && (
        <div className="mb-3 p-3 bg-white/60 rounded-lg text-sm text-gray-700 italic border border-amber-200">
          "{proposal.message_preview}"
        </div>
      )}

      {/* Proposed Items - shown as green "NEW" rows (no left/current side) */}
      <div className="space-y-1.5">
        {proposal.lines.map((line, idx) => (
          <div key={idx} className="p-2.5 rounded-lg border bg-green-50 border-green-200 text-sm">
            <div className="flex justify-between items-center">
              <span className="font-medium text-gray-900">{line.item_name}</span>
              <span className="text-xs font-semibold text-green-600 bg-green-100 px-1.5 py-0.5 rounded">
                NEW
              </span>
            </div>
            <div className="text-xs text-gray-500 mt-0.5">
              {line.size} &middot; Qty: {line.quantity}
            </div>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 mt-4">
        <button
          onClick={() => onCreateOrder(proposal.id, proposal.lines)}
          className="flex items-center gap-1 px-4 py-2 bg-amber-500 text-white text-sm font-medium rounded-lg hover:bg-amber-600 transition-colors"
        >
          <Check className="w-4 h-4" />
          Create Order
        </button>
        <button
          onClick={() => onDismiss(proposal.id)}
          className="flex items-center gap-1 px-4 py-2 bg-white text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-100 transition-colors border border-gray-200"
        >
          <X className="w-4 h-4" />
          Dismiss
        </button>

        {/* Reclassify menu */}
        <div className="relative ml-auto">
          <button
            onClick={() => setReclassifyView(reclassifyView === 'closed' ? 'menu' : 'closed')}
            className="flex items-center gap-1 px-3 py-2 text-gray-500 text-sm hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <MoreHorizontal className="w-4 h-4" />
            Wrong?
          </button>
          {reclassifyView === 'menu' && (
            <div className="absolute right-0 bottom-full mb-1 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20">
              <button
                onClick={() => { setReclassifyView('pick-order'); setReassignSearch(''); }}
                className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 text-gray-700"
              >
                <div className="font-medium">Assign to existing order</div>
                <div className="text-xs text-gray-400">Add to an existing customer's order</div>
              </button>
              <button
                onClick={() => { onReanalyze(proposal.id); setReclassifyView('closed'); }}
                className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 text-gray-700"
              >
                <div className="font-medium">Re-analyze</div>
                <div className="text-xs text-gray-400">Ask AI to try again</div>
              </button>
            </div>
          )}
          {reclassifyView === 'pick-order' && (
            <div className="absolute right-0 bottom-full mb-1 w-72 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20">
              <div className="px-3 py-2 border-b border-gray-100">
                <input
                  type="text"
                  value={reassignSearch}
                  onChange={(e) => setReassignSearch(e.target.value)}
                  placeholder="Search customers..."
                  className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  autoFocus
                />
              </div>
              <div className="max-h-48 overflow-auto">
                {allOrders
                  .filter(o => !reassignSearch || o.customer_name.toLowerCase().includes(reassignSearch.toLowerCase()))
                  .map(o => (
                    <button
                      key={o.id}
                      onClick={() => {
                        if (confirm(`Assign this proposal to ${o.customer_name}'s order?`)) {
                          onReassignToOrder(proposal.id, o.id);
                          setReclassifyView('closed');
                        }
                      }}
                      className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50"
                    >
                      <div className="font-medium text-gray-900">{o.customer_name}</div>
                      <div className="text-xs text-gray-500">
                        {o.items.length} item{o.items.length !== 1 ? 's' : ''}
                        {o.delivery_date && ` · ${new Date(o.delivery_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                      </div>
                    </button>
                  ))}
              </div>
              <button
                onClick={() => setReclassifyView('menu')}
                className="w-full text-left px-4 py-2 text-xs text-gray-500 hover:bg-gray-50 border-t border-gray-100"
              >
                ← Back
              </button>
            </div>
          )}
        </div>
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
  <div class="footer">Generated from Frootful Sales Aggregation</div>
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
// MAIN COMPONENT
// ============================================================================

const DashboardV2: React.FC<DashboardV2Props> = ({ organizationId }) => {
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [orders, setOrders] = useState<Order[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>(MOCK_PROPOSALS);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());
  const [selectedCustomer, setSelectedCustomer] = useState<{ date: string; customer: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Load orders
  useEffect(() => {
    if (organizationId) {
      loadOrders();
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

  const loadOrders = async () => {
    if (!organizationId) return;

    setIsLoading(true);
    try {
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (!session) return;

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
          order_lines!inner(count)
        `)
        .eq('organization_id', organizationId)
        .eq('order_lines.status', 'active')
        .order('delivery_date', { ascending: true });

      if (error) {
        console.error('Error loading orders:', error);
        return;
      }

      const transformedOrders: Order[] = (data || []).map((order: any) => ({
        id: order.id,
        customer_name: order.customer_name || 'Unknown Customer',
        status: order.status || 'pending',
        source: order.source_channel || 'manual',
        delivery_date: order.delivery_date,
        created_at: order.created_at,
        items: [],
        line_count: order.order_lines?.[0]?.count || 0,
      }));

      // Merge with mock standing orders for UI development
      const allOrders = [...transformedOrders, ...MOCK_STANDING_ORDERS];
      setOrders(allOrders);
    } catch (error) {
      console.error('Error loading orders:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Get proposals grouped by date
  const proposalsByDate = useMemo(() => {
    const grouped: Record<string, { changes: Proposal[]; newOrders: Proposal[] }> = {};

    proposals.forEach(proposal => {
      if (!grouped[proposal.delivery_date]) {
        grouped[proposal.delivery_date] = { changes: [], newOrders: [] };
      }
      if (proposal.order_id === null) {
        grouped[proposal.delivery_date].newOrders.push(proposal);
      } else {
        grouped[proposal.delivery_date].changes.push(proposal);
      }
    });

    return grouped;
  }, [proposals]);

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

  // Get pending proposal count for a date
  const getPendingCountForDate = (dateKey: string) => {
    const dateProposals = proposalsByDate[dateKey];
    if (!dateProposals) return 0;
    return dateProposals.changes.length + dateProposals.newOrders.length;
  };

  // Handlers (mock - just remove from state)
  const handleApplyChange = (proposalId: string, lines: ProposalLine[]) => {
    console.log('Applying changes:', proposalId, lines);
    setProposals(prev => prev.filter(p => p.id !== proposalId));
  };

  const handleDismiss = (proposalId: string) => {
    console.log('Dismissing proposal:', proposalId);
    setProposals(prev => prev.filter(p => p.id !== proposalId));
  };

  const handleCreateOrder = (proposalId: string, lines: ProposalLine[]) => {
    console.log('Creating order:', proposalId, lines);
    setProposals(prev => prev.filter(p => p.id !== proposalId));
  };

  const handleReclassifyAsNew = (proposalId: string) => {
    console.log('Reclassifying as new order:', proposalId);
    setProposals(prev => prev.filter(p => p.id !== proposalId));
  };

  const handleReanalyze = (proposalId: string) => {
    console.log('Re-analyzing proposal:', proposalId);
    setProposals(prev => prev.filter(p => p.id !== proposalId));
  };

  const handleReassignToOrder = (proposalId: string, targetOrderId: string) => {
    console.log('Reassigning proposal to order:', proposalId, targetOrderId);
    setProposals(prev => prev.filter(p => p.id !== proposalId));
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'processing':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'analyzed':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'pushed_to_erp':
      case 'exported':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'failed':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'needs_review':
        return 'bg-orange-100 text-orange-800 border-orange-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
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
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    }
    if (date.toDateString() === tomorrow.toDateString()) {
      return 'Tomorrow';
    }
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric'
    });
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Upcoming Orders</h2>
          <p className="text-gray-600">Today and the next 7 days</p>
        </div>

        <div className="flex items-center space-x-3">
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

      {viewMode === 'week' ? (
        <>
          {/* Days List */}
          <div className="space-y-4">
            {displayDates.map(date => {
              const dateKey = date.toISOString().split('T')[0];
              const customersForDate = getOrdersForDate(date);
              const customerNames = Object.keys(customersForDate);
              const totalOrders = getTotalOrdersForDate(date);
              const isExpanded = expandedDates.has(dateKey);
              const today = isToday(date);
              const pendingCount = getPendingCountForDate(dateKey);
              const newOrderProposals = getNewOrderProposalsForDate(dateKey);

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
                        <span className="text-lg font-bold">{date.getDate()}</span>
                      </div>
                      <div className="text-left">
                        <h4 className={`text-lg font-semibold ${today ? 'text-green-700' : 'text-gray-900'}`}>
                          {formatDateHeader(date)}
                        </h4>
                        <p className="text-sm text-gray-500">
                          {totalOrders > 0 || newOrderProposals.length > 0
                            ? `${customerNames.length + newOrderProposals.length} customer${(customerNames.length + newOrderProposals.length) !== 1 ? 's' : ''} · ${totalOrders + newOrderProposals.length} order${(totalOrders + newOrderProposals.length) !== 1 ? 's' : ''}`
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
                      {pendingCount > 0 && (
                        <span className="flex items-center gap-1 px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-sm font-medium">
                          <Bell className="w-4 h-4" />
                          {pendingCount} pending
                        </span>
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
                      {/* New Order Proposals */}
                      {newOrderProposals.length > 0 && (
                        <div className="p-4 space-y-4">
                          {newOrderProposals.map(proposal => (
                            <NewOrderProposalCard
                              key={proposal.id}
                              proposal={proposal}
                              allOrders={orders}
                              onCreateOrder={handleCreateOrder}
                              onDismiss={handleDismiss}
                              onReanalyze={handleReanalyze}
                              onReassignToOrder={handleReassignToOrder}
                            />
                          ))}
                        </div>
                      )}

                      {/* Existing Customers */}
                      {customerNames.length > 0 && (
                        <div className="divide-y divide-gray-100">
                          {customerNames.map(customerName => {
                            const customerOrders = customersForDate[customerName];
                            const isCustomerSelected = selectedCustomer?.date === dateKey && selectedCustomer?.customer === customerName;
                            const customerProposals = proposals.filter(p =>
                              p.order_id !== null &&
                              p.customer_name === customerName &&
                              p.delivery_date === dateKey
                            );
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
                                    {customerProposals.length > 0 && (
                                      <span className="flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-medium">
                                        <Bell className="w-3 h-3" />
                                        {customerProposals.length} pending change{customerProposals.length > 1 ? 's' : ''}
                                      </span>
                                    )}
                                    {/* Show status badges */}
                                    <div className="flex items-center space-x-1">
                                      {[...new Set(customerOrders.map(o => o.status))].slice(0, 2).map(status => (
                                        <span
                                          key={status}
                                          className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(status)}`}
                                        >
                                          {status.replace(/_/g, ' ')}
                                        </span>
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
                                      {customerOrders.map(order => {
                                        const orderProposal = customerProposals.find(p =>
                                          p.order_id === order.id ||
                                          (p.customer_name === customerName && p.delivery_date === dateKey)
                                        );

                                        return (
                                          <div
                                            key={order.id}
                                            className="rounded-lg border bg-white border-gray-200 p-4"
                                          >
                                            {/* Order line items table */}
                                            {order.items.length > 0 && (
                                              <table className="w-full text-sm">
                                                <thead>
                                                  <tr className="text-left text-xs text-gray-400 uppercase tracking-wider">
                                                    <th className="pb-2 font-medium">Item</th>
                                                    <th className="pb-2 font-medium w-16 text-center">Size</th>
                                                    <th className="pb-2 font-medium w-12 text-center">Qty</th>
                                                  </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-50">
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

                                            {/* Inline side-by-side diff */}
                                            {orderProposal && (
                                              <InlineOrderDiff
                                                order={order}
                                                proposal={orderProposal}
                                                allOrders={orders}
                                                onApply={handleApplyChange}
                                                onDismiss={handleDismiss}
                                                onReclassifyAsNew={handleReclassifyAsNew}
                                                onReanalyze={handleReanalyze}
                                                onReassignToOrder={handleReassignToOrder}
                                              />
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
                      )}

                      {/* Empty State */}
                      {customerNames.length === 0 && newOrderProposals.length === 0 && (
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
                            <span>·</span>
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
                        <span className={`px-3 py-1.5 rounded-full text-xs font-medium border ${getStatusColor(order.status)}`}>
                          {order.status.replace(/_/g, ' ')}
                        </span>
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
  );
};

export default DashboardV2;
