import React, { useState } from 'react';
import { Loader2, Upload } from 'lucide-react';

const UploadOrdersSection: React.FC = () => {
  const [isDragging, setIsDragging] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    handleFiles(files);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      handleFiles(files);
    }
  };

  const handleFiles = async (files: File[]) => {
    setIsUploading(true);

    // Simulate upload process
    await new Promise(resolve => setTimeout(resolve, 1000));

    setUploadedFiles(prev => [...prev, ...files]);
    setIsUploading(false);
  };

  const removeFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const clearAll = () => {
    setUploadedFiles([]);
  };

  const getFileIcon = (file: File) => {
    if (file.type.startsWith('image/')) {
      return '🖼️';
    } else if (file.type === 'application/pdf') {
      return '📄';
    } else if (file.type.includes('document') || file.type.includes('word')) {
      return '📝';
    } else if (file.type.includes('spreadsheet') || file.type.includes('excel')) {
      return '📊';
    } else {
      return '📎';
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Upload Orders</h2>
          <p className="text-gray-600">Upload email files, PDFs, or documents to process as orders</p>
        </div>
        {uploadedFiles.length > 0 && (
          <button
            onClick={clearAll}
            className="px-4 py-2 text-red-600 border border-red-300 rounded-lg hover:bg-red-50 transition-colors"
          >
            Clear All
          </button>
        )}
      </div>

      {/* Upload Area */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
            isDragging
              ? 'border-green-400 bg-green-50'
              : 'border-gray-300 hover:border-gray-400'
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {isUploading ? (
            <div className="flex flex-col items-center">
              <Loader2 className="w-12 h-12 animate-spin text-green-600 mb-4" />
              <p className="text-lg font-medium text-gray-900">Uploading files...</p>
              <p className="text-gray-500">Please wait while we process your files</p>
            </div>
          ) : (
            <div className="flex flex-col items-center">
              <Upload className="w-12 h-12 text-gray-400 mb-4" />
              <p className="text-lg font-medium text-gray-900 mb-2">
                Drop files here or click to upload
              </p>
              <p className="text-gray-500 mb-4">
                Support for emails (.eml), PDFs, images, and documents
              </p>
              <input
                type="file"
                multiple
                onChange={handleFileSelect}
                className="hidden"
                id="file-upload"
                accept=".eml,.pdf,.doc,.docx,.jpg,.jpeg,.png,.gif,.txt"
              />
              <label
                htmlFor="file-upload"
                className="px-6 py-3 text-white rounded-lg cursor-pointer transition-colors"
                style={{ backgroundColor: '#53AD6D' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#4a9c63';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#53AD6D';
                }}
              >
                Choose Files
              </label>
            </div>
          )}
        </div>
      </div>

      {/* Uploaded Files List */}
      {uploadedFiles.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">
              Uploaded Files ({uploadedFiles.length})
            </h3>
            <p className="text-sm text-gray-500">
              Files have been uploaded and marked as ready for processing
            </p>
          </div>

          <div className="divide-y divide-gray-200">
            {uploadedFiles.map((file, index) => (
              <div key={index} className="px-6 py-4 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <span className="text-2xl">{getFileIcon(file)}</span>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{file.name}</p>
                    <p className="text-xs text-gray-500">
                      {file.type || 'Unknown type'} • {formatFileSize(file.size)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    ✓ Uploaded
                  </span>
                  <button
                    onClick={() => removeFile(index)}
                    className="text-red-600 hover:text-red-800 text-sm"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Instructions */}
      <div className="bg-blue-50 rounded-lg p-6 border border-blue-200">
        <h4 className="text-sm font-medium text-blue-900 mb-3">📋 Supported File Types</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-blue-800">
          <div>
            <p className="font-medium mb-2">Email Files:</p>
            <ul className="space-y-1 text-blue-700">
              <li>• .eml files (exported emails)</li>
              <li>• Email attachments</li>
            </ul>
          </div>
          <div>
            <p className="font-medium mb-2">Documents:</p>
            <ul className="space-y-1 text-blue-700">
              <li>• PDF files (.pdf)</li>
              <li>• Word documents (.doc, .docx)</li>
              <li>• Images (.jpg, .png, .gif)</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UploadOrdersSection;