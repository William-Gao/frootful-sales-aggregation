import React, { useState, useEffect } from 'react';
import { 
  Mail, 
  Calendar, 
  User, 
  Clock,
  CheckCircle,
  AlertCircle,
  Search,
  Filter,
  Eye,
  ExternalLink,
  Package,
  Loader2,
  Send,
  Paperclip,
  Download,
  FileText,
  Image,
  File
} from 'lucide-react';
import { supabaseClient } from '../supabaseClient';

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
}

interface AnalysisData {
  customers: Customer[];
  items: any[];
  matchingCustomer?: Customer;
  analyzedItems: AnalyzedItem[];
  requestedDeliveryDate?: string;
  originalEmail: {
    id: string;
    subject: string;
    from: string;
    to: string;
    date: string;
    body: string;
  };
}

interface EmailOrder {
  id: string;
  email_id: string;
  subject: string;
  from_email: string;
  to_email: string;
  email_content: string;
  attachments: Attachment[];
  status: 'received' | 'processing' | 'analyzed' | 'exported' | 'failed';
  analysis_data?: AnalysisData;
  created_at: string;
  processed_at?: string;
  exported_at?: string;
  erp_order_id?: string;
  erp_order_number?: string;
}

const EmailOrdersSection: React.FC = () => {
  const [emailOrders, setEmailOrders] = useState<EmailOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedOrder, setSelectedOrder] = useState<EmailOrder | null>(null);
  const [exportingOrder, setExportingOrder] = useState<string | null>(null);

  useEffect(() => {
    loadEmailOrders();
  }, []);

  const loadEmailOrders = async () => {
    try {
      setLoading(true);
      
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (!session) {
        console.error('No session found');
        return;
      }

      const { data, error } = await supabaseClient
        .from('email_orders')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading email orders:', error);
        return;
      }

      setEmailOrders(data || []);
    } catch (error) {
      console.error('Error loading email orders:', error);
    } finally {
      setLoading(false);
    }
  };

  const exportToERP = async (emailOrder: EmailOrder) => {
    if (!emailOrder.analysis_data || !emailOrder.analysis_data.analyzedItems.length) {
      alert('No analyzed items found to export');
      return;
    }

    const analysisData = emailOrder.analysis_data;
    
    if (!analysisData.matchingCustomer) {
      alert('No matching customer found. Please ensure the customer exists in Business Central.');
      return;
    }

    try {
      setExportingOrder(emailOrder.id);

      const { data: { session } } = await supabaseClient.auth.getSession();
      if (!session) {
        throw new Error('No session found');
      }

      const orderData = {
        customerNumber: analysisData.matchingCustomer.number,
        items: analysisData.analyzedItems.map(item => ({
          itemName: item.matchedItem?.number || item.itemName,
          quantity: item.quantity,
          price: item.matchedItem?.unitPrice
        })),
        requestedDeliveryDate: analysisData.requestedDeliveryDate
      };

      console.log('Exporting email order to ERP:', orderData);

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/export-order-to-erp`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ orderData })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Export failed');
      }

      console.log('Export successful:', result);
      
      await loadEmailOrders();
      setSelectedOrder(null);
      
      alert(`Successfully created order #${result.orderNumber} in Business Central!`);

    } catch (error) {
      console.error('Error exporting to ERP:', error);
      alert(`Failed to export to ERP: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setExportingOrder(null);
    }
  };

  const filteredOrders = emailOrders.filter(order => {
    const matchesSearch = order.subject.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         order.from_email.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'exported': return 'text-green-600 bg-green-100';
      case 'analyzed': return 'text-blue-600 bg-blue-100';
      case 'processing': return 'text-yellow-600 bg-yellow-100';
      case 'received': return 'text-gray-600 bg-gray-100';
      case 'failed': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'exported': return <CheckCircle className="w-4 h-4" />;
      case 'analyzed': return <Eye className="w-4 h-4" />;
      case 'processing': return <Clock className="w-4 h-4" />;
      case 'received': return <Mail className="w-4 h-4" />;
      case 'failed': return <AlertCircle className="w-4 h-4" />;
      default: return <Mail className="w-4 h-4" />;
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
      return <Image className="w-4 h-4 text-blue-500" />;
    } else if (mimeType.includes('pdf')) {
      return <FileText className="w-4 h-4 text-red-500" />;
    } else if (mimeType.includes('text/') || mimeType.includes('document')) {
      return <FileText className="w-4 h-4 text-green-500" />;
    } else {
      return <File className="w-4 h-4 text-gray-500" />;
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
          <span className="ml-3 text-gray-600">Loading email orders...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Email Orders</h2>
          <p className="text-gray-600">Orders extracted from Gmail and processed by Frootful</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Mail className="w-6 h-6 text-blue-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Total Emails</p>
              <p className="text-2xl font-bold text-gray-900">{emailOrders.length}</p>
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
                {emailOrders.filter(o => o.status === 'exported').length}
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
                {emailOrders.filter(o => ['received', 'processing', 'analyzed'].includes(o.status)).length}
              </p>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="p-2 bg-red-100 rounded-lg">
              <AlertCircle className="w-6 h-6 text-red-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Failed</p>
              <p className="text-2xl font-bold text-gray-900">
                {emailOrders.filter(o => o.status === 'failed').length}
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
                placeholder="Search by subject or sender..."
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
              <option value="processing">Processing</option>
              <option value="analyzed">Analyzed</option>
              <option value="exported">Exported</option>
              <option value="failed">Failed</option>
            </select>
          </div>
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Email
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  From
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Items Found
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Attachments
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredOrders.map((order) => (
                <tr key={order.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-gray-900 truncate max-w-xs">
                      {order.subject}
                    </div>
                    {order.erp_order_number && (
                      <div className="text-sm text-gray-500">
                        ERP: {order.erp_order_number}
                      </div>
                    )}
                  </td>
                  
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900 truncate max-w-xs">
                      {order.from_email}
                    </div>
                  </td>
                  
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      {getStatusIcon(order.status)}
                      <span className={`ml-2 inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(order.status)}`}>
                        {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                      </span>
                    </div>
                  </td>
                  
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {order.analysis_data?.analyzedItems?.length || 0} items
                    </div>
                  </td>
                  
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      {order.attachments && order.attachments.length > 0 ? (
                        <>
                          <Paperclip className="w-4 h-4 text-gray-400 mr-1" />
                          <span className="text-sm text-gray-900">{order.attachments.length}</span>
                        </>
                      ) : (
                        <span className="text-sm text-gray-400">None</span>
                      )}
                    </div>
                  </td>
                  
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatDate(order.created_at)}
                  </td>
                  
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => setSelectedOrder(order)}
                        className="text-indigo-600 hover:text-indigo-900"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      {order.erp_order_number && (
                        <button className="text-green-600 hover:text-green-900">
                          <ExternalLink className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {filteredOrders.length === 0 && (
          <div className="text-center py-12">
            <Mail className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No email orders found</h3>
            <p className="mt-1 text-sm text-gray-500">
              {searchTerm || statusFilter !== 'all'
                ? 'Try adjusting your search or filters.'
                : 'Email orders will appear here when you extract them from Gmail.'}
            </p>
          </div>
        )}
      </div>

      {/* Order Detail Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-11/12 md:w-3/4 lg:w-2/3 xl:w-1/2 shadow-lg rounded-md bg-white max-h-[80vh] overflow-y-auto">
            <div className="mt-3">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">
                  Email Order Details
                </h3>
                <button
                  onClick={() => setSelectedOrder(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <span className="sr-only">Close</span>
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              <div className="space-y-6">
                {/* Email Info */}
                <div>
                  <h4 className="text-sm font-medium text-gray-900 mb-3">Email Information</h4>
                  <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                    <div className="flex items-center">
                      <Mail className="w-4 h-4 text-gray-400 mr-2" />
                      <span className="text-sm font-medium">Subject:</span>
                      <span className="text-sm ml-2">{selectedOrder.subject}</span>
                    </div>
                    <div className="flex items-center">
                      <User className="w-4 h-4 text-gray-400 mr-2" />
                      <span className="text-sm font-medium">From:</span>
                      <span className="text-sm ml-2">{selectedOrder.from_email}</span>
                    </div>
                    <div className="flex items-center">
                      <Calendar className="w-4 h-4 text-gray-400 mr-2" />
                      <span className="text-sm font-medium">Date:</span>
                      <span className="text-sm ml-2">{formatDate(selectedOrder.created_at)}</span>
                    </div>
                    <div className="flex items-center">
                      {getStatusIcon(selectedOrder.status)}
                      <span className="text-sm font-medium ml-2">Status:</span>
                      <span className={`ml-2 inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(selectedOrder.status)}`}>
                        {selectedOrder.status.charAt(0).toUpperCase() + selectedOrder.status.slice(1)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Email Content */}
                <div>
                  <h4 className="text-sm font-medium text-gray-900 mb-3">Email Content</h4>
                  <div className="bg-gray-50 rounded-lg p-4 max-h-60 overflow-y-auto">
                    <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans">
                      {selectedOrder.email_content}
                    </pre>
                  </div>
                </div>

                {/* Attachments Section */}
                {selectedOrder.attachments && selectedOrder.attachments.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-900 mb-3">
                      Attachments ({selectedOrder.attachments.length})
                    </h4>
                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="space-y-3">
                        {selectedOrder.attachments.map((attachment, index) => (
                          <div key={index} className="flex items-center justify-between p-3 bg-white rounded-lg border">
                            <div className="flex items-center space-x-3">
                              {getAttachmentIcon(attachment.mimeType)}
                              <div>
                                <div className="text-sm font-medium text-gray-900">
                                  {attachment.filename}
                                </div>
                                <div className="text-xs text-gray-500">
                                  {attachment.mimeType} • {formatFileSize(attachment.size)}
                                  {attachment.hasContent && (
                                    <span className="ml-2 text-green-600">
                                      • Text extracted ({attachment.extractedTextLength} chars)
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center space-x-2">
                              {attachment.hasContent && (
                                <button
                                  onClick={() => {
                                    // Show extracted text in a modal or expand inline
                                    alert(`Extracted text from ${attachment.filename}:\n\n${attachment.content?.substring(0, 500)}...`);
                                  }}
                                  className="text-blue-600 hover:text-blue-800 text-xs"
                                  title="View extracted text"
                                >
                                  <FileText className="w-4 h-4" />
                                </button>
                              )}
                              <button
                                onClick={() => {
                                  // In a real implementation, you'd download the attachment
                                  alert('Download functionality would be implemented here');
                                }}
                                className="text-gray-600 hover:text-gray-800 text-xs"
                                title="Download attachment"
                              >
                                <Download className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Analysis Results */}
                {selectedOrder.analysis_data && (
                  <>
                    {/* Customer Match */}
                    {selectedOrder.analysis_data.matchingCustomer && (
                      <div>
                        <h4 className="text-sm font-medium text-gray-900 mb-3">Matched Customer</h4>
                        <div className="bg-green-50 rounded-lg p-4">
                          <div className="flex items-center">
                            <User className="w-4 h-4 text-green-600 mr-2" />
                            <span className="text-sm font-medium text-green-800">
                              {selectedOrder.analysis_data.matchingCustomer.displayName}
                            </span>
                            <span className="text-sm text-green-600 ml-2">
                              ({selectedOrder.analysis_data.matchingCustomer.number})
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Analyzed Items */}
                    {selectedOrder.analysis_data.analyzedItems && selectedOrder.analysis_data.analyzedItems.length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium text-gray-900 mb-3">
                          Analyzed Items ({selectedOrder.analysis_data.analyzedItems.length})
                        </h4>
                        <div className="bg-gray-50 rounded-lg p-4">
                          <div className="space-y-3">
                            {selectedOrder.analysis_data.analyzedItems.map((item, index) => (
                              <div key={index} className="flex justify-between items-center">
                                <div>
                                  <div className="text-sm font-medium text-gray-900">
                                    {item.matchedItem?.displayName || item.itemName}
                                  </div>
                                  {item.matchedItem && (
                                    <div className="text-xs text-gray-500">
                                      Item #: {item.matchedItem.number}
                                    </div>
                                  )}
                                </div>
                                <div className="text-right">
                                  <div className="text-sm font-medium text-gray-900">
                                    Qty: {item.quantity}
                                  </div>
                                  {item.matchedItem?.unitPrice && (
                                    <div className="text-xs text-gray-500">
                                      ${item.matchedItem.unitPrice}
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Delivery Date */}
                    {selectedOrder.analysis_data.requestedDeliveryDate && (
                      <div>
                        <h4 className="text-sm font-medium text-gray-900 mb-3">Requested Delivery Date</h4>
                        <div className="bg-blue-50 rounded-lg p-4">
                          <div className="flex items-center">
                            <Calendar className="w-4 h-4 text-blue-600 mr-2" />
                            <span className="text-sm text-blue-800">
                              {new Date(selectedOrder.analysis_data.requestedDeliveryDate).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* Actions */}
                <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
                  {selectedOrder.status === 'analyzed' && selectedOrder.analysis_data?.matchingCustomer && (
                    <button
                      onClick={() => exportToERP(selectedOrder)}
                      disabled={exportingOrder === selectedOrder.id}
                      className="flex items-center space-x-2 px-4 py-2 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      style={{ backgroundColor: '#53AD6D' }}
                      onMouseEnter={(e) => {
                        if (!e.currentTarget.disabled) {
                          e.currentTarget.style.backgroundColor = '#4a9c63';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!e.currentTarget.disabled) {
                          e.currentTarget.style.backgroundColor = '#53AD6D';
                        }
                      }}
                    >
                      {exportingOrder === selectedOrder.id ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Exporting...</span>
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4" />
                          <span>Export to ERP</span>
                        </>
                      )}
                    </button>
                  )}
                  
                  <button
                    onClick={() => setSelectedOrder(null)}
                    className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EmailOrdersSection;