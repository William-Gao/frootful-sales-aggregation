import React from 'react';
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
import { TrendingUp, TrendingDown, Package, DollarSign, Users, Clock, Mail, MessageSquare, FileText, PenTool } from 'lucide-react';

// Demo data for charts
const ordersOverTimeData = [
  { month: 'Jul', orders: 145, revenue: 34500 },
  { month: 'Aug', orders: 178, revenue: 42300 },
  { month: 'Sep', orders: 203, revenue: 51200 },
  { month: 'Oct', orders: 189, revenue: 47800 },
  { month: 'Nov', orders: 234, revenue: 58900 },
  { month: 'Dec', orders: 287, revenue: 72100 },
  { month: 'Jan', orders: 312, revenue: 78400 },
];

const ordersBySourceData = [
  { name: 'Email', value: 487, color: '#3B82F6' },
  { name: 'SMS/Text', value: 234, color: '#10B981' },
  { name: 'EDI/Portal', value: 189, color: '#F59E0B' },
  { name: 'Handwritten', value: 78, color: '#8B5CF6' },
];

const topCustomersData = [
  { name: 'Publix Super Markets', orders: 156, revenue: 89400 },
  { name: 'Whole Foods Market', orders: 134, revenue: 76200 },
  { name: 'Kroger Co.', orders: 98, revenue: 54800 },
  { name: 'Trader Joe\'s', orders: 87, revenue: 48300 },
  { name: 'Sprouts Farmers', orders: 72, revenue: 41200 },
];

const weeklyTrendData = [
  { day: 'Mon', thisWeek: 45, lastWeek: 38 },
  { day: 'Tue', thisWeek: 52, lastWeek: 42 },
  { day: 'Wed', thisWeek: 48, lastWeek: 45 },
  { day: 'Thu', thisWeek: 61, lastWeek: 48 },
  { day: 'Fri', thisWeek: 55, lastWeek: 51 },
  { day: 'Sat', thisWeek: 32, lastWeek: 28 },
  { day: 'Sun', thisWeek: 19, lastWeek: 15 },
];

const processingTimeData = [
  { hour: '6am', orders: 12 },
  { hour: '8am', orders: 34 },
  { hour: '10am', orders: 58 },
  { hour: '12pm', orders: 45 },
  { hour: '2pm', orders: 67 },
  { hour: '4pm', orders: 43 },
  { hour: '6pm', orders: 21 },
];

interface StatCardProps {
  title: string;
  value: string;
  change: number;
  changeLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  iconBgColor: string;
  iconColor: string;
}

