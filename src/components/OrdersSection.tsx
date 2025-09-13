import React, { useState, useEffect } from 'react';
import { 
  Package, 
  Calendar, 
  User, 
  Mail, 
  Phone, 
  MapPin, 
  DollarSign,
  Clock,
  CheckCircle,
  AlertCircle,
  Search,
  Filter,
  Download,
  Eye,
  ExternalLink,
  Edit,
  Save,
  X,
  Loader2,
  MessageSquare,
  Send
} from 'lucide-react';
import { supabaseClient } from '../supabaseClient';

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

interface Item {
  id: string;
  number: string;
  displayName: string;
  unitPrice: number;
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
  status: 'received' | 'processing' | 'analyzed' | 'exported' | 'failed' | 'pending' | 'completed' | 'cancelled';
  source: 'email' | 'text' | 'manual';
  original_content: string;
  requested_delivery_date?: string;
  created_at: string;
  processed_at?: string;
  erp_order_id?: string;
  erp_order_number?: string;
  analysis_data?: AnalysisData;
  phone_number?: string;
  message_content?: string;
}

const OrdersSection: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);

  useEffect(() => {
    loadOrders();
  }, []);

  const loadOrders = async () => {
    try {
      setLoading(true);
      
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (!session) {
        console.error('No session found');
        return;
      }

      // Load text orders from database
      const { data: textOrders, error } = await supabaseClient
        .from('text_orders')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading text orders:', error);
        return;
      }

      // Transform text orders to match Order interface
      console.log('This is textOrder: ');
      console.log(textOrders);
      const transformedOrders: Order[] = (textOrders || []).map((textOrder: any) => ({
        id: textOrder.id,
        order_number: textOrder.erp_order_number || `TXT-${textOrder.id.slice(0, 8)}`,
        customer_name: textOrder.analysis_data?.matchingCustomer?.displayName || 'Unknown Customer',
        customer_email: textOrder.analysis_data?.matchingCustomer?.email || '',
        customer_phone: textOrder.analysis_data?.matchingCustomer?.phone_number,
        // phone_number: textOrder.phone_number,
        message_content: textOrder.message_content,
        items: textOrder.analysis_data?.analyzedItems?.map((item: AnalyzedItem) => ({
          name: item.matchedItem?.displayName || item.itemName,
          quantity: item.quantity,
          price: item.matchedItem?.unitPrice,
          description: item.matchedItem?.number
        })) || [],
        total_amount: textOrder.analysis_data?.analyzedItems?.reduce((sum: number, item: AnalyzedItem) => 
          sum + (item.quantity * (item.matchedItem?.unitPrice || 0)), 0),
        status: textOrder.status,
        source: 'text',
        original_content: textOrder.message_content,
        requested_delivery_date: textOrder.analysis_data?.requestedDeliveryDate,
        created_at: textOrder.created_at,
        processed_at: textOrder.updated_at,
        erp_order_id: textOrder.erp_order_id,
        erp_order_number: textOrder.erp_order_number,
        analysis_data: textOrder.analysis_data
      }));

      setOrders(transformedOrders);
    } catch (error) {
      console.error('Error loading orders:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEditOrder = (order: Order) => {
    setEditingOrder({ ...order });
    setIsEditing(true);
  };

  const handleSaveOrder = async () => {
    if (!editingOrder || !editingOrder.analysis_data) return;

    try {
      setIsSaving(true);

      const { data: { session } } = await supabaseClient.auth.getSession();
      if (!session) {
        throw new Error('No session found');
      }

      // Update the analysis data in the database
      const { error } = await supabaseClient
        .from('text_orders')
        .update({
          analysis_data: editingOrder.analysis_data,
          updated_at: new Date().toISOString()
        })
        .eq('id', editingOrder.id);

      if (error) {
        throw new Error(`Failed to update order: ${error.message}`);
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
    if (!editingOrder?.analysis_data) return;

    const selectedCustomer = editingOrder.analysis_data.customers.find(c => c.number === customerNumber);
    setEditingOrder({
      ...editingOrder,
      analysis_data: {
        ...editingOrder.analysis_data,
        matchingCustomer: selectedCustomer
      },
      customer_name: selectedCustomer?.displayName || 'Unknown Customer',
      customer_email: selectedCustomer?.email || ''
    });
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

    const selectedItem = editingOrder.analysis_data.items.find(item => item.number === itemNumber);
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
    if (!order.analysis_data || !order.analysis_data.analyzedItems.length) {
      alert('No analyzed items found to export');
      return;
    }

    const analysisData = order.analysis_data;
    
    // Check if we have a matching customer
    if (!analysisData.matchingCustomer) {
      alert('No matching customer found. Please select a customer first.');
      return;
    }

    try {
      setIsCreatingOrder(true);

      const { data: { session } } = await supabaseClient.auth.getSession();
      if (!session) {
        throw new Error('No session found');
      }

      // Prepare order data
      const orderData = {
        customerNumber: analysisData.matchingCustomer.number,
        items: analysisData.analyzedItems.map(item => ({
          itemName: item.matchedItem?.number || item.itemName,
          quantity: item.quantity,
          price: item.matchedItem?.unitPrice
        })),
        requestedDeliveryDate: analysisData.requestedDeliveryDate
      };

      console.log('Creating ERP order:', orderData);

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/export-order-to-erp`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          textOrderId: order.id,
          orderData: orderData
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Export failed');
      }

      console.log('ERP order created successfully:', result);
      
      // Refresh the orders list to show updated status
      await loadOrders();
      
      // Update the selected order if it's still open
      if (selectedOrder && selectedOrder.id === order.id) {
        const updatedOrder = orders.find(o => o.id === order.id);
        if (updatedOrder) {
          setSelectedOrder(updatedOrder);
        }
      }
      
      alert(`Successfully created order #${result.orderNumber} in Business Central!`);

    } catch (error) {
      console.error('Error creating ERP order:', error);
      alert(`Failed to create ERP order: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsCreatingOrder(false);
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
      case 'analyzed': return 'text-blue-600 bg-blue-100';
      case 'processing': return 'text-blue-600 bg-blue-100';
      case 'received':
      case 'pending': return 'text-yellow-600 bg-yellow-100';
      case 'failed':
      case 'cancelled': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getSourceIcon = (source: string) => {
    switch (source) {
      case 'email': return <Mail className="w-4 h-4" />;
      case 'text': return <MessageSquare className="w-4 h-4" />;
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

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const formatPhoneNumber = (phoneNumber: string) => {
    // Simple phone number formatting
    const cleaned = phoneNumber.replace(/\D/g, '');
    if (cleaned.length === 10) {
      return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
    }
    return phoneNumber;
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
          <p className="text-gray-600">Manage and track all orders from email and text messages processed by Frootful</p>
        </div>
        <div className="flex items-center space-x-3">
          <button className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors">
            <Download className="w-4 h-4" />
            <span>Export</span>
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
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
        
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="p-2 bg-green-100 rounded-lg">
              <CheckCircle className="w-6 h-6 text-green-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Exported</p>
              <p className="text-2xl font-bold text-gray-900">
                {orders.filter(o => o.status === 'exported' || o.status === 'completed').length}
              </p>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="p-2 bg-yellow-100 rounded-lg">
              <Clock className="w-6 h-6 text-yellow-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Processing</p>
              <p className="text-2xl font-bold text-gray-900">
                {orders.filter(o => ['received', 'processing', 'analyzed', 'pending'].includes(o.status)).length}
              </p>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="p-2 bg-purple-100 rounded-lg">
              <DollarSign className="w-6 h-6 text-purple-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Total Value</p>
              <p className="text-2xl font-bold text-gray-900">
                {formatCurrency(orders.reduce((sum, order) => sum + (order.total_amount || 0), 0))}
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
              <option value="manual">Manual</option>
            </select>
          </div>
        </div>
      </div>

      {/* Orders Table */}
      {/* Mobile-Friendly Orders List */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        {/* Desktop Table - Hidden on mobile */}
        <div className="hidden md:block overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Order
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Customer
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Items
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Amount
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
                  onClick={() => setSelectedOrder(order)}
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        {getSourceIcon(order.source)}
                      </div>
                      <div className="ml-3">
                        <div className="text-sm font-medium text-gray-900">
                          {order.order_number}
                        </div>
                        {order.erp_order_number && (
                          <div className="text-sm text-gray-500">
                            ERP: {order.erp_order_number}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {order.customer_name}
                    </div>
                    {order.customer_email ? (
                      <div className="text-sm text-gray-500">
                        {order.customer_email}
                      </div>
                    ) : order.phone_number ? (
                      <div className="text-sm text-gray-500">
                        {formatPhoneNumber(order.phone_number)}
                      </div>
                    ) : null}
                  </td>
                  
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {order.items.length} item{order.items.length !== 1 ? 's' : ''}
                    </div>
                    <div className="text-sm text-gray-500">
                      {order.items.reduce((sum, item) => sum + item.quantity, 0)} total qty
                    </div>
                  </td>
                  
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {order.total_amount ? formatCurrency(order.total_amount) : 'N/A'}
                    </div>
                  </td>
                  
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(order.status)}`}>
                      {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
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
              onClick={() => setSelectedOrder(order)}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2">
                  {getSourceIcon(order.source)}
                  <span className="font-medium text-gray-900">{order.order_number}</span>
                </div>
                <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(order.status)}`}>
                  {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                </span>
              </div>
              
              <div className="space-y-1">
                <div className="text-sm font-medium text-gray-900">{order.customer_name}</div>
                {order.customer_email ? (
                  <div className="text-sm text-gray-500">{order.customer_email}</div>
                ) : order.phone_number ? (
                  <div className="text-sm text-gray-500">{formatPhoneNumber(order.phone_number)}</div>
                ) : null}
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-gray-900">
                    {order.total_amount ? formatCurrency(order.total_amount) : 'N/A'}
                  </span>
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
                <h3 className="text-lg font-medium text-gray-900">
                  Order Details - {selectedOrder.order_number}
                </h3>
                <div className="flex items-center space-x-2">
                  {!isEditing && selectedOrder.analysis_data && (
                    <button
                      onClick={() => handleEditOrder(selectedOrder)}
                      className="flex items-center space-x-1 px-3 py-1 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700"
                    >
                      <Edit className="w-4 h-4" />
                      <span>Edit</span>
                    </button>
                  )}
                  <button
                    onClick={() => setSelectedOrder(null)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X className="h-6 w-6" />
                  </button>
                </div>
              </div>
              
              <div className="space-y-6 px-4 md:px-0 pb-4 md:pb-0">
                {/* Customer Info */}
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <h4 className="text-lg font-semibold text-gray-900 mb-4">Customer Information</h4>
                  
                  {/* Current Matched Customer Display */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Matched Customer from Business Central:
                    </label>
                    <div className="bg-gray-50 border border-gray-200 rounded-md p-3">
                      {selectedOrder.analysis_data?.matchingCustomer ? (
                        <div className="space-y-3">
                          {/* Display current matched customer info */}
                          {!isEditing && (
                            <div className="bg-white border border-gray-200 rounded-md p-4">
                              <div className="flex items-center mb-2">
                                <User className="w-5 h-5 text-green-600 mr-2" />
                                <span className="text-lg font-semibold text-gray-900">
                                  {selectedOrder.analysis_data.matchingCustomer.displayName}
                                </span>
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                                {selectedOrder.analysis_data.matchingCustomer.email && (
                                  <div className="md:col-span-2">
                                    <span className="font-medium text-gray-700">Email:</span>
                                    <span className="ml-2 text-gray-900">{selectedOrder.analysis_data.matchingCustomer.email}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                          
                          {/* Dropdown for editing */}
                          {isEditing && (
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-2">
                                Select Customer:
                              </label>
                              <select
                                value={editingOrder?.analysis_data?.matchingCustomer?.number || ''}
                                onChange={(e) => handleCustomerChange(e.target.value)}
                                className="w-full px-3 py-3 text-base border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                              >
                                <option value="">Select a customer...</option>
                                {selectedOrder.analysis_data.customers.map((customer) => (
                                  <option key={customer.id} value={customer.number}>
                                    {customer.displayName} ({customer.number})
                                    {customer.email && ` - ${customer.email}`}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-center py-4">
                          <AlertCircle className="w-8 h-8 text-yellow-500 mx-auto mb-2" />
                          <p className="text-sm text-gray-600">No customer matched from Business Central</p>
                          {isEditing && selectedOrder.analysis_data?.customers && selectedOrder.analysis_data.customers.length > 0 && (
                            <div className="mt-3">
                              <label className="block text-sm font-medium text-gray-700 mb-2">
                                Select Customer:
                              </label>
                              <select
                                value={editingOrder?.analysis_data?.matchingCustomer?.number || ''}
                                onChange={(e) => handleCustomerChange(e.target.value)}
                                className="w-full px-3 py-3 text-base border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                              >
                                <option value="">Select a customer...</option>
                                {selectedOrder.analysis_data.customers.map((customer) => (
                                  <option key={customer.id} value={customer.number}>
                                    {customer.displayName} ({customer.number})
                                    {customer.email && ` - ${customer.email}`}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Phone Number */}
                      {selectedOrder.customer_phone && (
                        <div className="flex items-center text-sm text-gray-600">
                          <Phone className="w-4 h-4 mr-2" />
                          <span>Phone: {selectedOrder.customer_phone}</span>
                        </div>
                      )}
                    </div>
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
                  <h4 className="text-sm font-medium text-gray-900 mb-3">Order Items</h4>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="space-y-3">
                      {isEditing && editingOrder?.analysis_data ? (
                        editingOrder.analysis_data.analyzedItems.map((item, index) => (
                          <div key={index} className="border border-gray-200 rounded-lg p-3 bg-white">
                            <div className="space-y-4">
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                  Item:
                                </label>
                                <select
                                  value={item.matchedItem?.number || ''}
                                  onChange={(e) => handleItemChange(index, e.target.value)}
                                  className="w-full px-3 py-3 text-base border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                                >
                                  <option value="">-- Select Item --</option>
                                  {editingOrder.analysis_data.items.map((availableItem) => (
                                    <option key={availableItem.id} value={availableItem.number}>
                                      {availableItem.displayName} (${availableItem.unitPrice})
                                    </option>
                                  ))}
                                </select>
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
                          <div key={index} className="border border-gray-200 rounded-lg p-3 bg-white">
                            <div className="flex justify-between items-start">
                              <div className="flex-1">
                                <div className="text-sm font-medium text-gray-900">{item.name}</div>
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
                                {item.price && (
                                  <>
                                    <div className="text-xs text-gray-500">
                                      ${item.price} each
                                    </div>
                                    <div className="text-sm font-medium text-gray-900">
                                      = {formatCurrency(item.quantity * item.price)}
                                    </div>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                    {selectedOrder.total_amount && !isEditing && (
                      <div className="border-t border-gray-200 mt-4 pt-4">
                        <div className="flex justify-between items-center">
                          <span className="text-base font-medium text-gray-900">Total</span>
                          <span className="text-lg font-bold text-gray-900">
                            {formatCurrency(selectedOrder.total_amount)}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Original Content */}
                <div>
                  <h4 className="text-sm font-medium text-gray-900 mb-3">
                    {selectedOrder.source === 'text' ? 'Original Text Message' : 'Original Email Content'}
                  </h4>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">
                      {selectedOrder.original_content}
                    </p>
                  </div>
                </div>

                {/* Order Status & Dates */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <h4 className="text-sm font-medium text-gray-900 mb-3">Status</h4>
                    <span className={`inline-flex px-3 py-1 text-sm font-semibold rounded-full ${getStatusColor(selectedOrder.status)}`}>
                      {selectedOrder.status.charAt(0).toUpperCase() + selectedOrder.status.slice(1)}
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
                    {/* Create ERP Order Button - only show if order hasn't been exported yet */}
                    {!['exported', 'completed'].includes(selectedOrder.status) && selectedOrder.analysis_data?.matchingCustomer && selectedOrder.analysis_data?.analyzedItems?.length > 0 && (
                      <button
                        onClick={() => createERPOrder(selectedOrder)}
                        disabled={isCreatingOrder}
                        className="w-full sm:w-auto flex items-center justify-center space-x-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-base font-medium"
                      >
                        {isCreatingOrder ? (
                          <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            <span>Creating Order...</span>
                          </>
                        ) : (
                          <>
                            <Send className="w-5 h-5" />
                            <span>Create ERP Order</span>
                          </>
                        )}
                      </button>
                    )}
                    <button
                      onClick={() => setSelectedOrder(null)}
                      className="w-full sm:w-auto px-6 py-3 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition-colors text-base font-medium"
                    >
                      Close
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrdersSection;