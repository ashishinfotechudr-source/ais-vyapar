import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type {
  Bill,
  Company,
  GatePass,
  InventoryItem,
  PaymentSheet,
  PurchaseOrder,
  Vendor,
  Voucher,
  WorkOrder,
} from '../types/erp.ts';
import { fmtNum, numberToIndianWords } from './api.ts';

export interface PdfOutput {
  title: string;
  filename: string;
  blobUrl: string;
  download: () => void;
}

function finalizePdf(doc: jsPDF, title: string, filename: string): PdfOutput {
  const blob = doc.output('blob');
  const blobUrl = URL.createObjectURL(blob);
  return {
    title,
    filename,
    blobUrl,
    download: () => doc.save(filename),
  };
}

function drawCompanyHeader(
  doc: jsPDF,
  company: Company,
  docHeading: string,
  docNumber: string,
  docDate: string,
  extraMeta: Array<[string, string]> = []
): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 26, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(company.legalName || company.name || 'VyaparLedger Enterprise', 14, 11);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  const line2 = [
    company.gstin ? `GSTIN: ${company.gstin}` : '',
    company.pan ? `PAN: ${company.pan}` : '',
    company.state ? `State: ${company.state} (${company.stateCode || '08'})` : '',
  ]
    .filter(Boolean)
    .join('  |  ');
  doc.text(line2 || 'GST Registered Enterprise', 14, 16.5);
  const addrLine = [company.address, company.city, company.pincode, company.phone, company.email]
    .filter(Boolean)
    .join(', ');
  if (addrLine) {
    doc.text(addrLine.slice(0, 95), 14, 21.5);
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(docHeading.toUpperCase(), pageWidth - 14, 11, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`No: ${docNumber}`, pageWidth - 14, 17, { align: 'right' });
  doc.text(`Date: ${docDate}`, pageWidth - 14, 22, { align: 'right' });

  doc.setTextColor(15, 23, 42);
  let y = 33;
  if (extraMeta.length > 0) {
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    extraMeta.forEach(([k, v], i) => {
      const colX = i % 2 === 0 ? 14 : pageWidth / 2 + 4;
      const rowY = y + Math.floor(i / 2) * 5;
      doc.setFont('helvetica', 'bold');
      doc.text(`${k}: `, colX, rowY);
      doc.setFont('helvetica', 'normal');
      doc.text(v || '-', colX + 28, rowY);
    });
    y += Math.ceil(extraMeta.length / 2) * 5 + 3;
  }
  return y;
}

function drawFooterBankAndSign(
  doc: jsPDF,
  company: Company,
  totalAmount: number,
  termsText?: string,
  startY?: number
) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  let y = startY || 200;
  if (y > pageHeight - 55) {
    doc.addPage();
    y = 20;
  }

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.text('Amount in Words:', 14, y);
  doc.setFont('helvetica', 'normal');
  doc.text(`INR ${numberToIndianWords(totalAmount)}`, 44, y);
  y += 6;

  const bank = (company.banks || [])[0];
  if (bank) {
    doc.setDrawColor(226, 232, 240);
    doc.rect(14, y, 95, 22);
    doc.setFont('helvetica', 'bold');
    doc.text('Company Bank Details', 17, y + 5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(`Bank: ${bank.bankName} (${bank.branch || 'Main'})`, 17, y + 10);
    doc.text(`A/C No: ${bank.accountNo}`, 17, y + 14.5);
    doc.text(`IFSC: ${bank.ifscCode}`, 17, y + 19);
  }

  doc.setDrawColor(226, 232, 240);
  doc.rect(pageWidth - 78, y, 64, 22);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text(`For ${company.name}`, pageWidth - 46, y + 5, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.text('Authorized Signatory', pageWidth - 46, y + 19, { align: 'center' });

  if (termsText) {
    const ty = y + 28;
    if (ty < pageHeight - 15) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.text('Terms & Conditions:', 14, ty);
      doc.setFont('helvetica', 'normal');
      const lines = doc.splitTextToSize(termsText, pageWidth - 28);
      doc.text(lines.slice(0, 6), 14, ty + 4.5);
    }
  }
}

