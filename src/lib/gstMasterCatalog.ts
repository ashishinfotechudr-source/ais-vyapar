export interface GstStateEntry {
  code: string;
  name: string;
  alphaCode: string;
  type: 'State' | 'Union Territory' | 'Other Territory';
}

export interface GstUnitEntry {
  code: string;
  name: string;
  description: string;
}

export interface GstCountryEntry {
  code: string;
  name: string;
  currency?: string;
}

export interface GstHsnEntry {
  code: string;
  name: string;
  description: string;
  gstRate: number;
  cgstRate: number;
  sgstRate: number;
  igstRate: number;
  type: 'HSN' | 'SAC';
}

export const INDIAN_STATES: GstStateEntry[] = [
  { code: '01', name: 'Jammu and Kashmir', alphaCode: 'JK', type: 'Union Territory' },
  { code: '02', name: 'Himachal Pradesh', alphaCode: 'HP', type: 'State' },
  { code: '03', name: 'Punjab', alphaCode: 'PB', type: 'State' },
  { code: '04', name: 'Chandigarh', alphaCode: 'CH', type: 'Union Territory' },
  { code: '05', name: 'Uttarakhand', alphaCode: 'UK', type: 'State' },
  { code: '06', name: 'Haryana', alphaCode: 'HR', type: 'State' },
  { code: '07', name: 'Delhi', alphaCode: 'DL', type: 'Union Territory' },
  { code: '08', name: 'Rajasthan', alphaCode: 'RJ', type: 'State' },
  { code: '09', name: 'Uttar Pradesh', alphaCode: 'UP', type: 'State' },
  { code: '10', name: 'Bihar', alphaCode: 'BR', type: 'State' },
  { code: '11', name: 'Sikkim', alphaCode: 'SK', type: 'State' },
  { code: '12', name: 'Arunachal Pradesh', alphaCode: 'AR', type: 'State' },
  { code: '13', name: 'Nagaland', alphaCode: 'NL', type: 'State' },
  { code: '14', name: 'Manipur', alphaCode: 'MN', type: 'State' },
  { code: '15', name: 'Mizoram', alphaCode: 'MZ', type: 'State' },
  { code: '16', name: 'Tripura', alphaCode: 'TR', type: 'State' },
  { code: '17', name: 'Meghalaya', alphaCode: 'ML', type: 'State' },
  { code: '18', name: 'Assam', alphaCode: 'AS', type: 'State' },
  { code: '19', name: 'West Bengal', alphaCode: 'WB', type: 'State' },
  { code: '20', name: 'Jharkhand', alphaCode: 'JH', type: 'State' },
  { code: '21', name: 'Odisha', alphaCode: 'OD', type: 'State' },
  { code: '22', name: 'Chhattisgarh', alphaCode: 'CG', type: 'State' },
  { code: '23', name: 'Madhya Pradesh', alphaCode: 'MP', type: 'State' },
  { code: '24', name: 'Gujarat', alphaCode: 'GJ', type: 'State' },
  { code: '26', name: 'Dadra and Nagar Haveli and Daman and Diu', alphaCode: 'DN', type: 'Union Territory' },
  { code: '27', name: 'Maharashtra', alphaCode: 'MH', type: 'State' },
  { code: '29', name: 'Karnataka', alphaCode: 'KA', type: 'State' },
  { code: '30', name: 'Goa', alphaCode: 'GA', type: 'State' },
  { code: '31', name: 'Lakshadweep', alphaCode: 'LD', type: 'Union Territory' },
  { code: '32', name: 'Kerala', alphaCode: 'KL', type: 'State' },
  { code: '33', name: 'Tamil Nadu', alphaCode: 'TN', type: 'State' },
  { code: '34', name: 'Puducherry', alphaCode: 'PY', type: 'Union Territory' },
  { code: '35', name: 'Andaman and Nicobar Islands', alphaCode: 'AN', type: 'Union Territory' },
  { code: '36', name: 'Telangana', alphaCode: 'TS', type: 'State' },
  { code: '37', name: 'Andhra Pradesh', alphaCode: 'AP', type: 'State' },
  { code: '38', name: 'Ladakh', alphaCode: 'LA', type: 'Union Territory' },
  { code: '96', name: 'Foreign Country', alphaCode: 'FC', type: 'Other Territory' },
  { code: '97', name: 'Other Territory', alphaCode: 'OT', type: 'Other Territory' },
];

