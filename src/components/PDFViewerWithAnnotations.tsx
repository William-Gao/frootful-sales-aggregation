import React, { useState, useMemo } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Configure PDF.js worker - use unpkg which works better with Vite
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface AnalyzedItem {
  itemName: string;
  quantity: number;
  matchedItem?: {
    id: string;
    number: string;
    displayName: string;
    unitPrice: number;
  } | null;
  // Optional: Manually specify exact coordinates for the highlight
  customBoundingBox?: {
    page: number;
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

interface Annotation {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  item: AnalyzedItem;
}

interface PDFViewerWithAnnotationsProps {
  pdfUrl: string;
  analyzedItems: AnalyzedItem[];
  className?: string;
}

/**
 * PDFViewerWithAnnotations - Displays PDF with highlighted annotations
 *
 * USAGE: To manually specify highlight positions, add customBoundingBox to analyzedItems:
 *
 * analyzedItems: [
 *   {
 *     itemName: 'Banana Red',
 *     quantity: 5,
 *     matchedItem: { ... },
 *     customBoundingBox: {
 *       page: 1,      // Page number (1-indexed)
 *       x: 50,        // X coordinate from left (in pixels at scale 1.5)
 *       y: 250,       // Y coordinate from top (in pixels at scale 1.5)
 *       width: 200,   // Width of highlight box
 *       height: 20    // Height of highlight box
 *     }
 *   }
 * ]
 *
 * Items WITH customBoundingBox: Manual positioning (no auto-detection)
 * Items WITHOUT customBoundingBox: Automatic text search and positioning
 */

const PDFViewerWithAnnotations: React.FC<PDFViewerWithAnnotationsProps> = ({
  pdfUrl,
  analyzedItems,
  className = ''
}) => {
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [hoveredAnnotation, setHoveredAnnotation] = useState<Annotation | null>(null);
  const [pageWidth, setPageWidth] = useState<number>(0);
  const [pageHeight, setPageHeight] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setIsLoading(false);
    setError(null);
  };

  const onDocumentLoadError = (error: Error) => {
    console.error('Error loading PDF:', error);
    setError(error.message || 'Failed to load PDF file');
    setIsLoading(false);
  };

  const onPageLoadSuccess = (page: any) => {
    const viewport = page.getViewport({ scale: 1.5 });
    setPageWidth(viewport.width);
    setPageHeight(viewport.height);

    const newAnnotations: Annotation[] = [];

    // First, add all items with custom bounding boxes
    analyzedItems.forEach((item) => {
      if (item.customBoundingBox && item.customBoundingBox.page === pageNumber) {
        newAnnotations.push({
          page: item.customBoundingBox.page,
          x: item.customBoundingBox.x,
          y: item.customBoundingBox.y,
          width: item.customBoundingBox.width,
          height: item.customBoundingBox.height,
          item
        });
      }
    });

    // Only do automatic text extraction for items WITHOUT custom bounding boxes
    const itemsNeedingAutoDetection = analyzedItems.filter(item => !item.customBoundingBox);

    if (itemsNeedingAutoDetection.length > 0) {
      // Extract text content and map to coordinates
      page.getTextContent().then((textContent: any) => {
        itemsNeedingAutoDetection.forEach((item) => {
          // Find text items that match the analyzed item name
          const searchText = item.itemName.toLowerCase();

          textContent.items.forEach((textItem: any, index: number) => {
            const itemText = textItem.str.toLowerCase();

            // Check if this text item contains part of the item name
            if (itemText.includes(searchText) || searchText.includes(itemText)) {
              // Get the transformation matrix: [scaleX, 0, 0, scaleY, x, y]
              const transform = textItem.transform;
              const x = transform[4];
              const y = transform[5];
              const width = textItem.width || 100;
              const height = textItem.height || 12;

              // Convert coordinates (PDF coordinates are bottom-up)
              const annotationY = viewport.height - y - height;

              newAnnotations.push({
                page: pageNumber,
                x: x * 1.5, // Apply scale
                y: annotationY * 1.5,
                width: width * 1.5,
                height: height * 1.5,
                item
              });
            }
          });
        });

        setAnnotations(newAnnotations);
      });
    } else {
      // All items have custom bounding boxes, no auto-detection needed
      setAnnotations(newAnnotations);
    }
  };

  const goToPrevPage = () => {
    setPageNumber(Math.max(1, pageNumber - 1));
  };

  const goToNextPage = () => {
    setPageNumber(Math.min(numPages, pageNumber + 1));
  };

  // Memoize options to prevent unnecessary reloads
  const options = useMemo(
    () => ({
      cMapUrl: `https://unpkg.com/pdfjs-dist@${pdfjs.version}/cmaps/`,
      cMapPacked: true,
    }),
    []
  );

  return (
    <div className={`relative ${className}`}>
      {isLoading && !error && (
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-500">Loading PDF...</div>
        </div>
      )}

      {error && (
        <div className="flex flex-col items-center justify-center h-64 bg-red-50 border border-red-200 rounded-lg p-6">
          <div className="text-red-600 font-semibold mb-2">Failed to load PDF</div>
          <div className="text-sm text-red-500 text-center">{error}</div>
          <button
            onClick={() => {
              setError(null);
              setIsLoading(true);
            }}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      )}

      {!error && (
        <>
          <div className="relative inline-block">
            <Document
              file={pdfUrl}
              onLoadSuccess={onDocumentLoadSuccess}
              onLoadError={onDocumentLoadError}
              loading={<div className="p-4 text-gray-500">Loading document...</div>}
              options={options}
            >
              <Page
                pageNumber={pageNumber}
                scale={1.5}
                onLoadSuccess={onPageLoadSuccess}
                renderTextLayer={false}
                renderAnnotationLayer={false}
                loading={<div className="p-4 text-gray-500">Loading page...</div>}
              />
            </Document>

            {/* Annotation overlay layer */}
            {pageWidth > 0 && pageHeight > 0 && (
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: `${pageWidth}px`,
                  height: `${pageHeight}px`,
                  pointerEvents: 'none'
                }}
              >
                {annotations
                  .filter(annotation => annotation.page === pageNumber)
                  .map((annotation, index) => (
                    <div
                      key={index}
                      style={{
                        position: 'absolute',
                        left: `${annotation.x}px`,
                        top: `${annotation.y}px`,
                        width: `${annotation.width}px`,
                        height: `${annotation.height}px`,
                        backgroundColor: 'rgba(255, 255, 0, 0.3)',
                        border: '2px solid #FFD700',
                        pointerEvents: 'auto',
                        cursor: 'pointer',
                        transition: 'background-color 0.2s'
                      }}
                      onMouseEnter={() => setHoveredAnnotation(annotation)}
                      onMouseLeave={() => setHoveredAnnotation(null)}
                      className="hover:bg-yellow-400/40"
                    >
                      {hoveredAnnotation === annotation && (
                        <div
                          style={{
                            position: 'absolute',
                            top: annotation.height < 30 ? '100%' : 'auto',
                            bottom: annotation.height >= 30 ? '100%' : 'auto',
                            left: 0,
                            minWidth: '250px',
                            zIndex: 1000,
                            marginTop: annotation.height < 30 ? '8px' : '0',
                            marginBottom: annotation.height >= 30 ? '8px' : '0'
                          }}
                          className="bg-white border-2 border-yellow-500 rounded-lg shadow-xl p-4"
                        >
                          <div className="space-y-2">
                            <div className="font-bold text-gray-900 text-sm border-b border-gray-200 pb-2">
                              Extracted Item
                            </div>
                            <div>
                              <div className="text-xs text-gray-500 uppercase tracking-wide">Item Name</div>
                              <div className="font-medium text-gray-900">{annotation.item.itemName}</div>
                            </div>
                            <div>
                              <div className="text-xs text-gray-500 uppercase tracking-wide">Quantity</div>
                              <div className="font-medium text-gray-900">{annotation.item.quantity}</div>
                            </div>
                            {annotation.item.matchedItem && (
                              <>
                                <div>
                                  <div className="text-xs text-gray-500 uppercase tracking-wide">Matched Item</div>
                                  <div className="font-medium text-gray-900">{annotation.item.matchedItem.displayName}</div>
                                </div>
                                <div>
                                  <div className="text-xs text-gray-500 uppercase tracking-wide">Unit Price</div>
                                  <div className="font-medium text-green-600">${annotation.item.matchedItem.unitPrice.toFixed(2)}</div>
                                </div>
                                <div className="pt-2 border-t border-gray-200">
                                  <div className="text-xs text-gray-500 uppercase tracking-wide">Total</div>
                                  <div className="font-bold text-lg text-green-600">
                                    ${(annotation.item.quantity * annotation.item.matchedItem.unitPrice).toFixed(2)}
                                  </div>
                                </div>
                              </>
                            )}
                          </div>
                          {/* Arrow pointer */}
                          <div
                            style={{
                              position: 'absolute',
                              left: '20px',
                              width: 0,
                              height: 0,
                              borderLeft: '8px solid transparent',
                              borderRight: '8px solid transparent',
                              ...(annotation.height < 30
                                ? { top: '-8px', borderBottom: '8px solid #FFD700' }
                                : { bottom: '-8px', borderTop: '8px solid #FFD700' }
                              )
                            }}
                          />
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            )}
          </div>

          {/* Page navigation */}
          {numPages > 1 && (
            <div className="flex items-center justify-center gap-4 mt-4 p-3 bg-gray-100 rounded-lg">
              <button
                onClick={goToPrevPage}
                disabled={pageNumber <= 1}
                className="px-4 py-2 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm"
              >
                Previous
              </button>
              <span className="text-sm text-gray-700 font-medium">
                Page {pageNumber} of {numPages}
              </span>
              <button
                onClick={goToNextPage}
                disabled={pageNumber >= numPages}
                className="px-4 py-2 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm"
              >
                Next
              </button>
            </div>
          )}

          {/* Summary info */}
          {analyzedItems.length > 0 && (
            <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
              <div className="text-sm text-blue-900">
                <span className="font-semibold">{analyzedItems.length}</span> items extracted from this document
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default PDFViewerWithAnnotations;