export function generateVoucherPdf(voucher: Voucher, company: Company): PdfOutput {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const headingMap: Record<string, string> = {
    sales: 'Tax Invoice',
    purchase: 'Purchase Voucher',
    proforma: 'Proforma Invoice',
    service: 'Service Tax Invoice',
    receipt: 'Receipt Voucher',
    payment: 'Payment Voucher',
    journal: 'Journal Voucher',
  };
  const title = headingMap[voucher.voucherKind] || 'Accounting Voucher';

  let y = drawCompanyHeader(doc, company, title, voucher.voucherNo, voucher.voucherDate, [
    ['Party Name', voucher.partyName],
    ['Party GSTIN', voucher.partyGstin || 'Unregistered'],
    ['Place of Supply', voucher.placeOfSupply || `${voucher.partyStateCode || '08'}-${voucher.partyState || company.state}`],
    ['Supply Type', `${voucher.supplyType} ${voucher.reverseCharge ? '(RCM)' : ''}`],
    ['Ref / PO No', voucher.refNo || '-'],
    ['Status', voucher.status],
  ]);

  if (voucher.partyAddress) {
    doc.setFontSize(8);
    doc.text(`Billing Address: ${voucher.partyAddress}`, 14, y);
    y += 6;
  }

  if (voucher.voucherKind === 'journal') {
    autoTable(doc, {
      startY: y,
      head: [['Ledger Account', 'Narration', 'Debit (INR)', 'Credit (INR)']],
      body: (voucher.journalLines || []).map((l) => [
        l.ledgerName,
        l.narration || voucher.narration || '-',
        l.drAmount ? fmtNum(l.drAmount) : '-',
        l.crAmount ? fmtNum(l.crAmount) : '-',
      ]),
      styles: { fontSize: 8.5, cellPadding: 2.5 },
      headStyles: { fillColor: [15, 23, 42] },
      columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' } },
    });
  } else if (voucher.voucherKind === 'receipt' || voucher.voucherKind === 'payment') {
    autoTable(doc, {
      startY: y,
      head: [['Particulars', 'Payment Mode', 'Bank / Ref', 'Amount (INR)']],
      body: [
        [
          voucher.narration || `${title} - ${voucher.partyName}`,
          voucher.paymentMode || 'Bank Transfer',
          `${voucher.bankAccount || '-'} / ${voucher.refNo || '-'}`,
          fmtNum(voucher.totalAmount),
        ],
      ],
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [15, 23, 42] },
      columnStyles: { 3: { halign: 'right' } },
    });
  } else {
    const isInter = voucher.supplyType === 'Inter-State';
    const head = isInter
      ? [['#', 'Description', 'HSN/SAC', 'Qty', 'Unit', 'Rate', 'Taxable', 'IGST', 'Total']]
      : [['#', 'Description', 'HSN/SAC', 'Qty', 'Unit', 'Rate', 'Taxable', 'CGST', 'SGST', 'Total']];

    const body = (voucher.items || []).map((it, idx) =>
      isInter
        ? [
            idx + 1,
            it.description,
            it.hsnSac || '-',
            fmtNum(it.qty, 2),
            it.unit || 'NOS',
            fmtNum(it.rate),
            fmtNum(it.taxableValue),
            `${fmtNum(it.igstAmount)} (${it.igstRate}%)`,
            fmtNum(it.totalAmount),
          ]
        : [
            idx + 1,
            it.description,
            it.hsnSac || '-',
            fmtNum(it.qty, 2),
            it.unit || 'NOS',
            fmtNum(it.rate),
            fmtNum(it.taxableValue),
            `${fmtNum(it.cgstAmount)} (${it.cgstRate}%)`,
            `${fmtNum(it.sgstAmount)} (${it.sgstRate}%)`,
            fmtNum(it.totalAmount),
          ]
    );

    autoTable(doc, {
      startY: y,
      head,
      body,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [15, 23, 42] },
      columnStyles: isInter
        ? { 3: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' }, 8: { halign: 'right' } }
        : { 3: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' }, 8: { halign: 'right' }, 9: { halign: 'right' } },
    });
  }

  const finalY = ((doc as any).lastAutoTable?.finalY || y + 30) + 6;
  const pageWidth = doc.internal.pageSize.getWidth();
  const sumRows: Array<[string, string]> = [
    ['Taxable Value', fmtNum(voucher.taxableValue)],
    ['CGST', fmtNum(voucher.cgstAmount)],
    ['SGST', fmtNum(voucher.sgstAmount)],
    ['IGST', fmtNum(voucher.igstAmount)],
    ['Round Off', fmtNum(voucher.roundOff)],
    ['Grand Total (INR)', fmtNum(voucher.totalAmount)],
  ];
  autoTable(doc, {
    startY: finalY,
    margin: { left: pageWidth - 82 },
    tableWidth: 68,
    body: sumRows,
    theme: 'grid',
    styles: { fontSize: 8.5, cellPadding: 1.8 },
    columnStyles: { 0: { fontStyle: 'bold' }, 1: { halign: 'right', fontStyle: 'bold' } },
  });

  const endY = ((doc as any).lastAutoTable?.finalY || finalY + 35) + 8;
  drawFooterBankAndSign(doc, company, Number(voucher.totalAmount), voucher.termsText || voucher.narration, endY);
  return finalizePdf(doc, `${title} · ${voucher.voucherNo}`, `${voucher.voucherNo.replace(/[^\w-]/g, '_')}.pdf`);
}