export const GSTN_UQC_UNITS: GstUnitEntry[] = [
  { code: 'BAG', name: 'Bags', description: 'Standard GSTN UQC for Bags' },
  { code: 'BAL', name: 'Bale', description: 'Standard GSTN UQC for Bales' },
  { code: 'BDL', name: 'Bundles', description: 'Standard GSTN UQC for Bundles' },
  { code: 'BKL', name: 'Buckles', description: 'Standard GSTN UQC for Buckles' },
  { code: 'BOU', name: 'Billion of Units', description: 'Standard GSTN UQC for Billion of Units' },
  { code: 'BOX', name: 'Box', description: 'Standard GSTN UQC for Boxes' },
  { code: 'BTL', name: 'Bottles', description: 'Standard GSTN UQC for Bottles' },
  { code: 'BUN', name: 'Bunches', description: 'Standard GSTN UQC for Bunches' },
  { code: 'CAN', name: 'Cans', description: 'Standard GSTN UQC for Cans' },
  { code: 'CBM', name: 'Cubic Meters', description: 'Standard GSTN UQC for Cubic Meters' },
  { code: 'CCM', name: 'Cubic Centimeters', description: 'Standard GSTN UQC for Cubic Centimeters' },
  { code: 'CMS', name: 'Centimeters', description: 'Standard GSTN UQC for Centimeters' },
  { code: 'CTN', name: 'Cartons', description: 'Standard GSTN UQC for Cartons' },
  { code: 'DOZ', name: 'Dozens', description: 'Standard GSTN UQC for Dozens' },
  { code: 'DRM', name: 'Drums', description: 'Standard GSTN UQC for Drums' },
  { code: 'GGK', name: 'Great Gross', description: 'Standard GSTN UQC for Great Gross' },
  { code: 'GMS', name: 'Grams', description: 'Standard GSTN UQC for Grams' },
  { code: 'GRS', name: 'Gross', description: 'Standard GSTN UQC for Gross' },
  { code: 'GYD', name: 'Gross Yards', description: 'Standard GSTN UQC for Gross Yards' },
  { code: 'KGS', name: 'Kilograms', description: 'Standard GSTN UQC for Kilograms' },
  { code: 'KLR', name: 'Kilolitre', description: 'Standard GSTN UQC for Kilolitre' },
  { code: 'KME', name: 'Kilometre', description: 'Standard GSTN UQC for Kilometre' },
  { code: 'LTR', name: 'Litres', description: 'Standard GSTN UQC for Litres' },
  { code: 'MLT', name: 'Millilitre', description: 'Standard GSTN UQC for Millilitre' },
  { code: 'MTR', name: 'Meters', description: 'Standard GSTN UQC for Meters' },
  { code: 'MTS', name: 'Metric Ton', description: 'Standard GSTN UQC for Metric Ton' },
  { code: 'NOS', name: 'Numbers', description: 'Standard GSTN UQC for Numbers / Units' },
  { code: 'PAC', name: 'Packs', description: 'Standard GSTN UQC for Packs' },
  { code: 'PCS', name: 'Pieces', description: 'Standard GSTN UQC for Pieces' },
  { code: 'PRS', name: 'Pairs', description: 'Standard GSTN UQC for Pairs' },
  { code: 'QTL', name: 'Quintal', description: 'Standard GSTN UQC for Quintal' },
  { code: 'ROL', name: 'Rolls', description: 'Standard GSTN UQC for Rolls' },
  { code: 'SET', name: 'Sets', description: 'Standard GSTN UQC for Sets' },
  { code: 'SQF', name: 'Square Feet', description: 'Standard GSTN UQC for Square Feet' },
  { code: 'SQM', name: 'Square Meters', description: 'Standard GSTN UQC for Square Meters' },
  { code: 'SQY', name: 'Square Yards', description: 'Standard GSTN UQC for Square Yards' },
  { code: 'TBS', name: 'Tablets', description: 'Standard GSTN UQC for Tablets' },
  { code: 'TGM', name: 'Ten Gross', description: 'Standard GSTN UQC for Ten Gross' },
  { code: 'THD', name: 'Thousands', description: 'Standard GSTN UQC for Thousands' },
  { code: 'TON', name: 'Tonnes', description: 'Standard GSTN UQC for Tonnes' },
  { code: 'TUB', name: 'Tubes', description: 'Standard GSTN UQC for Tubes' },
  { code: 'UGS', name: 'US Gallons', description: 'Standard GSTN UQC for US Gallons' },
  { code: 'UNT', name: 'Units', description: 'Standard GSTN UQC for Units' },
  { code: 'YDS', name: 'Yards', description: 'Standard GSTN UQC for Yards' },
  { code: 'OTH', name: 'Others', description: 'Standard GSTN UQC for Others' },
];

