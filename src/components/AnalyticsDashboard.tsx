import React, { useState, useEffect, useCallback } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  Legend,
  LineChart,
  Line,
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  Inbox,
  GitPullRequestArrow,
  Package,
  Mail,
  MessageSquare,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Bot,
  Zap,
  Loader2,
} from 'lucide-react';
import { supabaseClient } from '../supabaseClient';
import type { SupabaseClient } from '@supabase/supabase-js';

// ─── Types ──────────────────────────────────────────────────────────────────
type TimeRange = '7d' | '30d' | '90d';

interface SummaryData {
  intakeEvents: number;
  intakeChange: number;
  proposals: number;
  proposalChange: number;
  orders: number;
  orderChange: number;
  avgProcessingMs: number;
  processingChange: number;
}

interface TimelinePoint {
  date: string;
  intake: number;
  orders: number;
  proposals: number;
}

interface StatusItem {
  name: string;
  value: number;
  color: string;
}

interface OrderStatusItem {
  status: string;
  count: number;
  color: string;
}

interface CustomerOrderCount {
  name: string;
  orders: number;
}

interface IntakeEvent {
  id: string;
  channel: string;
  created_at: string;
  raw_content: { from?: string; subject?: string } | null;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hr ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

const ORDER_STATUS_COLORS: Record<string, string> = {
  pending_review: '#F59E0B',
  ready: '#3B82F6',
  pushed_to_erp: '#8B5CF6',
  completed: '#10B981',
  cancelled: '#EF4444',
};

const ORDER_STATUS_LABELS: Record<string, string> = {
  pending_review: 'Pending Review',
  ready: 'Ready',
  pushed_to_erp: 'Pushed to ERP',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

// ─── Stat Card ──────────────────────────────────────────────────────────────
interface StatCardProps {
  title: string;
  value: string;
  change: number | null;
  changeLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  iconBgColor: string;
  iconColor: string;
}

const StatCard: React.FC<StatCardProps> = ({ title, value, change, changeLabel, icon: Icon, iconBgColor, iconColor }) => {
  const isPositive = change !== null && change >= 0;
  const isGoodDirection = title.includes('Processing') ? !isPositive : isPositive;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
          {change !== null && (
            <div className="flex items-center mt-2">
              {isPositive ? (
                <TrendingUp className={`w-4 h-4 mr-1 ${isGoodDirection ? 'text-green-500' : 'text-red-500'}`} />
              ) : (
                <TrendingDown className={`w-4 h-4 mr-1 ${isGoodDirection ? 'text-green-500' : 'text-red-500'}`} />
              )}
              <span className={`text-sm font-medium ${isGoodDirection ? 'text-green-600' : 'text-red-600'}`}>
                {isPositive ? '+' : ''}{change}%
              </span>
              <span className="text-sm text-gray-500 ml-1">{changeLabel}</span>
            </div>
          )}
        </div>
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${iconBgColor}`}>
          <Icon className={`w-6 h-6 ${iconColor}`} />
        </div>
      </div>
    </div>
  );
};

// ─── Tooltip styles ─────────────────────────────────────────────────────────
const tooltipStyle = { backgroundColor: '#fff', border: '1px solid #E5E7EB', borderRadius: '8px', fontSize: '13px' };

// ─── Data Fetching ──────────────────────────────────────────────────────────

const ORG_OPTIONS = [
  { id: '', label: 'All Organizations' },
  { id: 'e047b512-0012-4287-bb74-dc6d4f7e673f', label: 'Boston Microgreens' },
  { id: '81cf0716-45ee-4fe8-895f-d9af962f5fab', label: 'La Gaitana Farms' },
];

// Helper to conditionally apply org filter to a query builder
function withOrg<T extends { eq: (col: string, val: string) => T }>(query: T, orgId: string): T {
  return orgId ? query.eq('organization_id', orgId) : query;
}

async function fetchMetrics(timeRange: TimeRange, orgId: string = '') {
  const sb = supabaseClient as SupabaseClient;
  const days = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90;
  const prevDays = days * 2; // previous period for comparison
  const cutoff = daysAgo(days);
  const prevCutoff = daysAgo(prevDays);

  // Parallel queries
  const [
    intakeRes,
    intakePrevRes,
    proposalRes,
    proposalPrevRes,
    ordersRes,
    ordersPrevRes,
    aiLogsRes,
    aiLogsPrevRes,
    proposalStatusRes,
    proposalTypeRes,
    orderStatusRes,
    intakeChannelRes,
    recentIntakeRes,
    customerCountRes,
    itemCountRes,
    variantCountRes,
    firstTryRes,
  ] = await Promise.all([
    // Current period counts
    withOrg(sb.from('intake_events').select('id', { count: 'exact', head: true }).gte('created_at', cutoff), orgId),
    withOrg(sb.from('intake_events').select('id', { count: 'exact', head: true }).gte('created_at', prevCutoff).lt('created_at', cutoff), orgId),
    withOrg(sb.from('order_change_proposals').select('id', { count: 'exact', head: true }).gte('created_at', cutoff), orgId),
    withOrg(sb.from('order_change_proposals').select('id', { count: 'exact', head: true }).gte('created_at', prevCutoff).lt('created_at', cutoff), orgId),
    withOrg(sb.from('orders').select('id', { count: 'exact', head: true }).gte('created_at', cutoff), orgId),
    withOrg(sb.from('orders').select('id', { count: 'exact', head: true }).gte('created_at', prevCutoff).lt('created_at', cutoff), orgId),
    // ai_analysis_logs has no organization_id — not filtered
    sb.from('ai_analysis_logs').select('processing_time_ms').gte('created_at', cutoff).not('processing_time_ms', 'is', null),
    sb.from('ai_analysis_logs').select('processing_time_ms').gte('created_at', prevCutoff).lt('created_at', cutoff).not('processing_time_ms', 'is', null),
    // Breakdowns (all time for status/type, or current period)
    withOrg(sb.from('order_change_proposals').select('status').gte('created_at', cutoff), orgId),
    withOrg(sb.from('order_change_proposals').select('type').gte('created_at', cutoff), orgId),
    withOrg(sb.from('orders').select('status'), orgId),
    withOrg(sb.from('intake_events').select('channel').gte('created_at', cutoff), orgId),
    // Recent intake events
    withOrg(sb.from('intake_events').select('id, channel, created_at, raw_content').order('created_at', { ascending: false }).limit(8), orgId),
    // Catalog counts
    withOrg(sb.from('customers').select('id', { count: 'exact', head: true }).eq('active', true), orgId),
    withOrg(sb.from('items').select('id', { count: 'exact', head: true }).eq('active', true), orgId),
    sb.from('item_variants').select('id', { count: 'exact', head: true }),
    // First-try acceptance: proposals with their intake_event_id, ordered by created_at
    withOrg(sb.from('order_change_proposals').select('intake_event_id, status, created_at, metadata, tags').not('intake_event_id', 'is', null).order('created_at'), orgId),
  ]);

  // ── Summary KPIs ──
  const intakeCurrent = intakeRes.count || 0;
  const intakePrev = intakePrevRes.count || 0;
  const proposalCurrent = proposalRes.count || 0;
  const proposalPrev = proposalPrevRes.count || 0;
  const ordersCurrent = ordersRes.count || 0;
  const ordersPrev = ordersPrevRes.count || 0;

  const aiLogs = (aiLogsRes.data || []) as { processing_time_ms: number }[];
  const aiLogsPrev = (aiLogsPrevRes.data || []) as { processing_time_ms: number }[];
  const avgMs = aiLogs.length > 0 ? aiLogs.reduce((sum, r) => sum + (r.processing_time_ms || 0), 0) / aiLogs.length : 0;
  const avgMsPrev = aiLogsPrev.length > 0 ? aiLogsPrev.reduce((sum, r) => sum + (r.processing_time_ms || 0), 0) / aiLogsPrev.length : 0;

  const pctChange = (curr: number, prev: number) => prev === 0 ? (curr > 0 ? 100 : 0) : Math.round(((curr - prev) / prev) * 100);

  const summary: SummaryData = {
    intakeEvents: intakeCurrent,
    intakeChange: pctChange(intakeCurrent, intakePrev),
    proposals: proposalCurrent,
    proposalChange: pctChange(proposalCurrent, proposalPrev),
    orders: ordersCurrent,
    orderChange: pctChange(ordersCurrent, ordersPrev),
    avgProcessingMs: Math.round(avgMs),
    processingChange: pctChange(avgMs, avgMsPrev),
  };

  // ── Proposal status breakdown ──
  const statusCounts: Record<string, number> = {};
  for (const row of (proposalStatusRes.data || []) as { status: string }[]) {
    statusCounts[row.status] = (statusCounts[row.status] || 0) + 1;
  }
  const proposalStatusData: StatusItem[] = [
    { name: 'Accepted', value: statusCounts['accepted'] || 0, color: '#10B981' },
    { name: 'Rejected', value: statusCounts['rejected'] || 0, color: '#EF4444' },
    { name: 'Pending', value: statusCounts['pending'] || 0, color: '#F59E0B' },
    { name: 'Failed', value: statusCounts['failed'] || 0, color: '#6B7280' },
  ].filter(s => s.value > 0);

  // ── Proposal type breakdown ──
  const typeCounts: Record<string, number> = {};
  for (const row of (proposalTypeRes.data || []) as { type: string | null }[]) {
    const t = row.type || 'unknown';
    typeCounts[t] = (typeCounts[t] || 0) + 1;
  }
  const proposalTypeData: StatusItem[] = [
    { name: 'New Order', value: typeCounts['new_order'] || 0, color: '#3B82F6' },
    { name: 'Change Order', value: typeCounts['change_order'] || 0, color: '#F59E0B' },
    { name: 'Cancel Order', value: typeCounts['cancel_order'] || 0, color: '#EF4444' },
  ].filter(s => s.value > 0);

  // ── Order status breakdown (all time) ──
  const orderCounts: Record<string, number> = {};
  for (const row of (orderStatusRes.data || []) as { status: string }[]) {
    orderCounts[row.status] = (orderCounts[row.status] || 0) + 1;
  }
  const orderStatusData: OrderStatusItem[] = Object.entries(orderCounts)
    .map(([status, count]) => ({
      status: ORDER_STATUS_LABELS[status] || status,
      count,
      color: ORDER_STATUS_COLORS[status] || '#6B7280',
    }))
    .sort((a, b) => b.count - a.count);

  // ── Intake channel breakdown ──
  const channelCounts: Record<string, number> = {};
  for (const row of (intakeChannelRes.data || []) as { channel: string }[]) {
    channelCounts[row.channel] = (channelCounts[row.channel] || 0) + 1;
  }
  const intakeChannelData: StatusItem[] = [
    { name: 'Email', value: channelCounts['email'] || 0, color: '#3B82F6' },
    { name: 'SMS', value: channelCounts['sms'] || 0, color: '#10B981' },
    { name: 'WhatsApp', value: channelCounts['whatsapp'] || 0, color: '#8B5CF6' },
  ].filter(s => s.value > 0);

  // ── Recent intake events ──
  const recentIntake = ((recentIntakeRes.data || []) as IntakeEvent[]).map(evt => ({
    id: evt.id,
    channel: evt.channel,
    time: formatDate(evt.created_at),
    from: evt.raw_content?.from || evt.raw_content?.subject || 'Unknown',
  }));

  // ── Timeline data (group by day for 7d, week for 30d, month for 90d) ──
  const [timelineIntakeRes, timelineProposalRes, timelineOrdersRes] = await Promise.all([
    withOrg(sb.from('intake_events').select('created_at').gte('created_at', cutoff).order('created_at'), orgId),
    withOrg(sb.from('order_change_proposals').select('created_at').gte('created_at', cutoff).order('created_at'), orgId),
    withOrg(sb.from('orders').select('created_at').gte('created_at', cutoff).order('created_at'), orgId),
  ]);

  const timeline = buildTimeline(
    timeRange,
    days,
    (timelineIntakeRes.data || []) as { created_at: string }[],
    (timelineProposalRes.data || []) as { created_at: string }[],
    (timelineOrdersRes.data || []) as { created_at: string }[],
  );

  // ── Top customers by orders (30d) ──
  const { data: topCustomerRows } = await sb.rpc('get_top_customers_by_orders', { days_back: 30 }).limit(7);
  // Fallback if RPC doesn't exist — use a simple query
  let topCustomers: CustomerOrderCount[] = [];
  if (topCustomerRows && Array.isArray(topCustomerRows)) {
    topCustomers = topCustomerRows.map((r: Record<string, unknown>) => ({
      name: (r.customer_name || r.name || 'Unknown') as string,
      orders: (r.order_count || r.orders || 0) as number,
    }));
  }
  if (topCustomers.length === 0) {
    // Fallback: query orders joined with customers
    const fallbackQuery = sb
      .from('orders')
      .select('customer_id, customers(name)')
      .gte('created_at', daysAgo(30));
    const { data: orderCustomers } = await (orgId ? fallbackQuery.eq('organization_id', orgId) : fallbackQuery);
    if (orderCustomers) {
      const counts: Record<string, { name: string; count: number }> = {};
      for (const row of orderCustomers as unknown as { customer_id: string; customers: { name: string } | null }[]) {
        const name = row.customers?.name || 'Unknown';
        if (!counts[row.customer_id]) counts[row.customer_id] = { name, count: 0 };
        counts[row.customer_id].count++;
      }
      topCustomers = Object.values(counts)
        .sort((a, b) => b.count - a.count)
        .slice(0, 7)
        .map(c => ({ name: c.name, orders: c.count }));
    }
  }

  // ── Catalog stats ──
  const catalogStats = {
    totalCustomers: customerCountRes.count || 0,
    totalItems: itemCountRes.count || 0,
    totalVariants: variantCountRes.count || 0,
  };

  // ── Acceptance rate ──
  const totalResolved = (statusCounts['accepted'] || 0) + (statusCounts['rejected'] || 0);
  const acceptanceRate = totalResolved > 0 ? Math.round(((statusCounts['accepted'] || 0) / totalResolved) * 100) : 0;

  // ── First-try acceptance rate ──
  // Group proposals by intake_event_id, check if the first proposal was accepted without edits
  // For orchestrator (Gaitana) proposals: use metadata.edited flag
  // For standard proposals: use whether the first proposal by created_at was accepted
  const firstTryRows = (firstTryRes.data || []) as { intake_event_id: string; status: string; created_at: string; metadata: Record<string, unknown> | null; tags: Record<string, unknown> | null }[];
  const firstByIntake: Record<string, { status: string; edited: boolean }> = {};
  for (const row of firstTryRows) {
    if (!firstByIntake[row.intake_event_id]) {
      const isOrchestrator = row.tags?.source === 'orchestrator';
      const wasEdited = isOrchestrator ? !!(row.metadata?.edited) : false;
      firstByIntake[row.intake_event_id] = { status: row.status, edited: wasEdited };
    }
  }
  const intakeIds = Object.keys(firstByIntake);
  const firstTryTotal = intakeIds.length;
  const firstTryAccepted = intakeIds.filter(id => {
    const entry = firstByIntake[id];
    return entry.status === 'accepted' && !entry.edited;
  }).length;
  const firstTryRate = firstTryTotal > 0 ? Math.round((firstTryAccepted / firstTryTotal) * 100) : 0;

  return {
    summary,
    timeline,
    proposalStatusData,
    proposalTypeData,
    orderStatusData,
    intakeChannelData,
    recentIntake,
    topCustomers,
    catalogStats,
    acceptanceRate,
    acceptedCount: statusCounts['accepted'] || 0,
    totalResolvedCount: totalResolved,
    aiLogCount: aiLogs.length,
    firstTryRate,
    firstTryAccepted,
    firstTryTotal,
  };
}

function buildTimeline(
  timeRange: TimeRange,
  _days: number,
  intake: { created_at: string }[],
  proposals: { created_at: string }[],
  orders: { created_at: string }[],
): TimelinePoint[] {
  if (timeRange === '7d') {
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const buckets: Record<string, { intake: number; proposals: number; orders: number }> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = dayNames[d.getDay()];
      buckets[key] = { intake: 0, proposals: 0, orders: 0 };
    }
    for (const r of intake) { const k = dayNames[new Date(r.created_at).getDay()]; if (buckets[k]) buckets[k].intake++; }
    for (const r of proposals) { const k = dayNames[new Date(r.created_at).getDay()]; if (buckets[k]) buckets[k].proposals++; }
    for (const r of orders) { const k = dayNames[new Date(r.created_at).getDay()]; if (buckets[k]) buckets[k].orders++; }
    return Object.entries(buckets).map(([date, v]) => ({ date, ...v }));
  }

  if (timeRange === '30d') {
    const buckets: { date: string; intake: number; proposals: number; orders: number }[] = [];
    for (let w = 3; w >= 0; w--) {
      const start = new Date(); start.setDate(start.getDate() - (w + 1) * 7);
      const end = new Date(); end.setDate(end.getDate() - w * 7);
      const label = `Week ${4 - w}`;
      const inRange = (d: string) => { const t = new Date(d); return t >= start && t < end; };
      buckets.push({
        date: label,
        intake: intake.filter(r => inRange(r.created_at)).length,
        proposals: proposals.filter(r => inRange(r.created_at)).length,
        orders: orders.filter(r => inRange(r.created_at)).length,
      });
    }
    return buckets;
  }

  // 90d — group by month
  const buckets: Record<string, { intake: number; proposals: number; orders: number }> = {};
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  for (const r of intake) { const k = monthNames[new Date(r.created_at).getMonth()]; buckets[k] = buckets[k] || { intake: 0, proposals: 0, orders: 0 }; buckets[k].intake++; }
  for (const r of proposals) { const k = monthNames[new Date(r.created_at).getMonth()]; buckets[k] = buckets[k] || { intake: 0, proposals: 0, orders: 0 }; buckets[k].proposals++; }
  for (const r of orders) { const k = monthNames[new Date(r.created_at).getMonth()]; buckets[k] = buckets[k] || { intake: 0, proposals: 0, orders: 0 }; buckets[k].orders++; }
  return Object.entries(buckets).map(([date, v]) => ({ date, ...v }));
}

// ─── Main Component ─────────────────────────────────────────────────────────
const AnalyticsDashboard: React.FC = () => {
  const [timeRange, setTimeRange] = useState<TimeRange>('30d');
  const [orgId, setOrgId] = useState('');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchMetrics>> | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchMetrics(timeRange, orgId);
      setData(result);
    } catch (err) {
      console.error('Failed to load metrics:', err);
    } finally {
      setLoading(false);
    }
  }, [timeRange, orgId]);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  const { summary, timeline, proposalStatusData, proposalTypeData, orderStatusData, intakeChannelData, recentIntake, topCustomers, acceptanceRate, acceptedCount, totalResolvedCount, aiLogCount, firstTryRate, firstTryAccepted, firstTryTotal } = data;
  const rangeLabel = timeRange === '7d' ? 'vs prev 7d' : timeRange === '30d' ? 'vs prev 30d' : 'vs prev 90d';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Business Metrics</h2>
          <p className="text-gray-500 text-sm">Live pipeline and processing overview</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={orgId}
            onChange={(e) => setOrgId(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {ORG_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>{opt.label}</option>
            ))}
          </select>
          <div className="flex bg-gray-100 rounded-lg p-1">
            {(['7d', '30d', '90d'] as TimeRange[]).map((range) => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  timeRange === range ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {range === '7d' ? '7 Days' : range === '30d' ? '30 Days' : '90 Days'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          title="Intake Events"
          value={summary.intakeEvents.toLocaleString()}
          change={summary.intakeChange}
          changeLabel={rangeLabel}
          icon={Inbox}
          iconBgColor="bg-indigo-100"
          iconColor="text-indigo-600"
        />
        <StatCard
          title="Proposals Created"
          value={summary.proposals.toLocaleString()}
          change={summary.proposalChange}
          changeLabel={rangeLabel}
          icon={GitPullRequestArrow}
          iconBgColor="bg-purple-100"
          iconColor="text-purple-600"
        />
        <StatCard
          title="Orders Created"
          value={summary.orders.toLocaleString()}
          change={summary.orderChange}
          changeLabel={rangeLabel}
          icon={Package}
          iconBgColor="bg-blue-100"
          iconColor="text-blue-600"
        />
      </div>

      {/* Acceptance Rates */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="w-5 h-5 text-blue-500" />
            <h3 className="text-base font-semibold text-gray-900">First-Try Acceptance</h3>
          </div>
          <div className="flex items-end gap-2">
            <span className="text-4xl font-bold text-gray-900">{firstTryRate}%</span>
            <span className="text-sm text-gray-500 mb-1">{firstTryAccepted} of {firstTryTotal} accepted on first try</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-3 mt-3">
            <div className="h-3 rounded-full bg-blue-500" style={{ width: `${firstTryRate}%` }} />
          </div>
          <p className="text-xs text-gray-400 mt-2">% of intake events where the first AI proposal was accepted without edits</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 className="w-5 h-5 text-green-500" />
            <h3 className="text-base font-semibold text-gray-900">Proposal Acceptance Rate</h3>
          </div>
          <div className="flex items-end gap-2">
            <span className="text-4xl font-bold text-gray-900">{acceptanceRate}%</span>
            <span className="text-sm text-gray-500 mb-1">{acceptedCount} of {totalResolvedCount} accepted</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-3 mt-3">
            <div className="h-3 rounded-full bg-green-500" style={{ width: `${acceptanceRate}%` }} />
          </div>
        </div>
      </div>

      {/* Row 1: Timeline + Proposal Status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-base font-semibold text-gray-900 mb-4">Activity Over Time</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={timeline}>
                <defs>
                  <linearGradient id="gradIntake" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366F1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6366F1" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradOrders" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#53AD6D" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#53AD6D" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradProposals" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="date" stroke="#6B7280" fontSize={12} />
                <YAxis stroke="#6B7280" fontSize={12} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend />
                <Area type="monotone" dataKey="orders" name="Orders" stroke="#53AD6D" strokeWidth={2} fillOpacity={1} fill="url(#gradOrders)" />
                <Area type="monotone" dataKey="proposals" name="Proposals" stroke="#8B5CF6" strokeWidth={2} fillOpacity={1} fill="url(#gradProposals)" />
                <Area type="monotone" dataKey="intake" name="Intake Events" stroke="#6366F1" strokeWidth={2} fillOpacity={1} fill="url(#gradIntake)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-base font-semibold text-gray-900 mb-4">Proposal Outcomes</h3>
          {proposalStatusData.length > 0 ? (
            <>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={proposalStatusData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value">
                      {proposalStatusData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} formatter={(value) => [value, 'Proposals']} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2 mt-2">
                {proposalStatusData.map((item) => {
                  const total = proposalStatusData.reduce((a, b) => a + b.value, 0);
                  return (
                    <div key={item.name} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                        <span className="text-sm text-gray-600">{item.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-gray-900">{item.value}</span>
                        <span className="text-xs text-gray-400">({Math.round((item.value / total) * 100)}%)</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <p className="text-sm text-gray-400 py-8 text-center">No proposals in this period</p>
          )}
        </div>
      </div>

      {/* Row 2: Order Status + Proposal Types */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-base font-semibold text-gray-900 mb-4">Orders by Status</h3>
          <div className="space-y-3">
            {orderStatusData.map((item) => {
              const total = orderStatusData.reduce((a, b) => a + b.count, 0);
              const pct = total > 0 ? Math.round((item.count / total) * 100) : 0;
              return (
                <div key={item.status}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-gray-700">{item.status}</span>
                    <span className="text-sm font-semibold text-gray-900">{item.count} <span className="text-gray-400 font-normal">({pct}%)</span></span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2.5">
                    <div className="h-2.5 rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: item.color }} />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between">
            <span className="text-sm text-gray-500">Total Orders</span>
            <span className="text-lg font-bold text-gray-900">{orderStatusData.reduce((a, b) => a + b.count, 0).toLocaleString()}</span>
          </div>
        </div>

        <div className="grid grid-rows-2 gap-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <h3 className="text-base font-semibold text-gray-900 mb-3">Intake by Channel</h3>
            <div className="flex items-center gap-6">
              {intakeChannelData.map((item) => {
                const total = intakeChannelData.reduce((a, b) => a + b.value, 0);
                const pct = total > 0 ? Math.round((item.value / total) * 100) : 0;
                return (
                  <div key={item.name} className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      {item.name === 'Email' ? <Mail className="w-4 h-4 text-blue-500" /> :
                       item.name === 'SMS' ? <MessageSquare className="w-4 h-4 text-green-500" /> :
                       <MessageSquare className="w-4 h-4 text-purple-500" />}
                      <span className="text-sm text-gray-600">{item.name}</span>
                    </div>
                    <p className="text-xl font-bold text-gray-900">{item.value}</p>
                    <div className="w-full bg-gray-100 rounded-full h-1.5 mt-1">
                      <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, backgroundColor: item.color }} />
                    </div>
                    <p className="text-xs text-gray-400 mt-1">{pct}%</p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <h3 className="text-base font-semibold text-gray-900 mb-3">Proposals by Type</h3>
            <div className="flex items-center gap-6">
              {proposalTypeData.map((item) => {
                const total = proposalTypeData.reduce((a, b) => a + b.value, 0);
                const pct = total > 0 ? Math.round((item.value / total) * 100) : 0;
                const IconComp = item.name === 'New Order' ? Package : item.name === 'Change Order' ? AlertCircle : XCircle;
                const iconClass = item.name === 'New Order' ? 'text-blue-500' : item.name === 'Change Order' ? 'text-amber-500' : 'text-red-500';
                return (
                  <div key={item.name} className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <IconComp className={`w-4 h-4 ${iconClass}`} />
                      <span className="text-sm text-gray-600">{item.name}</span>
                    </div>
                    <p className="text-xl font-bold text-gray-900">{item.value}</p>
                    <div className="w-full bg-gray-100 rounded-full h-1.5 mt-1">
                      <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, backgroundColor: item.color }} />
                    </div>
                    <p className="text-xs text-gray-400 mt-1">{pct}%</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Row 3: Top Customers + Weekly Comparison (placeholder) */}
      {topCustomers.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-base font-semibold text-gray-900 mb-4">Top Customers by Orders (30d)</h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topCustomers} layout="vertical" margin={{ left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" horizontal vertical={false} />
                  <XAxis type="number" stroke="#6B7280" fontSize={12} />
                  <YAxis type="category" dataKey="name" stroke="#6B7280" fontSize={11} width={130} tick={{ fill: '#374151' }} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(value) => [value, 'Orders']} />
                  <Bar dataKey="orders" fill="#53AD6D" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Timeline as line chart alternative */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-base font-semibold text-gray-900 mb-4">Orders vs Proposals</h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={timeline}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="date" stroke="#6B7280" fontSize={12} />
                  <YAxis stroke="#6B7280" fontSize={12} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend />
                  <Line type="monotone" dataKey="orders" name="Orders" stroke="#53AD6D" strokeWidth={2} dot={{ fill: '#53AD6D', r: 4 }} />
                  <Line type="monotone" dataKey="proposals" name="Proposals" stroke="#8B5CF6" strokeWidth={2} strokeDasharray="5 5" dot={{ fill: '#8B5CF6', r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* Row 4: Recent Intake Feed + Quick Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-base font-semibold text-gray-900 mb-4">Recent Intake Events</h3>
          <div className="space-y-3">
            {recentIntake.length > 0 ? recentIntake.map((evt) => (
              <div key={evt.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                  evt.channel === 'email' ? 'bg-blue-100' : evt.channel === 'sms' ? 'bg-green-100' : 'bg-purple-100'
                }`}>
                  {evt.channel === 'email' ? <Mail className="w-4 h-4 text-blue-600" /> :
                   <MessageSquare className={`w-4 h-4 ${evt.channel === 'sms' ? 'text-green-600' : 'text-purple-600'}`} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{evt.from}</p>
                  <p className="text-xs text-gray-500 capitalize">{evt.channel}</p>
                </div>
                <span className="text-xs text-gray-400 whitespace-nowrap">{evt.time}</span>
              </div>
            )) : (
              <p className="text-sm text-gray-400 py-4 text-center">No recent intake events</p>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <div className="flex items-center gap-2 mb-3">
              <Zap className="w-5 h-5 text-amber-500" />
              <h3 className="text-base font-semibold text-gray-900">AI Processing</h3>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Total Analyses</span>
                <span className="text-sm font-semibold text-gray-900">{aiLogCount}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Avg. Time</span>
                <span className="text-sm font-semibold text-gray-900">{summary.avgProcessingMs > 0 ? `${(summary.avgProcessingMs / 1000).toFixed(1)}s` : '—'}</span>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default AnalyticsDashboard;