export function generatePoPdf(po: PurchaseOrder, company: Company): PdfOutput {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const y = drawCompanyHeader(doc, company, 'Purchase Order', po.poNumber, po.poDate, [
    ['Supplier', po.vendorName],
    ['Supplier GSTIN', po.vendorGstin || '-'],
    ['Delivery Date', po.expectedDelivery || '-'],
    ['Supply Type', po.supplyType],
    ['Payment Terms', po.paymentTerms || '30 Days'],
    ['Status', po.status],
  ]);

  autoTable(doc, {
    startY: y,
    head: [['#', 'Item Description', 'HSN/SAC', 'Qty', 'Unit', 'Rate', 'Taxable', 'GST %', 'Total']],
    body: (po.items || []).map((it, i) => [
      i + 1,
      it.description,
      it.hsnSac || '-',
      fmtNum(it.qty, 2),
      it.unit || 'NOS',
      fmtNum(it.rate),
      fmtNum(it.taxableValue),
      `${it.gstRate}%`,
      fmtNum(it.totalAmount),
    ]),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [15, 23, 42] },
    columnStyles: { 3: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' }, 8: { halign: 'right' } },
  });

  const finalY = ((doc as any).lastAutoTable?.finalY || y + 30) + 6;
  const pageWidth = doc.internal.pageSize.getWidth();
  autoTable(doc, {
    startY: finalY,
    margin: { left: pageWidth - 82 },
    tableWidth: 68,
    body: [
      ['Taxable Value', fmtNum(po.taxableValue)],
      ['CGST', fmtNum(po.cgstAmount)],
      ['SGST', fmtNum(po.sgstAmount)],
      ['IGST', fmtNum(po.igstAmount)],
      ['Grand Total (INR)', fmtNum(po.totalAmount)],
    ],
    theme: 'grid',
    styles: { fontSize: 8.5, cellPadding: 1.8 },
    columnStyles: { 0: { fontStyle: 'bold' }, 1: { halign: 'right', fontStyle: 'bold' } },
  });

  const endY = ((doc as any).lastAutoTable?.finalY || finalY + 35) + 8;
  drawFooterBankAndSign(doc, company, Number(po.totalAmount), po.termsText, endY);
  return finalizePdf(doc, `Purchase Order · ${po.poNumber}`, `${po.poNumber.replace(/[^\w-]/g, '_')}.pdf`);
}

export function generateWoPdf(wo: WorkOrder, company: Company): PdfOutput {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const y = drawCompanyHeader(doc, company, 'Work Order', wo.woNumber, wo.woDate, [
    ['Contractor', wo.contractorName],
    ['GSTIN', wo.vendorGstin || '-'],
    ['Site Location', wo.siteLocation || '-'],
    ['Completion Date', wo.completionDate || '-'],
    ['Supply Type', wo.supplyType],
    ['Status', wo.status],
  ]);

  autoTable(doc, {
    startY: y,
    head: [['#', 'Work Description', 'SAC/HSN', 'Qty', 'Unit', 'Rate', 'Taxable', 'GST %', 'Total']],
    body: (wo.items || []).map((it, i) => [
      i + 1,
      it.description,
      it.hsnSac || '-',
      fmtNum(it.qty, 2),
      it.unit || 'NOS',
      fmtNum(it.rate),
      fmtNum(it.taxableValue),
      `${it.gstRate}%`,
      fmtNum(it.totalAmount),
    ]),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [15, 23, 42] },
    columnStyles: { 3: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' }, 8: { halign: 'right' } },
  });

  const finalY = ((doc as any).lastAutoTable?.finalY || y + 30) + 6;
  const pageWidth = doc.internal.pageSize.getWidth();
  autoTable(doc, {
    startY: finalY,
    margin: { left: pageWidth - 82 },
    tableWidth: 68,
    body: [
      ['Taxable Value', fmtNum(wo.taxableValue)],
      ['CGST', fmtNum(wo.cgstAmount)],
      ['SGST', fmtNum(wo.sgstAmount)],
      ['IGST', fmtNum(wo.igstAmount)],
      ['Total Value (INR)', fmtNum(wo.totalAmount)],
    ],
    theme: 'grid',
    styles: { fontSize: 8.5, cellPadding: 1.8 },
    columnStyles: { 0: { fontStyle: 'bold' }, 1: { halign: 'right', fontStyle: 'bold' } },
  });

  const endY = ((doc as any).lastAutoTable?.finalY || finalY + 35) + 8;
  drawFooterBankAndSign(doc, company, Number(wo.totalAmount), wo.termsText || wo.scopeOfWork, endY);
  return finalizePdf(doc, `Work Order · ${wo.woNumber}`, `${wo.woNumber.replace(/[^\w-]/g, '_')}.pdf`);
}