export const ISO_COUNTRIES: GstCountryEntry[] = [
  { code: 'IN', name: 'India', currency: 'INR' },
  { code: 'AE', name: 'United Arab Emirates', currency: 'AED' },
  { code: 'AU', name: 'Australia', currency: 'AUD' },
  { code: 'BD', name: 'Bangladesh', currency: 'BDT' },
  { code: 'BH', name: 'Bahrain', currency: 'BHD' },
  { code: 'CA', name: 'Canada', currency: 'CAD' },
  { code: 'CH', name: 'Switzerland', currency: 'CHF' },
  { code: 'CN', name: 'China', currency: 'CNY' },
  { code: 'DE', name: 'Germany', currency: 'EUR' },
  { code: 'FR', name: 'France', currency: 'EUR' },
  { code: 'GB', name: 'United Kingdom', currency: 'GBP' },
  { code: 'HK', name: 'Hong Kong', currency: 'HKD' },
  { code: 'ID', name: 'Indonesia', currency: 'IDR' },
  { code: 'IT', name: 'Italy', currency: 'EUR' },
  { code: 'JP', name: 'Japan', currency: 'JPY' },
  { code: 'KR', name: 'South Korea', currency: 'KRW' },
  { code: 'KW', name: 'Kuwait', currency: 'KWD' },
  { code: 'LK', name: 'Sri Lanka', currency: 'LKR' },
  { code: 'MY', name: 'Malaysia', currency: 'MYR' },
  { code: 'NL', name: 'Netherlands', currency: 'EUR' },
  { code: 'NP', name: 'Nepal', currency: 'NPR' },
  { code: 'NZ', name: 'New Zealand', currency: 'NZD' },
  { code: 'OM', name: 'Oman', currency: 'OMR' },
  { code: 'QA', name: 'Qatar', currency: 'QAR' },
  { code: 'SA', name: 'Saudi Arabia', currency: 'SAR' },
  { code: 'SG', name: 'Singapore', currency: 'SGD' },
  { code: 'TH', name: 'Thailand', currency: 'THB' },
  { code: 'US', name: 'United States of America', currency: 'USD' },
  { code: 'VN', name: 'Vietnam', currency: 'VND' },
  { code: 'ZA', name: 'South Africa', currency: 'ZAR' },
];

