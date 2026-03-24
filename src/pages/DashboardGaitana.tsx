import React, { useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { Placeholder } from '@tiptap/extension-placeholder';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { supabaseClient } from '../supabaseClient';
import AnalyticsDashboardGaitana from '../components/AnalyticsDashboardGaitana';

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const GAITANA_ORG_ID = '81cf0716-45ee-4fe8-895f-d9af962f5fab';
const ORCHESTRATOR_URL = 'https://frootful-orchestrator-977662914555.us-central1.run.app';

// ── Supabase Proposal Types ──

interface ProposalFile {
  id: string;
  filename: string;
  extension: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  storage_path: string;
}

interface ProposalLine {
  id: string;
  change_type: string;
  item_name: string;
  proposed_values: Record<string, unknown> | null;
  line_number: number | null;
}

interface InboxProposal {
  id: string;
  status: string;
  type: string | null;
  created_at: string;
  tags: Record<string, unknown>;
  metadata: Record<string, unknown> | null;
  notes: string | null;
  intake_event_id: string | null;
  // From intake_events join
  channel: string;
  email_subject: string;
  email_from: string;
  email_body: string;
  // Attached files
  files: ProposalFile[];
  // Proposal lines
  lines: ProposalLine[];
}

// ============================================================================
// La Gaitana — Standalone Dashboard (UI-only, hardcoded mock data)
// Inbox + Webflor-style Order Creation + Order Confirmation
// ============================================================================

const frootfulGreen = '#16a34a';

// ── Types ──

interface RecipeLine {
  color: string;
  variety: string;
  ramos: number;
  upc?: string;
  nombre_receta?: string;
}

interface OrderItem {
  finca: string;
  numero_item: string;
  empaque: string;
  caja_id: string;
  cajas: number;
  tallos_ramo: number;
  ramos_caja: number;
  tallos_caja: number;
  total_tallos: number;
  tipo_caja: string;
  tipo_precio: string;
  precio: number;
  valor_total: number;
  upc: string;
  cajas_confirmadas: number;
  marca: string;
  recipe_type?: 'mix' | 'rainbow' | 'single';
  recipe_note?: string;
  recipe?: RecipeLine[];
}

type SidebarTab = 'inbox' | 'upload' | 'orders' | 'chat' | 'metrics';
type OrderState = 'En Proceso' | 'Pendiente' | 'Confirmado';

// ── Mock Data ──

const MOCK_EMAIL = {
  sender: 'Global Flower Imports <orders@globalflowerimports.com>',
  subject: 'PO029889 — Customer 1142 (HEB)',
  date: '2026-03-04T14:23:00Z',
  body: 'Hi,\n\nPlease find attached PO029889 for Customer 1142 (HEB).\n\nThanks,\nGlobal Flower Imports',
  attachment: 'PO029889_Customer_1142.pdf',
  pdfUrl: '/demo/PO029889_Customer_1142.pdf',
};

const MOCK_EMAIL_2 = {
  sender: 'Global Flower Imports <orders@globalflowerimports.com>',
  subject: 'PO029916 — Customer 1142 (WEGMANS)',
  date: '2026-03-04T15:10:00Z',
  body: 'Hi,\n\nPlease find attached PO029916 for Customer 1142 (Wegmans).\n\nThanks,\nGlobal Flower Imports',
  attachment: 'PO029916_Customer_1142.pdf',
  pdfUrl: '/demo/PO029916_Customer_1142.pdf',
};

const MOCK_ORDER_2 = {
  order_number: '313802',
  cliente: '(1142) - Gems Group',
  dir_despacho: '(1142) Gems Group',
  compania: 'La Gaitana Farms S...',
  fecha_orden: '2026/02/26',
  fecha_elaboracion: '2026/03/02',
  fecha_entrega: '2026/03/02',
  fecha_llegada: '2026/03/02',
  agente_comercial: 'Marcela Quintero',
  po: 'PO029916',
  marcacion: '',
  comentario: 'MQ2.23.26 — Caja Mixta de Raffines & Solomio. Cada producto con diferente información de UPC. RAFFINES: 09006410222, SOLOMIO: 09006410231. UPC WEGMANS CON PUNTO DE COLOR SEGÚN INDIQUE PEDIDO',
};

const MOCK_ITEMS_2: OrderItem[] = [
  {
    finca: 'GFM', numero_item: '2015780', empaque: 'Combo Raffine / Solomio / Sel',
    caja_id: '8B Folder Chicu', cajas: 6, tallos_ramo: 7,
    ramos_caja: 12, tallos_caja: 84, total_tallos: 504, tipo_caja: '8B Folder Chicu',
    tipo_precio: 'Ramos', precio: 1.74, valor_total: 125.28,
    upc: 'RAFFINES: 09006410222 / SOLOMIO: 09006410231', cajas_confirmadas: 6, marca: 'Wegmans',
    recipe_type: 'mix',
    recipe: [
      { color: 'bicolor yellow', variety: 'Lala Bonita (Solomio)', ramos: 2 },
      { color: 'orange', variety: 'Clif (Solomio)', ramos: 2 },
      { color: 'white', variety: 'Ard (Solomio)', ramos: 2 },
      { color: 'bicolor burgundy', variety: 'Petit Faye (Raffine)', ramos: 3 },
      { color: 'light pink', variety: 'Thia (Raffine)', ramos: 3 },
    ],
  },
];

const TOTALS_2 = {
  cajas: MOCK_ITEMS_2.reduce((s, i) => s + i.cajas, 0),
  total_tallos: MOCK_ITEMS_2.reduce((s, i) => s + i.total_tallos, 0),
  valor_total: MOCK_ITEMS_2.reduce((s, i) => s + i.valor_total, 0),
  cajas_confirmadas: MOCK_ITEMS_2.reduce((s, i) => s + i.cajas_confirmadas, 0),
};

const MOCK_ORDER = {
  order_number: '314331',
  cliente: '(1142) - Gems Group',
  dir_despacho: '(1142) Gems Group',
  compania: 'La Gaitana Farms S...',
  fecha_orden: '02/26/2026',
  fecha_elaboracion: '2026/03/02',
  fecha_entrega: '2026/03/02',
  fecha_llegada: '2026/03/02',
  agente_comercial: 'Marcela Quintero',
  po: 'PO031349',
  marcacion: '',
  comentario: 'MQ3.4.26',
};

const MOCK_ITEMS: OrderItem[] = [
  {
    finca: 'GFM', numero_item: '2015772', empaque: 'Carnation fcy Mixed',
    caja_id: 'Carnations Asstd - Cliente 1001', cajas: 20, tallos_ramo: 5,
    ramos_caja: 140, tallos_caja: 700, total_tallos: 14000, tipo_caja: 'FB',
    tipo_precio: 'Ramos', precio: 0.925, valor_total: 2590.0,
    upc: '841152000137', cajas_confirmadas: 20, marca: 'Base FB Gems (C15318B1-0)',
    recipe_type: 'mix',
    recipe_note: 'AI was previously instructed to place a single item since the full mix will be modified later based on real inventory.',
    recipe: [
      { color: 'bicolor burgundy', variety: 'Perfect', ramos: 7 },
    ],
  },
  {
    finca: 'GFM', numero_item: '2015773', empaque: 'Carnation fcy white Polar Route',
    caja_id: 'Carnations White - Cliente 1001', cajas: 11, tallos_ramo: 5,
    ramos_caja: 140, tallos_caja: 700, total_tallos: 7700, tipo_caja: 'FB',
    tipo_precio: 'Ramos', precio: 0.925, valor_total: 1424.5,
    upc: '841152040200', cajas_confirmadas: 11, marca: 'Base FB Gems (C15318B1-0)',
    recipe_type: 'single',
    recipe_note: 'Single variety — 140 ramos of Polar Route per box.',
    recipe: [
      { color: 'white', variety: 'Polar Route', ramos: 140 },
    ],
  },
  {
    finca: 'GFM', numero_item: '2015775', empaque: 'Bouquet Unico Mixed',
    caja_id: 'Blooms Mini Carns Assorted - Cliente 1001', cajas: 17, tallos_ramo: 6,
    ramos_caja: 135, tallos_caja: 810, total_tallos: 13770, tipo_caja: 'FB',
    tipo_precio: 'Ramos', precio: 1.11, valor_total: 2547.45,
    upc: 'varies', cajas_confirmadas: 17, marca: 'Base FB Gems (C15318B1-0)',
    recipe_type: 'mix',
    recipe_note: 'UPC varies by color — see configuration.',
    recipe: [
      { color: 'bicolor red', variety: 'Payaso', ramos: 45, upc: '841152050064', nombre_receta: 'Mini Carnations ASST - BL' },
      { color: 'white', variety: 'Nimbus', ramos: 45, upc: '841152050170', nombre_receta: 'Mini Carnations ASST - WH' },
      { color: 'yellow', variety: 'Caesar', ramos: 45, upc: '841152050187', nombre_receta: 'Mini Carnations ASST - YL' },
    ],
  },
  {
    finca: 'GFM', numero_item: '2015774', empaque: 'Minicarnation sel Rainbow',
    caja_id: 'Blooms RBW Mini Carnations - Cliente 1001', cajas: 26, tallos_ramo: 1,
    ramos_caja: 135, tallos_caja: 810, total_tallos: 21060, tipo_caja: 'FB',
    tipo_precio: 'Ramos', precio: 1.20, valor_total: 4212.0,
    upc: '841152050071', cajas_confirmadas: 26, marca: 'Base FB Gems (C15318B1-0)',
    recipe_type: 'rainbow',
    recipe_note: '6 colors of Pigeon at 135 ramos each — 810 stems per box.',
    recipe: [
      { color: 'hot pink', variety: 'Pigeon', ramos: 135 },
      { color: 'orange', variety: 'Pigeon', ramos: 135 },
      { color: 'pink', variety: 'Pigeon', ramos: 135 },
      { color: 'purple', variety: 'Pigeon', ramos: 135 },
      { color: 'red', variety: 'Pigeon', ramos: 135 },
      { color: 'yellow', variety: 'Pigeon', ramos: 135 },
    ],
  },
];

const TOTALS = {
  cajas: MOCK_ITEMS.reduce((s, i) => s + i.cajas, 0),
  total_tallos: MOCK_ITEMS.reduce((s, i) => s + i.total_tallos, 0),
  valor_total: MOCK_ITEMS.reduce((s, i) => s + i.valor_total, 0),
  cajas_confirmadas: MOCK_ITEMS.reduce((s, i) => s + i.cajas_confirmadas, 0),
};

const statusColor: Record<string, string> = {
  'pending_review': 'bg-yellow-100 text-yellow-700 border-yellow-200',
  'ready': 'bg-blue-100 text-blue-700 border-blue-200',
  'export_in_progress': 'bg-orange-100 text-orange-700 border-orange-200',
  'pushed_to_erp': 'bg-green-100 text-green-700 border-green-200',
  'export_failed': 'bg-red-100 text-red-700 border-red-200',
  'completed': 'bg-green-100 text-green-700 border-green-200',
  'cancelled': 'bg-red-100 text-red-700 border-red-200',
};

const statusLabel: Record<string, string> = {
  'pending_review': 'Pending Review',
  'ready': 'Ready',
  'export_in_progress': 'Exporting to WebFlor...',
  'pushed_to_erp': 'Pushed to WebFlor',
  'export_failed': 'Export Failed',
  'completed': 'Completed',
  'cancelled': 'Cancelled',
};

interface OrderRow {
  id: string;
  customer_name: string | null;
  customer_reference: string | null;
  status: string;
  delivery_date: string | null;
  total_amount: number | null;
  created_at: string;
  origin_intake_event_id: string | null;
  source_channel: string | null;
  metadata: Record<string, unknown> | null;
}

interface OrderDetail {
  channel: string | null;
  email_subject: string | null;
  email_from: string | null;
  email_body: string | null;
  files: ProposalFile[];
  fileUrls: Record<string, string>;
  proposalMd: string | null;
  proposalStatus: string | null;
}

const channelLabel: Record<string, string> = {
  'email': 'Email',
  'erp': 'Email',
  'dashboard_upload': 'Upload',
  'api': 'API',
};

// ── Icons (inline SVGs to avoid lucide dependency) ──

const InboxIcon = () => (
  <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" /><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
  </svg>
);
const PackageIcon = () => (
  <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path d="m16.5 9.4-9-5.19M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" />
  </svg>
);
const MailIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <rect width="20" height="16" x="2" y="4" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
  </svg>
);
const PaperclipIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
  </svg>
);
const CheckIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path d="M5 13l4 4L19 7" />
  </svg>
);
const ChevronRightIcon = () => (
  <svg className="w-3 h-3 text-gray-300" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path d="m9 18 6-6-6-6" />
  </svg>
);
const ChevronLeftIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path d="m15 18-6-6 6-6" />
  </svg>
);
const ExpandIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
  </svg>
);
const CloseIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>
);

// ── Fullscreen Modal ──
const ExpandedModal: React.FC<{ open: boolean; onClose: () => void; title: string; children: React.ReactNode }> = ({ open, onClose, title, children }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-[90vw] max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
            <CloseIcon />
          </button>
        </div>
        <div className="flex-1 overflow-auto p-6">
          {children}
        </div>
      </div>
    </div>
  );
};

// ── Tiptap Markdown Editor (WYSIWYG with markdown in/out) ──
import { Markdown } from 'tiptap-markdown';