export function generatePaymentSheetPdf(
  sheet: PaymentSheet,
  bills: Bill[],
  vendors: Vendor[],
  company: Company
): PdfOutput {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const sheetBills = bills.filter((b) => (sheet.billIds || []).includes(b.id));
  const y = drawCompanyHeader(doc, company, 'Bank Payment Advice', sheet.sheetNo, sheet.sheetDate, [
    ['Pay From Bank', sheet.payFromBank || 'Primary Bank'],
    ['Payment Mode', sheet.paymentMode],
    ['Total Bills', String(sheetBills.length)],
    ['Status', sheet.status],
  ]);

  autoTable(doc, {
    startY: y,
    head: [['Bill No', 'Beneficiary', 'A/C No', 'IFSC', 'Gross', 'TDS', 'Net Payable']],
    body: sheetBills.map((b) => {
      const v = vendors.find((x) => x.id === b.vendorId || x.vendorName === b.vendorName);
      return [
        b.billNo,
        b.vendorName,
        v?.accountNo || '-',
        v?.ifscCode || '-',
        fmtNum(Number(b.amount) + Number(b.gstAmount)),
        fmtNum(b.tdsAmount),
        fmtNum(b.netAmount),
      ];
    }),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [15, 23, 42] },
    columnStyles: { 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' } },
  });

  const endY = ((doc as any).lastAutoTable?.finalY || y + 40) + 10;
  drawFooterBankAndSign(doc, company, Number(sheet.totalNetAmount), sheet.remarks, endY);
  return finalizePdf(doc, `Payment Advice · ${sheet.sheetNo}`, `${sheet.sheetNo.replace(/[^\w-]/g, '_')}.pdf`);
}

export function generateGatePassPdf(gp: GatePass, company: Company): PdfOutput {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const y = drawCompanyHeader(doc, company, `${gp.direction} Gate Pass`, gp.passNo, gp.passDate, [
    ['Pass Type', gp.passType],
    ['Party Name', gp.partyName],
    ['Vehicle No', gp.vehicleNo || '-'],
    ['Driver Name', gp.driverName || '-'],
  ]);

  autoTable(doc, {
    startY: y,
    head: [['#', 'Item Description', 'Quantity', 'Unit', 'Remarks']],
    body: (gp.items || []).map((it, i) => [i + 1, it.description, fmtNum(it.qty, 2), it.unit || 'NOS', it.remarks || '-']),
    styles: { fontSize: 8.5, cellPadding: 2.5 },
    headStyles: { fillColor: [15, 23, 42] },
    columnStyles: { 2: { halign: 'right' } },
  });

  const endY = ((doc as any).lastAutoTable?.finalY || y + 40) + 12;
  drawFooterBankAndSign(doc, company, 0, gp.remarks, endY);
  return finalizePdf(doc, `Gate Pass · ${gp.passNo}`, `${gp.passNo.replace(/[^\w-]/g, '_')}.pdf`);
}

export function generateStockValuationPdf(items: InventoryItem[], company: Company): PdfOutput {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
  const y = drawCompanyHeader(doc, company, 'Stock Valuation Report', 'INV-VAL', new Date().toISOString().slice(0, 10));
  const totalVal = items.reduce((s, it) => s + Number(it.currentStock) * Number(it.purchaseRate), 0);

  autoTable(doc, {
    startY: y,
    head: [['SKU', 'Item Name', 'HSN', 'UQC', 'Method', 'Stock', 'Min/Reorder', 'Avg Cost', 'Valuation (INR)']],
    body: items.map((it) => [
      it.sku,
      it.name,
      it.hsnSac || '-',
      it.unit,
      it.valuationMethod,
      fmtNum(it.currentStock, 2),
      `${fmtNum(it.minStock, 0)} / ${fmtNum(it.reorderLevel, 0)}`,
      fmtNum(it.purchaseRate),
      fmtNum(Number(it.currentStock) * Number(it.purchaseRate)),
    ]),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [15, 23, 42] },
    columnStyles: { 5: { halign: 'right' }, 7: { halign: 'right' }, 8: { halign: 'right' } },
  });

  const endY = ((doc as any).lastAutoTable?.finalY || y + 30) + 8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(`Total Inventory Valuation: INR ${fmtNum(totalVal)}`, 14, endY);
  return finalizePdf(doc, 'Stock Valuation Report', 'stock_valuation_report.pdf');
}

