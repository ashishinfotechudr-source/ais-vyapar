import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export interface BankAccount {
  id: string;
  bankName: string;
  branch?: string;
  accountNo: string;
  ifscCode: string;
  accountType?: string;
  isDefault?: boolean;
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

export interface GatePassItem {
  id: string;
  description: string;
  qty: number;
  unit: string;
  remarks?: string;
}

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  username: text('username').default(''),
  email: text('email').notNull(),
  name: text('name').default(''),
  passwordHash: text('password_hash'),
  role: text('role').notNull().default('Admin'),
  active: boolean('active').notNull().default(true),
  perms: jsonb('perms').$type<{
    menus: Record<string, 'none' | 'view' | 'edit'>;
    options: { delete: boolean; export: boolean };
  }>(),
  companyIds: jsonb('company_ids').$type<number[] | null>(),
  lastLogin: timestamp('last_login'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const companies = pgTable('companies', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  legalName: text('legal_name').default(''),
  gstin: text('gstin').default(''),
  pan: text('pan').default(''),
  tan: text('tan').default(''),
  cin: text('cin').default(''),
  address: text('address').default(''),
  city: text('city').default(''),
  state: text('state').default('Rajasthan'),
  stateCode: text('state_code').default('08'),
  pincode: text('pincode').default(''),
  country: text('country').default('India'),
  email: text('email').default(''),
  phone: text('phone').default(''),
  website: text('website').default(''),
  logoUrl: text('logo_url').default(''),
  signatureUrl: text('signature_url').default(''),
  banks: jsonb('banks').$type<BankAccount[]>().default([]).notNull(),
  numbering: jsonb('numbering').$type<Record<string, { prefix: string; nextNo: number }>>().default({}).notNull(),
  financialYearStart: text('financial_year_start').default('04'),
  ownerUid: text('owner_uid').notNull(),
  deleted: boolean('deleted').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const vendors = pgTable('vendors', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id')
    .references(() => companies.id, { onDelete: 'cascade' })
    .notNull(),
  vendorCode: text('vendor_code').default(''),
  vendorName: text('vendor_name').notNull(),
  tradeName: text('trade_name').default(''),
  vendorCategory: text('vendor_category').default('Supplier'),
  contactPerson: text('contact_person').default(''),
  mobile: text('mobile').default(''),
  email: text('email').default(''),
  website: text('website').default(''),
  gstType: text('gst_type').default('Registered - Regular'),
  gstin: text('gstin').default(''),
  gstStatus: text('gst_status').default(''),
  businessConstitution: text('business_constitution').default(''),
  pan: text('pan').default(''),
  tan: text('tan').default(''),
  msmeRegNo: text('msme_reg_no').default(''),
  address: text('address').default(''),
  city: text('city').default(''),
  state: text('state').default(''),
  stateCode: text('state_code').default(''),
  pincode: text('pincode').default(''),
  country: text('country').default('India'),
  placeOfSupply: text('place_of_supply').default(''),
  bankName: text('bank_name').default(''),
  bankBranch: text('bank_branch').default(''),
  accountNo: text('account_no').default(''),
  ifscCode: text('ifsc_code').default(''),
  accountType: text('account_type').default('Current'),
  paymentTerms: text('payment_terms').default('30 Days'),
  creditLimit: numeric('credit_limit', { precision: 14, scale: 2 }).default('0'),
  openingBalance: numeric('opening_balance', { precision: 14, scale: 2 }).default('0'),
  tdsApplicable: boolean('tds_applicable').default(false),
  tdsSection: text('tds_section').default(''),
  tdsRate: numeric('tds_rate', { precision: 6, scale: 2 }).default('0'),
  status: text('status').default('Active').notNull(),
  notes: text('notes').default(''),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const warehouses = pgTable('warehouses', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id')
    .references(() => companies.id, { onDelete: 'cascade' })
    .notNull(),
  code: text('code').notNull(),
  name: text('name').notNull(),
  location: text('location').default(''),
  state: text('state').default(''),
  inCharge: text('in_charge').default(''),
  isDefault: boolean('is_default').default(false).notNull(),
  active: boolean('active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const inventoryItems = pgTable('inventory_items', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id')
    .references(() => companies.id, { onDelete: 'cascade' })
    .notNull(),
  sku: text('sku').notNull(),
  name: text('name').notNull(),
  description: text('description').default(''),
  category: text('category').default('Raw Material'),
  itemType: text('item_type').default('Goods'),
  hsnSac: text('hsn_sac').default(''),
  gstRate: numeric('gst_rate', { precision: 5, scale: 2 }).default('18'),
  cessRate: numeric('cess_rate', { precision: 5, scale: 2 }).default('0'),
  unit: text('unit').default('NOS'),
  altUnit: text('alt_unit').default(''),
  conversionFactor: numeric('conversion_factor', { precision: 12, scale: 4 }).default('1'),
  valuationMethod: text('valuation_method').default('Weighted Average'),
  purchaseRate: numeric('purchase_rate', { precision: 14, scale: 2 }).default('0'),
  sellingRate: numeric('selling_rate', { precision: 14, scale: 2 }).default('0'),
  mrp: numeric('mrp', { precision: 14, scale: 2 }).default('0'),
  openingStock: numeric('opening_stock', { precision: 14, scale: 3 }).default('0'),
  currentStock: numeric('current_stock', { precision: 14, scale: 3 }).default('0'),
  minStock: numeric('min_stock', { precision: 14, scale: 3 }).default('0'),
  reorderLevel: numeric('reorder_level', { precision: 14, scale: 3 }).default('0'),
  maxStock: numeric('max_stock', { precision: 14, scale: 3 }).default('0'),
  warehouseId: integer('warehouse_id'),
  binLocation: text('bin_location').default(''),
  batchTracked: boolean('batch_tracked').default(false).notNull(),
  serialTracked: boolean('serial_tracked').default(false).notNull(),
  preferredVendorId: integer('preferred_vendor_id'),
  active: boolean('active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const inventoryMovements = pgTable('inventory_movements', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id')
    .references(() => companies.id, { onDelete: 'cascade' })
    .notNull(),
  entryNo: text('entry_no').notNull(),
  entryDate: text('entry_date').notNull(),
  movementType: text('movement_type').notNull(), // IN_GRN, OUT_ISSUE, TRANSFER, ADJUSTMENT, OPENING
  itemId: integer('item_id')
    .references(() => inventoryItems.id, { onDelete: 'cascade' })
    .notNull(),
  warehouseId: integer('warehouse_id'),
  toWarehouseId: integer('to_warehouse_id'),
  batchNo: text('batch_no').default(''),
  expiryDate: text('expiry_date').default(''),
  serialNumbers: jsonb('serial_numbers').$type<string[]>().default([]),
  qty: numeric('qty', { precision: 14, scale: 3 }).notNull(),
  unitRate: numeric('unit_rate', { precision: 14, scale: 2 }).default('0'),
  totalValue: numeric('total_value', { precision: 14, scale: 2 }).default('0'),
  refDocType: text('ref_doc_type').default(''),
  refDocNo: text('ref_doc_no').default(''),
  vendorId: integer('vendor_id'),
  remarks: text('remarks').default(''),
  createdBy: text('created_by').default(''),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const purchaseOrders = pgTable('purchase_orders', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id')
    .references(() => companies.id, { onDelete: 'cascade' })
    .notNull(),
  poNumber: text('po_number').notNull(),
  poDate: text('po_date').notNull(),
  expectedDelivery: text('expected_delivery').default(''),
  vendorId: integer('vendor_id'),
  vendorName: text('vendor_name').notNull(),
  vendorGstin: text('vendor_gstin').default(''),
  vendorState: text('vendor_state').default(''),
  vendorStateCode: text('vendor_state_code').default(''),
  vendorAddress: text('vendor_address').default(''),
  deliveryAddress: text('delivery_address').default(''),
  warehouseId: integer('warehouse_id'),
  paymentTerms: text('payment_terms').default('30 Days'),
  termsText: text('terms_text').default(''),
  items: jsonb('items').$type<VoucherLineItem[]>().default([]).notNull(),
  charges: jsonb('charges').$type<VoucherCharge[]>().default([]).notNull(),
  taxableValue: numeric('taxable_value', { precision: 14, scale: 2 }).default('0'),
  cgstAmount: numeric('cgst_amount', { precision: 14, scale: 2 }).default('0'),
  sgstAmount: numeric('sgst_amount', { precision: 14, scale: 2 }).default('0'),
  igstAmount: numeric('igst_amount', { precision: 14, scale: 2 }).default('0'),
  cessAmount: numeric('cess_amount', { precision: 14, scale: 2 }).default('0'),
  totalAmount: numeric('total_amount', { precision: 14, scale: 2 }).default('0'),
  supplyType: text('supply_type').default('Intra-State'),
  status: text('status').default('Pending').notNull(),
  notes: text('notes').default(''),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const workOrders = pgTable('work_orders', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id')
    .references(() => companies.id, { onDelete: 'cascade' })
    .notNull(),
  woNumber: text('wo_number').notNull(),
  woDate: text('wo_date').notNull(),
  completionDate: text('completion_date').default(''),
  vendorId: integer('vendor_id'),
  contractorName: text('contractor_name').notNull(),
  vendorGstin: text('vendor_gstin').default(''),
  vendorState: text('vendor_state').default(''),
  vendorStateCode: text('vendor_state_code').default(''),
  siteLocation: text('site_location').default(''),
  scopeOfWork: text('scope_of_work').default(''),
  termsText: text('terms_text').default(''),
  items: jsonb('items').$type<VoucherLineItem[]>().default([]).notNull(),
  charges: jsonb('charges').$type<VoucherCharge[]>().default([]).notNull(),
  taxableValue: numeric('taxable_value', { precision: 14, scale: 2 }).default('0'),
  cgstAmount: numeric('cgst_amount', { precision: 14, scale: 2 }).default('0'),
  sgstAmount: numeric('sgst_amount', { precision: 14, scale: 2 }).default('0'),
  igstAmount: numeric('igst_amount', { precision: 14, scale: 2 }).default('0'),
  totalAmount: numeric('total_amount', { precision: 14, scale: 2 }).default('0'),
  supplyType: text('supply_type').default('Intra-State'),
  status: text('status').default('Pending').notNull(),
  notes: text('notes').default(''),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const vouchers = pgTable('vouchers', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id')
    .references(() => companies.id, { onDelete: 'cascade' })
    .notNull(),
  voucherKind: text('voucher_kind').notNull(), // sales, purchase, receipt, payment, journal, proforma, service
  voucherNo: text('voucher_no').notNull(),
  voucherDate: text('voucher_date').notNull(),
  dueDate: text('due_date').default(''),
  partyId: integer('party_id'),
  partyName: text('party_name').notNull(),
  partyGstin: text('party_gstin').default(''),
  partyState: text('party_state').default(''),
  partyStateCode: text('party_state_code').default(''),
  partyAddress: text('party_address').default(''),
  placeOfSupply: text('place_of_supply').default(''),
  supplyType: text('supply_type').default('Intra-State'),
  invoiceType: text('invoice_type').default('B2B'), // B2B, B2CL, B2CS, EXP, CDNR, NIL
  reverseCharge: boolean('reverse_charge').default(false).notNull(),
  itcEligibility: text('itc_eligibility').default('Eligible'), // Eligible, Ineligible, Capital Goods, Input Services
  refNo: text('ref_no').default(''),
  refDate: text('ref_date').default(''),
  paymentMode: text('payment_mode').default('Bank Transfer'),
  bankAccount: text('bank_account').default(''),
  tdsPercent: numeric('tds_percent', { precision: 6, scale: 2 }).default('0'),
  tdsAmount: numeric('tds_amount', { precision: 14, scale: 2 }).default('0'),
  items: jsonb('items').$type<VoucherLineItem[]>().default([]).notNull(),
  charges: jsonb('charges').$type<VoucherCharge[]>().default([]).notNull(),
  journalLines: jsonb('journal_lines').$type<JournalLine[]>().default([]).notNull(),
  taxableValue: numeric('taxable_value', { precision: 14, scale: 2 }).default('0'),
  cgstAmount: numeric('cgst_amount', { precision: 14, scale: 2 }).default('0'),
  sgstAmount: numeric('sgst_amount', { precision: 14, scale: 2 }).default('0'),
  igstAmount: numeric('igst_amount', { precision: 14, scale: 2 }).default('0'),
  cessAmount: numeric('cess_amount', { precision: 14, scale: 2 }).default('0'),
  roundOff: numeric('round_off', { precision: 10, scale: 2 }).default('0'),
  totalAmount: numeric('total_amount', { precision: 14, scale: 2 }).default('0'),
  paidAmount: numeric('paid_amount', { precision: 14, scale: 2 }).default('0'),
  narration: text('narration').default(''),
  termsText: text('terms_text').default(''),
  status: text('status').default('Posted').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const bills = pgTable('bills', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id')
    .references(() => companies.id, { onDelete: 'cascade' })
    .notNull(),
  billNo: text('bill_no').notNull(),
  billDate: text('bill_date').notNull(),
  vendorId: integer('vendor_id'),
  vendorName: text('vendor_name').notNull(),
  vendorGstin: text('vendor_gstin').default(''),
  docNo: text('doc_no').default(''),
  docDate: text('doc_date').default(''),
  poWoRef: text('po_wo_ref').default(''),
  amount: numeric('amount', { precision: 14, scale: 2 }).default('0'),
  gstAmount: numeric('gst_amount', { precision: 14, scale: 2 }).default('0'),
  cgstAmount: numeric('cgst_amount', { precision: 14, scale: 2 }).default('0'),
  sgstAmount: numeric('sgst_amount', { precision: 14, scale: 2 }).default('0'),
  igstAmount: numeric('igst_amount', { precision: 14, scale: 2 }).default('0'),
  tdsAmount: numeric('tds_amount', { precision: 14, scale: 2 }).default('0'),
  deduction: numeric('deduction', { precision: 14, scale: 2 }).default('0'),
  netAmount: numeric('net_amount', { precision: 14, scale: 2 }).default('0'),
  payFromBank: text('pay_from_bank').default(''),
  paymentMode: text('payment_mode').default('NEFT'),
  paymentSheetId: integer('payment_sheet_id'),
  status: text('status').default('Pending').notNull(),
  narration: text('narration').default(''),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const paymentSheets = pgTable('payment_sheets', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id')
    .references(() => companies.id, { onDelete: 'cascade' })
    .notNull(),
  sheetNo: text('sheet_no').notNull(),
  sheetDate: text('sheet_date').notNull(),
  payFromBank: text('pay_from_bank').default(''),
  paymentMode: text('payment_mode').default('NEFT'),
  billIds: jsonb('bill_ids').$type<number[]>().default([]).notNull(),
  totalNetAmount: numeric('total_net_amount', { precision: 14, scale: 2 }).default('0'),
  status: text('status').default('Initiated').notNull(),
  remarks: text('remarks').default(''),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const gatePasses = pgTable('gate_passes', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id')
    .references(() => companies.id, { onDelete: 'cascade' })
    .notNull(),
  passNo: text('pass_no').notNull(),
  passDate: text('pass_date').notNull(),
  passType: text('pass_type').default('Returnable').notNull(),
  direction: text('direction').default('Outward').notNull(),
  partyName: text('party_name').notNull(),
  vehicleNo: text('vehicle_no').default(''),
  driverName: text('driver_name').default(''),
  items: jsonb('items').$type<GatePassItem[]>().default([]).notNull(),
  status: text('status').default('Open').notNull(),
  remarks: text('remarks').default(''),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const accountGroups = pgTable('account_groups', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id')
    .references(() => companies.id, { onDelete: 'cascade' })
    .notNull(),
  name: text('name').notNull(),
  nature: text('nature').notNull(), // Asset, Liability, Income, Expense
  parentGroup: text('parent_group').default('Primary'),
  isSystem: boolean('is_system').default(false).notNull(),
});

export const ledgers = pgTable('ledgers', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id')
    .references(() => companies.id, { onDelete: 'cascade' })
    .notNull(),
  name: text('name').notNull(),
  groupName: text('group_name').notNull(),
  nature: text('nature').notNull(),
  openingBalance: numeric('opening_balance', { precision: 14, scale: 2 }).default('0'),
  openingType: text('opening_type').default('Dr'),
  gstin: text('gstin').default(''),
  state: text('state').default(''),
  vendorId: integer('vendor_id'),
});

export const termsTemplates = pgTable('terms_templates', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id')
    .references(() => companies.id, { onDelete: 'cascade' })
    .notNull(),
  name: text('name').notNull(),
  docType: text('doc_type').default('Purchase Order'),
  content: text('content').notNull(),
  isDefault: boolean('is_default').default(false).notNull(),
});

export const gstMasterData = pgTable(
  'gst_master_data',
  {
    id: serial('id').primaryKey(),
    category: text('category').notNull(), // hsn, country, state, uqc
    code: text('code').notNull(),
    name: text('name').notNull(),
    description: text('description').default(''),
    gstRate: numeric('gst_rate', { precision: 5, scale: 2 }),
    cgstRate: numeric('cgst_rate', { precision: 5, scale: 2 }),
    sgstRate: numeric('sgst_rate', { precision: 5, scale: 2 }),
    igstRate: numeric('igst_rate', { precision: 5, scale: 2 }),
    extra: jsonb('extra').$type<Record<string, unknown>>(),
    source: text('source').default('GSTZen / GSTN'),
    syncedAt: timestamp('synced_at').defaultNow().notNull(),
  },
  (table) => [uniqueIndex('gst_master_cat_code_idx').on(table.category, table.code)]
);

export const dbSnapshots = pgTable('db_snapshots', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id'),
  label: text('label').notNull(),
  createdBy: text('created_by').notNull(),
  recordCount: integer('record_count').default(0).notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const auditLogs = pgTable('audit_logs', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id'),
  actorEmail: text('actor_email').notNull(),
  action: text('action').notNull(),
  entityType: text('entity_type').default(''),
  detail: text('detail').default(''),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