const MarkdownEditor: React.FC<{ content: string; onChange: (md: string) => void }> = ({ content, onChange }) => {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; inTable: boolean } | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      Markdown,
    ],
    content,
    onUpdate: ({ editor: ed }) => {
      onChange((ed.storage as any).markdown.getMarkdown());
    },
    editorProps: {
      attributes: {
        class: 'prose prose-xs max-w-none p-3 focus:outline-none min-h-[200px] text-[11px] ' +
          '[&_h1]:text-sm [&_h1]:font-bold [&_h1]:text-gray-800 [&_h1]:mb-2 [&_h1]:mt-0 ' +
          '[&_h2]:text-xs [&_h2]:font-semibold [&_h2]:text-gray-700 [&_h2]:mb-1.5 [&_h2]:mt-3 ' +
          '[&_h3]:text-[11px] [&_h3]:font-semibold [&_h3]:text-gray-600 [&_h3]:mb-1 [&_h3]:mt-2 ' +
          '[&_p]:text-[11px] [&_p]:text-gray-600 [&_p]:mb-1.5 [&_p]:leading-relaxed ' +
          '[&_table]:w-full [&_table]:text-[10px] [&_table]:border-collapse [&_table]:mb-2 ' +
          '[&_th]:bg-gray-50 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-medium [&_th]:text-gray-500 [&_th]:border [&_th]:border-gray-200 ' +
          '[&_td]:px-2 [&_td]:py-1 [&_td]:text-gray-700 [&_td]:border [&_td]:border-gray-200 ' +
          '[&_strong]:font-semibold [&_strong]:text-gray-800',
      },
      handleDOMEvents: {
        contextmenu: (view, event) => {
          // Check if right-click is inside a table
          const pos = view.posAtCoords({ left: event.clientX, top: event.clientY });
          if (pos) {
            const resolved = view.state.doc.resolve(pos.pos);
            let inTable = false;
            for (let d = resolved.depth; d > 0; d--) {
              if (resolved.node(d).type.name === 'table') { inTable = true; break; }
            }
            event.preventDefault();
            setContextMenu({
              x: event.clientX,
              y: event.clientY,
              inTable,
            });
            return true;
          }
          // No position found — still show general menu
          event.preventDefault();
          setContextMenu({ x: event.clientX, y: event.clientY, inTable: false });
          return true;
        },
      },
    },
  });

  // Close context menu on click anywhere outside the menu
  const contextMenuRef = React.useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!contextMenu) return;
    const close = (e: Event) => {
      if (contextMenuRef.current?.contains(e.target as Node)) return;
      setContextMenu(null);
    };
    window.addEventListener('mousedown', close, true);
    window.addEventListener('scroll', close, true);
    window.addEventListener('contextmenu', close, true);
    return () => {
      window.removeEventListener('mousedown', close, true);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('contextmenu', close, true);
    };
  }, [contextMenu]);

  const isInTable = editor?.isActive('table') ?? false;

  type MenuItem = { label: string; action: () => void; danger?: boolean } | { type: 'separator' };
  const tableMenuItems: MenuItem[] = [
    { label: 'Insert row above', action: () => editor?.chain().focus().addRowBefore().run() },
    { label: 'Insert row below', action: () => editor?.chain().focus().addRowAfter().run() },
    { label: 'Delete row', action: () => editor?.chain().focus().deleteRow().run(), danger: true },
    { type: 'separator' },
    { label: 'Insert column left', action: () => editor?.chain().focus().addColumnBefore().run() },
    { label: 'Insert column right', action: () => editor?.chain().focus().addColumnAfter().run() },
    { label: 'Delete column', action: () => editor?.chain().focus().deleteColumn().run(), danger: true },
    { type: 'separator' },
    { label: 'Merge cells', action: () => editor?.chain().focus().mergeCells().run() },
    { label: 'Split cell', action: () => editor?.chain().focus().splitCell().run() },
    { label: 'Toggle header row', action: () => editor?.chain().focus().toggleHeaderRow().run() },
    { type: 'separator' },
    { label: 'Delete table', action: () => editor?.chain().focus().deleteTable().run(), danger: true },
  ];
  const generalMenuItems: MenuItem[] = [
    { label: 'Insert table', action: () => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
    { type: 'separator' },
    { label: 'Bold', action: () => editor?.chain().focus().toggleBold().run() },
    { label: 'Italic', action: () => editor?.chain().focus().toggleItalic().run() },
    { type: 'separator' },
    { label: 'Heading 2', action: () => editor?.chain().focus().toggleHeading({ level: 2 }).run() },
    { label: 'Heading 3', action: () => editor?.chain().focus().toggleHeading({ level: 3 }).run() },
    { label: 'Bullet list', action: () => editor?.chain().focus().toggleBulletList().run() },
    { type: 'separator' },
    { label: 'Horizontal rule', action: () => editor?.chain().focus().setHorizontalRule().run() },
  ];
  const contextMenuItems: MenuItem[] = contextMenu?.inTable ? tableMenuItems : generalMenuItems;

  const btnClass = (active: boolean) =>
    `p-1 rounded transition-colors ${active ? 'bg-gray-200 text-gray-800' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`;

  return (
    <div className="overflow-hidden flex flex-col h-full">
      <div className="flex-1 overflow-auto">
        <EditorContent editor={editor} />
      </div>

      {/* Right-click context menu — rendered via portal, clamped to viewport */}
      {contextMenu && createPortal(
        <div
          ref={(el) => {
            (contextMenuRef as any).current = el;
            if (!el) return;
            const rect = el.getBoundingClientRect();
            const x = Math.min(contextMenu.x, window.innerWidth - rect.width - 4);
            const y = Math.min(contextMenu.y, window.innerHeight - rect.height - 4);
            el.style.left = `${Math.max(4, x)}px`;
            el.style.top = `${Math.max(4, y)}px`;
          }}
          className="fixed z-[9999] bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-[160px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {contextMenuItems.map((item, i) =>
            'type' in item && item.type === 'separator' ? (
              <div key={i} className="my-1 border-t border-gray-100" />
            ) : (
              <button
                key={i}
                onClick={() => { (item as any).action(); setContextMenu(null); }}
                className={`w-full text-left px-3 py-1.5 text-[11px] hover:bg-gray-50 transition-colors ${
                  (item as any).danger ? 'text-red-500' : 'text-gray-700'
                }`}
              >
                {(item as any).label}
              </button>
            )
          )}
        </div>,
        document.body
      )}
    </div>
  );
};

// ── Embedded PDF Viewer with zoom/pan ──

const PdfViewer: React.FC<{ file: string; filename: string }> = React.memo(({ file, filename }) => {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = React.useRef({ dragging: false, startX: 0, startY: 0, startPanX: 0, startPanY: 0 });
  const containerRef = React.useRef<HTMLDivElement>(null);

  const baseWidth = 480;

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.stopPropagation();
    setZoom(z => Math.min(4, Math.max(0.5, z + (e.deltaY < 0 ? 0.15 : -0.15))));
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    dragRef.current = { dragging: true, startX: e.clientX, startY: e.clientY, startPanX: pan.x, startPanY: pan.y };
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current.dragging) return;
      setPan({
        x: dragRef.current.startPanX + (ev.clientX - dragRef.current.startX),
        y: dragRef.current.startPanY + (ev.clientY - dragRef.current.startY),
      });
    };
    const onUp = () => {
      dragRef.current.dragging = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [pan]);

  const reset = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden bg-gray-50">
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-gray-200 bg-gray-100">
        <PaperclipIcon />
        <span className="text-xs font-medium text-gray-700 mr-auto">{filename}</span>
        <button onClick={() => setZoom(z => Math.max(0.5, z - 0.25))} className="p-1 rounded hover:bg-gray-200 text-gray-500" title="Zoom out">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /><line x1="8" y1="11" x2="14" y2="11" /></svg>
        </button>
        <span className="text-[10px] text-gray-500 min-w-[2.5rem] text-center tabular-nums">{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom(z => Math.min(4, z + 0.25))} className="p-1 rounded hover:bg-gray-200 text-gray-500" title="Zoom in">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /><line x1="11" y1="8" x2="11" y2="14" /><line x1="8" y1="11" x2="14" y2="11" /></svg>
        </button>
        <button onClick={reset} className="p-1 rounded hover:bg-gray-200 text-gray-500" title="Reset">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M1 4v6h6" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" /></svg>
        </button>
      </div>
      {/* PDF canvas with zoom/pan */}
      <div
        ref={containerRef}
        className="overflow-hidden cursor-grab active:cursor-grabbing select-none bg-gray-800"
        style={{ height: '28rem' }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
      >
        <div
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: 'top center',
            transition: dragRef.current.dragging ? 'none' : 'transform 0.1s ease-out',
          }}
        >
          <Document file={file} loading={<div className="flex items-center justify-center h-48 text-xs text-gray-400">Loading PDF...</div>}>
            <Page pageNumber={1} width={baseWidth} renderTextLayer={false} renderAnnotationLayer={false} />
          </Document>
        </div>
      </div>
    </div>
  );
});

// ── Main Component ──

const GaitanaLoginGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [signUpSuccess, setSignUpSuccess] = useState(false);
  const [orgAuthorized, setOrgAuthorized] = useState<boolean | null>(null);

  useEffect(() => {
    const sb = supabaseClient as any;
    sb.auth.getSession().then(({ data }: any) => {
      setSession(data?.session || null);
      setAuthLoading(false);
    });
    const { data: { subscription } } = sb.auth.onAuthStateChange((_event: string, s: any) => {
      setSession(s);
      if (!s) setOrgAuthorized(null);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Check org membership when session changes
  useEffect(() => {
    if (!session?.user?.id) { setOrgAuthorized(null); return; }
    const sb = supabaseClient as any;
    sb.from('user_organizations')
      .select('id')
      .eq('user_id', session.user.id)
      .eq('organization_id', GAITANA_ORG_ID)
      .limit(1)
      .then(({ data }: any) => {
        setOrgAuthorized(data && data.length > 0);
      });
  }, [session?.user?.id]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError(null);
    setSignUpSuccess(false);
    const sb = supabaseClient as any;
    if (isSignUp) {
      const { error } = await sb.auth.signUp({ email: loginEmail, password: loginPassword });
      if (error) {
        setLoginError(error.message);
      } else {
        setSignUpSuccess(true);
      }
    } else {
      const { error } = await sb.auth.signInWithPassword({ email: loginEmail, password: loginPassword });
      if (error) setLoginError(error.message);
    }
    setLoginLoading(false);
  };

  const handleGoogleSignIn = () => {
    const SUPA_URL = import.meta.env.VITE_SUPABASE_URL;
    const callback = `${window.location.origin}/auth/callback`;
    const encoded = encodeURIComponent(callback);
    window.location.href =
      `${SUPA_URL}/auth/v1/authorize` +
      `?provider=google` +
      `&redirect_to=${encoded}` +
      `&access_type=offline` +
      `&prompt=consent` +
      `&scopes=email profile`;
  };

  if (authLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50"><p className="text-gray-400 text-sm">Loading...</p></div>;
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 via-white to-emerald-50">
        <div className="w-full max-w-sm bg-white rounded-xl shadow-lg border border-gray-100 p-8">
          <h1 className="text-2xl font-bold text-center mb-1" style={{ color: '#53AD6D' }}>Frootful</h1>
          <p className="text-center text-xs text-gray-400 mb-6">La Gaitana Farms</p>
          {loginError && <div className="mb-4 bg-red-50 border border-red-200 rounded p-3 text-xs text-red-600">{loginError}</div>}
          {signUpSuccess && <div className="mb-4 bg-green-50 border border-green-200 rounded p-3 text-xs text-green-600">Check your email for a confirmation link.</div>}
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
              <input type="email" required value={loginEmail} onChange={e => setLoginEmail(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-green-400 focus:border-transparent"
                placeholder="you@example.com" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Password</label>
              <input type="password" required value={loginPassword} onChange={e => setLoginPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-green-400 focus:border-transparent"
                placeholder={isSignUp ? 'Create a password' : 'Enter password'} />
            </div>
            <button type="submit" disabled={loginLoading}
              className="w-full py-2.5 rounded-md text-sm font-medium text-white transition-colors disabled:opacity-50"
              style={{ backgroundColor: '#53AD6D' }}>
              {loginLoading ? (isSignUp ? 'Creating account...' : 'Signing in...') : (isSignUp ? 'Create account' : 'Sign in')}
            </button>
          </form>
          <p className="text-center text-xs text-gray-500 mt-3">
            {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
            <button onClick={() => { setIsSignUp(s => !s); setLoginError(null); setSignUpSuccess(false); }} className="text-green-600 hover:underline font-medium">
              {isSignUp ? 'Sign in' : 'Sign up'}
            </button>
          </p>
          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200" /></div>
            <div className="relative flex justify-center text-xs"><span className="bg-white px-2 text-gray-400">or</span></div>
          </div>
          <button onClick={handleGoogleSignIn}
            className="w-full flex items-center justify-center gap-2 py-2.5 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
            <svg width="16" height="16" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59a14.5 14.5 0 0 1 0-9.18l-7.98-6.19a24.0 24.0 0 0 0 0 21.56l7.98-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
            <span>Continue with Google</span>
          </button>
        </div>
      </div>
    );
  }

  if (orgAuthorized === null) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50"><p className="text-gray-400 text-sm">Checking access...</p></div>;
  }

  if (!orgAuthorized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 via-white to-emerald-50">
        <div className="w-full max-w-sm bg-white rounded-xl shadow-lg border border-gray-100 p-8 text-center">
          <h1 className="text-2xl font-bold mb-1" style={{ color: '#53AD6D' }}>Frootful</h1>
          <p className="text-xs text-gray-400 mb-6">La Gaitana Farms</p>
          <div className="mb-4 bg-amber-50 border border-amber-200 rounded p-4">
            <p className="text-sm font-medium text-amber-800 mb-1">Access Restricted</p>
            <p className="text-xs text-amber-600">Your account ({session.user.email}) is not authorized for this organization. Please contact an administrator to request access.</p>
          </div>
          <button
            onClick={async () => { const sb = supabaseClient as any; await sb.auth.signOut(); }}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return <GaitanaSessionContext.Provider value={session}>{children}</GaitanaSessionContext.Provider>;
};

const GaitanaSessionContext = React.createContext<any>(null);

const DashboardGaitanaInner: React.FC = () => {
  const session = React.useContext(GaitanaSessionContext);
  const userEmail = session?.user?.email;
  const userName = session?.user?.user_metadata?.full_name;
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    setSigningOut(true);
    const sb = supabaseClient as any;
    await sb.auth.signOut();
    setSigningOut(false);
  };
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('inbox');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [orderCreated, setOrderCreated] = useState(false);
  const [order2Created, setOrder2Created] = useState(false);
  const [proposals, setProposals] = useState<InboxProposal[]>([]);
  const [proposalsLoading, setProposalsLoading] = useState(true);
  const [acceptedProposals, setAcceptedProposals] = useState<Set<string>>(new Set());
  const [acceptingProposals, setAcceptingProposals] = useState<Set<string>>(new Set());
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [orderDetails, setOrderDetails] = useState<Record<string, OrderDetail>>({});
  const [orderDetailLoading, setOrderDetailLoading] = useState<string | null>(null);
  const [acceptErrors, setAcceptErrors] = useState<Record<string, string>>({});
  const [editingMd, setEditingMd] = useState<Record<string, string>>({});
  const [fileUrls, setFileUrls] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [recentUploads, setRecentUploads] = useState<Array<{ id: string; filename: string; status: 'uploading' | 'processing' | 'done' | 'error'; error?: string }>>([]);
  const [activityItems, setActivityItems] = useState<Array<{
    id: string;
    filename: string;
    created_at: string;
    stage: 'uploaded' | 'extracting' | 'ready' | 'sending' | 'completed' | 'failed' | 'dismissed';
    proposal_id?: string;
    po_number?: string;
    customer_name?: string;
    error?: string;
    webflor_order_link?: string;
    channel?: string;
    email_from?: string;
    email_subject?: string;
    email_body?: string;
    proposal_md?: string;
  }>>([]);
  const [expandedActivityId, setExpandedActivityId] = useState<string | null>(null);
  const [activityFiles, setActivityFiles] = useState<Record<string, Array<{ id: string; filename: string; mime_type: string; signedUrl?: string }>>>({});
  const [splitPercent, setSplitPercent] = useState(50);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [collapsedProposalIds, setCollapsedProposalIds] = useState<Set<string>>(new Set());
  const [modalProposalId, setModalProposalId] = useState<string | null>(null);
  const [inboxChannelFilter, setInboxChannelFilter] = useState<string | null>(null);
  const [activitySourceFilter, setActivitySourceFilter] = useState<string | null>(null);
  const splitDragging = React.useRef(false);
  const splitContainerRef = React.useRef<HTMLDivElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [chatMessages, setChatMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = React.useRef<HTMLDivElement>(null);
  const o = MOCK_ORDER;
  const o2 = MOCK_ORDER_2;

  // ── Drag-to-resize split panel ──
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!splitDragging.current || !splitContainerRef.current) return;
      const rect = splitContainerRef.current.getBoundingClientRect();
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      setSplitPercent(Math.min(80, Math.max(20, pct)));
    };
    const onMouseUp = () => { splitDragging.current = false; document.body.style.cursor = ''; document.body.style.userSelect = ''; };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => { window.removeEventListener('mousemove', onMouseMove); window.removeEventListener('mouseup', onMouseUp); };
  }, []);

  // Fetch proposals from Supabase
  const fetchProposals = useCallback(async () => {
    try {
      const sb = supabaseClient as any;
      const { data, error } = await sb
        .from('order_change_proposals')
        .select(`
          id, status, type, created_at, tags, metadata, notes,
          intake_events ( channel, raw_content, created_at ),
          order_change_proposal_lines (
            id, change_type, item_name, proposed_values, line_number
          )
        `)
        .eq('organization_id', GAITANA_ORG_ID)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading proposals:', error);
        return;
      }

      // Fetch intake_files for all intake events
      const { data: data2 } = await sb
        .from('order_change_proposals')
        .select('id, intake_event_id')
        .in('id', (data || []).map((r: any) => r.id));

      const eventIdMap: Record<string, string> = {};
      for (const row of (data2 || [])) {
        if (row.intake_event_id) eventIdMap[row.id] = row.intake_event_id;
      }

      const allEventIds = [...new Set(Object.values(eventIdMap))];
      let filesByEvent: Record<string, ProposalFile[]> = {};
      if (allEventIds.length > 0) {
        const { data: filesData } = await sb
          .from('intake_files')
          .select('id, intake_event_id, filename, extension, mime_type, size_bytes, storage_path')
          .in('intake_event_id', allEventIds);
        if (filesData) {
          for (const f of filesData) {
            const evId = f.intake_event_id as string;
            if (!filesByEvent[evId]) filesByEvent[evId] = [];
            filesByEvent[evId].push({
              id: f.id,
              filename: f.filename,
              extension: f.extension,
              mime_type: f.mime_type,
              size_bytes: f.size_bytes,
              storage_path: f.storage_path,
            });
          }
        }
      }

      const transformed: InboxProposal[] = (data || []).map((row: any) => {
        const ie = row.intake_events;
        const rawContent = ie?.raw_content || {};
        const channel = ie?.channel || 'email';
        const eventId = eventIdMap[row.id];

        return {
          id: row.id,
          status: row.status,
          type: row.type,
          created_at: row.created_at,
          tags: row.tags || {},
          metadata: row.metadata,
          notes: row.notes,
          intake_event_id: eventId || null,
          channel,
          email_subject: rawContent.subject || '(no subject)',
          email_from: rawContent.from || 'Unknown sender',
          email_body: rawContent.body_text || rawContent.body || '',
          files: eventId ? (filesByEvent[eventId] || []) : [],
          lines: (row.order_change_proposal_lines || []).map((pl: any) => ({
            id: pl.id,
            change_type: pl.change_type,
            item_name: pl.item_name,
            proposed_values: pl.proposed_values,
            line_number: pl.line_number,
          })),
        };
      });

      setProposals(transformed);
    } catch (err) {
      console.error('Failed to fetch proposals:', err);
    } finally {
      setProposalsLoading(false);
    }
  }, []);

  useEffect(() => { fetchProposals(); }, [fetchProposals]);

  // Fetch orders from Supabase
  const fetchOrders = useCallback(async () => {
    setOrdersLoading(true);
    try {
      const sb = supabaseClient as any;
      const { data, error } = await sb
        .from('orders')
        .select('id, customer_name, customer_reference, status, delivery_date, total_amount, created_at, origin_intake_event_id, source_channel, metadata')
        .eq('organization_id', GAITANA_ORG_ID)
        .order('created_at', { ascending: false });
      if (error) {
        console.error('Failed to fetch orders:', error);
      } else {
        setOrders(data || []);
      }
    } catch (err) {
      console.error('Orders fetch error:', err);
    } finally {
      setOrdersLoading(false);
    }
  }, []);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  // Fetch activity feed — recent intake events with their proposal/order status
  const fetchActivity = useCallback(async () => {
    try {
      const sb = supabaseClient as any;
      // Get recent intake events for this org
      const { data: events } = await sb
        .from('intake_events')
        .select('id, created_at, channel, raw_content, status')
        .eq('organization_id', GAITANA_ORG_ID)
        .order('created_at', { ascending: false })
        .limit(10);
      if (!events?.length) return;

      // Get proposals for these events
      const eventIds = events.map((e: any) => e.id);
      const { data: props } = await sb
        .from('order_change_proposals')
        .select('id, intake_event_id, status, metadata, tags')
        .in('intake_event_id', eventIds);

      const propByEvent: Record<string, any> = {};
      for (const p of (props || [])) {
        propByEvent[p.intake_event_id] = p;
      }

      // Get orders linked to these proposals for webflor_order_link
      const proposalIds = (props || []).filter((p: any) => p.status === 'accepted').map((p: any) => p.id);
      let orderByProposal: Record<string, any> = {};
      if (proposalIds.length > 0) {
        const { data: ords } = await sb
          .from('orders')
          .select('id, status, metadata')
          .in('metadata->>proposal_id', proposalIds);
        for (const o of (ords || [])) {
          const pid = (o.metadata as any)?.proposal_id;
          if (pid) orderByProposal[pid] = o;
        }
      }

      const items = events.map((ev: any) => {
        const prop = propByEvent[ev.id];
        const filename = ev.raw_content?.subject || 'Unknown';
        const order = prop ? orderByProposal[prop.id] : null;

        let stage: string = 'uploaded';
        let error: string | undefined;
        let webflor_order_link: string | undefined;

        if (prop) {
          // Proposal exists — derive stage from proposal status
          if (prop.status === 'failed') {
            stage = 'failed';
            error = prop.tags?.extraction_error || 'Extraction failed';
          } else if (prop.status === 'rejected') {
            stage = 'dismissed';
          } else if (prop.status === 'pending') {
            // Only "ready" if extraction has actually produced content (webflor_order_md).
            // The proposal is created before extraction finishes, so we must check for actual content.
            stage = prop.metadata?.webflor_order_md ? 'ready' : 'extracting';
          } else if (prop.status === 'accepted') {
            const syncStatus = prop.tags?.erp_sync_status;
            if (syncStatus === 'completed') {
              stage = 'completed';
              webflor_order_link = order?.metadata?.webflor_order_link;
            } else if (syncStatus === 'failed') {
              stage = 'failed';
              error = prop.tags?.erp_error;
            } else {
              stage = 'sending';
            }
          }
        } else {
          // No proposal yet — use intake_event.status
          if (ev.status === 'processing') {
            stage = 'extracting';
          } else if (ev.status === 'failed') {
            stage = 'failed';
            error = 'Extraction failed';
          } else {
            stage = 'uploaded'; // received
          }
        }

        return {
          id: ev.id,
          filename,
          created_at: ev.created_at,
          stage,
          proposal_id: prop?.id,
          po_number: prop?.metadata?.po_number,
          customer_name: prop?.metadata?.customer_name,
          error,
          webflor_order_link,
          channel: ev.channel || 'upload',
          email_from: ev.raw_content?.from,
          email_subject: ev.raw_content?.subject,
          email_body: ev.raw_content?.body_text || ev.raw_content?.body,
          proposal_md: prop?.metadata?.webflor_order_md,
        };
      });

      setActivityItems(items);
    } catch (err) {
      console.error('Failed to fetch activity:', err);
    }
  }, []);

  useEffect(() => { fetchActivity(); }, [fetchActivity]);

  // Poll proposals + activity every 30s
  useEffect(() => {
    const interval = setInterval(() => { fetchProposals(); fetchActivity(); }, 30000);
    return () => clearInterval(interval);
  }, [fetchProposals, fetchActivity]);

  // Poll activity every 10s while there are in-progress items
  useEffect(() => {
    const hasInProgress = activityItems.some(a => a.stage === 'extracting' || a.stage === 'sending');
    if (!hasInProgress) return;
    const interval = setInterval(fetchActivity, 10000);
    return () => clearInterval(interval);
  }, [activityItems, fetchActivity]);

  // Poll proposals every 5s while any are still extracting (no md yet)
  useEffect(() => {
    const hasExtracting = proposals.some(p => p.lines.length === 0 && !p.metadata?.webflor_order_md);
    if (!hasExtracting) return;
    const interval = setInterval(fetchProposals, 5000);
    return () => clearInterval(interval);
  }, [proposals, fetchProposals]);

  // Fetch files for an expanded activity item
  const fetchActivityFiles = useCallback(async (intakeEventId: string) => {
    if (activityFiles[intakeEventId]) return;
    try {
      const sb = supabaseClient as any;
      const { data: files } = await sb
        .from('intake_files')
        .select('id, filename, mime_type, storage_path')
        .eq('intake_event_id', intakeEventId);
      if (files?.length) {
        const withUrls = await Promise.all(files.map(async (f: any) => {
          const { data } = await sb.storage.from('intake-files').createSignedUrl(f.storage_path, 3600);
          return { id: f.id, filename: f.filename, mime_type: f.mime_type, signedUrl: data?.signedUrl };
        }));
        setActivityFiles(prev => ({ ...prev, [intakeEventId]: withUrls }));
      } else {
        setActivityFiles(prev => ({ ...prev, [intakeEventId]: [] }));
      }
    } catch (err) {
      console.error('Failed to fetch activity files:', err);
    }
  }, [activityFiles]);

  // Fetch order detail (intake event, files, proposal) on expand
  const fetchOrderDetail = useCallback(async (order: OrderRow) => {
    if (orderDetails[order.id]) return; // already fetched
    setOrderDetailLoading(order.id);
    try {
      const sb = supabaseClient as any;
      const detail: OrderDetail = { channel: null, email_subject: null, email_from: null, email_body: null, files: [], fileUrls: {}, proposalMd: null, proposalStatus: null };

      if (order.origin_intake_event_id) {
        // Fetch intake event
        const { data: ie } = await sb.from('intake_events').select('raw_content, channel').eq('id', order.origin_intake_event_id).single();
        if (ie) {
          detail.channel = ie.channel || null;
          if (ie.raw_content) {
            detail.email_subject = ie.raw_content.subject || null;
            detail.email_from = ie.raw_content.from || null;
            detail.email_body = ie.raw_content.body_text || ie.raw_content.body || null;
          }
        }

        // Fetch intake files
        const { data: files } = await sb.from('intake_files').select('id, filename, mime_type, size_bytes, storage_path').eq('intake_event_id', order.origin_intake_event_id);
        if (files) {
          detail.files = files;
          // Get signed URLs
          for (const file of files) {
            const { data } = await sb.storage.from('intake-files').createSignedUrl(file.storage_path, 3600);
            if (data?.signedUrl) detail.fileUrls[file.id] = data.signedUrl;
          }
        }

        // Fetch proposal
        const { data: proposals } = await sb.from('order_change_proposals').select('metadata, status').eq('intake_event_id', order.origin_intake_event_id).limit(1);
        if (proposals?.[0]) {
          detail.proposalMd = proposals[0].metadata?.webflor_order_md || null;
          detail.proposalStatus = proposals[0].status;
        }
      }

      setOrderDetails(prev => ({ ...prev, [order.id]: detail }));
    } catch (err) {
      console.error('Failed to fetch order detail:', err);
    } finally {
      setOrderDetailLoading(null);
    }
  }, [orderDetails]);

  // Accept proposal → call resolve-gaitana-proposal edge function (handles order creation + orchestrator trigger)
  const handleAcceptProposal = useCallback(async (proposalId: string) => {
    setAcceptingProposals(prev => new Set([...prev, proposalId]));
    setAcceptErrors(prev => { const next = { ...prev }; delete next[proposalId]; return next; });
    try {
      const sb = supabaseClient as any;
      const proposal = proposals.find(p => p.id === proposalId);
      if (!proposal) throw new Error('Proposal not found');

      // 1. Save edited markdown back to proposal metadata if changed
      const editedMd = editingMd[proposalId];
      if (editedMd) {
        const metadata = { ...(proposal.metadata || {}), webflor_order_md: editedMd, edited: true };
        await sb.from('order_change_proposals').update({ metadata }).eq('id', proposalId);
      }

      // 2. Call edge function — it handles: mark accepted, create order, insert events, trigger orchestrator
      const { data: sessionData } = await sb.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error('Not authenticated — please sign in');
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const res = await fetch(`${supabaseUrl}/functions/v1/resolve-gaitana-proposal`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ proposalId }),
      });
      const result = await res.json();
      if (!result.success) throw new Error(result.error || 'Edge function failed');

      setAcceptedProposals(prev => new Set([...prev, proposalId]));
      fetchOrders();
      fetchActivity();
    } catch (err: any) {
      console.error('Accept proposal failed:', err);
      setAcceptErrors(prev => ({ ...prev, [proposalId]: err.message || 'Failed to create order' }));
    } finally {
      setAcceptingProposals(prev => { const next = new Set(prev); next.delete(proposalId); return next; });
    }
  }, [proposals, editingMd, fetchOrders, fetchActivity]);

  // Dismiss proposal → update status to 'rejected' in Supabase
  const [dismissingProposals, setDismissingProposals] = useState<Set<string>>(new Set());
  const handleDismissProposal = useCallback(async (proposalId: string) => {
    setDismissingProposals(prev => new Set([...prev, proposalId]));
    try {
      const sb = supabaseClient as any;
      await sb.from('order_change_proposals')
        .update({ status: 'rejected', reviewed_at: new Date().toISOString() })
        .eq('id', proposalId);
      setProposals(prev => prev.filter(p => p.id !== proposalId));
    } catch (err: any) {
      console.error('Dismiss proposal failed:', err);
    } finally {
      setDismissingProposals(prev => { const next = new Set(prev); next.delete(proposalId); return next; });
    }
  }, []);

  // Upload PO PDF via edge function (service role bypasses RLS)
  const handleUploadPO = useCallback(async (file: File) => {
    const uploadId = crypto.randomUUID();
    setRecentUploads(prev => [{ id: uploadId, filename: file.name, status: 'uploading' }, ...prev]);
    setUploading(true);
    setUploadError(null);
    setUploadSuccess(null);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const sb = supabaseClient as any;
      const { data: { session } } = await sb.auth.getSession();
      const token = session?.access_token;

      const formData = new FormData();
      formData.append('file', file);
      formData.append('organization_id', GAITANA_ORG_ID);

      const res = await fetch(`${supabaseUrl}/functions/v1/upload-intake-file`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Upload failed');

      setRecentUploads(prev => prev.map(u => u.id === uploadId ? { ...u, status: 'processing' as const } : u));
      setUploadSuccess(`${file.name} uploaded — processing...`);
      fetchActivity();

      // Poll for proposal creation, then mark done
      const pollInterval = setInterval(async () => {
        await fetchProposals();
        await fetchActivity();
      }, 5000);
      setTimeout(() => {
        clearInterval(pollInterval);
        setRecentUploads(prev => prev.map(u => u.id === uploadId ? { ...u, status: 'done' as const } : u));
        setUploadSuccess(null);
      }, 60000);
    } catch (err: any) {
      console.error('Upload failed:', err);
      setUploadError(err.message || 'Upload failed');
      setRecentUploads(prev => prev.map(u => u.id === uploadId ? { ...u, status: 'error' as const, error: err.message } : u));
    } finally {
      setUploading(false);
    }
  }, [fetchProposals, fetchActivity]);

  // Handle drag and drop
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleUploadPO(file);
  }, [handleUploadPO]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  // Resolve storage_path → signed URLs for PDF files (only when file IDs change)
  const prevFileIdsRef = React.useRef<string>('');
  useEffect(() => {
    if (proposals.length === 0) return;
    const allFiles = proposals.flatMap(p => p.files);
    if (allFiles.length === 0) return;
    const fileIdsKey = allFiles.map(f => f.id).sort().join(',');
    if (fileIdsKey === prevFileIdsRef.current) return;
    prevFileIdsRef.current = fileIdsKey;
    (async () => {
      const sb = supabaseClient as any;
      const urls: Record<string, string> = {};
      for (const file of allFiles) {
        if (file.storage_path.startsWith('/demo/')) {
          urls[file.id] = file.storage_path;
        } else {
          const { data } = await sb.storage.from('intake-files').createSignedUrl(file.storage_path, 3600);
          if (data?.signedUrl) urls[file.id] = data.signedUrl;
        }
      }
      setFileUrls(urls);
    })();
  }, [proposals]);

  return (
    <div className="flex h-screen">
      {/* ── Sidebar ── */}
      <nav className={`${sidebarCollapsed ? 'w-16' : 'w-56'} flex-shrink-0 bg-white border-r border-gray-200 flex flex-col transition-all duration-200`}>
        {/* Logo */}
        <div className={`h-16 flex items-center justify-between ${sidebarCollapsed ? 'px-2' : 'px-4'} border-b border-gray-100`}>
          {sidebarCollapsed ? (
            <button onClick={() => setSidebarCollapsed(false)} className="w-full flex justify-center p-2 rounded-lg hover:bg-gray-100 transition-colors" title="Expand sidebar">
              <svg width="28" height="28" viewBox="0 0 100 100" fill="none"><path d="M50 10 L85 45 L75 55 L50 30 L25 55 L15 45 Z" fill={frootfulGreen} /><path d="M50 35 L75 60 L65 70 L50 55 L35 70 L25 60 Z" fill={frootfulGreen} /></svg>
            </button>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <svg width="28" height="28" viewBox="0 0 100 100" fill="none"><path d="M50 10 L85 45 L75 55 L50 30 L25 55 L15 45 Z" fill={frootfulGreen} /><path d="M50 35 L75 60 L65 70 L50 55 L35 70 L25 60 Z" fill={frootfulGreen} /></svg>
                <span className="text-2xl font-bold" style={{ color: frootfulGreen }}>Frootful</span>
              </div>
              <button onClick={() => setSidebarCollapsed(true)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors" title="Collapse sidebar">
                <ChevronLeftIcon />
              </button>
            </>
          )}
        </div>

        {/* Nav items */}
        <div className="flex-1 py-4">
          <div className={`space-y-1 ${sidebarCollapsed ? 'px-2' : 'px-3'}`}>
            <button
              onClick={() => setSidebarTab('inbox')}
              className={`relative w-full flex items-center ${sidebarCollapsed ? 'justify-center' : ''} gap-3 px-3 py-2.5 rounded-lg transition-colors ${sidebarTab === 'inbox' ? 'text-white' : 'text-gray-600 hover:bg-gray-100'}`}
              style={sidebarTab === 'inbox' ? { backgroundColor: frootfulGreen } : undefined}
              title="Inbox"
            >
              <InboxIcon />
              {!sidebarCollapsed && <span className="font-medium">Inbox</span>}
              {proposals.filter(p => !acceptedProposals.has(p.id)).length > 0 && (
                <span className={`${sidebarCollapsed ? 'absolute -top-1 -right-1' : 'ml-auto'} min-w-[20px] h-5 flex items-center justify-center bg-red-500 text-white text-xs font-bold rounded-full px-1`}>{proposals.filter(p => !acceptedProposals.has(p.id)).length}</span>
              )}
            </button>
            {/* Upload PO — commented out until edge function is deployed
            <button
              onClick={() => setSidebarTab('upload')}
              className={`w-full flex items-center ${sidebarCollapsed ? 'justify-center' : ''} gap-3 px-3 py-2.5 rounded-lg transition-colors ${sidebarTab === 'upload' ? 'text-white' : 'text-gray-600 hover:bg-gray-100'}`}
              style={sidebarTab === 'upload' ? { backgroundColor: frootfulGreen } : undefined}
              title="Upload PO"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" /></svg>
              {!sidebarCollapsed && <span className="font-medium">Upload PO</span>}
            </button>
            */}
            <button
              onClick={() => setSidebarTab('orders')}
              className={`w-full flex items-center ${sidebarCollapsed ? 'justify-center' : ''} gap-3 px-3 py-2.5 rounded-lg transition-colors ${sidebarTab === 'orders' ? 'text-white' : 'text-gray-600 hover:bg-gray-100'}`}
              style={sidebarTab === 'orders' ? { backgroundColor: frootfulGreen } : undefined}
              title="Orders"
            >
              <PackageIcon />
              {!sidebarCollapsed && <span className="font-medium">Orders</span>}
            </button>
            <button
              onClick={() => setSidebarTab('metrics')}
              className={`w-full flex items-center ${sidebarCollapsed ? 'justify-center' : ''} gap-3 px-3 py-2.5 rounded-lg transition-colors ${sidebarTab === 'metrics' ? 'text-white' : 'text-gray-600 hover:bg-gray-100'}`}
              style={sidebarTab === 'metrics' ? { backgroundColor: frootfulGreen } : undefined}
              title="Metrics"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M3 3v18h18M7 16l4-4 4 4 5-5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              {!sidebarCollapsed && <span className="font-medium">Metrics</span>}
            </button>
            {/* Chat sidebar tab — commented out, using Dify widget instead
            <button
              onClick={() => setSidebarTab('chat')}
              className={`w-full flex items-center ${sidebarCollapsed ? 'justify-center' : ''} gap-3 px-3 py-2.5 rounded-lg transition-colors ${sidebarTab === 'chat' ? 'text-white' : 'text-gray-600 hover:bg-gray-100'}`}
              style={sidebarTab === 'chat' ? { backgroundColor: frootfulGreen } : undefined}
              title="Chat"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
              {!sidebarCollapsed && <span className="font-medium">Chat</span>}
            </button>
            */}
          </div>
        </div>

        {/* Bottom: user info + sign out */}
        <div className={`border-t border-gray-100 ${sidebarCollapsed ? 'px-2 py-3' : 'px-4 py-3'}`}>
          {sidebarCollapsed ? (
            <div className="relative">
              <button
                onClick={() => setUserMenuOpen(o => !o)}
                className="w-full flex justify-center p-2 rounded-lg hover:bg-gray-100 transition-colors"
                title={userName || userEmail || 'User'}
              >
                <div className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center">
                  <svg className="w-4 h-4 text-green-700" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 3a4 4 0 100 8 4 4 0 000-8z" /></svg>
                </div>
              </button>
              {userMenuOpen && (
                <div className="absolute bottom-full left-0 mb-1 w-48 bg-white rounded-lg shadow-lg py-1 z-50 border border-gray-200">
                  <div className="px-4 py-2 border-b border-gray-100">
                    <p className="text-xs font-medium text-gray-700 truncate">{userName || userEmail}</p>
                    {userName && <p className="text-[10px] text-gray-400 truncate">{userEmail}</p>}
                  </div>
                  <button
                    onClick={() => { setUserMenuOpen(false); handleSignOut(); }}
                    disabled={signingOut}
                    className="flex items-center gap-2 w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" /></svg>
                    <span>{signingOut ? 'Signing out...' : 'Sign Out'}</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="relative">
              <button
                onClick={() => setUserMenuOpen(o => !o)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <div className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-green-700" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 3a4 4 0 100 8 4 4 0 000-8z" /></svg>
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-xs font-medium text-gray-700 truncate">{userName || userEmail}</p>
                  <p className="text-[10px] text-gray-400">La Gaitana Farms</p>
                </div>
                <svg className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ${userMenuOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6" /></svg>
              </button>
              {userMenuOpen && (
                <div className="absolute bottom-full left-0 right-0 mb-1 bg-white rounded-lg shadow-lg py-1 z-50 border border-gray-200">
                  <button
                    onClick={() => { setUserMenuOpen(false); handleSignOut(); }}
                    disabled={signingOut}
                    className="flex items-center gap-2 w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" /></svg>
                    <span>{signingOut ? 'Signing out...' : 'Sign Out'}</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </nav>

      {/* ── Main Content ── */}
      <main className="flex-1 min-w-0 overflow-y-auto bg-gray-50">
        {sidebarTab === 'inbox' && (
          <div className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
              <h3 className="text-lg font-semibold text-gray-900">Inbox</h3>
              {(() => {
                const pendingCount = proposals.filter(p => !acceptedProposals.has(p.id)).length;
                return pendingCount > 0 ? (
                  <span className="ml-1 px-2 py-0.5 text-xs font-bold bg-red-100 text-red-600 rounded-full">
                    {pendingCount} new
                  </span>
                ) : null;
              })()}
              <button
                onClick={() => { setProposalsLoading(true); fetchProposals(); fetchActivity(); }}
                className="ml-auto p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                title="Refresh"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              </button>
            </div>

            {(() => {
              const isExtracting = (p: InboxProposal) => p.lines.length === 0 && !p.metadata?.webflor_order_md;
              const needsAttention = proposals.filter(p => !acceptedProposals.has(p.id) && !isExtracting(p)).length;
              const extractingCount = proposals.filter(p => isExtracting(p)).length;
              return (
                <>
                  {needsAttention > 0 && <p className="text-xs font-medium text-amber-600 mb-1">{needsAttention} needs attention</p>}
                  {extractingCount > 0 && <p className="text-xs font-medium text-blue-500 mb-1">{extractingCount} extracting</p>}
                </>
              );
            })()}

            <div className="mb-6">
              {proposalsLoading ? (
                <div className="text-center py-12 text-gray-400 text-sm">Loading proposals...</div>
              ) : proposals.length === 0 ? (
                <div className="text-center py-12 text-gray-400 text-sm">No pending proposals</div>
              ) : (
                <div className="space-y-3">
                  {proposals.filter(p => {
                    if (!inboxChannelFilter) return true;
                    if (inboxChannelFilter === 'attention') return !acceptedProposals.has(p.id);
                    if (inboxChannelFilter === 'accepted') return acceptedProposals.has(p.id);
                    return true;
                  }).map((proposal) => {
                    const isAccepted = acceptedProposals.has(proposal.id);
                    return (
                      <div key={proposal.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col lg:flex-row" style={{ height: '600px' }}>
                        {/* Left: source document */}
                        <div className="bg-white overflow-hidden flex flex-col min-h-0 border-r border-gray-200" style={{ width: `${splitPercent}%`, flexShrink: 0 }} ref={splitContainerRef}>
                          {/* Sender header */}
                          <div className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-200 bg-gray-50/80 flex-shrink-0">
                            <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-gray-900 truncate">{proposal.email_from || '—'}</p>
                              <p className="text-[11px] text-gray-500 truncate">{proposal.email_subject || '—'}</p>
                            </div>
                            {proposal.type && (
                              <span className="px-1.5 py-0.5 text-[10px] font-medium bg-purple-50 text-purple-600 rounded flex-shrink-0 whitespace-nowrap">
                                {proposal.type.replace('_', ' ')}
                              </span>
                            )}
                            <span className="text-[11px] text-gray-400 flex-shrink-0 whitespace-nowrap">
                              {new Date(proposal.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Bogota' })}
                            </span>
                            {isAccepted ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border bg-blue-50 text-blue-700 border-blue-200 whitespace-nowrap flex-shrink-0">
                                <svg className="w-2.5 h-2.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                                Sending
                              </span>
                            ) : proposal.lines.length === 0 && !proposal.metadata?.webflor_order_md ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border bg-blue-50 text-blue-600 border-blue-200 whitespace-nowrap flex-shrink-0">
                                <svg className="w-2.5 h-2.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                                Extracting
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border bg-amber-50 text-amber-700 border-amber-200 whitespace-nowrap flex-shrink-0">
                                <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><path d="M12 8v4m0 4h.01" /></svg>
                                Needs attention
                              </span>
                            )}
                          </div>
                          {/* File tabs */}
                          {(() => {
                            const isEmbeddedImage = (f: { filename: string; mime_type: string }) =>
                              f.mime_type?.startsWith('image/') && /^image\d+\.\w+$/i.test(f.filename);
                            const visibleFiles = proposal.files.filter(f => fileUrls[f.id] && !isEmbeddedImage(f));
                            if (visibleFiles.length === 0) {
                              if (proposal.files.length > 0) return <p className="p-4 text-[10px] text-gray-400 italic">Loading attachments...</p>;
                              return <p className="p-4 text-[10px] text-gray-300 italic">No attachments</p>;
                            }
                            const activeFileId = selectedFileId || visibleFiles[0]?.id;
                            const activeFile = visibleFiles.find(f => f.id === activeFileId) || visibleFiles[0];
                            return (
                              <>
                                {visibleFiles.length > 1 && (
                                  <div className="flex border-b border-gray-100 bg-gray-50 overflow-x-auto flex-shrink-0">
                                    {visibleFiles.map(file => (
                                      <button
                                        key={file.id}
                                        onClick={() => setSelectedFileId(file.id)}
                                        className={`px-3 py-1.5 text-[11px] font-medium whitespace-nowrap border-b-2 transition-colors ${
                                          file.id === activeFile.id
                                            ? 'border-blue-500 text-blue-700 bg-white'
                                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                                        }`}
                                      >
                                        {file.filename}
                                      </button>
                                    ))}
                                  </div>
                                )}
                                <div className="flex-1 min-h-0 overflow-auto">
                                  {activeFile.mime_type === 'application/pdf' ? (
                                    <PdfViewer key={activeFile.id} file={fileUrls[activeFile.id]} filename={activeFile.filename} />
                                  ) : activeFile.mime_type?.startsWith('image/') ? (
                                    <div className="p-4">
                                      <img src={fileUrls[activeFile.id]} alt={activeFile.filename} className="max-w-full rounded border border-gray-200" />
                                    </div>
                                  ) : (
                                    <a href={fileUrls[activeFile.id]} target="_blank" rel="noopener noreferrer"
                                      className="flex items-center gap-2 m-4 px-3 py-2 rounded border border-gray-200 hover:bg-gray-50 text-xs text-blue-600">
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                      {activeFile.filename}
                                    </a>
                                  )}
                                </div>
                              </>
                            );
                          })()}
                          {/* Email body toggle at bottom */}
                          {proposal.email_body && (
                            <details className="border-t border-gray-100 flex-shrink-0">
                              <summary className="px-4 py-2 text-[10px] text-gray-400 cursor-pointer hover:text-gray-500 select-none">Show email body</summary>
                              <pre className="px-4 pb-3 text-[10px] text-gray-500 whitespace-pre-wrap font-sans max-h-32 overflow-auto leading-relaxed">{proposal.email_body}</pre>
                            </details>
                          )}
                        </div>

                        {/* Drag handle */}
                        <div
                          className="hidden lg:flex w-3 cursor-col-resize items-center justify-center group flex-shrink-0"
                          onMouseDown={(e) => { e.preventDefault(); splitDragging.current = true; document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none'; }}
                        >
                          <div className="w-0.5 h-8 bg-gray-200 rounded-full group-hover:bg-blue-400 group-active:bg-blue-500 transition-colors" />
                        </div>

                        {/* Right: AI proposal */}
                        <div className="flex-1 min-w-0 bg-white overflow-hidden flex flex-col">
                          {/* Right panel header */}
                          <div className="flex items-center justify-between px-4 py-2 border-b border-blue-100 bg-blue-50/60 flex-shrink-0">
                            <div className="flex items-center gap-2">
                              <svg className="w-3.5 h-3.5 text-blue-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
                              <p className="text-[11px] font-semibold text-blue-700 uppercase tracking-wider">AI Proposal</p>
                              {!!proposal.metadata?.webflor_order_md && (
                                <span className="text-[10px] text-green-600 font-medium">Extracted</span>
                              )}
                            </div>
                            <button
                              onClick={() => setModalProposalId(proposal.id)}
                              className="p-1 text-gray-400 hover:text-gray-600 rounded transition-colors"
                              title="Expand"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5" /></svg>
                            </button>
                          </div>
                          {isAccepted ? (
                            <div className="p-5">
                              <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                                <div className="flex items-center gap-2 mb-3">
                                  <svg className="w-4 h-4 animate-spin text-blue-600" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                                  <span className="text-sm font-semibold text-blue-800">Sending to WebFlor</span>
                                </div>
                                <p className="text-xs text-gray-500">The order is being created in WebFlor. This usually takes 1–2 minutes. Check the Orders tab for status.</p>
                              </div>
                            </div>
                          ) : proposal.lines.length === 0 && !proposal.metadata?.webflor_order_md ? (
                            <div className="flex flex-col items-center justify-center flex-1 gap-3 p-8 text-center">
                              <svg className="w-6 h-6 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                              <p className="text-sm font-medium text-gray-700">Extracting order data...</p>
                              <p className="text-xs text-gray-400">The AI agent is reading the PO and extracting order details. This usually takes 1–2 minutes.</p>
                            </div>
                          ) : (
                            <div className="flex flex-col flex-1 overflow-hidden">
                              <div className="overflow-auto flex-1 min-h-0">
                                {proposal.lines.length > 0 && (
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="text-[9px] text-gray-400 uppercase tracking-wider border-b border-gray-100">
                                        <th className="px-4 py-2 text-left font-medium">Item</th>
                                        <th className="px-4 py-2 text-center font-medium">Type</th>
                                        <th className="px-4 py-2 text-center font-medium">Qty</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {proposal.lines.sort((a, b) => (a.line_number || 0) - (b.line_number || 0)).map(line => (
                                        <tr key={line.id} className="border-b border-gray-50">
                                          <td className="px-4 py-2 text-gray-800">{line.item_name}</td>
                                          <td className="px-4 py-2 text-center">
                                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                              line.change_type === 'add' ? 'bg-green-50 text-green-600' :
                                              line.change_type === 'remove' ? 'bg-red-50 text-red-600' :
                                              'bg-yellow-50 text-yellow-600'
                                            }`}>{line.change_type}</span>
                                          </td>
                                          <td className="px-4 py-2 text-center text-gray-600">{(line.proposed_values as any)?.quantity ?? '—'}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                )}

                                {proposal.lines.length === 0 && !!proposal.metadata?.webflor_order_md && (
                                  <div className="h-full">
                                    <MarkdownEditor
                                      content={editingMd[proposal.id] ?? String((proposal.metadata as Record<string, unknown>).webflor_order_md)}
                                      onChange={(md) => setEditingMd(prev => ({ ...prev, [proposal.id]: md }))}
                                    />
                                  </div>
                                )}

                                {proposal.notes && (
                                  <p className="px-4 py-2 text-[11px] text-gray-500 italic">{proposal.notes}</p>
                                )}
                              </div>

                              {/* Action bar */}
                              <div className="px-4 py-3 border-t border-gray-200">
                                {acceptErrors[proposal.id] && (
                                  <p className="text-[11px] text-red-500 mb-2">Error: {acceptErrors[proposal.id]}</p>
                                )}
                                <div className="flex items-center justify-between">
                                  <button
                                    onClick={() => handleDismissProposal(proposal.id)}
                                    disabled={dismissingProposals.has(proposal.id)}
                                    className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors disabled:opacity-50"
                                  >
                                    {dismissingProposals.has(proposal.id) ? 'Dismissing...' : 'Dismiss'}
                                  </button>
                                  <button
                                    onClick={() => handleAcceptProposal(proposal.id)}
                                    disabled={acceptingProposals.has(proposal.id)}
                                    className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    style={{ backgroundColor: frootfulGreen }}
                                  >
                                    {acceptingProposals.has(proposal.id) ? (
                                      <>
                                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                                        Sending...
                                      </>
                                    ) : (
                                      <>
                                        <CheckIcon />
                                        Send to WebFlor
                                      </>
                                    )}
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                      );
                    })}
                  </div>
                )}
              </div>

            {/* Activity Feed */}
            {activityItems.length > 0 && (
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">All Activity</h4>
                  <span className="text-[10px] text-gray-300">Colombia (UTC-5)</span>
                  <div className="flex items-center gap-1.5 ml-4">
                    {([null, 'email', 'phone', 'sms', 'edi', 'upload'] as const).map(ch => {
                      const count = ch === null ? activityItems.length : activityItems.filter(a => (a.channel || 'upload') === ch).length;
                      return (
                        <button
                          key={ch ?? 'all'}
                          onClick={() => setActivitySourceFilter(ch)}
                          className={`px-2 py-0.5 text-[10px] rounded-full border transition-colors ${
                            activitySourceFilter === ch
                              ? 'bg-gray-900 text-white border-gray-900'
                              : count === 0 && ch !== null
                                ? 'bg-white text-gray-300 border-gray-100'
                                : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
                          }`}
                        >
                          {ch === null ? 'All' : ch.toUpperCase()}
                          {count > 0 && <span className="ml-0.5 opacity-60">{count}</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50">
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">PO / File</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Customer</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Source</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Received <span className="normal-case font-normal text-gray-300">(COT)</span></th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Status</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase"></th>
                      </tr>
                    </thead>
                    <tbody>
                  {activityItems.filter(a => !activitySourceFilter || (a.channel || 'upload') === activitySourceFilter).map(item => {
                    const stageConfig: Record<string, { icon: React.ReactNode; label: string; color: string; bg: string; border: string }> = {
                      uploaded: {
                        icon: <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>,
                        label: 'Processing',
                        color: 'text-gray-600', bg: 'bg-gray-50', border: 'border-gray-200',
                      },
                      extracting: {
                        icon: <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>,
                        label: 'Extracting',
                        color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200',
                      },
                      ready: {
                        icon: <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
                        label: 'Needs review',
                        color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200',
                      },
                      sending: {
                        icon: <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>,
                        label: 'Sending',
                        color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200',
                      },
                      completed: {
                        icon: <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><path d="M9 12l2 2 4-4" /></svg>,
                        label: 'Completed',
                        color: 'text-green-700', bg: 'bg-green-50', border: 'border-green-200',
                      },
                      failed: {
                        icon: <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>,
                        label: 'Failed',
                        color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200',
                      },
                      dismissed: {
                        icon: <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" /></svg>,
                        label: 'Dismissed',
                        color: 'text-gray-500', bg: 'bg-gray-50', border: 'border-gray-200',
                      },
                    };
                    const cfg = stageConfig[item.stage] || stageConfig.uploaded;
                    const isExpanded = expandedActivityId === item.id;
                    return (
                      <React.Fragment key={item.id}>
                        <tr
                          className={`border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer ${isExpanded ? 'bg-blue-50' : ''}`}
                          onClick={() => { setExpandedActivityId(isExpanded ? null : item.id); if (!isExpanded) fetchActivityFiles(item.id); }}
                        >
                          <td className="px-4 py-3 text-xs text-gray-900">
                            <span className={`inline-block mr-1.5 transition-transform ${isExpanded ? 'rotate-90' : ''}`}>&#9656;</span>
                            {item.po_number || item.filename}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-600">{item.customer_name || '—'}</td>
                          <td className="px-4 py-3 text-center">
                            <span className="px-1.5 py-0.5 text-[10px] font-medium bg-blue-50 text-blue-600 rounded">{item.channel || 'upload'}</span>
                          </td>
                          <td className="px-4 py-3 text-center text-xs text-gray-600">
                            {new Date(item.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Bogota' })}
                          </td>
                          <td className="px-4 py-3 text-center">
                              <span className={`inline-flex items-center justify-center gap-1 min-w-[7rem] px-2.5 py-1 rounded text-[11px] font-semibold border ${cfg.bg} ${cfg.color} ${cfg.border}`}>
                                {cfg.icon}
                                {cfg.label}
                              </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                              {item.webflor_order_link && (
                                <a
                                  href={item.webflor_order_link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 border border-blue-200 transition-colors"
                                >
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" /></svg>
                                  View in WebFlor
                                </a>
                              )}
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr><td colSpan={6} className="p-0">
                          <div className="flex flex-col lg:flex-row" style={{ height: '550px' }}>
                            {/* Left: source document */}
                            <div className="bg-white overflow-hidden flex flex-col min-h-0 border-r border-gray-200" style={{ width: '50%', flexShrink: 0 }}>
                              {/* Sender header bar — matches inbox card */}
                              <div className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-200 bg-gray-50/80 flex-shrink-0">
                                <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-medium text-gray-900 truncate">{item.email_from || item.customer_name || '—'}</p>
                                  <p className="text-[11px] text-gray-500 truncate">{item.po_number || item.filename || '—'}</p>
                                </div>
                                <span className="px-1.5 py-0.5 text-[10px] font-medium bg-blue-50 text-blue-600 rounded flex-shrink-0">{item.channel || 'upload'}</span>
                                <span className="text-[11px] text-gray-400 flex-shrink-0">
                                  {new Date(item.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric' })}
                                </span>
                              </div>
                              {/* Email body */}
                              {item.email_body && item.email_body.trim() && (
                                <details className="border-b border-gray-100 flex-shrink-0">
                                  <summary className="px-4 py-2 text-[10px] text-gray-400 cursor-pointer hover:text-gray-500 select-none">Show email body</summary>
                                  <pre className="px-4 pb-3 text-[10px] text-gray-500 whitespace-pre-wrap font-sans max-h-32 overflow-auto leading-relaxed">{item.email_body}</pre>
                                </details>
                              )}
                              {/* File tabs */}
                              {(() => {
                                const files = activityFiles[item.id];
                                const pdfFiles = files?.filter(f => f.mime_type === 'application/pdf' && f.signedUrl) || [];
                                const nonPdfFiles = files?.filter(f => f.mime_type !== 'application/pdf' && f.signedUrl && !/^image\d+\.\w+$/i.test(f.filename)) || [];
                                const allVisibleFiles = [...pdfFiles, ...nonPdfFiles];
                                if (allVisibleFiles.length > 0) {
                                  const activeFile = allVisibleFiles[0];
                                  return (
                                    <>
                                      {allVisibleFiles.length > 1 && (
                                        <div className="flex border-b border-gray-100 bg-gray-50 overflow-x-auto flex-shrink-0">
                                          {allVisibleFiles.map(file => (
                                            <button
                                              key={file.id}
                                              className="px-3 py-1.5 text-[11px] font-medium whitespace-nowrap border-b-2 transition-colors border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100 first:border-blue-500 first:text-blue-700 first:bg-white"
                                            >
                                              {file.filename}
                                            </button>
                                          ))}
                                        </div>
                                      )}
                                      <div className="flex-1 min-h-0 overflow-auto">
                                        {activeFile.mime_type === 'application/pdf' ? (
                                          <PdfViewer file={activeFile.signedUrl!} filename={activeFile.filename} />
                                        ) : (
                                          <a href={activeFile.signedUrl} target="_blank" rel="noopener noreferrer"
                                            className="flex items-center gap-2 m-4 px-3 py-2 rounded border border-gray-200 hover:bg-gray-50 text-xs text-blue-600">
                                            {activeFile.filename}
                                          </a>
                                        )}
                                      </div>
                                    </>
                                  );
                                }
                                if (files && files.length === 0) {
                                  return <div className="flex-1 flex items-center justify-center text-xs text-gray-400">No attachments</div>;
                                }
                                if (!files) {
                                  return <div className="flex-1 flex items-center justify-center text-xs text-gray-400">Loading...</div>;
                                }
                                return <div className="flex-1 flex items-center justify-center text-xs text-gray-400">No attachments</div>;
                              })()}
                              {item.error && (
                                <div className="px-3 py-2 border-t border-red-100 bg-red-50 text-[11px] text-red-600 font-medium flex-shrink-0">Error: {item.error}</div>
                              )}
                            </div>

                            {/* Right: AI Extraction */}
                            <div className="flex-1 min-w-0 bg-white overflow-hidden flex flex-col">
                              {/* Right panel header — matches inbox AI PROPOSAL header */}
                              <div className="flex items-center justify-between px-4 py-2 border-b border-blue-100 bg-blue-50/60 flex-shrink-0">
                                <div className="flex items-center gap-2">
                                  <svg className="w-3.5 h-3.5 text-blue-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
                                  <p className="text-[11px] font-semibold text-blue-700 uppercase tracking-wider">AI Proposal</p>
                                  {item.proposal_md && (
                                    <span className="text-[10px] text-green-600 font-medium">Extracted</span>
                                  )}
                                </div>
                              </div>
                              <div className="flex-1 overflow-auto p-3">
                                {item.proposal_md ? (
                                  <div className="prose prose-xs max-w-none text-gray-700 [&_table]:text-[11px] [&_table]:w-full [&_th]:bg-gray-100 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-semibold [&_th]:text-gray-600 [&_th]:border [&_th]:border-gray-200 [&_td]:px-2 [&_td]:py-1 [&_td]:border [&_td]:border-gray-200 [&_h2]:text-sm [&_h2]:font-bold [&_h2]:text-gray-800 [&_h2]:mt-3 [&_h2]:mb-1 [&_p]:text-xs [&_p]:my-1 [&_blockquote]:text-amber-700 [&_blockquote]:bg-amber-50 [&_blockquote]:border-amber-300 [&_blockquote]:px-2 [&_blockquote]:py-1 [&_blockquote]:rounded [&_blockquote]:text-xs [&_blockquote]:not-italic">
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{item.proposal_md}</ReactMarkdown>
                                  </div>
                                ) : (
                                  <div className="flex-1 flex items-center justify-center text-xs text-gray-400 italic">
                                    {item.stage === 'extracting' ? (
                                      <span className="flex items-center gap-2">
                                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                                        Extraction in progress...
                                      </span>
                                    ) : 'No extraction data'}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                          </td></tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Expanded Proposal Modal ── */}
        {modalProposalId && (() => {
          const proposal = proposals.find(p => p.id === modalProposalId);
          if (!proposal) return null;
          const isAccepted = acceptedProposals.has(proposal.id);
          return (
            <ExpandedModal open={true} onClose={() => setModalProposalId(null)} title={proposal.email_subject || 'Proposal'}>
              <div className="flex gap-6 h-[70vh]">
                {/* Left: email + files */}
                <div className="w-1/2 overflow-auto pr-4 border-r border-gray-200">
                  <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Source Email / Files</h4>
                  <div className="mb-4">
                    <p className="text-xs text-gray-500 mb-1"><span className="font-medium">From:</span> {proposal.email_from}</p>
                    <p className="text-xs text-gray-500"><span className="font-medium">Subject:</span> {proposal.email_subject}</p>
                  </div>
                  <pre className="text-sm text-gray-600 whitespace-pre-wrap font-sans leading-relaxed mb-4">{proposal.email_body || '(no body)'}</pre>
                  {proposal.files.filter(f => fileUrls[f.id]).map(file => (
                    file.mime_type === 'application/pdf' ? (
                      <PdfViewer key={file.id} file={fileUrls[file.id]} filename={file.filename} />
                    ) : file.mime_type?.startsWith('image/') ? (
                      <div key={file.id} className="mb-3">
                        <p className="text-xs text-gray-400 mb-1">{file.filename}</p>
                        <img src={fileUrls[file.id]} alt={file.filename} className="max-w-full rounded border border-gray-200" />
                      </div>
                    ) : (
                      <a key={file.id} href={fileUrls[file.id]} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-2 px-3 py-2 mb-2 rounded border border-gray-200 hover:bg-gray-50 text-sm text-blue-600">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                        {file.filename}
                      </a>
                    )
                  ))}
                </div>
                {/* Right: proposal content */}
                <div className="w-1/2 overflow-auto pl-2">
                  <h4 className="text-xs font-semibold text-blue-500 uppercase tracking-wider mb-3">AI Proposal</h4>
                  {isAccepted ? (
                    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <svg className="w-4 h-4 animate-spin text-blue-600" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                        <span className="text-sm font-semibold text-blue-800">Sending to WebFlor</span>
                      </div>
                      <p className="text-xs text-gray-500">The order is being created in WebFlor. This usually takes 1–2 minutes. Check the Orders tab for status.</p>
                    </div>
                  ) : (
                    <>
                      {proposal.lines.length > 0 && (
                        <div className="bg-white border border-blue-200 rounded-lg overflow-hidden mb-4">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="bg-gray-50 text-xs text-gray-400 uppercase tracking-wider">
                                <th className="px-4 py-2.5 text-left font-medium">Item</th>
                                <th className="px-4 py-2.5 text-center font-medium">Type</th>
                                <th className="px-4 py-2.5 text-center font-medium">Qty</th>
                              </tr>
                            </thead>
                            <tbody>
                              {proposal.lines.sort((a, b) => (a.line_number || 0) - (b.line_number || 0)).map(line => (
                                <tr key={line.id} className="border-t border-gray-100">
                                  <td className="px-4 py-2.5 text-gray-800">{line.item_name}</td>
                                  <td className="px-4 py-2.5 text-center">
                                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                      line.change_type === 'add' ? 'bg-green-50 text-green-600' :
                                      line.change_type === 'remove' ? 'bg-red-50 text-red-600' :
                                      'bg-yellow-50 text-yellow-600'
                                    }`}>{line.change_type}</span>
                                  </td>
                                  <td className="px-4 py-2.5 text-center text-gray-600">{(line.proposed_values as any)?.quantity ?? '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                      {proposal.lines.length === 0 && !!proposal.metadata?.webflor_order_md && (
                        <MarkdownEditor
                          content={editingMd[proposal.id] ?? String((proposal.metadata as Record<string, unknown>).webflor_order_md)}
                          onChange={(md) => setEditingMd(prev => ({ ...prev, [proposal.id]: md }))}
                        />
                      )}
                      {proposal.notes && (
                        <p className="text-sm text-gray-500 mb-4 italic">{proposal.notes}</p>
                      )}
                      <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-200">
                        <button onClick={() => setModalProposalId(null)} className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors">
                          Close
                        </button>
                        <button
                          onClick={() => handleAcceptProposal(proposal.id)}
                          disabled={acceptingProposals.has(proposal.id)}
                          className="flex items-center gap-1.5 px-5 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {acceptingProposals.has(proposal.id) ? (
                            <>
                              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                              Sending...
                            </>
                          ) : (
                            <>
                              <CheckIcon />
                              Send to WebFlor
                            </>
                          )}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </ExpandedModal>
          );
        })()}

        {/* Keep mock emails as hidden fallback — remove this block when fully migrated */}
        {false && sidebarTab === 'inbox' && (
          <div className="p-6">
            <div className="space-y-4">
              {/* ── Mock Email 1: PO029889 (HEB) ── */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100">
                  <div className="flex items-start gap-3">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${orderCreated ? 'bg-green-100' : 'bg-amber-100'}`}>
                      <MailIcon />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-semibold text-gray-900 truncate">{MOCK_EMAIL.sender}</span>
                        <span className="text-xs text-gray-400 flex-shrink-0">{new Date(MOCK_EMAIL.date).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Bogota' })}</span>
                      </div>
                      <p className="text-xs text-gray-500 truncate">{MOCK_EMAIL.subject}</p>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col lg:flex-row">
                  <div className="lg:w-1/2 p-5 border-b lg:border-b-0 lg:border-r border-gray-100">
                    <pre className="text-xs text-gray-600 whitespace-pre-wrap font-sans leading-relaxed mb-3">{MOCK_EMAIL.body}</pre>
                    <PdfViewer file={MOCK_EMAIL.pdfUrl} filename={MOCK_EMAIL.attachment} />
                  </div>
                  <div className="lg:w-1/2 lg:flex-shrink-0">
                    <AIRecommendationCard order={o} items={MOCK_ITEMS} totals={TOTALS} onCreateOrder={() => setOrderCreated(true)} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {sidebarTab === 'upload' && (
          <div className="p-6 max-w-3xl mx-auto">
            <div className="flex items-center gap-3 mb-6">
              <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" /></svg>
              <h3 className="text-lg font-semibold text-gray-900">Upload Purchase Order</h3>
            </div>

            <p className="text-sm text-gray-500 mb-6">
              Upload a PO document (PDF, PNG, JPG). It will be processed automatically and appear as a proposal in your Inbox.
            </p>

            {/* Drop zone */}
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => !uploading && fileInputRef.current?.click()}
              className={`relative border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all ${
                dragOver
                  ? 'border-green-400 bg-green-50'
                  : uploading
                    ? 'border-gray-200 bg-gray-50 cursor-wait'
                    : 'border-gray-300 bg-white hover:border-green-400 hover:bg-green-50/30'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleUploadPO(file);
                  e.target.value = '';
                }}
              />

              {uploading ? (
                <div className="flex flex-col items-center gap-3">
                  <svg className="w-10 h-10 text-green-500 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <p className="text-sm font-medium text-gray-700">Uploading...</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center">
                    <svg className="w-7 h-7 text-green-600" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                      <path d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12l-3-3m0 0l-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-700">
                      {dragOver ? 'Drop file here' : 'Drag & drop a PO file, or click to browse'}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">PDF, PNG, or JPG — max 10MB</p>
                  </div>
                </div>
              )}
            </div>

            {/* Status messages */}
            {uploadError && (
              <div className="mt-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600 flex items-center gap-2">
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
                <span>{uploadError}</span>
                <button onClick={() => setUploadError(null)} className="ml-auto text-red-400 hover:text-red-600 font-bold">&times;</button>
              </div>
            )}
            {uploadSuccess && (
              <div className="mt-4 px-4 py-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700 flex items-center gap-2">
                <svg className="w-4 h-4 flex-shrink-0 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span>{uploadSuccess}</span>
              </div>
            )}

            {/* Recent uploads */}
            {recentUploads.length > 0 && (
              <div className="mt-6">
                <h4 className="text-sm font-semibold text-gray-700 mb-3">Recent Uploads</h4>
                <div className="space-y-2">
                  {recentUploads.map(upload => (
                    <div key={upload.id} className="flex items-center gap-3 px-4 py-3 bg-white rounded-lg border border-gray-200">
                      <svg className="w-5 h-5 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                        <path d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                      </svg>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{upload.filename}</p>
                      </div>
                      <div className="flex-shrink-0">
                        {upload.status === 'uploading' && (
                          <span className="flex items-center gap-1.5 text-xs text-blue-600">
                            <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                            Uploading
                          </span>
                        )}
                        {upload.status === 'processing' && (
                          <span className="flex items-center gap-1.5 text-xs text-amber-600">
                            <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                            Processing
                          </span>
                        )}
                        {upload.status === 'done' && (
                          <span className="flex items-center gap-1.5 text-xs text-green-600">
                            <CheckIcon /> Done
                          </span>
                        )}
                        {upload.status === 'error' && (
                          <span className="text-xs text-red-500" title={upload.error}>Failed</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* How it works */}
            <div className="mt-8 bg-gray-50 rounded-xl p-5 border border-gray-200">
              <h4 className="text-sm font-semibold text-gray-700 mb-3">How it works</h4>
              <div className="space-y-3">
                {[
                  { step: '1', title: 'Upload', desc: 'Drop a PO document (PDF with line items, quantities, prices)' },
                  { step: '2', title: 'AI Processing', desc: 'The document is OCR\'d and analyzed by AI to extract order details' },
                  { step: '3', title: 'Review', desc: 'A proposal appears in your Inbox with extracted line items for review' },
                ].map(s => (
                  <div key={s.step} className="flex items-start gap-3">
                    <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0" style={{ backgroundColor: frootfulGreen }}>{s.step}</span>
                    <div>
                      <p className="text-sm font-medium text-gray-800">{s.title}</p>
                      <p className="text-xs text-gray-500">{s.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {sidebarTab === 'orders' && (
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Orders</h3>
              <button onClick={() => { setOrdersLoading(true); fetchOrders(); }} className="text-xs text-gray-400 hover:text-gray-600">
                Refresh
              </button>
            </div>
            {ordersLoading ? (
              <div className="text-center py-12 text-gray-400 text-sm">Loading orders...</div>
            ) : orders.length === 0 ? (
              <div className="text-center py-12 text-gray-400 text-sm">No orders yet</div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">PO</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Customer</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Received by Frootful <span className="normal-case font-normal text-gray-300">(COT)</span></th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Delivery Date</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Source</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((ord) => {
                      const isExpanded = expandedOrderId === ord.id;
                      const detail = orderDetails[ord.id];
                      return (
                        <React.Fragment key={ord.id}>
                          <tr
                            className={`border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer ${isExpanded ? 'bg-blue-50' : ''}`}
                            onClick={() => {
                              if (isExpanded) {
                                setExpandedOrderId(null);
                              } else {
                                setExpandedOrderId(ord.id);
                                fetchOrderDetail(ord);
                              }
                            }}
                          >
                            <td className="px-4 py-3 text-xs font-mono font-medium text-gray-900">
                              <span className={`inline-block mr-1.5 transition-transform ${isExpanded ? 'rotate-90' : ''}`}>&#9656;</span>
                              {ord.customer_reference || '—'}
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-700">{ord.customer_name || '—'}</td>
                            <td className="px-4 py-3 text-center text-xs text-gray-600">{new Date(ord.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Bogota' })}</td>
                            <td className="px-4 py-3 text-center text-xs text-gray-600">{ord.delivery_date || '—'}</td>
                            <td className="px-4 py-3 text-center text-xs text-gray-600">
                              {ord.source_channel ? (channelLabel[ord.source_channel] || ord.source_channel) : '—'}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <div className="flex items-center justify-center gap-2">
                                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold border ${statusColor[ord.status] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                                  {ord.status === 'export_in_progress' && (
                                    <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                                  )}
                                  {statusLabel[ord.status] || ord.status}
                                </span>
                                {(ord.metadata as Record<string, unknown>)?.webflor_order_link && (
                                  <a
                                    href={(ord.metadata as Record<string, unknown>).webflor_order_link as string}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 border border-blue-200 transition-colors"
                                  >
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" /></svg>
                                    View in WebFlor
                                  </a>
                                )}
                              </div>
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr>
                              <td colSpan={6} className="p-0">
                                <div className="bg-gray-50 border-t border-gray-200 px-6 py-4">
                                  {orderDetailLoading === ord.id ? (
                                    <p className="text-xs text-gray-400">Loading details...</p>
                                  ) : !detail ? (
                                    <p className="text-xs text-gray-400">No linked intake event</p>
                                  ) : (
                                    <div className="flex flex-col lg:flex-row gap-5">
                                      {/* Left: source email + files */}
                                      <div className="lg:w-1/2">
                                        <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold mb-2">Source</p>
                                        {detail.channel && (
                                          <p className="text-xs text-gray-700 mb-1"><span className="font-medium">Channel:</span> {channelLabel[detail.channel] || detail.channel}</p>
                                        )}
                                        {detail.email_from && (
                                          <p className="text-xs text-gray-700 mb-1"><span className="font-medium">From:</span> {detail.email_from}</p>
                                        )}
                                        {detail.email_subject && (
                                          <p className="text-xs text-gray-700 mb-1"><span className="font-medium">Subject:</span> {detail.email_subject}</p>
                                        )}
                                        {detail.email_body && (
                                          <pre className="text-[11px] text-gray-600 whitespace-pre-wrap font-sans leading-relaxed mt-2 mb-3 bg-white rounded border border-gray-200 p-3">{detail.email_body}</pre>
                                        )}
                                        {detail.files.length > 0 && (
                                          <div className="mt-2">
                                            <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold mb-1">Attachments</p>
                                            {detail.files.map(file => (
                                              detail.fileUrls[file.id] ? (
                                                file.mime_type === 'application/pdf' ? (
                                                  <PdfViewer key={file.id} file={detail.fileUrls[file.id]} filename={file.filename} />
                                                ) : file.mime_type?.startsWith('image/') ? (
                                                  <img key={file.id} src={detail.fileUrls[file.id]} alt={file.filename} className="max-w-full rounded border border-gray-200 mb-2" />
                                                ) : (
                                                  <a key={file.id} href={detail.fileUrls[file.id]} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-3 py-2 mb-2 rounded border border-gray-200 hover:bg-white text-xs text-blue-600">
                                                    {file.filename}
                                                  </a>
                                                )
                                              ) : (
                                                <p key={file.id} className="text-[10px] text-gray-400">{file.filename}</p>
                                              )
                                            ))}
                                          </div>
                                        )}
                                        {!detail.email_from && detail.files.length === 0 && (
                                          <p className="text-xs text-gray-400 italic">No source data available</p>
                                        )}
                                      </div>

                                      {/* Right: proposal markdown */}
                                      <div className="lg:w-1/2">
                                        <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold mb-2">AI Proposal</p>
                                        {detail.proposalMd ? (
                                          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden p-3 max-h-[500px] overflow-y-auto
                                            [&_h1]:text-sm [&_h1]:font-bold [&_h1]:text-gray-800 [&_h1]:mb-2 [&_h1]:mt-0
                                            [&_h2]:text-xs [&_h2]:font-semibold [&_h2]:text-gray-700 [&_h2]:mb-1.5 [&_h2]:mt-3
                                            [&_h3]:text-[11px] [&_h3]:font-semibold [&_h3]:text-gray-600 [&_h3]:mb-1 [&_h3]:mt-2
                                            [&_p]:text-[11px] [&_p]:text-gray-600 [&_p]:mb-1.5 [&_p]:leading-relaxed
                                            [&_ul]:text-[11px] [&_ul]:text-gray-600 [&_ul]:mb-1.5 [&_ul]:pl-4
                                            [&_li]:mb-0.5
                                            [&_table]:w-full [&_table]:text-[10px] [&_table]:border-collapse [&_table]:mb-2
                                            [&_th]:bg-gray-50 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-medium [&_th]:text-gray-500 [&_th]:border [&_th]:border-gray-200
                                            [&_td]:px-2 [&_td]:py-1 [&_td]:text-gray-700 [&_td]:border [&_td]:border-gray-200
                                            [&_strong]:font-semibold [&_strong]:text-gray-800
                                            [&_hr]:my-2 [&_hr]:border-gray-200">
                                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{detail.proposalMd}</ReactMarkdown>
                                          </div>
                                        ) : (
                                          <p className="text-xs text-gray-400 italic">No proposal extracted</p>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {sidebarTab === 'metrics' && (
          <div className="flex-1 overflow-auto p-6">
            <AnalyticsDashboardGaitana />
          </div>
        )}

        {false && sidebarTab === 'chat' && (
          <div className="flex-1 flex flex-col h-full">
            {/* Header */}
            <div className="px-6 py-4 border-b bg-white flex items-center gap-3">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold" style={{ backgroundColor: frootfulGreen }}>F</div>
              <div>
                <h2 className="text-sm font-semibold text-gray-800">Fru Assistant</h2>
                <p className="text-xs text-gray-500">Ask about WebFlor orders, customers, products</p>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {chatMessages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-gray-400 space-y-3">
                  <svg className="w-12 h-12" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM21 12c0 4.97-4.03 9-9 9a9.07 9.07 0 01-4.126-.98L3 21l1.98-4.874A9.07 9.07 0 013 12c0-4.97 4.03-9 9-9s9 4.03 9 9z" /></svg>
                  <p className="text-sm">Start a conversation with Fru</p>
                  <div className="flex flex-wrap gap-2 justify-center max-w-md">
                    {['Show recent orders', 'List customers', 'What products are available?'].map((q) => (
                      <button
                        key={q}
                        onClick={() => { setChatInput(q); }}
                        className="text-xs px-3 py-1.5 rounded-full border border-gray-300 hover:bg-gray-50 transition-colors text-gray-600"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {chatMessages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm whitespace-pre-wrap ${
                      msg.role === 'user'
                        ? 'bg-green-600 text-white rounded-br-md'
                        : 'bg-gray-100 text-gray-800 rounded-bl-md'
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}
              {chatLoading && (
                <div className="flex justify-start">
                  <div className="bg-gray-100 text-gray-500 px-4 py-2.5 rounded-2xl rounded-bl-md text-sm">
                    <span className="inline-flex gap-1">
                      <span className="animate-bounce" style={{ animationDelay: '0ms' }}>·</span>
                      <span className="animate-bounce" style={{ animationDelay: '150ms' }}>·</span>
                      <span className="animate-bounce" style={{ animationDelay: '300ms' }}>·</span>
                    </span>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input */}
            <div className="px-6 py-4 border-t bg-white">
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const text = chatInput.trim();
                  if (!text || chatLoading) return;
                  setChatInput('');
                  setChatMessages((prev) => [...prev, { role: 'user', content: text }]);
                  setChatLoading(true);
                  setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
                  try {
                    const res = await fetch('/api/chat', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ message: text, history: chatMessages }),
                    });
                    setChatMessages((prev) => [...prev, { role: 'assistant', content: '' }]);
                    setChatLoading(false);
                    const reader = res.body?.getReader();
                    const decoder = new TextDecoder();
                    if (reader) {
                      let buf = '';
                      while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        buf += decoder.decode(value, { stream: true });
                        const lines = buf.split('\n');
                        buf = lines.pop() || '';
                        for (const line of lines) {
                          if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                            try {
                              const { token } = JSON.parse(line.slice(6));
                              if (token) {
                                setChatMessages((prev) => {
                                  const updated = [...prev];
                                  const last = updated[updated.length - 1];
                                  if (last?.role === 'assistant') {
                                    updated[updated.length - 1] = { ...last, content: last.content + token };
                                  }
                                  return updated;
                                });
                                chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
                              }
                            } catch { /* skip malformed SSE lines */ }
                          }
                        }
                      }
                    }
                  } catch {
                    setChatMessages((prev) => [...prev, { role: 'assistant', content: 'Error connecting to the assistant. Please try again.' }]);
                  } finally {
                    setChatLoading(false);
                    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
                  }
                }}
                className="flex gap-2"
              >
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Type a message..."
                  className="flex-1 border border-gray-300 rounded-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
                <button
                  type="submit"
                  disabled={chatLoading || !chatInput.trim()}
                  className="w-10 h-10 rounded-full flex items-center justify-center text-white transition-colors disabled:opacity-40"
                  style={{ backgroundColor: frootfulGreen }}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" /></svg>
                </button>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

// ── Webflor-style Order Creation Card ──

// ── Prose/Markdown-style Order Card ──

// ── Editable Table Component ──

const PlusIcon = () => (
  <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>
);
const TrashIcon = () => (
  <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
);

interface EditableTableProps {
  initialColumns: string[];
  initialRows: string[][];
  compact?: boolean;
}

const EditableTable: React.FC<EditableTableProps> = ({ initialColumns, initialRows, compact }) => {
  const [columns, setColumns] = useState<string[]>(initialColumns);
  const [rows, setRows] = useState<string[][]>(initialRows);

  const updateCell = (rowIdx: number, colIdx: number, value: string) => {
    setRows(prev => prev.map((row, ri) => ri === rowIdx ? row.map((c, ci) => ci === colIdx ? value : c) : row));
  };

  const updateHeader = (colIdx: number, value: string) => {
    setColumns(prev => prev.map((c, ci) => ci === colIdx ? value : c));
  };

  const addRow = () => {
    setRows(prev => [...prev, columns.map(() => '')]);
  };

  const removeRow = (rowIdx: number) => {
    if (rows.length <= 1) return;
    setRows(prev => prev.filter((_, i) => i !== rowIdx));
  };

  const addColumn = () => {
    setColumns(prev => [...prev, 'New']);
    setRows(prev => prev.map(row => [...row, '']));
  };

  const removeColumn = (colIdx: number) => {
    if (columns.length <= 1) return;
    setColumns(prev => prev.filter((_, i) => i !== colIdx));
    setRows(prev => prev.map(row => row.filter((_, i) => i !== colIdx)));
  };

  const py = compact ? 'py-0.5' : 'py-1.5';
  const textSize = compact ? 'text-[11px]' : 'text-xs';

  return (
    <div className="rounded border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className={`w-full ${textSize}`}>
          <thead>
            <tr className="bg-gray-50">
              {columns.map((col, ci) => (
                <th key={ci} className={`px-2 ${py} text-left text-[9px] text-gray-500 uppercase tracking-wider font-semibold group relative`}>
                  <input
                    className="bg-transparent w-full outline-none text-[9px] text-gray-500 uppercase tracking-wider font-semibold"
                    value={col}
                    onChange={(e) => updateHeader(ci, e.target.value)}
                  />
                  {columns.length > 1 && (
                    <button
                      onClick={() => removeColumn(ci)}
                      className="absolute -top-2 right-0 hidden group-hover:flex items-center justify-center w-4 h-4 bg-red-100 text-red-500 rounded-full hover:bg-red-200"
                      title="Remove column"
                    >
                      <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12" /></svg>
                    </button>
                  )}
                </th>
              ))}
              <th className={`px-1 ${py} w-8`}>
                <button onClick={addColumn} className="p-0.5 text-gray-300 hover:text-green-600 hover:bg-green-50 rounded transition-colors" title="Add column">
                  <PlusIcon />
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri} className={`${ri % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} group/row`}>
                {row.map((cell, ci) => (
                  <td key={ci} className={`px-2 ${py}`}>
                    <input
                      className={`bg-transparent w-full outline-none ${textSize} text-gray-800 focus:bg-blue-50 focus:rounded px-0.5 -mx-0.5`}
                      value={cell}
                      onChange={(e) => updateCell(ri, ci, e.target.value)}
                    />
                  </td>
                ))}
                <td className={`px-1 ${py} w-8`}>
                  {rows.length > 1 && (
                    <button
                      onClick={() => removeRow(ri)}
                      className="p-0.5 text-gray-300 opacity-0 group-hover/row:opacity-100 hover:text-red-500 hover:bg-red-50 rounded transition-all"
                      title="Remove row"
                    >
                      <TrashIcon />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Add row button */}
      <button
        onClick={addRow}
        className="w-full flex items-center justify-center gap-1 py-1 text-[10px] text-gray-400 hover:text-green-600 hover:bg-green-50 border-t border-gray-100 transition-colors"
      >
        <PlusIcon /> Add row
      </button>
    </div>
  );
};

// ── Order Confirmed Card (shown after creation) ──

const OrderConfirmedCard: React.FC = () => {
  const [expanded, setExpanded] = useState(false);

  const cardContent = (isExpanded: boolean) => (
    <>
      {/* Summary info */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs">
          <span className="text-gray-500 font-medium">PO</span>
          <span className="text-gray-900 font-semibold">{MOCK_ORDER.po}</span>
          <span className="px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded text-[10px] font-medium">HEB</span>
          <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-[10px] font-medium">FB Gems</span>
          {!isExpanded && (
            <button onClick={() => setExpanded(true)} className="ml-auto p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors" title="Expand">
              <ExpandIcon />
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-gray-500">
          <span>Fecha Orden: <span className="text-gray-700">{MOCK_ORDER.fecha_orden}</span></span>
          <span>Fecha Elaboración: <span className="text-gray-700">{MOCK_ORDER.fecha_elaboracion}</span></span>
          <span>Fecha Entrega: <span className="text-gray-700">{MOCK_ORDER.fecha_entrega}</span></span>
          <span>Fecha Llegada: <span className="text-gray-700">{MOCK_ORDER.fecha_llegada}</span></span>
        </div>
      </div>

      {/* Compact items summary */}
      <div className="mt-3 border-t border-gray-200 pt-2 overflow-x-auto">
        <table className="w-full text-xs min-w-[600px]">
          <thead>
            <tr className="text-[9px] text-gray-400 uppercase tracking-wider">
              <th className="py-1 text-left font-medium">Empaque</th>
              <th className="py-1 text-left font-medium">Finca</th>
              <th className="py-1 text-center font-medium">Cajas</th>
              <th className="py-1 text-center font-medium">Tallos/Ramo</th>
              <th className="py-1 text-center font-medium">Ramos/Caja</th>
              <th className="py-1 text-center font-medium">Tipo Precio</th>
              <th className="py-1 text-center font-medium">Precio</th>
              <th className="py-1 text-center font-medium">Marca</th>
              <th className="py-1 text-center font-medium">UPC</th>
            </tr>
          </thead>
          <tbody>
            {MOCK_ITEMS.map((item) => (
              <tr key={item.numero_item} className="text-gray-700">
                <td className="py-1 text-[10px]">{item.empaque}</td>
                <td className="py-1">
                  <span className="inline-flex px-1 py-0.5 rounded text-[9px] font-mono font-medium bg-green-50 text-green-700">{item.finca === 'GFM' ? 'Gaitana' : 'Arabela'}</span>
                </td>
                <td className="py-1 text-center text-[10px] font-medium">{item.cajas}</td>
                <td className="py-1 text-center text-[10px]">{item.tallos_ramo}</td>
                <td className="py-1 text-center text-[10px]">{item.ramos_caja}</td>
                <td className="py-1 text-center text-[10px]">{item.tipo_precio}</td>
                <td className="py-1 text-center text-[10px]">${item.precio.toFixed(2)}</td>
                <td className="py-1 text-center text-[10px]">{item.marca || '—'}</td>
                <td className="py-1 text-center text-[10px]">{item.upc === 'varies' ? <span className="italic text-gray-400">see config below</span> : (item.upc || '—')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );

  return (
    <div>
      {cardContent(false)}
      <ExpandedModal open={expanded} onClose={() => setExpanded(false)} title={`Order #${MOCK_ORDER.order_number} — ${MOCK_ORDER.po}`}>
        {cardContent(true)}
      </ExpandedModal>
    </div>
  );
};

// ── TipTap Rich-Text Editor Card ──

function buildOrderHTML(o: typeof MOCK_ORDER, items: OrderItem[], totals: typeof TOTALS): string {
  const tableRows = items.map(item =>
    `<tr>
      <td>${item.empaque}</td>
      <td>${item.finca === 'GFM' ? 'Gaitana' : 'Arabela'}</td>
      <td>${item.cajas}</td>
      <td>${item.tallos_ramo}</td>
      <td>${item.ramos_caja}</td>
      <td>${item.tipo_precio}</td>
      <td>$${item.precio.toFixed(2)}</td>
      <td>${item.marca || '—'}</td>
      <td>${item.upc === 'varies' ? 'see config below' : (item.upc || '—')}</td>
    </tr>`
  ).join('');

  return `
    <h2>Order for ${o.cliente}</h2>
    <p><strong>PO ${o.po}</strong></p>
    <p>Fecha Orden: ${o.fecha_orden}<br/>Fecha Elaboración: ${o.fecha_elaboracion}<br/>Fecha Entrega: ${o.fecha_entrega}<br/>Fecha Llegada: ${o.fecha_llegada}</p>
    <h3>Line Items</h3>
    <table>
      <tr><th>Empaque</th><th>Finca</th><th>Cajas</th><th>Tallos/Ramo</th><th>Ramos/Caja</th><th>Tipo Precio</th><th>Precio</th><th>Marca</th><th>UPC</th></tr>
      ${tableRows}
    </table>
    <p>Ready to submit. Review line items and recipes below, then create the order.</p>
  `;
}

const AIRecommendationCard: React.FC<{
  order: typeof MOCK_ORDER;
  items: OrderItem[];
  totals: typeof TOTALS;
  onCreateOrder: () => void;
}> = ({ order: o, items, totals, onCreateOrder }) => {
  const [expandedRecipes, setExpandedRecipes] = useState<Set<string>>(new Set());
  const [isExpanded, setIsExpanded] = useState(false);

  const toggleRecipe = (id: string) => {
    setExpandedRecipes(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      Placeholder.configure({ placeholder: 'Start typing...' }),
    ],
    content: buildOrderHTML(o, items, totals),
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none',
      },
    },
  });

  const addTableRow = useCallback(() => { editor?.chain().focus().addRowAfter().run(); }, [editor]);
  const deleteTableRow = useCallback(() => { editor?.chain().focus().deleteRow().run(); }, [editor]);
  const addTableCol = useCallback(() => { editor?.chain().focus().addColumnAfter().run(); }, [editor]);
  const deleteTableCol = useCallback(() => { editor?.chain().focus().deleteColumn().run(); }, [editor]);

  return (
    <div className="bg-blue-50">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-blue-200">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
          <p className="text-xs text-blue-700 uppercase tracking-wider font-semibold">AI Recommendation</p>
          <span className="group relative cursor-help">
            <svg className="w-3 h-3 text-blue-300 hover:text-blue-500 transition-colors" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
            </svg>
            <span className="absolute bottom-full left-0 mb-1.5 hidden group-hover:block w-56 px-2.5 py-1.5 rounded bg-gray-800 text-[10px] text-white leading-relaxed shadow-lg z-10">
              These are the instructions the AI will use to create this order. You can add, remove, and modify any part of the instructions.
            </span>
          </span>
        </div>
        <button onClick={() => setIsExpanded(true)} className="p-1 rounded text-blue-400 hover:text-blue-600 hover:bg-blue-100 transition-colors" title="Expand">
          <ExpandIcon />
        </button>
      </div>

      {/* Toolbar */}
      <div className="px-4 py-1.5 border-b border-blue-100 bg-blue-50/50 flex items-center gap-1 flex-wrap">
        <button onClick={() => editor?.chain().focus().toggleBold().run()} className={`px-1.5 py-0.5 text-[10px] font-bold rounded transition-colors ${editor?.isActive('bold') ? 'bg-blue-200 text-blue-800' : 'text-gray-500 hover:bg-blue-100'}`}>B</button>
        <button onClick={() => editor?.chain().focus().toggleItalic().run()} className={`px-1.5 py-0.5 text-[10px] italic rounded transition-colors ${editor?.isActive('italic') ? 'bg-blue-200 text-blue-800' : 'text-gray-500 hover:bg-blue-100'}`}>I</button>
        <button onClick={() => editor?.chain().focus().toggleStrike().run()} className={`px-1.5 py-0.5 text-[10px] line-through rounded transition-colors ${editor?.isActive('strike') ? 'bg-blue-200 text-blue-800' : 'text-gray-500 hover:bg-blue-100'}`}>S</button>
        <span className="w-px h-4 bg-gray-300 mx-1" />
        <button onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} className={`px-1.5 py-0.5 text-[10px] font-semibold rounded transition-colors ${editor?.isActive('heading', { level: 2 }) ? 'bg-blue-200 text-blue-800' : 'text-gray-500 hover:bg-blue-100'}`}>H2</button>
        <button onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()} className={`px-1.5 py-0.5 text-[10px] font-semibold rounded transition-colors ${editor?.isActive('heading', { level: 3 }) ? 'bg-blue-200 text-blue-800' : 'text-gray-500 hover:bg-blue-100'}`}>H3</button>
        <button onClick={() => editor?.chain().focus().toggleBulletList().run()} className={`px-1.5 py-0.5 text-[10px] rounded transition-colors ${editor?.isActive('bulletList') ? 'bg-blue-200 text-blue-800' : 'text-gray-500 hover:bg-blue-100'}`}>
          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></svg>
        </button>
        <span className="w-px h-4 bg-gray-300 mx-1" />
        <span className="text-[9px] text-gray-400 mr-1">TABLE:</span>
        <button onClick={addTableRow} className="px-1.5 py-0.5 text-[10px] text-gray-500 hover:bg-blue-100 rounded transition-colors" title="Add row">+Row</button>
        <button onClick={deleteTableRow} className="px-1.5 py-0.5 text-[10px] text-gray-500 hover:bg-red-100 hover:text-red-600 rounded transition-colors" title="Delete row">-Row</button>
        <button onClick={addTableCol} className="px-1.5 py-0.5 text-[10px] text-gray-500 hover:bg-blue-100 rounded transition-colors" title="Add column">+Col</button>
        <button onClick={deleteTableCol} className="px-1.5 py-0.5 text-[10px] text-gray-500 hover:bg-red-100 hover:text-red-600 rounded transition-colors" title="Delete column">-Col</button>
      </div>

      {/* Editor */}
      <div className="p-4">
        <div className="bg-white border border-blue-200 rounded-lg">
          <EditorContent editor={editor} className="tiptap-editor p-5 text-xs min-h-[200px] overflow-x-auto" />
        </div>

        {/* Collapsible recipe sections */}
        {items.filter(item => item.recipe && item.recipe.length > 0).map((item) => {
          const isExpanded = expandedRecipes.has(item.numero_item);
          return (
            <div key={item.numero_item} className="mt-2">
              <button
                onClick={() => toggleRecipe(item.numero_item)}
                className="w-full flex items-center gap-2 text-left text-xs py-2 px-3 rounded-lg bg-white border border-blue-200 hover:bg-blue-50 transition-colors"
              >
                <svg className={`w-3 h-3 text-blue-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6" /></svg>
                <span className="font-medium text-gray-800">{item.empaque}</span>
                <span className="text-[10px] text-gray-400 ml-auto">Recipe</span>
              </button>
              {isExpanded && (
                <div className="mt-1 ml-2">
                  <EditableTable
                    initialColumns={(() => {
                      const cols = ['Color', 'Variety', 'Ramos'];
                      if (item.recipe!.some(r => r.nombre_receta)) cols.push('Nombre Receta');
                      if (item.recipe!.some(r => r.upc)) cols.push('UPC');
                      return cols;
                    })()}
                    initialRows={item.recipe!.map(r => {
                      const row = [r.color, r.variety, String(r.ramos)];
                      if (item.recipe!.some(r2 => r2.nombre_receta)) row.push(r.nombre_receta || '');
                      if (item.recipe!.some(r2 => r2.upc)) row.push(r.upc || '');
                      return row;
                    })}
                    compact
                  />
                  {item.recipe_note && (
                    <div
                      contentEditable
                      suppressContentEditableWarning
                      className="px-2 py-1.5 bg-blue-50 border border-t-0 border-blue-100 rounded-b text-[10px] text-blue-700 italic outline-none focus:ring-1 focus:ring-blue-300 cursor-text"
                    >
                      {item.recipe_note}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Action buttons */}
        <div className="flex items-center justify-between mt-3">
          <button className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors">
            Dismiss
          </button>
          <button
            onClick={onCreateOrder}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
          >
            <CheckIcon />
            Send to WebFlor
          </button>
        </div>
      </div>

      {/* TipTap editor styles */}
      <style>{`
        .tiptap-editor .ProseMirror {
          outline: none;
        }
        .tiptap-editor .ProseMirror h2 {
          font-size: 14px;
          font-weight: 600;
          color: #111827;
          margin: 0 0 4px 0;
        }
        .tiptap-editor .ProseMirror h3 {
          font-size: 12px;
          font-weight: 600;
          color: #374151;
          margin: 12px 0 4px 0;
        }
        .tiptap-editor .ProseMirror p {
          font-size: 12px;
          color: #6b7280;
          margin: 0 0 8px 0;
          line-height: 1.5;
        }
        .tiptap-editor .ProseMirror strong {
          color: #374151;
        }
        .tiptap-editor .ProseMirror table {
          border-collapse: collapse;
          width: 100%;
          min-width: 600px;
          margin: 8px 0;
          font-size: 11px;
        }
        .tiptap-editor .ProseMirror {
          overflow-x: auto;
        }
        .tiptap-editor .ProseMirror th,
        .tiptap-editor .ProseMirror td {
          border: 1px solid #e5e7eb;
          padding: 4px 8px;
          text-align: left;
        }
        .tiptap-editor .ProseMirror th {
          background: #f9fafb;
          font-size: 9px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #6b7280;
          font-weight: 600;
        }
        .tiptap-editor .ProseMirror td {
          color: #374151;
        }
        .tiptap-editor .ProseMirror tr:nth-child(even) td {
          background: #f9fafb50;
        }
        .tiptap-editor .ProseMirror .selectedCell {
          background: #dbeafe;
        }
        .tiptap-editor .ProseMirror ul {
          list-style: disc;
          padding-left: 20px;
          margin: 4px 0;
        }
        .tiptap-editor .ProseMirror li {
          font-size: 12px;
          color: #374151;
        }
        .tiptap-editor .ProseMirror p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          color: #9ca3af;
          pointer-events: none;
          height: 0;
        }
      `}</style>

      {/* Expanded modal */}
      <ExpandedModal open={isExpanded} onClose={() => setIsExpanded(false)} title={`AI Recommendation — ${o.po}`}>
        <div className="bg-white border border-blue-200 rounded-lg">
          <EditorContent editor={editor} className="tiptap-editor p-5 text-xs min-h-[200px] overflow-x-auto" />
        </div>

        {/* Recipes in modal */}
        {items.filter(item => item.recipe && item.recipe.length > 0).map((item) => {
          const isRecipeExpanded = expandedRecipes.has(item.numero_item);
          return (
            <div key={item.numero_item} className="mt-3">
              <button
                onClick={() => toggleRecipe(item.numero_item)}
                className="w-full flex items-center gap-2 text-left text-sm py-2 px-3 rounded-lg bg-white border border-blue-200 hover:bg-blue-50 transition-colors"
              >
                <svg className={`w-3 h-3 text-blue-400 transition-transform ${isRecipeExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6" /></svg>
                <span className="font-medium text-gray-800">{item.empaque}</span>
                <span className="text-xs text-gray-400 ml-auto">Recipe</span>
              </button>
              {isRecipeExpanded && (
                <div className="mt-1 ml-2">
                  <EditableTable
                    initialColumns={(() => {
                      const cols = ['Color', 'Variety', 'Ramos'];
                      if (item.recipe!.some(r => r.nombre_receta)) cols.push('Nombre Receta');
                      if (item.recipe!.some(r => r.upc)) cols.push('UPC');
                      return cols;
                    })()}
                    initialRows={item.recipe!.map(r => {
                      const row = [r.color, r.variety, String(r.ramos)];
                      if (item.recipe!.some(r2 => r2.nombre_receta)) row.push(r.nombre_receta || '');
                      if (item.recipe!.some(r2 => r2.upc)) row.push(r.upc || '');
                      return row;
                    })}
                    compact
                  />
                  {item.recipe_note && (
                    <div
                      contentEditable
                      suppressContentEditableWarning
                      className="px-2 py-1.5 bg-blue-50 border border-t-0 border-blue-100 rounded-b text-[10px] text-blue-700 italic outline-none focus:ring-1 focus:ring-blue-300 cursor-text"
                    >
                      {item.recipe_note}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Action buttons in modal */}
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200">
          <button className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors">
            Dismiss
          </button>
          <button
            onClick={() => { onCreateOrder(); setIsExpanded(false); }}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
          >
            <CheckIcon />
            Send to WebFlor
          </button>
        </div>
      </ExpandedModal>
    </div>
  );
};


const CHAINLIT_URL = import.meta.env.VITE_CHAINLIT_URL || 'http://localhost:8001';

type ResizeEdge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw' | null;

const ChatWidget: React.FC = () => {
  const session = React.useContext(GaitanaSessionContext);
  const [open, setOpen] = useState(false);
  const [size, setSize] = useState({ w: 420, h: Math.min(600, window.innerHeight - 100) });
  const [pos, setPos] = useState({ x: Math.max(10, window.innerWidth - 470), y: Math.max(10, window.innerHeight - Math.min(600, window.innerHeight - 100) - 80) });
  const [dragging, setDragging] = useState(false);
  const [resizeEdge, setResizeEdge] = useState<ResizeEdge>(null);
  const dragOffset = React.useRef({ x: 0, y: 0 });
  const resizeStart = React.useRef({ x: 0, y: 0, w: 0, h: 0, px: 0, py: 0 });

  const onMouseDown = (e: React.MouseEvent) => {
    setDragging(true);
    dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    e.preventDefault();
  };

  const onResizeDown = (edge: ResizeEdge) => (e: React.MouseEvent) => {
    setResizeEdge(edge);
    resizeStart.current = { x: e.clientX, y: e.clientY, w: size.w, h: size.h, px: pos.x, py: pos.y };
    e.preventDefault();
    e.stopPropagation();
  };

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      setPos({ x: e.clientX - dragOffset.current.x, y: e.clientY - dragOffset.current.y });
    };
    const onUp = () => setDragging(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [dragging]);

  useEffect(() => {
    if (!resizeEdge) return;
    const s = resizeStart.current;
    const onMove = (e: MouseEvent) => {
      const dx = e.clientX - s.x;
      const dy = e.clientY - s.y;
      let newW = s.w, newH = s.h, newX = s.px, newY = s.py;
      if (resizeEdge.includes('e')) newW = Math.max(350, s.w + dx);
      if (resizeEdge.includes('w')) { newW = Math.max(350, s.w - dx); newX = s.px + s.w - newW; }
      if (resizeEdge.includes('s')) newH = Math.max(400, s.h + dy);
      if (resizeEdge.includes('n')) { newH = Math.max(400, s.h - dy); newY = s.py + s.h - newH; }
      setSize({ w: newW, h: newH });
      setPos({ x: newX, y: newY });
    };
    const onUp = () => setResizeEdge(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [resizeEdge]);

  // Keep button near bottom-right of chat window
  const btnX = pos.x + size.w - 50;
  const btnY = pos.y + size.h + 10;

  return createPortal(
    <>
      {open && (
        <div style={{
          position: 'fixed', left: pos.x, top: pos.y, width: size.w, height: size.h,
          borderRadius: 12, overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
          zIndex: 9999, background: '#1e1e2e',
        }}>
          {/* Drag handle */}
          <div
            onMouseDown={onMouseDown}
            style={{
              height: 28, background: '#16a34a', cursor: 'grab',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              userSelect: 'none', fontSize: 11, color: '#fff', fontWeight: 600, letterSpacing: 1,
            }}
          >
            ⠿ Frootful
          </div>
          <iframe
            src={`${CHAINLIT_URL}?user_id=${encodeURIComponent(session?.user?.id || '')}&user_email=${encodeURIComponent(session?.user?.email || '')}&user_name=${encodeURIComponent(session?.user?.user_metadata?.full_name || '')}`}
            style={{ width: '100%', height: 'calc(100% - 28px)', border: 'none' }}
          />
          {/* Resize handles — edges */}
          <div onMouseDown={onResizeDown('n')} style={{ position: 'absolute', top: 0, left: 8, right: 8, height: 6, cursor: 'ns-resize' }} />
          <div onMouseDown={onResizeDown('s')} style={{ position: 'absolute', bottom: 0, left: 8, right: 8, height: 6, cursor: 'ns-resize' }} />
          <div onMouseDown={onResizeDown('w')} style={{ position: 'absolute', left: 0, top: 8, bottom: 8, width: 6, cursor: 'ew-resize' }} />
          <div onMouseDown={onResizeDown('e')} style={{ position: 'absolute', right: 0, top: 8, bottom: 8, width: 6, cursor: 'ew-resize' }} />
          {/* Resize handles — corners */}
          <div onMouseDown={onResizeDown('nw')} style={{ position: 'absolute', top: 0, left: 0, width: 12, height: 12, cursor: 'nwse-resize' }} />
          <div onMouseDown={onResizeDown('ne')} style={{ position: 'absolute', top: 0, right: 0, width: 12, height: 12, cursor: 'nesw-resize' }} />
          <div onMouseDown={onResizeDown('sw')} style={{ position: 'absolute', bottom: 0, left: 0, width: 12, height: 12, cursor: 'nesw-resize' }} />
          <div onMouseDown={onResizeDown('se')} style={{ position: 'absolute', bottom: 0, right: 0, width: 12, height: 12, cursor: 'nwse-resize' }} />
        </div>
      )}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position: 'fixed',
          bottom: open ? undefined : 20,
          right: open ? undefined : 20,
          left: open ? btnX : undefined,
          top: open ? btnY : undefined,
          width: 50, height: 50,
          borderRadius: '50%', background: '#16a34a', color: '#fff', border: 'none',
          cursor: 'pointer', zIndex: 10000, fontSize: 24,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        }}
      >
        {open ? '✕' : '💬'}
      </button>
    </>,
    document.body
  );
};

const DashboardGaitana: React.FC = () => (
  <GaitanaLoginGate>
    <DashboardGaitanaInner />
    <ChatWidget />
  </GaitanaLoginGate>
);

export default DashboardGaitana;
