import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Upload, FileText, Image, Loader2, BrainCircuit } from 'lucide-react';

// Brand color
const BRAND_GREEN = '#53AD6D';

// Processing stages with timing
const PROCESSING_STAGES = [
  { text: "Receiving your document...", duration: 1500 },
  { text: "Analyzing document structure...", duration: 2000 },
  { text: "Reading customer details...", duration: 2000 },
  { text: "Extracting item details...", duration: 2500 },
  { text: "Analyzing results...", duration: 2000 },
  { text: "Almost done...", duration: 1500 },
];

// Mock extracted data for user uploads
const mockExtractedItems = [
  { product: "Romaine Hearts", quantity: 48 },
  { product: "Baby Spinach", quantity: 36 },
  { product: "Kale Bunches", quantity: 24 },
  { product: "Green Onions", quantity: 60 },
  { product: "Cilantro", quantity: 45 },
  { product: "Parsley", quantity: 30 },
];

const Playground: React.FC = () => {
  const navigate = useNavigate();
  const [uploadedFile, setUploadedFile] = useState<{ url: string; name: string; type: string } | null>(null);
  const [isProcessing, setIsProcessing] = useState(true);
  const [currentStage, setCurrentStage] = useState(0);

  const runProcessingStages = (onComplete: () => void) => {
    let stageIndex = 0;
    const totalStages = PROCESSING_STAGES.length;

    const runStage = () => {
      setCurrentStage(stageIndex);

      if (stageIndex === totalStages - 1) {
        setTimeout(() => {
          onComplete();
        }, 1500);
        return;
      }

      setTimeout(() => {
        stageIndex++;
        runStage();
      }, PROCESSING_STAGES[stageIndex].duration);
    };

    runStage();
  };

  useEffect(() => {
    const storedFile = sessionStorage.getItem('demoUploadedFile');
    if (storedFile) {
      const parsed = JSON.parse(storedFile);
      setUploadedFile(parsed);

      // Start processing animation
      runProcessingStages(() => {
        setIsProcessing(false);
      });
    } else {
      navigate('/demo');
    }
  }, [navigate]);

  const handleUploadAnother = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,.pdf';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        setIsProcessing(true);
        setCurrentStage(0);

        const reader = new FileReader();
        reader.onload = () => {
          const fileData = {
            url: reader.result as string,
            name: file.name,
            type: file.type,
          };
          sessionStorage.setItem('demoUploadedFile', JSON.stringify(fileData));
          setUploadedFile(fileData);

          runProcessingStages(() => {
            setIsProcessing(false);
          });
        };
        reader.readAsDataURL(file);
      }
    };
    input.click();
  };

  const isPDF = uploadedFile?.type === 'application/pdf';

  if (!uploadedFile) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: BRAND_GREEN }} />
      </div>
    );
  }

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

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h2 className="text-3xl font-bold text-gray-900 mb-2">Your Extraction Results</h2>
          <p className="text-gray-500">{uploadedFile.name}</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Side - Uploaded Document */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center space-x-2">
              {isPDF ? (
                <FileText className="w-5 h-5 text-red-500" />
              ) : (
                <Image className="w-5 h-5 text-blue-500" />
              )}
              <h3 className="text-lg font-semibold text-gray-900">Uploaded Document</h3>
            </div>
            <div className="p-4 h-[600px] overflow-auto bg-gray-50">
              {isPDF ? (
                <iframe
                  src={uploadedFile.url}
                  className="w-full h-full rounded-lg bg-white"
                  title="Uploaded PDF"
                />
              ) : (
                <div className="flex items-center justify-center h-full">
                  <img
                    src={uploadedFile.url}
                    alt="Uploaded document"
                    className="max-w-full max-h-full object-contain rounded-lg"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Right Side - Processing or Extracted Data */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center space-x-2">
              <BrainCircuit className="w-5 h-5" style={{ color: BRAND_GREEN }} />
              <h3 className="text-lg font-semibold text-gray-900">Frootful AI</h3>
            </div>

            {isProcessing ? (
              /* Loading State */
              <div className="p-6 h-[600px] flex flex-col items-center justify-center">
                <Loader2 className="w-16 h-16 animate-spin mb-8" style={{ color: BRAND_GREEN }} />
                <p className="text-gray-700 font-medium text-xl">
                  {PROCESSING_STAGES[currentStage]?.text || "Processing..."}
                </p>
              </div>
            ) : (
              /* Extracted Data */
              <div className="p-6 h-[600px] overflow-y-auto">
                {/* Mock Header Info */}
                <div className="mb-6 p-4 rounded-xl border border-gray-100" style={{ backgroundColor: 'rgba(83, 173, 109, 0.04)' }}>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-400">Customer</span>
                      <p className="text-gray-900 font-medium">Sample Customer</p>
                    </div>
                    <div>
                      <span className="text-gray-400">PO Number</span>
                      <p className="text-gray-900 font-medium">PO-2025-001</p>
                    </div>
                    <div>
                      <span className="text-gray-400">Ship Date</span>
                      <p className="text-gray-900 font-medium">01/20/2025</p>
                    </div>
                    <div>
                      <span className="text-gray-400">Arrival Date</span>
                      <p className="text-gray-900 font-medium">01/21/2025</p>
                    </div>
                  </div>
                </div>

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
                      {mockExtractedItems.map((item, index) => (
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
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        {!isProcessing && (
          <div className="flex items-center justify-center space-x-4 mt-8">
            <button
              onClick={() => navigate('/demo')}
              className="flex items-center space-x-2 px-6 py-3 text-gray-600 bg-white rounded-xl hover:bg-gray-50 transition-colors border border-gray-200"
            >
              <ArrowLeft className="w-5 h-5" />
              <span>Back to Demo</span>
            </button>
            <button
              onClick={handleUploadAnother}
              className="flex items-center space-x-2 px-6 py-3 text-white rounded-xl transition-colors hover:opacity-90"
              style={{ backgroundColor: BRAND_GREEN }}
            >
              <Upload className="w-5 h-5" />
              <span>Upload Another</span>
            </button>
          </div>
        )}
      </main>

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

export default Playground;
