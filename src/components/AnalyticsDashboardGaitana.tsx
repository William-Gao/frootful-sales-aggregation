import React, { useState } from 'react';
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
  Package,
  Mail,
  CheckCircle2,
  Zap,
  DollarSign,
  Truck,
  Flower2,
} from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────────────
type TimeRange = '7d' | '30d' | '90d';

// ─── Fake Data ──────────────────────────────────────────────────────────────

const FAKE_DATA = {
  '7d': {
    posReceived: 417,
    posChange: 12,
    ordersCreated: 398,
    ordersChange: 8,
    stemsShipped: 3342000,
    stemsChange: 15,
    revenue: 3007800,
    revenueChange: 11,
    firstTryRate: 95,
    firstTryAccepted: 396,
    firstTryTotal: 417,
    acceptanceRate: 97,
    acceptedCount: 405,
    totalResolved: 417,
    avgProcessingTime: 68,
    timeline: [
      { date: 'Mon', pos: 72, orders: 68, stems: 524000 },
      { date: 'Tue', pos: 81, orders: 78, stems: 604800 },
      { date: 'Wed', pos: 58, orders: 55, stems: 436800 },
      { date: 'Thu', pos: 69, orders: 66, stems: 512400 },
      { date: 'Fri', pos: 84, orders: 80, stems: 672000 },
      { date: 'Sat', pos: 30, orders: 29, stems: 336000 },
      { date: 'Sun', pos: 23, orders: 22, stems: 256000 },
    ],
    proposalStatus: [
      { name: 'Accepted', value: 405, color: '#10B981' },
      { name: 'Pending', value: 8, color: '#F59E0B' },
      { name: 'Rejected', value: 4, color: '#EF4444' },
    ],
    topCustomers: [
      { name: 'Gems Group', orders: 142, stems: 1136000 },
      { name: 'Raffine\'s Flowers', orders: 94, stems: 789600 },
      { name: 'Four Seasons', orders: 71, stems: 596400 },
      { name: 'Elite Floral', orders: 52, stems: 374400 },
      { name: 'Sun Valley', orders: 39, stems: 445600 },
    ],
    topProducts: [
      { name: 'Carnation Fcy Mixed', boxes: 1960 },
      { name: 'Minicarnation Sel Rainbow', boxes: 1680 },
      { name: 'Minicarnation Sel Consumer', boxes: 1344 },
      { name: 'Carnation Fcy White', boxes: 1050 },
      { name: 'Rose Red Freedom', boxes: 890 },
    ],
    ordersByStatus: [
      { status: 'Completed', count: 312, color: '#10B981' },
      { status: 'In Progress', count: 64, color: '#3B82F6' },
      { status: 'Pending', count: 22, color: '#F59E0B' },
    ],
  },
  '30d': {
    posReceived: 1583,
    posChange: 18,
    ordersCreated: 1512,
    ordersChange: 14,
    stemsShipped: 12096000,
    stemsChange: 22,
    revenue: 10886400,
    revenueChange: 19,
    firstTryRate: 96,
    firstTryAccepted: 1520,
    firstTryTotal: 1583,
    acceptanceRate: 97,
    acceptedCount: 1535,
    totalResolved: 1583,
    avgProcessingTime: 72,
    timeline: [
      { date: 'Week 1', pos: 348, orders: 332, stems: 2646000 },
      { date: 'Week 2', pos: 385, orders: 368, stems: 2940000 },
      { date: 'Week 3', pos: 412, orders: 394, stems: 3150000 },
      { date: 'Week 4', pos: 438, orders: 418, stems: 3360000 },
    ],
    proposalStatus: [
      { name: 'Accepted', value: 1535, color: '#10B981' },
      { name: 'Pending', value: 28, color: '#F59E0B' },
      { name: 'Rejected', value: 20, color: '#EF4444' },
    ],
    topCustomers: [
      { name: 'Gems Group', orders: 524, stems: 4402000 },
      { name: 'Raffine\'s Flowers', orders: 336, stems: 2822400 },
      { name: 'Four Seasons', orders: 268, stems: 2251200 },
      { name: 'Elite Floral', orders: 192, stems: 1382400 },
      { name: 'Sun Valley', orders: 142, stems: 1420000 },
    ],
    topProducts: [
      { name: 'Carnation Fcy Mixed', boxes: 7420 },
      { name: 'Minicarnation Sel Rainbow', boxes: 6380 },
      { name: 'Minicarnation Sel Consumer', boxes: 5320 },
      { name: 'Carnation Fcy White', boxes: 4420 },
      { name: 'Rose Red Freedom', boxes: 3380 },
    ],
    ordersByStatus: [
      { status: 'Completed', count: 1186, color: '#10B981' },
      { status: 'In Progress', count: 238, color: '#3B82F6' },
      { status: 'Pending', count: 88, color: '#F59E0B' },
    ],
  },
  '90d': {
    posReceived: 4631,
    posChange: 34,
    ordersCreated: 4426,
    ordersChange: 28,
    stemsShipped: 35408000,
    stemsChange: 31,
    revenue: 31867200,
    revenueChange: 27,
    firstTryRate: 95,
    firstTryAccepted: 4400,
    firstTryTotal: 4631,
    acceptanceRate: 96,
    acceptedCount: 4446,
    totalResolved: 4631,
    avgProcessingTime: 75,
    timeline: [
      { date: 'Jan', pos: 1420, orders: 1358, stems: 10864000 },
      { date: 'Feb', pos: 1524, orders: 1462, stems: 11696000 },
      { date: 'Mar', pos: 1687, orders: 1606, stems: 12848000 },
    ],
    proposalStatus: [
      { name: 'Accepted', value: 4446, color: '#10B981' },
      { name: 'Pending', value: 102, color: '#F59E0B' },
      { name: 'Rejected', value: 83, color: '#EF4444' },
    ],
    topCustomers: [
      { name: 'Gems Group', orders: 1536, stems: 12902400 },
      { name: 'Raffine\'s Flowers', orders: 984, stems: 8265600 },
      { name: 'Four Seasons', orders: 782, stems: 6568800 },
      { name: 'Elite Floral', orders: 562, stems: 4046400 },
      { name: 'Sun Valley', orders: 412, stems: 4120000 },
    ],
    topProducts: [
      { name: 'Carnation Fcy Mixed', boxes: 21580 },
      { name: 'Minicarnation Sel Rainbow', boxes: 18520 },
      { name: 'Minicarnation Sel Consumer', boxes: 15460 },
      { name: 'Carnation Fcy White', boxes: 12680 },
      { name: 'Rose Red Freedom', boxes: 9860 },
    ],
    ordersByStatus: [
      { status: 'Completed', count: 3482, color: '#10B981' },
      { status: 'In Progress', count: 682, color: '#3B82F6' },
      { status: 'Pending', count: 262, color: '#F59E0B' },
    ],
  },
};

