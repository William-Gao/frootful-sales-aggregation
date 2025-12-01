import React, { useState } from 'react';
import { CheckCircle, XCircle, AlertCircle, Minus, Plus, LayoutGrid, Columns } from 'lucide-react';

interface OrderItem {
  name: string;
  quantity: number;
  price: number;
  description?: string;
}

interface OrderSnapshot {
  customer_name: string;
  customer_email: string;
  customer_phone?: string;
  items: OrderItem[];
  total_amount: number;
  requested_delivery_date?: string;
}

interface OrderDiff {
  id: string;
  orderNumber: string;
  before: OrderSnapshot;
  after: OrderSnapshot;
  timestamp: string;
}

type ViewMode = 'side-by-side' | 'unified';

const DiffPreviewSection: React.FC = () => {
  const [selectedDiff, setSelectedDiff] = useState<OrderDiff | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('side-by-side');

  // Dummy data with before/after snapshots
  const dummyDiffs: OrderDiff[] = [
    {
      id: 'diff-1',
      orderNumber: 'EDI-001',
      timestamp: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      before: {
        customer_name: 'Publix Super Markets',
        customer_email: 'buyer@publix.com',
        customer_phone: '(555) 123-4567',
        requested_delivery_date: '2025-11-05',
        items: [
          { name: 'LETTUCE - ROMAINE HEARTS - 12 COUNT', quantity: 56, price: 55.95, description: '0950322' },
          { name: 'SWISS CHARD RED - 12 COUNT', quantity: 42, price: 18.00, description: '0025275' },
          { name: 'KALE BLACK - 12 COUNT', quantity: 49, price: 15.95, description: '0024447' },
        ],
        total_amount: 17958.85
      },
      after: {
        customer_name: 'Publix Super Markets, Inc.',
        customer_email: 'procurement@publix.com',
        customer_phone: '(555) 123-4567',
        requested_delivery_date: '2025-11-05',
        items: [
          { name: 'LETTUCE - ROMAINE HEARTS - 12 COUNT', quantity: 56, price: 55.95, description: '0950322' },
          { name: 'SWISS CHARD RED - 12 COUNT', quantity: 42, price: 18.00, description: '0025275' },
          { name: 'KALE BLACK - 12 COUNT', quantity: 49, price: 15.95, description: '0024447' },
        ],
        total_amount: 17958.85
      }
    },
    {
      id: 'diff-2',
      orderNumber: 'EDI-002',
      timestamp: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      before: {
        customer_name: 'Harris Teeter',
        customer_email: 'buyer@harristeeter.com',
        requested_delivery_date: '2025-11-08',
        items: [
          { name: 'LETTUCE - GREEN LEAF - 18 COUNT', quantity: 120, price: 30.95, description: '68843' },
          { name: 'LETTUCE - RED LEAF - 18 COUNT', quantity: 108, price: 30.95, description: '68844' },
          { name: 'RADISH - 12 COUNT', quantity: 110, price: 21.00, description: '88820' },
        ],
        total_amount: 11225.60
      },
      after: {
        customer_name: 'Harris Teeter',
        customer_email: 'buyer@harristeeter.com',
        requested_delivery_date: '2025-11-08',
        items: [
          { name: 'LETTUCE - GREEN LEAF - 18 COUNT', quantity: 150, price: 30.95, description: '68843' },
          { name: 'LETTUCE - RED LEAF - 18 COUNT', quantity: 108, price: 30.95, description: '68844' },
          { name: 'SPINACH - 24 COUNT', quantity: 40, price: 31.95, description: '88719' },
        ],
        total_amount: 12266.10
      }
    },
    {
      id: 'diff-3',
      orderNumber: 'EMAIL-001',
      timestamp: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      before: {
        customer_name: 'Whole Foods Market',
        customer_email: 'orders@wholefoods.com',
        customer_phone: '(555) 123-4567',
        requested_delivery_date: '2025-11-05',
        items: [
          { name: 'ORGANIC KALE - 12 COUNT', quantity: 175, price: 3.75 },
          { name: 'RAINBOW CHARD - 12 COUNT', quantity: 125, price: 4.50 },
        ],
        total_amount: 1218.75
      },
      after: {
        customer_name: 'Whole Foods Market',
        customer_email: 'orders@wholefoods.com',
        customer_phone: '(555) 987-6543',
        requested_delivery_date: '2025-11-08',
        items: [
          { name: 'ORGANIC KALE - 12 COUNT', quantity: 175, price: 3.75 },
          { name: 'RAINBOW CHARD - 12 COUNT', quantity: 125, price: 4.50 },
        ],
        total_amount: 1218.75
      }
    }
  ];

  const renderDiffLine = (label: string, before: string, after: string, changed: boolean) => {
    return (
      <div className="grid grid-cols-2 border-b border-gray-200">
        {/* Before (Left) */}
        <div className={`p-3 ${changed ? 'bg-red-50' : 'bg-gray-50'} border-r border-gray-200`}>
          <div className="text-xs text-gray-500 mb-1 font-medium">{label}</div>
          <div className={`text-sm ${changed ? 'text-red-900' : 'text-gray-700'} flex items-start`}>
            {changed && <Minus className="w-4 h-4 mr-2 flex-shrink-0 text-red-600 mt-0.5" />}
            <span className={changed ? 'line-through' : ''}>{before || 'N/A'}</span>
          </div>
        </div>

        {/* After (Right) */}
        <div className={`p-3 ${changed ? 'bg-green-50' : 'bg-gray-50'}`}>
          <div className="text-xs text-gray-500 mb-1 font-medium">{label}</div>
          <div className={`text-sm ${changed ? 'text-green-900 font-medium' : 'text-gray-700'} flex items-start`}>
            {changed && <Plus className="w-4 h-4 mr-2 flex-shrink-0 text-green-600 mt-0.5" />}
            <span>{after || 'N/A'}</span>
          </div>
        </div>
      </div>
    );
  };

  const renderItemsDiff = (beforeItems: OrderItem[], afterItems: OrderItem[]) => {
    const beforeMap = new Map(beforeItems.map(item => [item.name, item]));
    const afterMap = new Map(afterItems.map(item => [item.name, item]));
    const allItemNames = new Set([...beforeMap.keys(), ...afterMap.keys()]);

    return (
      <div className="border-b border-gray-200">
        {/* Header */}
        <div className="grid grid-cols-2 bg-gray-100 border-b border-gray-200">
          <div className="p-3 border-r border-gray-200">
            <div className="text-xs font-semibold text-gray-600">BEFORE - Items ({beforeItems.length})</div>
          </div>
          <div className="p-3">
            <div className="text-xs font-semibold text-gray-600">AFTER - Items ({afterItems.length})</div>
          </div>
        </div>

        {/* Items */}
        {Array.from(allItemNames).map((itemName, idx) => {
          const beforeItem = beforeMap.get(itemName);
          const afterItem = afterMap.get(itemName);
          const isRemoved = beforeItem && !afterItem;
          const isAdded = !beforeItem && afterItem;
          const isModified = beforeItem && afterItem && (
            beforeItem.quantity !== afterItem.quantity || beforeItem.price !== afterItem.price
          );

          return (
            <div key={idx} className="grid grid-cols-2 border-b border-gray-200 last:border-b-0">
              {/* Before */}
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

              {/* After */}
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

  const handleApprove = (diff: OrderDiff) => {
    alert(`Approved changes for ${diff.orderNumber}!\n\nChanges will be applied to the order.`);
  };

  const handleReject = (diff: OrderDiff) => {
    alert(`Rejected changes for ${diff.orderNumber}.\n\nOrder will remain unchanged.`);
  };

  const countChanges = (diff: OrderDiff) => {
    let changes = 0;
    if (diff.before.customer_name !== diff.after.customer_name) changes++;
    if (diff.before.customer_email !== diff.after.customer_email) changes++;
    if (diff.before.customer_phone !== diff.after.customer_phone) changes++;
    if (diff.before.requested_delivery_date !== diff.after.requested_delivery_date) changes++;

    const beforeItems = new Set(diff.before.items.map(i => `${i.name}-${i.quantity}`));
    const afterItems = new Set(diff.after.items.map(i => `${i.name}-${i.quantity}`));
    if (beforeItems.size !== afterItems.size ||
        !Array.from(beforeItems).every(item => afterItems.has(item))) {
      changes++;
    }

    return changes;
  };

  const renderUnifiedView = (diff: OrderDiff) => {
    const beforeMap = new Map(diff.before.items.map(item => [item.name, item]));
    const afterMap = new Map(diff.after.items.map(item => [item.name, item]));

    const removedItems = diff.before.items.filter(item => !afterMap.has(item.name));
    const addedItems = diff.after.items.filter(item => !beforeMap.has(item.name));
    const modifiedItems = diff.before.items.filter(item => {
      const afterItem = afterMap.get(item.name);
      return afterItem && (afterItem.quantity !== item.quantity || afterItem.price !== item.price);
    }).map(item => ({ before: item, after: afterMap.get(item.name)! }));

    const modifiedFields: Array<{ label: string; before: string; after: string }> = [];
    if (diff.before.customer_name !== diff.after.customer_name) {
      modifiedFields.push({ label: 'Customer Name', before: diff.before.customer_name, after: diff.after.customer_name });
    }
    if (diff.before.customer_email !== diff.after.customer_email) {
      modifiedFields.push({ label: 'Email', before: diff.before.customer_email, after: diff.after.customer_email });
    }
    if (diff.before.customer_phone !== diff.after.customer_phone) {
      modifiedFields.push({ label: 'Phone', before: diff.before.customer_phone || 'N/A', after: diff.after.customer_phone || 'N/A' });
    }
    if (diff.before.requested_delivery_date !== diff.after.requested_delivery_date) {
      modifiedFields.push({ label: 'Delivery Date', before: diff.before.requested_delivery_date || 'N/A', after: diff.after.requested_delivery_date || 'N/A' });
    }

    return (
      <div className="space-y-6">
        {/* Removed Section */}
        {(removedItems.length > 0) && (
          <div className="bg-red-50 rounded-lg border border-red-200 overflow-hidden">
            <div className="bg-red-100 px-4 py-3 border-b border-red-200">
              <div className="flex items-center space-x-2">
                <Minus className="w-5 h-5 text-red-700" />
                <h4 className="font-semibold text-red-900">Removed ({removedItems.length})</h4>
              </div>
            </div>
            <div className="p-4 space-y-3">
              {removedItems.map((item, idx) => (
                <div key={idx} className="bg-white rounded-lg border border-red-200 p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="font-medium text-red-900">{item.name}</div>
                      {item.description && (
                        <div className="text-xs text-red-600 mt-0.5">SKU: {item.description}</div>
                      )}
                    </div>
                    <div className="text-lg font-semibold text-red-700 ml-4">
                      {item.quantity}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Added Section */}
        {(addedItems.length > 0) && (
          <div className="bg-green-50 rounded-lg border border-green-200 overflow-hidden">
            <div className="bg-green-100 px-4 py-3 border-b border-green-200">
              <div className="flex items-center space-x-2">
                <Plus className="w-5 h-5 text-green-700" />
                <h4 className="font-semibold text-green-900">Added ({addedItems.length})</h4>
              </div>
            </div>
            <div className="p-4 space-y-3">
              {addedItems.map((item, idx) => (
                <div key={idx} className="bg-white rounded-lg border border-green-200 p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="font-medium text-green-900">{item.name}</div>
                      {item.description && (
                        <div className="text-xs text-green-600 mt-0.5">SKU: {item.description}</div>
                      )}
                    </div>
                    <div className="text-lg font-semibold text-green-700 ml-4">
                      {item.quantity}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Modified Section */}
        {(modifiedItems.length > 0 || modifiedFields.length > 0) && (
          <div className="bg-yellow-50 rounded-lg border border-yellow-200 overflow-hidden">
            <div className="bg-yellow-100 px-4 py-3 border-b border-yellow-200">
              <div className="flex items-center space-x-2">
                <AlertCircle className="w-5 h-5 text-yellow-700" />
                <h4 className="font-semibold text-yellow-900">
                  Modified ({modifiedItems.length + modifiedFields.length})
                </h4>
              </div>
            </div>
            <div className="p-4 space-y-3">
              {/* Modified Fields */}
              {modifiedFields.map((field, idx) => (
                <div key={`field-${idx}`} className="bg-white rounded-lg border border-yellow-200 p-3">
                  <div className="font-medium text-yellow-900 mb-2">{field.label}</div>
                  <div className="flex items-center space-x-3 text-sm">
                    <div className="flex-1">
                      <div className="text-xs text-gray-500 mb-1">Before</div>
                      <div className="text-gray-700">{field.before}</div>
                    </div>
                    <div className="text-gray-400">→</div>
                    <div className="flex-1">
                      <div className="text-xs text-gray-500 mb-1">After</div>
                      <div className="text-green-700 font-medium">{field.after}</div>
                    </div>
                  </div>
                </div>
              ))}

              {/* Modified Items */}
              {modifiedItems.map((item, idx) => (
                <div key={`item-${idx}`} className="bg-white rounded-lg border border-yellow-200 p-3">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex-1">
                      <div className="font-medium text-yellow-900">{item.before.name}</div>
                      {item.before.description && (
                        <div className="text-xs text-gray-500 mt-0.5">SKU: {item.before.description}</div>
                      )}
                    </div>
                  </div>
                  {item.before.quantity !== item.after.quantity && (
                    <div className="flex items-center justify-between bg-yellow-50 rounded p-2">
                      <span className="text-sm text-gray-600">Quantity:</span>
                      <div className="flex items-center space-x-2">
                        <span className="text-lg font-semibold text-gray-600">{item.before.quantity}</span>
                        <span className="text-gray-400">→</span>
                        <span className="text-lg font-semibold text-green-700">{item.after.quantity}</span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Order Changes Review</h2>
          <p className="text-gray-600">Review proposed changes before applying</p>
        </div>

        {/* View Mode Toggle */}
        {selectedDiff && (
          <div className="flex bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setViewMode('side-by-side')}
              className={`flex items-center space-x-2 px-4 py-2 rounded-md transition-colors ${
                viewMode === 'side-by-side'
                  ? 'bg-white shadow-sm text-gray-900'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Columns className="w-4 h-4" />
              <span className="text-sm font-medium">Side-by-Side</span>
            </button>
            <button
              onClick={() => setViewMode('unified')}
              className={`flex items-center space-x-2 px-4 py-2 rounded-md transition-colors ${
                viewMode === 'unified'
                  ? 'bg-white shadow-sm text-gray-900'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
              <span className="text-sm font-medium">Unified</span>
            </button>
          </div>
        )}
      </div>

      {/* Pending Changes List */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: List of pending changes */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">Pending Changes ({dummyDiffs.length})</h3>

          {dummyDiffs.map((diff) => (
            <div
              key={diff.id}
              onClick={() => setSelectedDiff(diff)}
              className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                selectedDiff?.id === diff.id
                  ? 'border-indigo-500 bg-indigo-50'
                  : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-md'
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="font-medium text-gray-900">{diff.orderNumber}</div>
                  <div className="text-sm text-gray-600">{diff.before.customer_name}</div>
                </div>
                <span className="px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 rounded">
                  {countChanges(diff)} {countChanges(diff) === 1 ? 'change' : 'changes'}
                </span>
              </div>
              <div className="text-xs text-gray-500">
                {new Date(diff.timestamp).toLocaleString()}
              </div>
            </div>
          ))}
        </div>

        {/* Right: Git-style diff view */}
        <div className="lg:col-span-2">
          {selectedDiff ? (
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
              {/* Header */}
              <div className="p-6 border-b border-gray-200 bg-gray-50">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Diff: {selectedDiff.orderNumber}
                </h3>
                <div className="text-sm text-gray-600">
                  {new Date(selectedDiff.timestamp).toLocaleString()}
                </div>
              </div>

              {/* Diff Content - Conditional Rendering */}
              {viewMode === 'side-by-side' ? (
                <>
                  {/* Column Headers */}
                  <div className="grid grid-cols-2 bg-gray-100 border-b-2 border-gray-300">
                    <div className="p-3 border-r border-gray-300">
                      <div className="flex items-center space-x-2">
                        <Minus className="w-4 h-4 text-red-600" />
                        <span className="text-sm font-semibold text-gray-700">BEFORE</span>
                      </div>
                    </div>
                    <div className="p-3">
                      <div className="flex items-center space-x-2">
                        <Plus className="w-4 h-4 text-green-600" />
                        <span className="text-sm font-semibold text-gray-700">AFTER</span>
                      </div>
                    </div>
                  </div>

                  {/* Side-by-Side Diff Content */}
                  <div className="max-h-[600px] overflow-y-auto">
                    {/* Customer Info */}
                    {renderDiffLine(
                      'Customer Name',
                      selectedDiff.before.customer_name,
                      selectedDiff.after.customer_name,
                      selectedDiff.before.customer_name !== selectedDiff.after.customer_name
                    )}
                    {renderDiffLine(
                      'Email',
                      selectedDiff.before.customer_email,
                      selectedDiff.after.customer_email,
                      selectedDiff.before.customer_email !== selectedDiff.after.customer_email
                    )}
                    {renderDiffLine(
                      'Phone',
                      selectedDiff.before.customer_phone || '',
                      selectedDiff.after.customer_phone || '',
                      selectedDiff.before.customer_phone !== selectedDiff.after.customer_phone
                    )}
                    {renderDiffLine(
                      'Delivery Date',
                      selectedDiff.before.requested_delivery_date || '',
                      selectedDiff.after.requested_delivery_date || '',
                      selectedDiff.before.requested_delivery_date !== selectedDiff.after.requested_delivery_date
                    )}

                    {/* Items */}
                    {renderItemsDiff(selectedDiff.before.items, selectedDiff.after.items)}
                  </div>
                </>
              ) : (
                /* Unified View Content */
                <div className="p-6 max-h-[600px] overflow-y-auto">
                  {renderUnifiedView(selectedDiff)}
                </div>
              )}

              {/* Action Buttons */}
              <div className="p-6 border-t border-gray-200 flex space-x-3 bg-gray-50">
                <button
                  onClick={() => handleReject(selectedDiff)}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium flex items-center justify-center space-x-2"
                >
                  <XCircle className="w-4 h-4" />
                  <span>Reject Changes</span>
                </button>
                <button
                  onClick={() => handleApprove(selectedDiff)}
                  className="flex-1 px-4 py-2 text-white rounded-lg transition-colors font-medium flex items-center justify-center space-x-2"
                  style={{ backgroundColor: '#53AD6D' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#4a9c63';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#53AD6D';
                  }}
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>Approve & Apply</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-12 text-center">
              <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">Select a change from the list to see the diff</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DiffPreviewSection;
