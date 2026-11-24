import React, { useEffect } from 'react';
import { Download, FileText, X } from 'lucide-react';
import type { PdfOutput } from '../lib/pdfGenerator.ts';

interface PdfPreviewModalProps {
  pdf: PdfOutput | null;
  onClose: () => void;
}

export const PdfPreviewModal: React.FC<PdfPreviewModalProps> = ({ pdf, onClose }) => {
  useEffect(() => {
    return () => {
      if (pdf?.blobUrl) {
        URL.revokeObjectURL(pdf.blobUrl);
      }
    };
  }, [pdf]);

  if (!pdf) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
      <div className="flex h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <FileText className="h-5 w-5 text-emerald-600" />
            <div>
              <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                {pdf.title}
              </h3>
              <p className="font-mono text-xs text-slate-500">{pdf.filename}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={pdf.download}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-700"
            >
              <Download className="h-4 w-4" />
              Download PDF
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="flex-1 bg-slate-100 dark:bg-slate-950">
          <iframe
            title={pdf.title}
            src={pdf.blobUrl}
            className="h-full w-full border-0"
          />
        </div>
      </div>
    </div>
  );
};