// ─── Stat Card ──────────────────────────────────────────────────────────────
interface StatCardProps {
  title: string;
  value: string;
  change: number;
  changeLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  iconBgColor: string;
  iconColor: string;
}

const StatCard: React.FC<StatCardProps> = ({ title, value, change, changeLabel, icon: Icon, iconBgColor, iconColor }) => {
  const isPositive = change >= 0;
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
          <div className="flex items-center mt-2">
            {isPositive ? (
              <TrendingUp className="w-4 h-4 mr-1 text-green-500" />
            ) : (
              <TrendingDown className="w-4 h-4 mr-1 text-red-500" />
            )}
            <span className={`text-sm font-medium ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
              {isPositive ? '+' : ''}{change}%
            </span>
            <span className="text-sm text-gray-500 ml-1">{changeLabel}</span>
          </div>
        </div>
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${iconBgColor}`}>
          <Icon className={`w-6 h-6 ${iconColor}`} />
        </div>
      </div>
    </div>
  );
};

const tooltipStyle = { backgroundColor: '#fff', border: '1px solid #E5E7EB', borderRadius: '8px', fontSize: '13px' };

// ─── Main Component ─────────────────────────────────────────────────────────
const AnalyticsDashboardGaitana: React.FC = () => {
  const [timeRange, setTimeRange] = useState<TimeRange>('30d');
  const d = FAKE_DATA[timeRange];
  const rangeLabel = timeRange === '7d' ? 'vs prev 7d' : timeRange === '30d' ? 'vs prev 30d' : 'vs prev 90d';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Business Metrics</h2>
          <p className="text-gray-500 text-sm">Order processing overview</p>
        </div>
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

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          title="POs Received"
          value={d.posReceived.toLocaleString()}
          change={d.posChange}
          changeLabel={rangeLabel}
          icon={Inbox}
          iconBgColor="bg-indigo-100"
          iconColor="text-indigo-600"
        />
        <StatCard
          title="Orders Created"
          value={d.ordersCreated.toLocaleString()}
          change={d.ordersChange}
          changeLabel={rangeLabel}
          icon={Package}
          iconBgColor="bg-blue-100"
          iconColor="text-blue-600"
        />
        <StatCard
          title="Stems Shipped"
          value={d.stemsShipped.toLocaleString()}
          change={d.stemsChange}
          changeLabel={rangeLabel}
          icon={Flower2}
          iconBgColor="bg-green-100"
          iconColor="text-green-600"
        />
        <StatCard
          title="Revenue"
          value={`$${d.revenue.toLocaleString()}`}
          change={d.revenueChange}
          changeLabel={rangeLabel}
          icon={DollarSign}
          iconBgColor="bg-emerald-100"
          iconColor="text-emerald-600"
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
            <span className="text-4xl font-bold text-gray-900">{d.firstTryRate}%</span>
            <span className="text-sm text-gray-500 mb-1">{d.firstTryAccepted} of {d.firstTryTotal} accepted on first try</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-3 mt-3">
            <div className="h-3 rounded-full bg-blue-500" style={{ width: `${d.firstTryRate}%` }} />
          </div>
          <p className="text-xs text-gray-400 mt-2">% of POs where the AI extraction was accepted without edits</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 className="w-5 h-5 text-green-500" />
            <h3 className="text-base font-semibold text-gray-900">Overall Acceptance Rate</h3>
          </div>
          <div className="flex items-end gap-2">
            <span className="text-4xl font-bold text-gray-900">{d.acceptanceRate}%</span>
            <span className="text-sm text-gray-500 mb-1">{d.acceptedCount} of {d.totalResolved} accepted</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-3 mt-3">
            <div className="h-3 rounded-full bg-green-500" style={{ width: `${d.acceptanceRate}%` }} />
          </div>
        </div>
      </div>

      {/* Row 1: Timeline + Proposal Outcomes */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-base font-semibold text-gray-900 mb-4">Order Activity</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={d.timeline}>
                <defs>
                  <linearGradient id="gradPOs" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366F1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6366F1" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradOrders" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#53AD6D" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#53AD6D" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="date" stroke="#6B7280" fontSize={12} />
                <YAxis stroke="#6B7280" fontSize={12} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend />
                <Area type="monotone" dataKey="orders" name="Orders Created" stroke="#53AD6D" strokeWidth={2} fillOpacity={1} fill="url(#gradOrders)" />
                <Area type="monotone" dataKey="pos" name="POs Received" stroke="#6366F1" strokeWidth={2} fillOpacity={1} fill="url(#gradPOs)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-base font-semibold text-gray-900 mb-4">Proposal Outcomes</h3>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={d.proposalStatus} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value">
                  {d.proposalStatus.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} formatter={(value) => [value, 'Proposals']} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-2 mt-2">
            {d.proposalStatus.map((item) => {
              const total = d.proposalStatus.reduce((a, b) => a + b.value, 0);
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
        </div>
      </div>

      {/* Row 2: Top Customers + Top Products */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-base font-semibold text-gray-900 mb-4">Top Customers by Orders</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={d.topCustomers} layout="vertical" margin={{ left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" horizontal vertical={false} />
                <XAxis type="number" stroke="#6B7280" fontSize={12} />
                <YAxis type="category" dataKey="name" stroke="#6B7280" fontSize={11} width={130} tick={{ fill: '#374151' }} />
                <Tooltip contentStyle={tooltipStyle} formatter={(value) => [value, 'Orders']} />
                <Bar dataKey="orders" fill="#53AD6D" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-base font-semibold text-gray-900 mb-4">Top Products by Boxes</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={d.topProducts} layout="vertical" margin={{ left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" horizontal vertical={false} />
                <XAxis type="number" stroke="#6B7280" fontSize={12} />
                <YAxis type="category" dataKey="name" stroke="#6B7280" fontSize={11} width={180} tick={{ fill: '#374151' }} />
                <Tooltip contentStyle={tooltipStyle} formatter={(value) => [value, 'Boxes']} />
                <Bar dataKey="boxes" fill="#6366F1" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Row 3: Order Status + AI Processing + Shipping */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-base font-semibold text-gray-900 mb-4">Orders by Status</h3>
          <div className="space-y-3">
            {d.ordersByStatus.map((item) => {
              const total = d.ordersByStatus.reduce((a, b) => a + b.count, 0);
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
            <span className="text-lg font-bold text-gray-900">{d.ordersByStatus.reduce((a, b) => a + b.count, 0)}</span>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="w-5 h-5 text-amber-500" />
            <h3 className="text-base font-semibold text-gray-900">AI Processing</h3>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Avg. Extraction Time</span>
              <span className="text-sm font-semibold text-gray-900">{d.avgProcessingTime}s</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">POs Processed</span>
              <span className="text-sm font-semibold text-gray-900">{d.posReceived}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">WebFlor Orders Created</span>
              <span className="text-sm font-semibold text-gray-900">{d.ordersCreated}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Items w/ Recipe Match</span>
              <span className="text-sm font-semibold text-gray-900">94%</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Truck className="w-5 h-5 text-blue-500" />
            <h3 className="text-base font-semibold text-gray-900">Shipping Summary</h3>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Total Boxes</span>
              <span className="text-sm font-semibold text-gray-900">{Math.round(d.stemsShipped / 168).toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Total Stems</span>
              <span className="text-sm font-semibold text-gray-900">{d.stemsShipped.toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Avg. Price/Stem</span>
              <span className="text-sm font-semibold text-gray-900">${(d.revenue / d.stemsShipped).toFixed(3)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Active Customers</span>
              <span className="text-sm font-semibold text-gray-900">{d.topCustomers.length}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Row 4: Stems over time */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 className="text-base font-semibold text-gray-900 mb-4">Stems Shipped Over Time</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={d.timeline}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis dataKey="date" stroke="#6B7280" fontSize={12} />
              <YAxis stroke="#6B7280" fontSize={12} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip contentStyle={tooltipStyle} formatter={(value: number) => [value.toLocaleString(), 'Stems']} />
              <Line type="monotone" dataKey="stems" name="Stems" stroke="#16a34a" strokeWidth={2.5} dot={{ fill: '#16a34a', r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default AnalyticsDashboardGaitana;