export const HSN_SAC_CATALOG: GstHsnEntry[] = [
  { code: '2523', name: 'Portland Cement & Aluminous Cement', description: 'Portland cement, aluminous cement, slag cement, supersulphate cement', gstRate: 28, cgstRate: 14, sgstRate: 14, igstRate: 28, type: 'HSN' },
  { code: '2710', name: 'Petroleum Oils & Lubricants', description: 'Industrial fuel oils and lubricating oils', gstRate: 18, cgstRate: 9, sgstRate: 9, igstRate: 18, type: 'HSN' },
  { code: '3208', name: 'Paints and Varnishes', description: 'Industrial paints, coatings and varnishes based on synthetic polymers', gstRate: 18, cgstRate: 9, sgstRate: 9, igstRate: 18, type: 'HSN' },
  { code: '3917', name: 'PVC Tubes, Pipes & Fittings', description: 'Tubes, pipes and hoses, and fittings therefor, of plastics', gstRate: 18, cgstRate: 9, sgstRate: 9, igstRate: 18, type: 'HSN' },
  { code: '4407', name: 'Timber & Sawn Wood', description: 'Wood sawn or chipped lengthwise, sliced or peeled', gstRate: 18, cgstRate: 9, sgstRate: 9, igstRate: 18, type: 'HSN' },
  { code: '4819', name: 'Corrugated Cartons & Packing Boxes', description: 'Cartons, boxes, cases, bags and other packing containers of paper', gstRate: 12, cgstRate: 6, sgstRate: 6, igstRate: 12, type: 'HSN' },
  { code: '6802', name: 'Worked Monumental or Building Stone', description: 'Marble, granite, sandstone tiles and slabs', gstRate: 18, cgstRate: 9, sgstRate: 9, igstRate: 18, type: 'HSN' },
  { code: '6907', name: 'Ceramic & Vitrified Tiles', description: 'Ceramic flags and paving, hearth or wall tiles', gstRate: 18, cgstRate: 9, sgstRate: 9, igstRate: 18, type: 'HSN' },
  { code: '7214', name: 'Iron & Steel Bars / TMT Rods', description: 'Bars and rods of iron or non-alloy steel, hot-rolled or forged', gstRate: 18, cgstRate: 9, sgstRate: 9, igstRate: 18, type: 'HSN' },
  { code: '7308', name: 'Structural Steel & Fabrication', description: 'Structures and parts of structures of iron or steel', gstRate: 18, cgstRate: 9, sgstRate: 9, igstRate: 18, type: 'HSN' },
  { code: '7318', name: 'Screws, Bolts, Nuts & Fasteners', description: 'Screws, bolts, nuts, coach screws, rivets, washers of iron or steel', gstRate: 18, cgstRate: 9, sgstRate: 9, igstRate: 18, type: 'HSN' },
  { code: '8414', name: 'Air Compressors & Vacuum Pumps', description: 'Air or vacuum pumps, air or other gas compressors and fans', gstRate: 18, cgstRate: 9, sgstRate: 9, igstRate: 18, type: 'HSN' },
  { code: '8471', name: 'Computers & Automatic Data Processing', description: 'Laptops, desktops, servers and data processing hardware', gstRate: 18, cgstRate: 9, sgstRate: 9, igstRate: 18, type: 'HSN' },
  { code: '8504', name: 'Electrical Transformers & Inverters', description: 'Electrical transformers, static converters and inductors', gstRate: 18, cgstRate: 9, sgstRate: 9, igstRate: 18, type: 'HSN' },
  { code: '8537', name: 'Electrical Control Panels & Switchgear', description: 'Boards, panels, consoles, desks and cabinets for electrical control', gstRate: 18, cgstRate: 9, sgstRate: 9, igstRate: 18, type: 'HSN' },
  { code: '8544', name: 'Insulated Wires & Cables', description: 'Insulated wire, cable and optical fibre cables', gstRate: 18, cgstRate: 9, sgstRate: 9, igstRate: 18, type: 'HSN' },
  { code: '9403', name: 'Office & Industrial Furniture', description: 'Other furniture and parts thereof (office workstations, racks)', gstRate: 18, cgstRate: 9, sgstRate: 9, igstRate: 18, type: 'HSN' },
  { code: '9954', name: 'Construction & Civil Works Services', description: 'General construction services of buildings and civil engineering works', gstRate: 18, cgstRate: 9, sgstRate: 9, igstRate: 18, type: 'SAC' },
  { code: '9965', name: 'Goods Transport Agency (GTA) / Freight', description: 'Goods transport services by road, rail, air or water', gstRate: 5, cgstRate: 2.5, sgstRate: 2.5, igstRate: 5, type: 'SAC' },
  { code: '9971', name: 'Financial & Banking Charges', description: 'Financial and related services', gstRate: 18, cgstRate: 9, sgstRate: 9, igstRate: 18, type: 'SAC' },
  { code: '9972', name: 'Real Estate & Commercial Rental Services', description: 'Rental or leasing services involving own or leased property', gstRate: 18, cgstRate: 9, sgstRate: 9, igstRate: 18, type: 'SAC' },
  { code: '9982', name: 'Legal, Accounting & Audit Services', description: 'Legal, accounting, auditing, bookkeeping and tax consultancy services', gstRate: 18, cgstRate: 9, sgstRate: 9, igstRate: 18, type: 'SAC' },
  { code: '9983', name: 'IT Software, Engineering & Consultancy', description: 'Information technology design, software development and technical consultancy', gstRate: 18, cgstRate: 9, sgstRate: 9, igstRate: 18, type: 'SAC' },
  { code: '9985', name: 'Security, Manpower & Support Services', description: 'Employment, security, cleaning and business support services', gstRate: 18, cgstRate: 9, sgstRate: 9, igstRate: 18, type: 'SAC' },
  { code: '9987', name: 'Maintenance, Repair & Installation (AMC)', description: 'Maintenance, repair and installation services of machinery and equipment', gstRate: 18, cgstRate: 9, sgstRate: 9, igstRate: 18, type: 'SAC' },
  { code: '9988', name: 'Job Work & Manufacturing Services', description: 'Manufacturing services on physical inputs owned by others', gstRate: 12, cgstRate: 6, sgstRate: 6, igstRate: 12, type: 'SAC' },
];

