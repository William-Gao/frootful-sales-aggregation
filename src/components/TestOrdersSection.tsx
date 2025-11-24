import React, { useState } from 'react';
import { Package, Calendar, User, Mail, Phone, MapPin, CheckCircle, AlertCircle, Search, Filter, Eye, X, Network, Copy, FileText, Image as ImageIcon, File as FileIcon, Download, Minus, Plus, LayoutGrid, Columns, Paperclip } from 'lucide-react';
import PDFViewerWithAnnotations from './PDFViewerWithAnnotations';

interface OrderItem {
  name: string;
  quantity: number;
  price: number;
  description?: string;
}

interface Attachment {
  filename: string;
  mimeType: string;
  size: number;
  attachmentId: string;
  hasContent: boolean;
  extractedTextLength: number;
  hasExtractedText?: boolean;
  extractedText?: string;
  storageUrl?: string;
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
  customers: any[];
  items: any[];
  matchingCustomer?: {
    id: string;
    number: string;
    displayName: string;
    email: string;
  };
  analyzedItems?: AnalyzedItem[];
  requestedDeliveryDate?: string;
}

interface Order {
  id: string;
  order_number: string;
  customer_name: string;
  customer_email: string;
  customer_phone?: string;
  items: OrderItem[];
  total_amount?: number;
  status: 'received' | 'processing' | 'analyzed' | 'exported' | 'failed' | 'pending' | 'completed' | 'cancelled' | 'needs_review';
  source: 'edi';
  original_content: string;
  requested_delivery_date?: string;
  created_at: string;
  erp_order_number?: string;
  analysis_data?: AnalysisData;
  attachments?: Attachment[];
  trading_partner?: string;
  hasPendingChanges?: boolean;
  pendingVersion?: Order;
  changeRequestEmail?: {
    from: string;
    subject: string;
    receivedAt: string;
  };
}

type ViewMode = 'current' | 'diff-side-by-side' | 'diff-unified';

