export interface BankAccount {
  id: string;
  bankName: string;
  branch?: string;
  accountNo: string;
  ifscCode: string;
  accountType?: string;
  isDefault?: boolean;
}

export interface Company {
  id: number;
  code: string;
  name: string;
  legalName: string;
  gstin: string;
  pan: string;
  tan: string;
  cin: string;
  address: string;
  city: string;
  state: string;
  stateCode: string;
  pincode: string;
  country: string;
  email: string;
  phone: string;
  website: string;
  logoUrl: string;
  signatureUrl: string;
  banks: BankAccount[];
  numbering: Record<string, { prefix: string; nextNo: number }>;
  financialYearStart: string;
}

export interface Vendor {
  id: number;
  companyId: number;
  vendorCode: string;
  vendorName: string;
  tradeName: string;
  vendorCategory: string;
  contactPerson: string;
  mobile: string;
  email: string;
  website: string;
  gstType: string;
  gstin: string;
  gstStatus: string;
  businessConstitution: string;
  pan: string;
  tan: string;
  msmeRegNo: string;
  address: string;
  city: string;
  state: string;
  stateCode: string;
  pincode: string;
  country: string;
  placeOfSupply: string;
  bankName: string;
  bankBranch: string;
  accountNo: string;
  ifscCode: string;
  accountType: string;
  paymentTerms: string;
  creditLimit: string;
  openingBalance: string;
  tdsApplicable: boolean;
  tdsSection: string;
  tdsRate: string;
  status: string;
  notes: string;
}

export interface Warehouse {
  id: number;
  companyId: number;
  code: string;
  name: string;
  location: string;
  state: string;
  inCharge: string;
  isDefault: boolean;
  active: boolean;
}

export interface InventoryItem {
  id: number;
  companyId: number;
  sku: string;
  name: string;
  description: string;
  category: string;
  itemType: string;
  hsnSac: string;
  gstRate: string;
  cessRate: string;
  unit: string;
  altUnit: string;
  conversionFactor: string;
  valuationMethod: string;
  purchaseRate: string;
  sellingRate: string;
  mrp: string;
  openingStock: string;
  currentStock: string;
  minStock: string;
  reorderLevel: string;
  maxStock: string;
  warehouseId: number | null;
  binLocation: string;
  batchTracked: boolean;
  serialTracked: boolean;
  preferredVendorId: number | null;
  active: boolean;
}

export interface InventoryMovement {
  id: number;
  companyId: number;
  entryNo: string;
  entryDate: string;
  movementType: 'IN_GRN' | 'OUT_ISSUE' | 'TRANSFER' | 'ADJUSTMENT' | 'OPENING';
  itemId: number;
  warehouseId: number | null;
  toWarehouseId: number | null;
  batchNo: string;
  expiryDate: string;
  serialNumbers: string[];
  qty: string;
  unitRate: string;
  totalValue: string;
  refDocType: string;
  refDocNo: string;
  vendorId: number | null;
  remarks: string;
  createdBy: string;
}

export interface VoucherLineItem {
  id: string;
  itemId?: number;
  sku?: string;
  description: string;
  hsnSac: string;
  qty: number;
  unit: string;
  rate: number;
  discount: number;
  taxableValue: number;
  gstRate: number;
  cgstRate: number;
  sgstRate: number;
  igstRate: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  cessRate?: number;
  cessAmount?: number;
  totalAmount: number;
}

export interface VoucherCharge {
  id: string;
  head: string;
  type: 'Add' | 'Less';
  amount: number;
  gstRate?: number;
}

export interface JournalLine {
  id: string;
  ledgerName: string;
  drAmount: number;
  crAmount: number;
  narration?: string;
}

export interface PurchaseOrder {
  id: number;
  companyId: number;
  poNumber: string;
  poDate: string;
  expectedDelivery: string;
  vendorId: number | null;
  vendorName: string;
  vendorGstin: string;
  vendorState: string;
  vendorStateCode: string;
  vendorAddress: string;
  deliveryAddress: string;
  warehouseId: number | null;
  paymentTerms: string;
  termsText: string;
  items: VoucherLineItem[];
  charges: VoucherCharge[];
  taxableValue: string;
  cgstAmount: string;
  sgstAmount: string;
  igstAmount: string;
  cessAmount: string;
  totalAmount: string;
  supplyType: string;
  status: string;
  notes: string;
}

export interface WorkOrder {
  id: number;
  companyId: number;
  woNumber: string;
  woDate: string;
  completionDate: string;
  vendorId: number | null;
  contractorName: string;
  vendorGstin: string;
  vendorState: string;
  vendorStateCode: string;
  siteLocation: string;
  scopeOfWork: string;
  termsText: string;
  items: VoucherLineItem[];
  charges: VoucherCharge[];
  taxableValue: string;
  cgstAmount: string;
  sgstAmount: string;
  igstAmount: string;
  totalAmount: string;
  supplyType: string;
  status: string;
  notes: string;
}

