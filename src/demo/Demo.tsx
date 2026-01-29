import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, FileText, Sparkles, Mail, MessageSquare, PenTool, BrainCircuit } from 'lucide-react';

// Order type tabs
type OrderType = 'email' | 'text' | 'edi' | 'handwritten';

const ORDER_TYPES: { id: OrderType; label: string; icon: React.ReactNode }[] = [
  { id: 'email', label: 'Email', icon: <Mail className="w-4 h-4" /> },
  { id: 'text', label: 'Text', icon: <MessageSquare className="w-4 h-4" /> },
  { id: 'edi', label: 'EDI', icon: <FileText className="w-4 h-4" /> },
  { id: 'handwritten', label: 'Handwritten', icon: <PenTool className="w-4 h-4" /> },
];

// EDI Order - Extracted data from the Publix Order 138734 PDF
const ediExtractedItems = [
  { product: "ORG GW Romaine Hearts 12oz", quantity: 56 },
  { product: "Swiss Chard Red", quantity: 42 },
  { product: "Organic Parsley Italian", quantity: 70 },
  { product: "Organic Kale Lacinato", quantity: 49 },
  { product: "Organic Kale Green", quantity: 28 },
  { product: "Organic Green Onions", quantity: 40 },
  { product: "Organic Dandelion Greens", quantity: 35 },
  { product: "Romaine", quantity: 49 },
  { product: "Escarole", quantity: 35 },
  { product: "Organic Cilantro", quantity: 120 },
  { product: "Radishes Bunched", quantity: 40 },
  { product: "Organic Chard Rainbow", quantity: 35 },
  { product: "Organic Beets Red", quantity: 49 },
  { product: "Lettuce Green Leaf", quantity: 98 },
  { product: "Beets", quantity: 56 },
];

const ediHeaderInfo = {
  customer: "Publix Super Markets, Inc.",
  poNumber: "G120419-01",
  shipDate: "10/30/2025",
  arrivalDate: "10/31/2025",
};

// Text Order - SMS flower order
const textExtractedItems = [
  { product: "Hydrangea", quantity: 1 },
  { product: "Alstro", quantity: 1 },
  { product: "Filler Mix", quantity: 1 },
  { product: "Rose", quantity: 1 },
  { product: "Orchid", quantity: 1 },
];

const textHeaderInfo = {
  customer: "SMS Customer",
  deliveryDate: "Tomorrow",
};

// Email Order - Floral email order
const emailExtractedItems = [
  { product: "Blue Delphinium", quantity: 6, unit: "bunches" },
  { product: "Italian Ruscus", quantity: 4, unit: "bunches" },
  { product: "17200 Square Vases", quantity: 2, unit: "cases" },
  { product: "Consumer Bags", quantity: 2, unit: "cases" },
  { product: "Bones Plant Food Little Packs", quantity: 2, unit: "boxes" },
];

const emailHeaderInfo = {
  customer: "Carmen Ines Llaury Noblecilla",
  email: "carmen.ll@hotmail.com",
  deliveryDate: "Tomorrow (Oct 23, 2025)",
  salesperson: "Cindi Suplee",
};

// Handwritten Order - Asian vegetable wholesale order sheet
const handwrittenExtractedItems = [
  { product: "AA Choy, Mx #1", quantity: 30 },
  { product: "Baby Bok Choy, Ca #1", quantity: 30 },
  { product: "Big Green Onion 24B Mx", quantity: 1 },
  { product: "Chi. Celery-Green, Ca", quantity: 30 },
  { product: "Garlic Stem #1 New", quantity: 22 },
  { product: "Gai Lan Mx #1", quantity: 25 },
  { product: "Gai Lan Ca #1", quantity: 4 },
  { product: "Taiwan Spinach, Mx #1", quantity: 5 },
  { product: "Taiwan Spinach, Ca", quantity: 10 },
  { product: "Yam Leaf, Ca #1", quantity: 10 },
  { product: "Thai Basil, #1 Mx", quantity: 1 },
  { product: "Dan Ca, # 60", quantity: 1 },
  { product: "Neo Gai", quantity: 3 },
];

const handwrittenHeaderInfo = {
  vendor: "AC215 Wholesale",
  orderType: "Vegetables 亞洲蔬菜",
};

// Brand color
const BRAND_GREEN = '#53AD6D';