const TestOrdersSection: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('current');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Dummy EDI orders with pending changes
  React.useEffect(() => {
    const dummyOrders: Order[] = [
      {
        id: 'edi-test-1',
        order_number: 'EDI-001',
        customer_name: 'Publix Super Markets, Inc.',
        customer_email: 'buyer@publix.com',
        customer_phone: '(555) 123-4567',
        requested_delivery_date: '2025-11-05',
        items: [
          { name: 'LETTUCE - ROMAINE HEARTS - 12 COUNT', quantity: 56, price: 55.95, description: '0950322' },
          { name: 'SWISS CHARD RED - 12 COUNT', quantity: 42, price: 18.00, description: '0025275' },
          { name: 'KALE BLACK - 12 COUNT', quantity: 49, price: 15.95, description: '0024447' },
        ],
        total_amount: 17958.85,
        status: 'needs_review',
        source: 'edi',
        trading_partner: 'iTradeNetwork',
        original_content: 'EDI X12 850 Purchase Order...',
        created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        erp_order_number: 'SO-2025-1145',
        analysis_data: {
          customers: [],
          items: [],
          matchingCustomer: {
            id: 'publix-001',
            number: 'CUST-10001',
            displayName: 'Publix Super Markets, Inc.',
            email: 'buyer@publix.com',
          },
          analyzedItems: [
            { itemName: 'LETTUCE - ROMAINE HEARTS - 12 COUNT', quantity: 56, matchedItem: { id: '0950322', number: '0950322', displayName: 'LETTUCE - ROMAINE HEARTS - 12 COUNT', unitPrice: 55.95 } },
            { itemName: 'SWISS CHARD RED - 12 COUNT', quantity: 42, matchedItem: { id: '0025275', number: '0025275', displayName: 'SWISS CHARD RED - 12 COUNT', unitPrice: 18.00 } },
            { itemName: 'KALE BLACK - 12 COUNT', quantity: 49, matchedItem: { id: '0024447', number: '0024447', displayName: 'KALE BLACK - 12 COUNT', unitPrice: 15.95 } },
          ],
        },
        hasPendingChanges: true,
        changeRequestEmail: {
          from: 'procurement@publix.com',
          subject: 'RE: Updated contact email for orders',
          receivedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
        },
        pendingVersion: {
          id: 'edi-test-1-pending',
          order_number: 'EDI-001',
          customer_name: 'Publix Super Markets, Inc.',
          customer_email: 'procurement@publix.com',
          customer_phone: '(555) 123-4567',
          requested_delivery_date: '2025-11-05',
          items: [
            { name: 'LETTUCE - ROMAINE HEARTS - 12 COUNT', quantity: 56, price: 55.95, description: '0950322' },
            { name: 'SWISS CHARD RED - 12 COUNT', quantity: 42, price: 18.00, description: '0025275' },
            { name: 'KALE BLACK - 12 COUNT', quantity: 49, price: 15.95, description: '0024447' },
          ],
          total_amount: 17958.85,
          status: 'analyzed',
          source: 'edi',
          trading_partner: 'iTradeNetwork',
          original_content: 'EDI X12 850 Purchase Order...',
          created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        }
      },
      {
        id: 'edi-test-2',
        order_number: 'EDI-002',
        customer_name: 'Harris Teeter',
        customer_email: 'buyer@harristeeter.com',
        requested_delivery_date: '2025-11-08',
        items: [
          { name: 'LETTUCE - GREEN LEAF - 18 COUNT', quantity: 120, price: 30.95, description: '68843' },
          { name: 'LETTUCE - RED LEAF - 18 COUNT', quantity: 108, price: 30.95, description: '68844' },
          { name: 'RADISH - 12 COUNT', quantity: 110, price: 21.00, description: '88820' },
        ],
        total_amount: 11225.60,
        status: 'needs_review',
        source: 'edi',
        trading_partner: 'SPS Commerce',
        original_content: 'EDI X12 850 Purchase Order...',
        created_at: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
        erp_order_number: 'SO-2025-1142',
        analysis_data: {
          customers: [],
          items: [],
          matchingCustomer: {
            id: 'harris-teeter-001',
            number: 'CUST-10002',
            displayName: 'Harris Teeter',
            email: 'buyer@harristeeter.com',
          },
        },
        hasPendingChanges: true,
        changeRequestEmail: {
          from: 'orders@harristeeter.com',
          subject: 'Order Update - Add Spinach, Increase Lettuce Qty',
          receivedAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
        },
        pendingVersion: {
          id: 'edi-test-2-pending',
          order_number: 'EDI-002',
          customer_name: 'Harris Teeter',
          customer_email: 'buyer@harristeeter.com',
          requested_delivery_date: '2025-11-08',
          items: [
            { name: 'LETTUCE - GREEN LEAF - 18 COUNT', quantity: 150, price: 30.95, description: '68843' },
            { name: 'LETTUCE - RED LEAF - 18 COUNT', quantity: 108, price: 30.95, description: '68844' },
            { name: 'SPINACH - 24 COUNT', quantity: 40, price: 31.95, description: '88719' },
          ],
          total_amount: 12266.10,
          status: 'analyzed',
          source: 'edi',
          trading_partner: 'SPS Commerce',
          original_content: 'EDI X12 850 Purchase Order...',
          created_at: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
        }
      },
      {
        id: 'edi-test-3',
        order_number: 'EDI-003',
        customer_name: 'A Plus Vegetable',
        customer_email: 'orders@aplusvegetable.com',
        customer_phone: '(555) 789-0123',
        requested_delivery_date: '2025-11-12',
        items: [
          { name: 'Winter Melon Long Mx #1', quantity: 4000, price: 0.45, description: 'per lb' },
          { name: 'Passion Fruit CA', quantity: 40, price: 5.75, description: 'per lb' },
          { name: 'Lotus Root China', quantity: 20, price: 20.00, description: 'BOX' },
          { name: 'Korean Lobok Ca', quantity: 21, price: 9.50, description: 'BOX' },
          { name: 'Lemon Grass', quantity: 21, price: 23.00, description: 'BOX' },
          { name: 'Banana Red', quantity: 5, price: 16.00, description: 'BOX' },
        ],
        total_amount: 2793.50,
        status: 'analyzed',
        source: 'edi',
        trading_partner: 'File Upload',
        original_content: 'Order uploaded from file: a plus vegetable 11-2-25.pdf',
        created_at: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
        erp_order_number: 'SO-2025-1150',
        attachments: [
          {
            filename: 'a plus vegetable 11-2-25.pdf',
            mimeType: 'application/pdf',
            size: 2458624,
            attachmentId: 'aplus-veg-pdf-001',
            hasContent: true,
            extractedTextLength: 0,
            hasExtractedText: false,
            storageUrl: 'https://zkglvdfppodwlgzhfgqs.supabase.co/storage/v1/object/sign/demo-files/aplusvegetable/a%20plus%20vegetable%2011-2-25.pdf?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV9lOGQwM2FmMy02YjhlLTRlMzItYjhjZS1iNDI5MjdhYzZjMGEiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJkZW1vLWZpbGVzL2FwbHVzdmVnZXRhYmxlL2EgcGx1cyB2ZWdldGFibGUgMTEtMi0yNS5wZGYiLCJpYXQiOjE3NjI1NDc2NzEsImV4cCI6MTc5NDA4MzY3MX0.-ylYvL2LsRKDW4E26i6TjC-xMu-IajHWflqjI25xSH4'
          }
        ],
        analysis_data: {
          customers: [],
          items: [],
          matchingCustomer: {
            id: 'aplus-001',
            number: 'CUST-10003',
            displayName: 'A Plus Vegetable',
            email: 'orders@aplusvegetable.com',
          },
          analyzedItems: [
            // {
            //   itemName: 'Winter Melon Long Mx #1',
            //   quantity: 4000,
            //   matchedItem: { id: 'PROD-028', number: 'PROD-028', displayName: 'Winter Melon Long Mx #1', unitPrice: 0.45 },
            //   customBoundingBox: { page: 1, x: 50, y: 100, width: 200, height: 20 }
            // },
            // {
            //   itemName: 'Passion Fruit CA',
            //   quantity: 40,
            //   matchedItem: { id: 'PROD-008', number: 'PROD-008', displayName: 'Passion Fruit CA', unitPrice: 5.75 },
            //   customBoundingBox: { page: 1, x: 50, y: 130, width: 200, height: 20 }
            // },
            // {
            //   itemName: 'Lotus Root China',
            //   quantity: 20,
            //   matchedItem: { id: 'PROD-038', number: 'PROD-038', displayName: 'Lotus Root China', unitPrice: 20.00 },
            //   customBoundingBox: { page: 1, x: 50, y: 160, width: 200, height: 20 }
            // },
            {
              itemName: 'Sand Pear 28/32c',
              quantity: 106,
              matchedItem: { id: 'PROD-036', number: 'PROD-036', displayName: 'Sand Pear', unitPrice: 9.50 },
              customBoundingBox: { page: 1, x: 50, y: 190, width: 200, height: 20 }
            },
            // {
            //   itemName: 'Lemon Grass',
            //   quantity: 21,
            //   matchedItem: { id: 'PROD-035', number: 'PROD-035', displayName: 'Lemon Grass', unitPrice: 23.00 },
            //   customBoundingBox: { page: 1, x: 50, y: 220, width: 200, height: 20 }
            // },
            // {
            //   itemName: 'Banana Red',
            //   quantity: 5,
            //   matchedItem: { id: 'PROD-003', number: 'PROD-003', displayName: 'Banana Red', unitPrice: 16.00 },
            //   customBoundingBox: { page: 1, x: 50, y: 250, width: 200, height: 20 }
            // },
          ],
        },
        hasPendingChanges: false,
      },
      {
        id: 'edi-test-4',
        order_number: 'EDI-004',
        customer_name: 'A Plus Vegetable',
        customer_email: 'orders@aplusvegetable.com',
        customer_phone: '(555) 789-0123',
        requested_delivery_date: '2025-11-12',
        items: [
          { name: 'Winter Melon Long Mx #1', quantity: 4000, price: 0.45, description: 'per lb' },
          { name: 'Passion Fruit CA', quantity: 40, price: 5.75, description: 'per lb' },
          { name: 'Lotus Root China', quantity: 20, price: 20.00, description: 'BOX' },
          { name: 'Korean Lobok Ca', quantity: 21, price: 9.50, description: 'BOX' },
          { name: 'Lemon Grass', quantity: 21, price: 23.00, description: 'BOX' },
        ],
        total_amount: 2713.50,
        status: 'analyzed',
        source: 'edi',
        trading_partner: 'File Upload',
        original_content: 'Order uploaded from file: a plus vegetable 11-2-25.pdf',
        created_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
        erp_order_number: 'SO-2025-1151',
        attachments: [
          {
            filename: 'a plus vegetable 11-2-25.pdf',
            mimeType: 'application/pdf',
            size: 2458624,
            attachmentId: 'aplus-veg-pdf-002',
            hasContent: true,
            extractedTextLength: 0,
            hasExtractedText: false,
            storageUrl: 'https://zkglvdfppodwlgzhfgqs.supabase.co/storage/v1/object/sign/demo-files/aplusvegetable/a%20plus%20vegetable%2011-2-25.pdf?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV9lOGQwM2FmMy02YjhlLTRlMzItYjhjZS1iNDI5MjdhYzZjMGEiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJkZW1vLWZpbGVzL2FwbHVzdmVnZXRhYmxlL2EgcGx1cyB2ZWdldGFibGUgMTEtMi0yNS5wZGYiLCJpYXQiOjE3NjI1NDc2NzEsImV4cCI6MTc5NDA4MzY3MX0.-ylYvL2LsRKDW4E26i6TjC-xMu-IajHWflqjI25xSH4'
          }
        ],
        analysis_data: {
          customers: [],
          items: [],
          matchingCustomer: {
            id: 'aplus-001',
            number: 'CUST-10003',
            displayName: 'A Plus Vegetable',
            email: 'orders@aplusvegetable.com',
          },
          analyzedItems: [
            { itemName: 'Winter Melon Long Mx #1', quantity: 4000, matchedItem: { id: 'PROD-028', number: 'PROD-028', displayName: 'Winter Melon Long Mx #1', unitPrice: 0.45 } },
            { itemName: 'Passion Fruit CA', quantity: 40, matchedItem: { id: 'PROD-008', number: 'PROD-008', displayName: 'Passion Fruit CA', unitPrice: 5.75 } },
            { itemName: 'Lotus Root China', quantity: 20, matchedItem: { id: 'PROD-038', number: 'PROD-038', displayName: 'Lotus Root China', unitPrice: 20.00 } },
            { itemName: 'Korean Lobok Ca', quantity: 21, matchedItem: { id: 'PROD-036', number: 'PROD-036', displayName: 'Korean Lobok Ca', unitPrice: 9.50 } },
            { itemName: 'Lemon Grass', quantity: 21, matchedItem: { id: 'PROD-035', number: 'PROD-035', displayName: 'Lemon Grass', unitPrice: 23.00 } },
          ],
        },
        hasPendingChanges: false,
      },
      {
        id: 'file-upload-test-1',
        order_number: 'FILE-001',
        customer_name: 'Produce Wholesale Customer',
        customer_email: 'orders@produce-supplier.com',
        customer_phone: '(555) 555-5555',
        requested_delivery_date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        items: [
          { name: 'Sand Pear 28/32', quantity: 3, price: 17.00, description: 'PALLET' },
          { name: 'Pomelo 8/10c China Red', quantity: 1, price: 17.50, description: 'PALLET' },
          { name: 'Banana Red', quantity: 5, price: 16.00 },
          { name: 'Longan Vietnam', quantity: 1, price: 23.00, description: 'PALLET' },
          { name: 'Medjool Date 11lb', quantity: 2, price: 33.00 },
          { name: 'Pomegranate Bin', quantity: 1, price: 26.00 },
          { name: 'Winter Jujube CA', quantity: 5, price: 82.00 },
          { name: 'Passion Fruit CA', quantity: 40, price: 5.75, description: 'per lb' },
          { name: 'Shine Muscat Grape', quantity: 10, price: 79.00 },
          { name: 'Shiitake Mush. #1', quantity: 30, price: 32.00 },
          { name: 'Enoki Mushroom, Korea', quantity: 60, price: 25.00 },
          { name: 'Green Onion, M', quantity: 1, price: 14.00, description: 'PALLET' },
          { name: 'Fresh Bamboo', quantity: 7, price: 54.00 },
          { name: 'Korean Chili MX', quantity: 2, price: 35.00 },
          { name: 'AA Choy Sum Mx #1', quantity: 20, price: 65.00 },
          { name: 'Taku Choy CA #1', quantity: 5, price: 27.00 },
          { name: 'Bac Ha', quantity: 1, price: 78.00 },
          { name: 'Banana Flower', quantity: 5, price: 20.00 },
          { name: 'Bitter Melon Ind Ca #1', quantity: 2, price: 46.00 },
          { name: 'Chayote Fancy #1', quantity: 7, price: 26.00 },
          { name: 'Eggplant Indian Ca', quantity: 2, price: 40.00 },
          { name: 'Eggplant Thai Green', quantity: 3, price: 48.00 },
          { name: 'Kabocha 10/12c #1', quantity: 1, price: 23.00, description: 'PALLET' },
          { name: 'Moa Gua Mx', quantity: 40, price: 21.00 },
          { name: 'MoaP Taiwan', quantity: 15, price: 22.00 },
          { name: 'Okra #1 Ca', quantity: 15, price: 24.50 },
          { name: 'Opo Ca', quantity: 15, price: 18.00 },
          { name: 'Winter Melon Long Mx #1', quantity: 4000, price: 0.45, description: 'per lb' },
          { name: 'Arrow Head', quantity: 20, price: 68.00 },
          { name: 'Japanese Yam M New Crop!', quantity: 2, price: 43.00, description: 'PALLET' },
          { name: 'Nami', quantity: 5, price: 50.00 },
          { name: 'Sunchoke', quantity: 2, price: 36.00 },
          { name: 'Taro Small Ecuador', quantity: 40, price: 30.00 },
          { name: 'Gai Lan Ca #1', quantity: 1, price: 40.00, description: 'PALLET' },
          { name: 'Lemon Grass', quantity: 21, price: 23.00 },
          { name: 'Korean Lobok Ca', quantity: 21, price: 9.50 },
          { name: 'Purple Yam Hawaii M', quantity: 2, price: 42.00, description: 'PALLET' },
          { name: 'Lotus Root China', quantity: 20, price: 20.00 },
        ],
        total_amount: 8029.50,
        status: 'analyzed',
        source: 'edi',
        trading_partner: 'File Upload',
        original_content: 'Order uploaded from file with produce items including Sand Pear, Pomelo, various vegetables, mushrooms, and tropical fruits. Total of 39 line items.',
        created_at: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
        erp_order_number: 'SO-2025-1152',
        attachments: [
          {
            filename: 'a plus vegetable 11-2-25.pdf',
            mimeType: 'application/pdf',
            size: 2458624,
            attachmentId: 'file-upload-attachment-test-1',
            hasContent: true,
            extractedTextLength: 0,
            hasExtractedText: false,
            storageUrl: 'https://zkglvdfppodwlgzhfgqs.supabase.co/storage/v1/object/sign/demo-files/aplusvegetable/a%20plus%20vegetable%2011-2-25.pdf?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV9lOGQwM2FmMy02YjhlLTRlMzItYjhjZS1iNDI5MjdhYzZjMGEiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJkZW1vLWZpbGVzL2FwbHVzdmVnZXRhYmxlL2EgcGx1cyB2ZWdldGFibGUgMTEtMi0yNS5wZGYiLCJpYXQiOjE3NjI1NDc2NzEsImV4cCI6MTc5NDA4MzY3MX0.-ylYvL2LsRKDW4E26i6TjC-xMu-IajHWflqjI25xSH4'
          }
        ],
        analysis_data: {
          customers: [],
          items: [],
          matchingCustomer: {
            id: 'produce-001',
            number: 'CUST-PRODUCE-001',
            displayName: 'Produce Wholesale Customer',
            email: 'orders@produce-supplier.com',
          },
          analyzedItems: [
            { itemName: 'Sand Pear 28/32', quantity: 3, matchedItem: { id: 'PROD-001', number: 'PROD-001', displayName: 'Sand Pear 28/32', unitPrice: 17.00 } },
            { itemName: 'Pomelo 8/10c China Red', quantity: 1, matchedItem: { id: 'PROD-002', number: 'PROD-002', displayName: 'Pomelo 8/10c China Red', unitPrice: 17.50 } },
            { itemName: 'Banana Red', quantity: 5, matchedItem: { id: 'PROD-003', number: 'PROD-003', displayName: 'Banana Red', unitPrice: 16.00 } },
            { itemName: 'Longan Vietnam', quantity: 1, matchedItem: { id: 'PROD-004', number: 'PROD-004', displayName: 'Longan Vietnam', unitPrice: 23.00 } },
            { itemName: 'Medjool Date 11lb', quantity: 2, matchedItem: { id: 'PROD-005', number: 'PROD-005', displayName: 'Medjool Date 11lb', unitPrice: 33.00 } },
            { itemName: 'Pomegranate Bin', quantity: 1, matchedItem: { id: 'PROD-006', number: 'PROD-006', displayName: 'Pomegranate Bin', unitPrice: 26.00 } },
            { itemName: 'Winter Jujube CA', quantity: 5, matchedItem: { id: 'PROD-007', number: 'PROD-007', displayName: 'Winter Jujube CA', unitPrice: 82.00 } },
            { itemName: 'Passion Fruit CA', quantity: 40, matchedItem: { id: 'PROD-008', number: 'PROD-008', displayName: 'Passion Fruit CA', unitPrice: 5.75 } },
            { itemName: 'Shine Muscat Grape', quantity: 10, matchedItem: { id: 'PROD-009', number: 'PROD-009', displayName: 'Shine Muscat Grape', unitPrice: 79.00 } },
            { itemName: 'Shiitake Mush. #1', quantity: 30, matchedItem: { id: 'PROD-010', number: 'PROD-010', displayName: 'Shiitake Mush. #1', unitPrice: 32.00 } },
            { itemName: 'Enoki Mushroom, Korea', quantity: 60, matchedItem: { id: 'PROD-011', number: 'PROD-011', displayName: 'Enoki Mushroom, Korea', unitPrice: 25.00 } },
            { itemName: 'Green Onion, M', quantity: 1, matchedItem: { id: 'PROD-012', number: 'PROD-012', displayName: 'Green Onion, M', unitPrice: 14.00 } },
            { itemName: 'Fresh Bamboo', quantity: 7, matchedItem: { id: 'PROD-013', number: 'PROD-013', displayName: 'Fresh Bamboo', unitPrice: 54.00 } },
            { itemName: 'Korean Chili MX', quantity: 2, matchedItem: { id: 'PROD-014', number: 'PROD-014', displayName: 'Korean Chili MX', unitPrice: 35.00 } },
            { itemName: 'AA Choy Sum Mx #1', quantity: 20, matchedItem: { id: 'PROD-015', number: 'PROD-015', displayName: 'AA Choy Sum Mx #1', unitPrice: 65.00 } },
            { itemName: 'Taku Choy CA #1', quantity: 5, matchedItem: { id: 'PROD-016', number: 'PROD-016', displayName: 'Taku Choy CA #1', unitPrice: 27.00 } },
            { itemName: 'Bac Ha', quantity: 1, matchedItem: { id: 'PROD-017', number: 'PROD-017', displayName: 'Bac Ha', unitPrice: 78.00 } },
            { itemName: 'Banana Flower', quantity: 5, matchedItem: { id: 'PROD-018', number: 'PROD-018', displayName: 'Banana Flower', unitPrice: 20.00 } },
            { itemName: 'Bitter Melon Ind Ca #1', quantity: 2, matchedItem: { id: 'PROD-019', number: 'PROD-019', displayName: 'Bitter Melon Ind Ca #1', unitPrice: 46.00 } },
            { itemName: 'Chayote Fancy #1', quantity: 7, matchedItem: { id: 'PROD-020', number: 'PROD-020', displayName: 'Chayote Fancy #1', unitPrice: 26.00 } },
            { itemName: 'Eggplant Indian Ca', quantity: 2, matchedItem: { id: 'PROD-021', number: 'PROD-021', displayName: 'Eggplant Indian Ca', unitPrice: 40.00 } },
            { itemName: 'Eggplant Thai Green', quantity: 3, matchedItem: { id: 'PROD-022', number: 'PROD-022', displayName: 'Eggplant Thai Green', unitPrice: 48.00 } },
            { itemName: 'Kabocha 10/12c #1', quantity: 1, matchedItem: { id: 'PROD-023', number: 'PROD-023', displayName: 'Kabocha 10/12c #1', unitPrice: 23.00 } },
            { itemName: 'Moa Gua Mx', quantity: 40, matchedItem: { id: 'PROD-024', number: 'PROD-024', displayName: 'Moa Gua Mx', unitPrice: 21.00 } },
            { itemName: 'MoaP Taiwan', quantity: 15, matchedItem: { id: 'PROD-025', number: 'PROD-025', displayName: 'MoaP Taiwan', unitPrice: 22.00 } },
            { itemName: 'Okra #1 Ca', quantity: 15, matchedItem: { id: 'PROD-026', number: 'PROD-026', displayName: 'Okra #1 Ca', unitPrice: 24.50 } },
            { itemName: 'Opo Ca', quantity: 15, matchedItem: { id: 'PROD-027', number: 'PROD-027', displayName: 'Opo Ca', unitPrice: 18.00 } },
            { itemName: 'Winter Melon Long Mx #1', quantity: 4000, matchedItem: { id: 'PROD-028', number: 'PROD-028', displayName: 'Winter Melon Long Mx #1', unitPrice: 0.45 } },
            { itemName: 'Arrow Head', quantity: 20, matchedItem: { id: 'PROD-029', number: 'PROD-029', displayName: 'Arrow Head', unitPrice: 68.00 } },
            { itemName: 'Japanese Yam M New Crop!', quantity: 2, matchedItem: { id: 'PROD-030', number: 'PROD-030', displayName: 'Japanese Yam M New Crop!', unitPrice: 43.00 } },
            { itemName: 'Nami', quantity: 5, matchedItem: { id: 'PROD-031', number: 'PROD-031', displayName: 'Nami', unitPrice: 50.00 } },
            { itemName: 'Sunchoke', quantity: 2, matchedItem: { id: 'PROD-032', number: 'PROD-032', displayName: 'Sunchoke', unitPrice: 36.00 } },
            { itemName: 'Taro Small Ecuador', quantity: 40, matchedItem: { id: 'PROD-033', number: 'PROD-033', displayName: 'Taro Small Ecuador', unitPrice: 30.00 } },
            { itemName: 'Gai Lan Ca #1', quantity: 1, matchedItem: { id: 'PROD-034', number: 'PROD-034', displayName: 'Gai Lan Ca #1', unitPrice: 40.00 } },
            { itemName: 'Lemon Grass', quantity: 21, matchedItem: { id: 'PROD-035', number: 'PROD-035', displayName: 'Lemon Grass', unitPrice: 23.00 } },
            { itemName: 'Korean Lobok Ca', quantity: 21, matchedItem: { id: 'PROD-036', number: 'PROD-036', displayName: 'Korean Lobok Ca', unitPrice: 9.50 } },
            { itemName: 'Purple Yam Hawaii M', quantity: 2, matchedItem: { id: 'PROD-037', number: 'PROD-037', displayName: 'Purple Yam Hawaii M', unitPrice: 42.00 } },
            { itemName: 'Lotus Root China', quantity: 20, matchedItem: { id: 'PROD-038', number: 'PROD-038', displayName: 'Lotus Root China', unitPrice: 20.00 } },
          ],
        },
        hasPendingChanges: false,
      },
    ];

    setOrders(dummyOrders);
  }, []);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatCurrency = (amount: number) => {
    return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      received: 'bg-blue-100 text-blue-800',
      pending: 'bg-yellow-100 text-yellow-800',
      processing: 'bg-purple-100 text-purple-800',
      analyzed: 'bg-indigo-100 text-indigo-800',
      exported: 'bg-green-100 text-green-800',
      completed: 'bg-green-100 text-green-800',
      failed: 'bg-red-100 text-red-800',
      cancelled: 'bg-gray-100 text-gray-800',
      needs_review: 'bg-orange-100 text-orange-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      received: 'Received',
      pending: 'Pending',
      processing: 'Processing',
      analyzed: 'Analyzed',
      exported: 'Exported',
      completed: 'Completed',
      failed: 'Failed',
      cancelled: 'Cancelled',
      needs_review: 'Needs Review',
    };
    return labels[status] || status.charAt(0).toUpperCase() + status.slice(1);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getAttachmentIcon = (mimeType: string) => {
    if (mimeType.startsWith('image/')) {
      return <ImageIcon className="w-4 h-4 text-blue-500" />;
    } else if (mimeType.includes('pdf')) {
      return <FileText className="w-4 h-4 text-red-500" />;
    } else if (mimeType.includes('text/') || mimeType.includes('document')) {
      return <FileText className="w-4 h-4 text-green-500" />;
    } else {
      return <FileIcon className="w-4 h-4 text-gray-500" />;
    }
  };

  const handleApproveChanges = (order: Order) => {
    alert(`Approved changes for ${order.order_number}!\n\nChanges will be applied to the order.`);
    // Update the order to remove pending changes
    setOrders(orders.map(o =>
      o.id === order.id
        ? { ...o.pendingVersion!, hasPendingChanges: false, pendingVersion: undefined }
        : o
    ));
    setSelectedOrder(null);
  };

  const handleRejectChanges = (order: Order) => {
    alert(`Rejected changes for ${order.order_number}.\n\nOriginal order will be kept.`);
    // Remove pending changes
    setOrders(orders.map(o =>
      o.id === order.id
        ? { ...o, hasPendingChanges: false, pendingVersion: undefined }
        : o
    ));
    setSelectedOrder(null);
  };

  const handleIgnoreChanges = (order: Order) => {
    alert(`Ignored changes for ${order.order_number}.\n\nYou won't be notified about these changes again.`);
    // Remove pending changes
    setOrders(orders.map(o =>
      o.id === order.id
        ? { ...o, hasPendingChanges: false, pendingVersion: undefined }
        : o
    ));
    setSelectedOrder(null);
  };

  const renderDiffLine = (label: string, before: string, after: string, changed: boolean) => {
    return (
      <div className="grid grid-cols-2 border-b border-gray-200">
        <div className={`p-3 ${changed ? 'bg-red-50' : 'bg-gray-50'} border-r border-gray-200`}>
          <div className="text-xs text-gray-500 mb-1 font-medium">{label}</div>
          <div className={`text-sm ${changed ? 'text-red-900' : 'text-gray-700'} flex items-start`}>
            {changed && <Minus className="w-4 h-4 mr-2 flex-shrink-0 text-red-600 mt-0.5" />}
            <span className={changed ? 'line-through' : ''}>{before || 'N/A'}</span>
          </div>
        </div>
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
        <div className="grid grid-cols-2 bg-gray-100 border-b border-gray-200">
          <div className="p-3 border-r border-gray-200">
            <div className="text-xs font-semibold text-gray-600">CURRENT - Items ({beforeItems.length})</div>
          </div>
          <div className="p-3">
            <div className="text-xs font-semibold text-gray-600">PROPOSED - Items ({afterItems.length})</div>
          </div>
        </div>

        {Array.from(allItemNames).map((itemName, idx) => {
          const beforeItem = beforeMap.get(itemName);
          const afterItem = afterMap.get(itemName);
          const isRemoved = beforeItem && !afterItem;
          const isAdded = !beforeItem && afterItem;
          const isModified = beforeItem && afterItem && beforeItem.quantity !== afterItem.quantity;

          return (
            <div key={idx} className="grid grid-cols-2 border-b border-gray-200 last:border-b-0">
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

  const renderUnifiedDiff = (order: Order, pendingVersion: Order) => {
    const beforeMap = new Map(order.items.map(item => [item.name, item]));
    const afterMap = new Map(pendingVersion.items.map(item => [item.name, item]));

    const removedItems = order.items.filter(item => !afterMap.has(item.name));
    const addedItems = pendingVersion.items.filter(item => !beforeMap.has(item.name));
    const modifiedItems = order.items.filter(item => {
      const afterItem = afterMap.get(item.name);
      return afterItem && afterItem.quantity !== item.quantity;
    }).map(item => ({ before: item, after: afterMap.get(item.name)! }));

    const modifiedFields: Array<{ label: string; before: string; after: string }> = [];
    if (order.customer_name !== pendingVersion.customer_name) {
      modifiedFields.push({ label: 'Customer Name', before: order.customer_name, after: pendingVersion.customer_name });
    }
    if (order.customer_email !== pendingVersion.customer_email) {
      modifiedFields.push({ label: 'Email', before: order.customer_email, after: pendingVersion.customer_email });
    }
    if (order.customer_phone !== pendingVersion.customer_phone) {
      modifiedFields.push({ label: 'Phone', before: order.customer_phone || 'N/A', after: pendingVersion.customer_phone || 'N/A' });
    }
    if (order.requested_delivery_date !== pendingVersion.requested_delivery_date) {
      modifiedFields.push({ label: 'Delivery Date', before: order.requested_delivery_date || 'N/A', after: pendingVersion.requested_delivery_date || 'N/A' });
    }

    return (
      <div className="space-y-6">
        {removedItems.length > 0 && (
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

        {addedItems.length > 0 && (
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

  const filteredOrders = orders.filter(order => {
    const matchesSearch = order.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         order.customer_email.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         order.order_number.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Test Orders (with Pending Changes)</h2>
        <p className="text-gray-600">Test area for reviewing order changes - No API calls, dummy data only</p>
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

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          >
            <option value="all">All Status</option>
            <option value="needs_review">Needs Review</option>
            <option value="received">Received</option>
            <option value="pending">Pending</option>
            <option value="analyzed">Analyzed</option>
            <option value="exported">Exported</option>
          </select>
        </div>
      </div>

      {/* Orders List */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Order</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Items</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredOrders.map((order) => (
              <tr
                key={order.id}
                className="hover:bg-gray-50 cursor-pointer"
                onClick={() => {
                  setSelectedOrder(order);
                  setViewMode('current');
                }}
              >
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <Network className="w-4 h-4 mr-2" />
                    <div>
                      <div className="text-sm font-medium text-gray-900">{order.order_number}</div>
                      {order.trading_partner && (
                        <div className="mt-1">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">
                            {order.trading_partner}
                          </span>
                        </div>
                      )}
                      {order.hasPendingChanges && (
                        <div className="mt-1">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-800">
                            ⚠️ Needs Review
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">{order.customer_name}</div>
                  <div className="text-sm text-gray-500">{order.customer_email}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900">{order.items.length} items</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(order.status)}`}>
                    {getStatusLabel(order.status)}
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

      {/* Order Detail Modal with Split View */}
      {selectedOrder && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-0 md:top-10 mx-auto p-4 md:p-5 border w-full md:w-11/12 lg:w-10/12 shadow-lg rounded-none md:rounded-md bg-white min-h-full md:min-h-0 md:max-h-[90vh] overflow-y-auto">
            <div className="mt-3">
              {/* Header */}
              <div className="flex items-center justify-between mb-4 px-4 md:px-0">
                <div>
                  <h3 className="text-lg font-medium text-gray-900">
                    Order Details - {selectedOrder.order_number}
                  </h3>
                  {selectedOrder.hasPendingChanges && (
                    <div className="mt-2 flex items-center space-x-2">
                      <AlertCircle className="w-4 h-4 text-orange-600" />
                      <span className="text-sm text-orange-700 font-medium">
                        This order needs review
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex items-center space-x-2">
                  {selectedOrder.hasPendingChanges && (
                    <div className="flex bg-gray-100 rounded-lg p-1">
                      <button
                        onClick={() => setViewMode('current')}
                        className={`flex items-center space-x-1 px-3 py-1.5 rounded-md transition-colors text-sm ${
                          viewMode === 'current'
                            ? 'bg-white shadow-sm text-gray-900'
                            : 'text-gray-600 hover:text-gray-900'
                        }`}
                      >
                        <Eye className="w-4 h-4" />
                        <span>Current</span>
                      </button>
                      <button
                        onClick={() => setViewMode('diff-side-by-side')}
                        className={`flex items-center space-x-1 px-3 py-1.5 rounded-md transition-colors text-sm ${
                          viewMode === 'diff-side-by-side'
                            ? 'bg-white shadow-sm text-gray-900'
                            : 'text-gray-600 hover:text-gray-900'
                        }`}
                      >
                        <Columns className="w-4 h-4" />
                        <span>Side-by-Side</span>
                      </button>
                      <button
                        onClick={() => setViewMode('diff-unified')}
                        className={`flex items-center space-x-1 px-3 py-1.5 rounded-md transition-colors text-sm ${
                          viewMode === 'diff-unified'
                            ? 'bg-white shadow-sm text-gray-900'
                            : 'text-gray-600 hover:text-gray-900'
                        }`}
                      >
                        <LayoutGrid className="w-4 h-4" />
                        <span>Unified</span>
                      </button>
                    </div>
                  )}
                  <button
                    onClick={() => {
                      setSelectedOrder(null);
                      setViewMode('current');
                    }}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X className="h-6 w-6" />
                  </button>
                </div>
              </div>

              {/* Content based on view mode */}
              {viewMode === 'current' && (
                <>
                  {/* Side-by-side layout for EDI-004 and FILE-001 */}
                  {(selectedOrder.order_number === 'EDI-004' || selectedOrder.order_number === 'FILE-001') && selectedOrder.attachments && selectedOrder.attachments.length > 0 ? (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 px-4 md:px-0 pb-4 md:pb-0">
                      {/* Left side - Order Details */}
                      <div className="space-y-6">
                        <div className="bg-white border border-gray-200 rounded-lg p-4">
                          <h4 className="text-lg font-semibold text-gray-900 mb-4">Customer Information</h4>
                          <div className="space-y-2 text-sm">
                            <div><span className="font-medium">Name:</span> {selectedOrder.customer_name}</div>
                            <div><span className="font-medium">Email:</span> {selectedOrder.customer_email}</div>
                            {selectedOrder.customer_phone && (
                              <div><span className="font-medium">Phone:</span> {selectedOrder.customer_phone}</div>
                            )}
                          </div>
                        </div>

                        <div className="bg-white border border-gray-200 rounded-lg p-4">
                          <h4 className="text-lg font-semibold text-gray-900 mb-4">Order Items</h4>
                          <div className="space-y-2">
                            {selectedOrder.items.map((item, idx) => (
                              <div key={idx} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                                <div className="flex-1">
                                  <div className="text-sm font-medium">{item.name}</div>
                                  {item.description && (
                                    <div className="text-xs text-gray-500">SKU: {item.description}</div>
                                  )}
                                </div>
                                <div className="text-lg font-semibold text-gray-700 ml-4">
                                  {item.quantity}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="bg-white border border-gray-200 rounded-lg p-4">
                          <h4 className="text-lg font-semibold text-gray-900 mb-4">Original Content</h4>
                          <div className="bg-gray-50 rounded p-3 text-sm font-mono text-gray-700 whitespace-pre-wrap max-h-96 overflow-y-auto">
                            {selectedOrder.original_content}
                          </div>
                        </div>
                      </div>

                      {/* Right side - PDF Preview */}
                      <div className="lg:sticky lg:top-4 lg:self-start">
                        <div className="bg-white border border-gray-200 rounded-lg p-4">
                          <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                            <Paperclip className="w-5 h-5 mr-2" />
                            Original Attachment
                          </h4>
                          {selectedOrder.attachments.map((attachment, index) => (
                            <div key={index}>
                              <div className="flex items-start justify-between mb-3">
                                <div className="flex items-center space-x-3">
                                  {getAttachmentIcon(attachment.mimeType)}
                                  <div>
                                    <div className="text-sm font-medium text-gray-900">
                                      {attachment.filename}
                                    </div>
                                    <div className="text-xs text-gray-500">
                                      {attachment.mimeType} • {formatFileSize(attachment.size)}
                                    </div>
                                  </div>
                                </div>
                                {attachment.storageUrl && (
                                  <button
                                    onClick={() => window.open(attachment.storageUrl, '_blank')}
                                    className="text-green-600 hover:text-green-800 text-xs px-3 py-1.5 rounded border border-green-200 hover:bg-green-50 flex items-center space-x-1"
                                    title="View/Download file"
                                  >
                                    <Download className="w-4 h-4" />
                                    <span>Download</span>
                                  </button>
                                )}
                              </div>

                              {/* PDF iframe */}
                              {attachment.mimeType === 'application/pdf' && attachment.storageUrl && (
                                <div className="mt-3">
                                  <iframe
                                    src={attachment.storageUrl}
                                    className="w-full h-[800px] rounded-lg border border-gray-300"
                                    title={attachment.filename}
                                  />
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Default stacked layout for other orders */
                    <div className="space-y-6 px-4 md:px-0 pb-4 md:pb-0">
                      {/* Current Order View */}
                      <div className="bg-white border border-gray-200 rounded-lg p-4">
                        <h4 className="text-lg font-semibold text-gray-900 mb-4">Customer Information</h4>
                        <div className="space-y-2 text-sm">
                          <div><span className="font-medium">Name:</span> {selectedOrder.customer_name}</div>
                          <div><span className="font-medium">Email:</span> {selectedOrder.customer_email}</div>
                          {selectedOrder.customer_phone && (
                            <div><span className="font-medium">Phone:</span> {selectedOrder.customer_phone}</div>
                          )}
                        </div>
                      </div>

                      <div className="bg-white border border-gray-200 rounded-lg p-4">
                        <h4 className="text-lg font-semibold text-gray-900 mb-4">Order Items</h4>
                        <div className="space-y-2">
                          {selectedOrder.items.map((item, idx) => (
                            <div key={idx} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                              <div className="flex-1">
                                <div className="text-sm font-medium">{item.name}</div>
                                {item.description && (
                                  <div className="text-xs text-gray-500">SKU: {item.description}</div>
                                )}
                              </div>
                              <div className="text-lg font-semibold text-gray-700 ml-4">
                                {item.quantity}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Attachments Section */}
                      {selectedOrder.attachments && selectedOrder.attachments.length > 0 && (
                        <div className="bg-white border border-gray-200 rounded-lg p-4">
                          <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                            <Paperclip className="w-5 h-5 mr-2" />
                            Attachments ({selectedOrder.attachments.length})
                          </h4>
                          <div className="space-y-4">
                            {selectedOrder.attachments.map((attachment, index) => (
                              <div key={index} className="bg-gray-50 rounded-lg border border-gray-300 p-4">
                                <div className="flex items-start justify-between mb-3">
                                  <div className="flex items-center space-x-3">
                                    {getAttachmentIcon(attachment.mimeType)}
                                    <div>
                                      <div className="text-sm font-medium text-gray-900">
                                        {attachment.filename}
                                      </div>
                                      <div className="text-xs text-gray-500">
                                        {attachment.mimeType} • {formatFileSize(attachment.size)}
                                      </div>
                                    </div>
                                  </div>
                                  {attachment.storageUrl && (
                                    <button
                                      onClick={() => window.open(attachment.storageUrl, '_blank')}
                                      className="text-green-600 hover:text-green-800 text-xs px-3 py-1.5 rounded border border-green-200 hover:bg-green-50 flex items-center space-x-1"
                                      title="View/Download file"
                                    >
                                      <Download className="w-4 h-4" />
                                      <span>Download</span>
                                    </button>
                                  )}
                                </div>

                                {/* PDF Preview with Annotations */}
                                {attachment.mimeType === 'application/pdf' &&
                                 attachment.storageUrl &&
                                 selectedOrder.analysis_data?.analyzedItems &&
                                 selectedOrder.analysis_data.analyzedItems.length > 0 && (
                                  <div className="mt-4">
                                    <PDFViewerWithAnnotations
                                      pdfUrl={attachment.storageUrl}
                                      analyzedItems={selectedOrder.analysis_data.analyzedItems}
                                      className="w-full"
                                    />
                                  </div>
                                )}

                                {/* Regular PDF iframe for PDFs without analyzed items */}
                                {attachment.mimeType === 'application/pdf' &&
                                 attachment.storageUrl &&
                                 (!selectedOrder.analysis_data?.analyzedItems || selectedOrder.analysis_data.analyzedItems.length === 0) && (
                                  <div className="mt-3">
                                    <iframe
                                      src={attachment.storageUrl}
                                      className="w-full h-[600px] rounded-lg border border-gray-300"
                                      title={attachment.filename}
                                    />
                                  </div>
                                )}

                                {/* Image Preview */}
                                {attachment.mimeType.startsWith('image/') && attachment.storageUrl && (
                                  <div className="mt-3">
                                    <img
                                      src={attachment.storageUrl}
                                      alt={attachment.filename}
                                      className="max-w-full max-h-96 rounded-lg border border-gray-200 shadow-sm"
                                      onError={(e) => {
                                        e.currentTarget.style.display = 'none';
                                      }}
                                    />
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              {viewMode === 'diff-side-by-side' && selectedOrder.pendingVersion && (
                <div className="space-y-4 px-4 md:px-0 pb-4 md:pb-0">
                  {/* Email Reference Header */}
                  {selectedOrder.changeRequestEmail && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <div className="flex items-start space-x-3">
                        <Mail className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-semibold text-blue-900 mb-2">Change Request Details</h4>
                          <div className="space-y-1 text-sm">
                            <div className="flex items-start">
                              <span className="font-medium text-blue-800 w-16 flex-shrink-0">From:</span>
                              <span className="text-blue-700">{selectedOrder.changeRequestEmail.from}</span>
                            </div>
                            <div className="flex items-start">
                              <span className="font-medium text-blue-800 w-16 flex-shrink-0">Subject:</span>
                              <span className="text-blue-700">{selectedOrder.changeRequestEmail.subject}</span>
                            </div>
                            <div className="flex items-start">
                              <span className="font-medium text-blue-800 w-16 flex-shrink-0">Received:</span>
                              <span className="text-blue-700">{formatDate(selectedOrder.changeRequestEmail.receivedAt)}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Column Headers */}
                  <div className="grid grid-cols-2 bg-gray-100 border-b-2 border-gray-300 rounded-t-lg overflow-hidden">
                    <div className="p-3 border-r border-gray-300">
                      <div className="flex items-center space-x-2">
                        <Minus className="w-4 h-4 text-red-600" />
                        <span className="text-sm font-semibold text-gray-700">CURRENT VERSION</span>
                      </div>
                    </div>
                    <div className="p-3">
                      <div className="flex items-center space-x-2">
                        <Plus className="w-4 h-4 text-green-600" />
                        <span className="text-sm font-semibold text-gray-700">PROPOSED VERSION</span>
                      </div>
                    </div>
                  </div>

                  {/* Diff Content */}
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="max-h-[500px] overflow-y-auto">
                      {renderDiffLine(
                        'Customer Name',
                        selectedOrder.customer_name,
                        selectedOrder.pendingVersion.customer_name,
                        selectedOrder.customer_name !== selectedOrder.pendingVersion.customer_name
                      )}
                      {renderDiffLine(
                        'Email',
                        selectedOrder.customer_email,
                        selectedOrder.pendingVersion.customer_email,
                        selectedOrder.customer_email !== selectedOrder.pendingVersion.customer_email
                      )}
                      {renderDiffLine(
                        'Phone',
                        selectedOrder.customer_phone || '',
                        selectedOrder.pendingVersion.customer_phone || '',
                        selectedOrder.customer_phone !== selectedOrder.pendingVersion.customer_phone
                      )}
                      {renderDiffLine(
                        'Delivery Date',
                        selectedOrder.requested_delivery_date || '',
                        selectedOrder.pendingVersion.requested_delivery_date || '',
                        selectedOrder.requested_delivery_date !== selectedOrder.pendingVersion.requested_delivery_date
                      )}

                      {renderItemsDiff(selectedOrder.items, selectedOrder.pendingVersion.items)}
                    </div>
                  </div>
                </div>
              )}

              {viewMode === 'diff-unified' && selectedOrder.pendingVersion && (
                <div className="space-y-4 px-4 md:px-0 pb-4 md:pb-0">
                  {/* Email Reference Header */}
                  {selectedOrder.changeRequestEmail && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <div className="flex items-start space-x-3">
                        <Mail className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-semibold text-blue-900 mb-2">Change Request Details</h4>
                          <div className="space-y-1 text-sm">
                            <div className="flex items-start">
                              <span className="font-medium text-blue-800 w-16 flex-shrink-0">From:</span>
                              <span className="text-blue-700">{selectedOrder.changeRequestEmail.from}</span>
                            </div>
                            <div className="flex items-start">
                              <span className="font-medium text-blue-800 w-16 flex-shrink-0">Subject:</span>
                              <span className="text-blue-700">{selectedOrder.changeRequestEmail.subject}</span>
                            </div>
                            <div className="flex items-start">
                              <span className="font-medium text-blue-800 w-16 flex-shrink-0">Received:</span>
                              <span className="text-blue-700">{formatDate(selectedOrder.changeRequestEmail.receivedAt)}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="max-h-[500px] overflow-y-auto">
                    {renderUnifiedDiff(selectedOrder, selectedOrder.pendingVersion)}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="mt-6 px-4 md:px-0 flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-3 pt-4 border-t border-gray-200">
                {selectedOrder.hasPendingChanges && viewMode !== 'current' ? (
                  <>
                    <button
                      onClick={() => handleIgnoreChanges(selectedOrder)}
                      className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
                    >
                      Ignore Changes
                    </button>
                    <button
                      onClick={() => handleRejectChanges(selectedOrder)}
                      className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
                    >
                      Reject Changes
                    </button>
                    <button
                      onClick={() => handleApproveChanges(selectedOrder)}
                      className="flex-1 px-4 py-2 text-white rounded-lg transition-colors font-medium"
                      style={{ backgroundColor: '#53AD6D' }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#4a9c63';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = '#53AD6D';
                      }}
                    >
                      Approve & Apply
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => {
                      setSelectedOrder(null);
                      setViewMode('current');
                    }}
                    className="w-full px-6 py-3 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition-colors text-base font-medium"
                  >
                    Close
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TestOrdersSection;