const GSTIN_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function validateGstinChecksum(rawGstin: string): {
  valid: boolean;
  gstin: string;
  stateCode: string;
  stateName: string;
  pan: string;
  entityCode: string;
  error?: string;
} {
  const gstin = String(rawGstin || '').trim().toUpperCase();
  if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(gstin)) {
    return {
      valid: false,
      gstin,
      stateCode: gstin.slice(0, 2),
      stateName: '',
      pan: gstin.slice(2, 12),
      entityCode: '',
      error: 'Invalid 15-character GSTIN format (Expected: 2-digit state + 10-char PAN + entity + Z + check digit).',
    };
  }

  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const codePoint = GSTIN_CHARS.indexOf(gstin[i]);
    const factor = i % 2 === 0 ? 1 : 2;
    const prod = codePoint * factor;
    sum += Math.floor(prod / 36) + (prod % 36);
  }
  const checkIndex = (36 - (sum % 36)) % 36;
  const expectedCheck = GSTIN_CHARS[checkIndex];

  const stateCode = gstin.slice(0, 2);
  const stateObj = INDIAN_STATES.find((s) => s.code === stateCode);

  if (gstin[14] !== expectedCheck) {
    return {
      valid: false,
      gstin,
      stateCode,
      stateName: stateObj?.name || '',
      pan: gstin.slice(2, 12),
      entityCode: gstin[12],
      error: `GSTIN checksum mismatch (expected trailing digit '${expectedCheck}').`,
    };
  }

  return {
    valid: true,
    gstin,
    stateCode,
    stateName: stateObj?.name || '',
    pan: gstin.slice(2, 12),
    entityCode: gstin[12],
  };
}

export function resolveStateFromInput(stateOrCode?: string, gstin?: string): {
  stateName: string;
  stateCode: string;
} {
  if (gstin && gstin.length >= 2) {
    const code = gstin.slice(0, 2);
    const byCode = INDIAN_STATES.find((s) => s.code === code);
    if (byCode) {
      return { stateName: byCode.name, stateCode: byCode.code };
    }
  }
  const q = String(stateOrCode || '').trim().toLowerCase();
  if (!q) return { stateName: '', stateCode: '' };
  const found = INDIAN_STATES.find(
    (s) =>
      s.code === q ||
      s.name.toLowerCase() === q ||
      s.alphaCode.toLowerCase() === q
  );
  return found
    ? { stateName: found.name, stateCode: found.code }
    : { stateName: stateOrCode || '', stateCode: '' };
}