const Demo: React.FC = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedOrderType, setSelectedOrderType] = useState<OrderType>('edi');

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        const fileData = {
          url: reader.result as string,
          name: file.name,
          type: file.type,
        };
        sessionStorage.setItem('demoUploadedFile', JSON.stringify(fileData));
        // Navigate immediately to playground where processing animation will show
        navigate('/demo/playground');
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="bg-white border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center space-x-3">
              <h1 className="text-2xl font-bold" style={{ color: BRAND_GREEN }}>
                Frootful
              </h1>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center mb-8">
          <div className="inline-flex items-center space-x-2 px-4 py-2 rounded-full border mb-6" style={{ backgroundColor: 'rgba(83, 173, 109, 0.08)', borderColor: 'rgba(83, 173, 109, 0.2)' }}>
            <Sparkles className="w-4 h-4" style={{ color: BRAND_GREEN }} />
            <span className="text-sm font-medium" style={{ color: BRAND_GREEN }}>AI-Powered Extraction</span>
          </div>
          <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
            Order Extraction
          </h2>
          <p className="text-xl text-gray-500 max-w-2xl mx-auto">
            See how Frootful extracts customer info, delivery dates, and line items from any order document in seconds.
          </p>
        </div>

        {/* Order Type Selector */}
        <div className="flex justify-center mb-8">
          <div className="inline-flex bg-gray-100 rounded-xl p-1">
            {ORDER_TYPES.map((type) => (
              <button
                key={type.id}
                onClick={() => setSelectedOrderType(type.id)}
                className={`flex items-center space-x-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  selectedOrderType === type.id
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {type.icon}
                <span>{type.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Sample Demo Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
          {/* Source Document */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center space-x-2">
              {selectedOrderType === 'edi' && <FileText className="w-5 h-5 text-red-500" />}
              {selectedOrderType === 'email' && <Mail className="w-5 h-5" style={{ color: BRAND_GREEN }} />}
              {selectedOrderType === 'text' && <MessageSquare className="w-5 h-5" style={{ color: BRAND_GREEN }} />}
              {selectedOrderType === 'handwritten' && <PenTool className="w-5 h-5" style={{ color: BRAND_GREEN }} />}
              <h3 className="text-lg font-semibold text-gray-900">
                {selectedOrderType === 'edi' && 'Sample EDI Order'}
                {selectedOrderType === 'email' && 'Sample Email Order'}
                {selectedOrderType === 'text' && 'Sample Text Order'}
                {selectedOrderType === 'handwritten' && 'Sample Handwritten Order'}
              </h3>
            </div>
            <div className={`p-4 bg-gray-50 overflow-auto ${selectedOrderType === 'email' ? 'h-auto' : 'h-[700px]'}`}>
              {selectedOrderType === 'edi' && (
                <iframe
                  src="/sample-order.pdf"
                  className="w-full h-full rounded-lg bg-white"
                  title="Sample Order PDF"
                />
              )}
              {selectedOrderType === 'text' && (
                <div className="flex items-center justify-center h-full">
                  <img
                    src="/sample-text-order.jpg"
                    alt="Text message order"
                    className="max-h-full max-w-full object-contain rounded-lg shadow"
                  />
                </div>
              )}
              {selectedOrderType === 'email' && (
                <div className="flex items-center justify-center h-full">
                  <img
                    src="/sample-email-order.png"
                    alt="Email order"
                    className="w-full h-auto object-contain rounded-lg shadow"
                  />
                </div>
              )}
              {selectedOrderType === 'handwritten' && (
                <div className="flex items-center justify-center h-full">
                  <img
                    src="/sample-handwritten-order.jpg"
                    alt="Handwritten order sheet"
                    className="max-h-full max-w-full object-contain rounded-lg shadow"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Extracted Data */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center space-x-2">
              <BrainCircuit className="w-5 h-5" style={{ color: BRAND_GREEN }} />
              <h3 className="text-lg font-semibold text-gray-900">Frootful AI</h3>
            </div>
            <div className={`p-6 overflow-y-auto ${selectedOrderType === 'email' ? 'h-auto' : 'h-[700px]'}`}>
              {/* Header Info - EDI */}
              {selectedOrderType === 'edi' && (
                <div className="mb-6 p-4 rounded-xl border border-gray-100" style={{ backgroundColor: 'rgba(83, 173, 109, 0.04)' }}>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-400">Customer</span>
                      <p className="text-gray-900 font-medium">{ediHeaderInfo.customer}</p>
                    </div>
                    <div>
                      <span className="text-gray-400">PO Number</span>
                      <p className="text-gray-900 font-medium">{ediHeaderInfo.poNumber}</p>
                    </div>
                    <div>
                      <span className="text-gray-400">Ship Date</span>
                      <p className="text-gray-900 font-medium">{ediHeaderInfo.shipDate}</p>
                    </div>
                    <div>
                      <span className="text-gray-400">Arrival Date</span>
                      <p className="text-gray-900 font-medium">{ediHeaderInfo.arrivalDate}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Header Info - Text */}
              {selectedOrderType === 'text' && (
                <div className="mb-6 p-4 rounded-xl border border-gray-100" style={{ backgroundColor: 'rgba(83, 173, 109, 0.04)' }}>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-400">Customer</span>
                      <p className="text-gray-900 font-medium">{textHeaderInfo.customer}</p>
                    </div>
                    <div>
                      <span className="text-gray-400">Delivery Date</span>
                      <p className="text-gray-900 font-medium">{textHeaderInfo.deliveryDate}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Header Info - Email */}
              {selectedOrderType === 'email' && (
                <div className="mb-6 p-4 rounded-xl border border-gray-100" style={{ backgroundColor: 'rgba(83, 173, 109, 0.04)' }}>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-400">Customer</span>
                      <p className="text-gray-900 font-medium">{emailHeaderInfo.customer}</p>
                    </div>
                    <div>
                      <span className="text-gray-400">Email</span>
                      <p className="text-gray-900 font-medium">{emailHeaderInfo.email}</p>
                    </div>
                    <div>
                      <span className="text-gray-400">Delivery Date</span>
                      <p className="text-gray-900 font-medium">{emailHeaderInfo.deliveryDate}</p>
                    </div>
                    <div>
                      <span className="text-gray-400">Salesperson</span>
                      <p className="text-gray-900 font-medium">{emailHeaderInfo.salesperson}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Header Info - Handwritten */}
              {selectedOrderType === 'handwritten' && (
                <div className="mb-6 p-4 rounded-xl border border-gray-100" style={{ backgroundColor: 'rgba(83, 173, 109, 0.04)' }}>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-400">Vendor</span>
                      <p className="text-gray-900 font-medium">{handwrittenHeaderInfo.vendor}</p>
                    </div>
                    <div>
                      <span className="text-gray-400">Order Type</span>
                      <p className="text-gray-900 font-medium">{handwrittenHeaderInfo.orderType}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Items Table */}
              <div className="overflow-hidden rounded-xl border border-gray-200">
                <table className="w-full">
                  <thead style={{ backgroundColor: 'rgba(83, 173, 109, 0.06)' }}>
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Product
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Qty
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {selectedOrderType === 'edi' && ediExtractedItems.map((item, index) => (
                      <tr key={index} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 text-sm text-gray-700">{item.product}</td>
                        <td className="px-4 py-3 text-sm text-gray-700 text-right font-medium">
                          {item.quantity}
                        </td>
                      </tr>
                    ))}
                    {selectedOrderType === 'text' && textExtractedItems.map((item, index) => (
                      <tr key={index} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 text-sm text-gray-700">{item.product}</td>
                        <td className="px-4 py-3 text-sm text-gray-700 text-right font-medium">
                          {item.quantity}
                        </td>
                      </tr>
                    ))}
                    {selectedOrderType === 'email' && emailExtractedItems.map((item, index) => (
                      <tr key={index} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 text-sm text-gray-700">{item.product}</td>
                        <td className="px-4 py-3 text-sm text-gray-700 text-right font-medium">
                          {item.quantity} {item.unit}
                        </td>
                      </tr>
                    ))}
                    {selectedOrderType === 'handwritten' && handwrittenExtractedItems.map((item, index) => (
                      <tr key={index} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 text-sm text-gray-700">{item.product}</td>
                        <td className="px-4 py-3 text-sm text-gray-700 text-right font-medium">
                          {item.quantity}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 text-center">
                <span className="text-xs text-gray-400">
                  {selectedOrderType === 'edi' && `${ediExtractedItems.length} items extracted`}
                  {selectedOrderType === 'text' && `${textExtractedItems.length} items extracted`}
                  {selectedOrderType === 'email' && `${emailExtractedItems.length} items extracted`}
                  {selectedOrderType === 'handwritten' && `${handwrittenExtractedItems.length} items extracted`}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Upload CTA */}
        <div className="max-w-2xl mx-auto">
          <div
            className="relative bg-white rounded-2xl border-2 border-dashed border-gray-200 hover:border-green-400 transition-colors cursor-pointer p-8"
            onClick={handleUploadClick}
          >
            <div className="flex flex-col items-center justify-center py-4">
              <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: 'rgba(83, 173, 109, 0.1)' }}>
                <Upload className="w-8 h-8" style={{ color: BRAND_GREEN }} />
              </div>
              <p className="text-gray-900 text-lg font-medium mb-2">Try with your own order</p>
              <p className="text-gray-400 text-sm text-center">
                Drop an order document here, or click to browse
                <br />
                <span className="text-xs">Supports PDF, PNG, JPG</span>
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.pdf"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-100 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="text-center text-sm text-gray-400">
            <p>&copy; {new Date().getFullYear()} Frootful. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Demo;