export type VoucherKind = 'sales' | 'purchase' | 'receipt' | 'payment' | 'journal' | 'proforma' | 'service';

export interface Voucher {
  id: number;
  companyId: number;
  voucherKind: VoucherKind;
  voucherNo: string;
  voucherDate: string;
  dueDate: string;
  partyId: number | null;
  partyName: string;
  partyGstin: string;
  partyState: string;
  partyStateCode: string;
  partyAddress: string;
  placeOfSupply: string;
  supplyType: string;
  invoiceType: string;
  reverseCharge: boolean;
  itcEligibility: string;
  refNo: string;
  refDate: string;
  paymentMode: string;
  bankAccount: string;
  tdsPercent: string;
  tdsAmount: string;
  items: VoucherLineItem[];
  charges: VoucherCharge[];
  journalLines: JournalLine[];
  taxableValue: string;
  cgstAmount: string;
  sgstAmount: string;
  igstAmount: string;
  cessAmount: string;
  roundOff: string;
  totalAmount: string;
  paidAmount: string;
  narration: string;
  termsText: string;
  status: string;
}

export interface Bill {
  id: number;
  companyId: number;
  billNo: string;
  billDate: string;
  vendorId: number | null;
  vendorName: string;
  vendorGstin: string;
  docNo: string;
  docDate: string;
  poWoRef: string;
  amount: string;
  gstAmount: string;
  cgstAmount: string;
  sgstAmount: string;
  igstAmount: string;
  tdsAmount: string;
  deduction: string;
  netAmount: string;
  payFromBank: string;
  paymentMode: string;
  paymentSheetId: number | null;
  status: string;
  narration: string;
}

export interface PaymentSheet {
  id: number;
  companyId: number;
  sheetNo: string;
  sheetDate: string;
  payFromBank: string;
  paymentMode: string;
  billIds: number[];
  totalNetAmount: string;
  status: string;
  remarks: string;
}

export interface GatePass {
  id: number;
  companyId: number;
  passNo: string;
  passDate: string;
  passType: string;
  direction: string;
  partyName: string;
  vehicleNo: string;
  driverName: string;
  items: Array<{ id: string; description: string; qty: number; unit: string; remarks?: string }>;
  status: string;
  remarks: string;
}

export interface AccountGroup {
  id: number;
  companyId: number;
  name: string;
  nature: string;
  parentGroup: string;
  isSystem: boolean;
}

export interface Ledger {
  id: number;
  companyId: number;
  name: string;
  groupName: string;
  nature: string;
  openingBalance: string;
  openingType: string;
  gstin: string;
  state: string;
  vendorId: number | null;
}

export interface TermsTemplate {
  id: number;
  companyId: number;
  name: string;
  docType: string;
  content: string;
  isDefault: boolean;
}

export interface GstMasterRow {
  id: number;
  category: 'hsn' | 'country' | 'state' | 'uqc';
  code: string;
  name: string;
  description: string;
  gstRate: string | null;
  cgstRate: string | null;
  sgstRate: string | null;
  igstRate: string | null;
  extra: Record<string, unknown> | null;
  source: string;
  syncedAt: string;
}

export interface DbSnapshotMeta {
  id: number;
  companyId: number | null;
  label: string;
  createdBy: string;
  recordCount: number;
  createdAt: string;
}

export interface AuditLogRow {
  id: number;
  companyId: number | null;
  actorEmail: string;
  action: string;
  entityType: string;
  detail: string;
  createdAt: string;
}

export interface ErpUser {
  id: number;
  uid: string;
  email: string;
  name: string;
  role: string;
  active: boolean;
  companyIds: number[] | null;
  perms: {
    menus: Record<string, 'none' | 'view' | 'edit'>;
    options: { delete: boolean; export: boolean };
  } | null;
}

export interface ErpBundle {
  company: Company;
  vendors: Vendor[];
  warehouses: Warehouse[];
  inventoryItems: InventoryItem[];
  inventoryMovements: InventoryMovement[];
  purchaseOrders: PurchaseOrder[];
  workOrders: WorkOrder[];
  vouchers: Voucher[];
  bills: Bill[];
  paymentSheets: PaymentSheet[];
  gatePasses: GatePass[];
  accountGroups: AccountGroup[];
  ledgers: Ledger[];
  termsTemplates: TermsTemplate[];
  auditLogs: AuditLogRow[];
  snapshots: DbSnapshotMeta[];
}