export function generateGstSummaryPdf(report: any, company: Company): PdfOutput {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const y = drawCompanyHeader(
    doc,
    company,
    'GST Return Summary (GSTR-1 / 2 / 3B)',
    'GST-FILING',
    new Date().toISOString().slice(0, 10),
    [['Return Period', `${report.period.fromDate} to ${report.period.toDate}`], ['Filing GSTIN', company.gstin || 'Not Set']]
  );

  autoTable(doc, {
    startY: y,
    head: [['GSTR Section', 'Taxable Value', 'IGST', 'CGST', 'SGST', 'Total Tax']],
    body: [
      [
        '3.1(a) Outward Taxable Supplies (GSTR-1)',
        fmtNum(report.gstr3b.table3_1.outwardTaxable.taxableValue),
        fmtNum(report.gstr3b.table3_1.outwardTaxable.igst),
        fmtNum(report.gstr3b.table3_1.outwardTaxable.cgst),
        fmtNum(report.gstr3b.table3_1.outwardTaxable.sgst),
        fmtNum(
          report.gstr3b.table3_1.outwardTaxable.igst +
            report.gstr3b.table3_1.outwardTaxable.cgst +
            report.gstr3b.table3_1.outwardTaxable.sgst
        ),
      ],
      [
        '3.1(d) Inward Supplies Liable to RCM',
        fmtNum(report.gstr3b.table3_1.inwardRcm.taxableValue),
        fmtNum(report.gstr3b.table3_1.inwardRcm.igst),
        fmtNum(report.gstr3b.table3_1.inwardRcm.cgst),
        fmtNum(report.gstr3b.table3_1.inwardRcm.sgst),
        fmtNum(
          report.gstr3b.table3_1.inwardRcm.igst +
            report.gstr3b.table3_1.inwardRcm.cgst +
            report.gstr3b.table3_1.inwardRcm.sgst
        ),
      ],
      [
        '4. Eligible Input Tax Credit (GSTR-2)',
        fmtNum(report.gstr2.summary.taxableValue),
        fmtNum(report.gstr3b.table4.eligibleItc.igst),
        fmtNum(report.gstr3b.table4.eligibleItc.cgst),
        fmtNum(report.gstr3b.table4.eligibleItc.sgst),
        fmtNum(report.gstr2.summary.eligibleItcTotal),
      ],
    ],
    styles: { fontSize: 8.5, cellPadding: 2.5 },
    headStyles: { fillColor: [15, 23, 42] },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } },
  });

  const y2 = ((doc as any).lastAutoTable?.finalY || y + 40) + 8;
  const off = report.gstr3b.table6_1.offset;
  autoTable(doc, {
    startY: y2,
    head: [['Tax Head (Table 6.1)', 'Paid via IGST ITC', 'Paid via CGST ITC', 'Paid via SGST ITC', 'Net Cash Payable']],
    body: [
      ['IGST', fmtNum(off.igst.paidByIgst), fmtNum(off.igst.paidByCgst), fmtNum(off.igst.paidBySgst), fmtNum(off.igst.paidInCash)],
      ['CGST', fmtNum(off.cgst.paidByIgst), fmtNum(off.cgst.paidByCgst), fmtNum(off.cgst.paidBySgst), fmtNum(off.cgst.paidInCash)],
      ['SGST', fmtNum(off.sgst.paidByIgst), fmtNum(off.sgst.paidByCgst), fmtNum(off.sgst.paidBySgst), fmtNum(off.sgst.paidInCash)],
    ],
    styles: { fontSize: 8.5, cellPadding: 2.5 },
    headStyles: { fillColor: [15, 118, 110] },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right', fontStyle: 'bold' } },
  });

  return finalizePdf(doc, 'GST Compliance Summary (GSTR-1/2/3B)', 'gst_compliance_summary.pdf');
}