export function determineSupplyType(companyStateCode?: string, partyStateCode?: string, partyGstin?: string): 'Intra-State' | 'Inter-State' {
  const cCode = (companyStateCode || '08').padStart(2, '0');
  const pCode = (partyStateCode || (partyGstin && partyGstin.length >= 2 ? partyGstin.slice(0, 2) : cCode)).padStart(2, '0');
  return cCode === pCode ? 'Intra-State' : 'Inter-State';
}

export function round2(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

export function computeLineItemsTotals(
  items: Array<{
    id?: string;
    itemId?: number;
    sku?: string;
    description: string;
    hsnSac: string;
    qty: number;
    unit: string;
    rate: number;
    discount?: number;
    gstRate: number;
    cessRate?: number;
  }>,
  charges: Array<{ id?: string; head: string; type: 'Add' | 'Less'; amount: number; gstRate?: number }>,
  supplyType: 'Intra-State' | 'Inter-State'
) {
  const isInter = supplyType === 'Inter-State';
  const computedItems = items.map((it, idx) => {
    const qty = Number(it.qty) || 0;
    const rate = Number(it.rate) || 0;
    const discount = Number(it.discount) || 0;
    const taxableValue = round2(Math.max(0, qty * rate - discount));
    const gstRate = Number(it.gstRate) || 0;
    const cessRate = Number(it.cessRate) || 0;
    const cgstRate = isInter ? 0 : round2(gstRate / 2);
    const sgstRate = isInter ? 0 : round2(gstRate / 2);
    const igstRate = isInter ? gstRate : 0;
    const cgstAmount = round2((taxableValue * cgstRate) / 100);
    const sgstAmount = round2((taxableValue * sgstRate) / 100);
    const igstAmount = round2((taxableValue * igstRate) / 100);
    const cessAmount = round2((taxableValue * cessRate) / 100);
    const totalAmount = round2(taxableValue + cgstAmount + sgstAmount + igstAmount + cessAmount);
    return {
      id: it.id || `li-${idx + 1}`,
      itemId: it.itemId,
      sku: it.sku || '',
      description: it.description || '',
      hsnSac: it.hsnSac || '',
      qty,
      unit: it.unit || 'NOS',
      rate,
      discount,
      taxableValue,
      gstRate,
      cgstRate,
      sgstRate,
      igstRate,
      cgstAmount,
      sgstAmount,
      igstAmount,
      cessRate,
      cessAmount,
      totalAmount,
    };
  });

  let taxableValue = round2(computedItems.reduce((s, r) => s + r.taxableValue, 0));
  let cgstAmount = round2(computedItems.reduce((s, r) => s + r.cgstAmount, 0));
  let sgstAmount = round2(computedItems.reduce((s, r) => s + r.sgstAmount, 0));
  let igstAmount = round2(computedItems.reduce((s, r) => s + r.igstAmount, 0));
  let cessAmount = round2(computedItems.reduce((s, r) => s + (r.cessAmount || 0), 0));

  for (const ch of charges) {
    const amt = Number(ch.amount) || 0;
    const signed = ch.type === 'Less' ? -amt : amt;
    taxableValue = round2(taxableValue + signed);
    const chGst = Number(ch.gstRate) || 0;
    if (chGst > 0) {
      if (isInter) {
        igstAmount = round2(igstAmount + (signed * chGst) / 100);
      } else {
        const half = round2((signed * (chGst / 2)) / 100);
        cgstAmount = round2(cgstAmount + half);
        sgstAmount = round2(sgstAmount + half);
      }
    }
  }

  const rawTotal = round2(taxableValue + cgstAmount + sgstAmount + igstAmount + cessAmount);
  const roundedTotal = Math.round(rawTotal);
  const roundOff = round2(roundedTotal - rawTotal);

  return {
    items: computedItems,
    taxableValue,
    cgstAmount,
    sgstAmount,
    igstAmount,
    cessAmount,
    roundOff,
    totalAmount: roundedTotal,
  };
}