const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  change,
  changeLabel,
  icon: Icon,
  iconBgColor,
  iconColor,
}) => {
  const isPositive = change >= 0;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
          <div className="flex items-center mt-2">
            {isPositive ? (
              <TrendingUp className="w-4 h-4 text-green-500 mr-1" />
            ) : (
              <TrendingDown className="w-4 h-4 text-red-500 mr-1" />
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

const AnalyticsDashboard: React.FC = () => {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Analytics Overview</h2>
        <p className="text-gray-600">Company-wide order processing metrics and insights</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Total Orders"
          value="988"
          change={18.2}
          changeLabel="vs last month"
          icon={Package}
          iconBgColor="bg-blue-100"
          iconColor="text-blue-600"
        />
        <StatCard
          title="Revenue Processed"
          value="$385,200"
          change={24.5}
          changeLabel="vs last month"
          icon={DollarSign}
          iconBgColor="bg-green-100"
          iconColor="text-green-600"
        />
        <StatCard
          title="Active Customers"
          value="156"
          change={8.3}
          changeLabel="vs last month"
          icon={Users}
          iconBgColor="bg-purple-100"
          iconColor="text-purple-600"
        />
        <StatCard
          title="Avg. Processing Time"
          value="2.4 min"
          change={-12.8}
          changeLabel="vs last month"
          icon={Clock}
          iconBgColor="bg-orange-100"
          iconColor="text-orange-600"
        />
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Orders Over Time */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Orders & Revenue Over Time</h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={ordersOverTimeData}>
                <defs>
                  <linearGradient id="colorOrders" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#53AD6D" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#53AD6D" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="month" stroke="#6B7280" fontSize={12} />
                <YAxis yAxisId="left" stroke="#6B7280" fontSize={12} />
                <YAxis yAxisId="right" orientation="right" stroke="#6B7280" fontSize={12} tickFormatter={(value) => `$${value / 1000}k`} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#fff', border: '1px solid #E5E7EB', borderRadius: '8px' }}
                  formatter={(value: number, name: string) => [
                    name === 'revenue' ? `$${value.toLocaleString()}` : value,
                    name === 'revenue' ? 'Revenue' : 'Orders'
                  ]}
                />
                <Area
                  yAxisId="left"
                  type="monotone"
                  dataKey="orders"
                  stroke="#53AD6D"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorOrders)"
                />
                <Area
                  yAxisId="right"
                  type="monotone"
                  dataKey="revenue"
                  stroke="#3B82F6"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorRevenue)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Orders by Source */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Orders by Source</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={ordersBySourceData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {ordersBySourceData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: '#fff', border: '1px solid #E5E7EB', borderRadius: '8px' }}
                  formatter={(value: number) => [value, 'Orders']}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          {/* Legend */}
          <div className="grid grid-cols-2 gap-2 mt-4">
            {ordersBySourceData.map((item) => (
              <div key={item.name} className="flex items-center space-x-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                <span className="text-sm text-gray-600">{item.name}</span>
                <span className="text-sm font-medium text-gray-900">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Customers */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Top Customers by Orders</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topCustomersData} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" horizontal={true} vertical={false} />
                <XAxis type="number" stroke="#6B7280" fontSize={12} />
                <YAxis
                  type="category"
                  dataKey="name"
                  stroke="#6B7280"
                  fontSize={11}
                  width={120}
                  tick={{ fill: '#374151' }}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: '#fff', border: '1px solid #E5E7EB', borderRadius: '8px' }}
                  formatter={(value: number, name: string) => [
                    name === 'revenue' ? `$${value.toLocaleString()}` : value,
                    name === 'revenue' ? 'Revenue' : 'Orders'
                  ]}
                />
                <Bar dataKey="orders" fill="#53AD6D" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Weekly Comparison */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Weekly Trend Comparison</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={weeklyTrendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="day" stroke="#6B7280" fontSize={12} />
                <YAxis stroke="#6B7280" fontSize={12} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#fff', border: '1px solid #E5E7EB', borderRadius: '8px' }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="thisWeek"
                  name="This Week"
                  stroke="#53AD6D"
                  strokeWidth={2}
                  dot={{ fill: '#53AD6D' }}
                />
                <Line
                  type="monotone"
                  dataKey="lastWeek"
                  name="Last Week"
                  stroke="#9CA3AF"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={{ fill: '#9CA3AF' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Order Source Breakdown Cards */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Source Channel Breakdown</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <div className="flex items-center space-x-3 mb-3">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <Mail className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Email Orders</p>
                <p className="text-xl font-bold text-gray-900">487</p>
              </div>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div className="bg-blue-500 h-2 rounded-full" style={{ width: '49%' }} />
            </div>
            <p className="text-xs text-gray-500 mt-2">49% of total orders</p>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <div className="flex items-center space-x-3 mb-3">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <MessageSquare className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">SMS/Text Orders</p>
                <p className="text-xl font-bold text-gray-900">234</p>
              </div>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div className="bg-green-500 h-2 rounded-full" style={{ width: '24%' }} />
            </div>
            <p className="text-xs text-gray-500 mt-2">24% of total orders</p>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <div className="flex items-center space-x-3 mb-3">
              <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
                <FileText className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">EDI/Portal Orders</p>
                <p className="text-xl font-bold text-gray-900">189</p>
              </div>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div className="bg-amber-500 h-2 rounded-full" style={{ width: '19%' }} />
            </div>
            <p className="text-xs text-gray-500 mt-2">19% of total orders</p>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <div className="flex items-center space-x-3 mb-3">
              <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                <PenTool className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Handwritten Orders</p>
                <p className="text-xl font-bold text-gray-900">78</p>
              </div>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div className="bg-purple-500 h-2 rounded-full" style={{ width: '8%' }} />
            </div>
            <p className="text-xs text-gray-500 mt-2">8% of total orders</p>
          </div>
        </div>
      </div>

      {/* Peak Hours Chart */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Order Volume by Time of Day</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={processingTimeData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis dataKey="hour" stroke="#6B7280" fontSize={12} />
              <YAxis stroke="#6B7280" fontSize={12} />
              <Tooltip
                contentStyle={{ backgroundColor: '#fff', border: '1px solid #E5E7EB', borderRadius: '8px' }}
                formatter={(value: number) => [value, 'Orders']}
              />
              <Bar dataKey="orders" fill="#53AD6D" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="text-sm text-gray-500 mt-2">
          Peak order volume occurs between 2pm-4pm. Consider staffing adjustments during these hours.
        </p>
      </div>
    </div>
  );
};

export default AnalyticsDashboard;
