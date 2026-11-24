<?php

function getIndianStates(): array {
    return [
        ['code' => '01', 'name' => 'Jammu and Kashmir', 'alphaCode' => 'JK', 'type' => 'Union Territory'],
        ['code' => '02', 'name' => 'Himachal Pradesh', 'alphaCode' => 'HP', 'type' => 'State'],
        ['code' => '03', 'name' => 'Punjab', 'alphaCode' => 'PB', 'type' => 'State'],
        ['code' => '04', 'name' => 'Chandigarh', 'alphaCode' => 'CH', 'type' => 'Union Territory'],
        ['code' => '05', 'name' => 'Uttarakhand', 'alphaCode' => 'UK', 'type' => 'State'],
        ['code' => '06', 'name' => 'Haryana', 'alphaCode' => 'HR', 'type' => 'State'],
        ['code' => '07', 'name' => 'Delhi', 'alphaCode' => 'DL', 'type' => 'Union Territory'],
        ['code' => '08', 'name' => 'Rajasthan', 'alphaCode' => 'RJ', 'type' => 'State'],
        ['code' => '09', 'name' => 'Uttar Pradesh', 'alphaCode' => 'UP', 'type' => 'State'],
        ['code' => '10', 'name' => 'Bihar', 'alphaCode' => 'BR', 'type' => 'State'],
        ['code' => '11', 'name' => 'Sikkim', 'alphaCode' => 'SK', 'type' => 'State'],
        ['code' => '12', 'name' => 'Arunachal Pradesh', 'alphaCode' => 'AR', 'type' => 'State'],
        ['code' => '13', 'name' => 'Nagaland', 'alphaCode' => 'NL', 'type' => 'State'],
        ['code' => '14', 'name' => 'Manipur', 'alphaCode' => 'MN', 'type' => 'State'],
        ['code' => '15', 'name' => 'Mizoram', 'alphaCode' => 'MZ', 'type' => 'State'],
        ['code' => '16', 'name' => 'Tripura', 'alphaCode' => 'TR', 'type' => 'State'],
        ['code' => '17', 'name' => 'Meghalaya', 'alphaCode' => 'ML', 'type' => 'State'],
        ['code' => '18', 'name' => 'Assam', 'alphaCode' => 'AS', 'type' => 'State'],
        ['code' => '19', 'name' => 'West Bengal', 'alphaCode' => 'WB', 'type' => 'State'],
        ['code' => '20', 'name' => 'Jharkhand', 'alphaCode' => 'JH', 'type' => 'State'],
        ['code' => '21', 'name' => 'Odisha', 'alphaCode' => 'OD', 'type' => 'State'],
        ['code' => '22', 'name' => 'Chhattisgarh', 'alphaCode' => 'CG', 'type' => 'State'],
        ['code' => '23', 'name' => 'Madhya Pradesh', 'alphaCode' => 'MP', 'type' => 'State'],
        ['code' => '24', 'name' => 'Gujarat', 'alphaCode' => 'GJ', 'type' => 'State'],
        ['code' => '26', 'name' => 'Dadra and Nagar Haveli and Daman and Diu', 'alphaCode' => 'DN', 'type' => 'Union Territory'],
        ['code' => '27', 'name' => 'Maharashtra', 'alphaCode' => 'MH', 'type' => 'State'],
        ['code' => '29', 'name' => 'Karnataka', 'alphaCode' => 'KA', 'type' => 'State'],
        ['code' => '30', 'name' => 'Goa', 'alphaCode' => 'GA', 'type' => 'State'],
        ['code' => '31', 'name' => 'Lakshadweep', 'alphaCode' => 'LD', 'type' => 'Union Territory'],
        ['code' => '32', 'name' => 'Kerala', 'alphaCode' => 'KL', 'type' => 'State'],
        ['code' => '33', 'name' => 'Tamil Nadu', 'alphaCode' => 'TN', 'type' => 'State'],
        ['code' => '34', 'name' => 'Puducherry', 'alphaCode' => 'PY', 'type' => 'Union Territory'],
        ['code' => '35', 'name' => 'Andaman and Nicobar Islands', 'alphaCode' => 'AN', 'type' => 'Union Territory'],
        ['code' => '36', 'name' => 'Telangana', 'alphaCode' => 'TS', 'type' => 'State'],
        ['code' => '37', 'name' => 'Andhra Pradesh', 'alphaCode' => 'AP', 'type' => 'State'],
        ['code' => '38', 'name' => 'Ladakh', 'alphaCode' => 'LA', 'type' => 'Union Territory'],
        ['code' => '96', 'name' => 'Foreign Country', 'alphaCode' => 'FC', 'type' => 'Other Territory'],
        ['code' => '97', 'name' => 'Other Territory', 'alphaCode' => 'OT', 'type' => 'Other Territory'],
    ];
}

function getGstnUqcUnits(): array {
    return [
        ['code' => 'BAG', 'name' => 'Bags', 'description' => 'Standard GSTN UQC for Bags'],
        ['code' => 'BAL', 'name' => 'Bale', 'description' => 'Standard GSTN UQC for Bales'],
        ['code' => 'BDL', 'name' => 'Bundles', 'description' => 'Standard GSTN UQC for Bundles'],
        ['code' => 'BKL', 'name' => 'Buckles', 'description' => 'Standard GSTN UQC for Buckles'],
        ['code' => 'BOU', 'name' => 'Billion of Units', 'description' => 'Standard GSTN UQC for Billion of Units'],
        ['code' => 'BOX', 'name' => 'Box', 'description' => 'Standard GSTN UQC for Boxes'],
        ['code' => 'BTL', 'name' => 'Bottles', 'description' => 'Standard GSTN UQC for Bottles'],
        ['code' => 'BUN', 'name' => 'Bunches', 'description' => 'Standard GSTN UQC for Bunches'],
        ['code' => 'CAN', 'name' => 'Cans', 'description' => 'Standard GSTN UQC for Cans'],
        ['code' => 'CBM', 'name' => 'Cubic Meters', 'description' => 'Standard GSTN UQC for Cubic Meters'],
        ['code' => 'CCM', 'name' => 'Cubic Centimeters', 'description' => 'Standard GSTN UQC for Cubic Centimeters'],
        ['code' => 'CMS', 'name' => 'Centimeters', 'description' => 'Standard GSTN UQC for Centimeters'],
        ['code' => 'CTN', 'name' => 'Cartons', 'description' => 'Standard GSTN UQC for Cartons'],
        ['code' => 'DOZ', 'name' => 'Dozens', 'description' => 'Standard GSTN UQC for Dozens'],
        ['code' => 'DRM', 'name' => 'Drums', 'description' => 'Standard GSTN UQC for Drums'],
        ['code' => 'GGK', 'name' => 'Great Gross', 'description' => 'Standard GSTN UQC for Great Gross'],
        ['code' => 'GMS', 'name' => 'Grams', 'description' => 'Standard GSTN UQC for Grams'],
        ['code' => 'GRS', 'name' => 'Gross', 'description' => 'Standard GSTN UQC for Gross'],
        ['code' => 'GYD', 'name' => 'Gross Yards', 'description' => 'Standard GSTN UQC for Gross Yards'],
        ['code' => 'KGS', 'name' => 'Kilograms', 'description' => 'Standard GSTN UQC for Kilograms'],
        ['code' => 'KLR', 'name' => 'Kilolitre', 'description' => 'Standard GSTN UQC for Kilolitre'],
        ['code' => 'KME', 'name' => 'Kilometre', 'description' => 'Standard GSTN UQC for Kilometre'],
        ['code' => 'LTR', 'name' => 'Litres', 'description' => 'Standard GSTN UQC for Litres'],
        ['code' => 'MLT', 'name' => 'Millilitre', 'description' => 'Standard GSTN UQC for Millilitre'],
        ['code' => 'MTR', 'name' => 'Meters', 'description' => 'Standard GSTN UQC for Meters'],
        ['code' => 'MTS', 'name' => 'Metric Ton', 'description' => 'Standard GSTN UQC for Metric Ton'],
        ['code' => 'NOS', 'name' => 'Numbers', 'description' => 'Standard GSTN UQC for Numbers / Units'],
        ['code' => 'PAC', 'name' => 'Packs', 'description' => 'Standard GSTN UQC for Packs'],
        ['code' => 'PCS', 'name' => 'Pieces', 'description' => 'Standard GSTN UQC for Pieces'],
        ['code' => 'PRS', 'name' => 'Pairs', 'description' => 'Standard GSTN UQC for Pairs'],
        ['code' => 'QTL', 'name' => 'Quintal', 'description' => 'Standard GSTN UQC for Quintal'],
        ['code' => 'ROL', 'name' => 'Rolls', 'description' => 'Standard GSTN UQC for Rolls'],
        ['code' => 'SET', 'name' => 'Sets', 'description' => 'Standard GSTN UQC for Sets'],
        ['code' => 'SQF', 'name' => 'Square Feet', 'description' => 'Standard GSTN UQC for Square Feet'],
        ['code' => 'SQM', 'name' => 'Square Meters', 'description' => 'Standard GSTN UQC for Square Meters'],
        ['code' => 'SQY', 'name' => 'Square Yards', 'description' => 'Standard GSTN UQC for Square Yards'],
        ['code' => 'TBS', 'name' => 'Tablets', 'description' => 'Standard GSTN UQC for Tablets'],
        ['code' => 'TGM', 'name' => 'Ten Gross', 'description' => 'Standard GSTN UQC for Ten Gross'],
        ['code' => 'THD', 'name' => 'Thousands', 'description' => 'Standard GSTN UQC for Thousands'],
        ['code' => 'TON', 'name' => 'Tonnes', 'description' => 'Standard GSTN UQC for Tonnes'],
        ['code' => 'TUB', 'name' => 'Tubes', 'description' => 'Standard GSTN UQC for Tubes'],
        ['code' => 'UGS', 'name' => 'US Gallons', 'description' => 'Standard GSTN UQC for US Gallons'],
        ['code' => 'UNT', 'name' => 'Units', 'description' => 'Standard GSTN UQC for Units'],
        ['code' => 'YDS', 'name' => 'Yards', 'description' => 'Standard GSTN UQC for Yards'],
        ['code' => 'OTH', 'name' => 'Others', 'description' => 'Standard GSTN UQC for Others'],
    ];
}

function getIsoCountries(): array {
    return [
        ['code' => 'IN', 'name' => 'India', 'currency' => 'INR'],
        ['code' => 'AE', 'name' => 'United Arab Emirates', 'currency' => 'AED'],
        ['code' => 'AU', 'name' => 'Australia', 'currency' => 'AUD'],
        ['code' => 'BD', 'name' => 'Bangladesh', 'currency' => 'BDT'],
        ['code' => 'BH', 'name' => 'Bahrain', 'currency' => 'BHD'],
        ['code' => 'CA', 'name' => 'Canada', 'currency' => 'CAD'],
        ['code' => 'CH', 'name' => 'Switzerland', 'currency' => 'CHF'],
        ['code' => 'CN', 'name' => 'China', 'currency' => 'CNY'],
        ['code' => 'DE', 'name' => 'Germany', 'currency' => 'EUR'],
        ['code' => 'FR', 'name' => 'France', 'currency' => 'EUR'],
        ['code' => 'GB', 'name' => 'United Kingdom', 'currency' => 'GBP'],
        ['code' => 'HK', 'name' => 'Hong Kong', 'currency' => 'HKD'],
        ['code' => 'ID', 'name' => 'Indonesia', 'currency' => 'IDR'],
        ['code' => 'IT', 'name' => 'Italy', 'currency' => 'EUR'],
        ['code' => 'JP', 'name' => 'Japan', 'currency' => 'JPY'],
        ['code' => 'KR', 'name' => 'South Korea', 'currency' => 'KRW'],
        ['code' => 'KW', 'name' => 'Kuwait', 'currency' => 'KWD'],
        ['code' => 'LK', 'name' => 'Sri Lanka', 'currency' => 'LKR'],
        ['code' => 'MY', 'name' => 'Malaysia', 'currency' => 'MYR'],
        ['code' => 'NL', 'name' => 'Netherlands', 'currency' => 'EUR'],
        ['code' => 'NP', 'name' => 'Nepal', 'currency' => 'NPR'],
        ['code' => 'NZ', 'name' => 'New Zealand', 'currency' => 'NZD'],
        ['code' => 'OM', 'name' => 'Oman', 'currency' => 'OMR'],
        ['code' => 'QA', 'name' => 'Qatar', 'currency' => 'QAR'],
        ['code' => 'SA', 'name' => 'Saudi Arabia', 'currency' => 'SAR'],
        ['code' => 'SG', 'name' => 'Singapore', 'currency' => 'SGD'],
        ['code' => 'TH', 'name' => 'Thailand', 'currency' => 'THB'],
        ['code' => 'US', 'name' => 'United States of America', 'currency' => 'USD'],
        ['code' => 'VN', 'name' => 'Vietnam', 'currency' => 'VND'],
        ['code' => 'ZA', 'name' => 'South Africa', 'currency' => 'ZAR'],
    ];
}

function getHsnSacCatalog(): array {
    return [
        ['code' => '2523', 'name' => 'Portland Cement & Aluminous Cement', 'description' => 'Portland cement, aluminous cement, slag cement', 'gstRate' => 28, 'cgstRate' => 14, 'sgstRate' => 14, 'igstRate' => 28, 'type' => 'HSN'],
        ['code' => '2710', 'name' => 'Petroleum Oils & Lubricants', 'description' => 'Industrial fuel oils and lubricating oils', 'gstRate' => 18, 'cgstRate' => 9, 'sgstRate' => 9, 'igstRate' => 18, 'type' => 'HSN'],
        ['code' => '3208', 'name' => 'Paints and Varnishes', 'description' => 'Industrial paints, coatings and varnishes', 'gstRate' => 18, 'cgstRate' => 9, 'sgstRate' => 9, 'igstRate' => 18, 'type' => 'HSN'],
        ['code' => '3917', 'name' => 'PVC Tubes, Pipes & Fittings', 'description' => 'Tubes, pipes and hoses of plastics', 'gstRate' => 18, 'cgstRate' => 9, 'sgstRate' => 9, 'igstRate' => 18, 'type' => 'HSN'],
        ['code' => '4407', 'name' => 'Timber & Sawn Wood', 'description' => 'Wood sawn or chipped lengthwise', 'gstRate' => 18, 'cgstRate' => 9, 'sgstRate' => 9, 'igstRate' => 18, 'type' => 'HSN'],
        ['code' => '4819', 'name' => 'Corrugated Cartons & Packing Boxes', 'description' => 'Cartons, boxes, cases of paper', 'gstRate' => 12, 'cgstRate' => 6, 'sgstRate' => 6, 'igstRate' => 12, 'type' => 'HSN'],
        ['code' => '6802', 'name' => 'Worked Monumental or Building Stone', 'description' => 'Marble, granite, sandstone tiles and slabs', 'gstRate' => 18, 'cgstRate' => 9, 'sgstRate' => 9, 'igstRate' => 18, 'type' => 'HSN'],
        ['code' => '6907', 'name' => 'Ceramic & Vitrified Tiles', 'description' => 'Ceramic flags and paving or wall tiles', 'gstRate' => 18, 'cgstRate' => 9, 'sgstRate' => 9, 'igstRate' => 18, 'type' => 'HSN'],
        ['code' => '7214', 'name' => 'Iron & Steel Bars / TMT Rods', 'description' => 'Bars and rods of iron or non-alloy steel', 'gstRate' => 18, 'cgstRate' => 9, 'sgstRate' => 9, 'igstRate' => 18, 'type' => 'HSN'],
        ['code' => '7308', 'name' => 'Structural Steel & Fabrication', 'description' => 'Structures and parts of structures of iron or steel', 'gstRate' => 18, 'cgstRate' => 9, 'sgstRate' => 9, 'igstRate' => 18, 'type' => 'HSN'],
        ['code' => '7318', 'name' => 'Screws, Bolts, Nuts & Fasteners', 'description' => 'Screws, bolts, nuts, rivets, washers of steel', 'gstRate' => 18, 'cgstRate' => 9, 'sgstRate' => 9, 'igstRate' => 18, 'type' => 'HSN'],
        ['code' => '8414', 'name' => 'Air Compressors & Vacuum Pumps', 'description' => 'Air or vacuum pumps and compressors', 'gstRate' => 18, 'cgstRate' => 9, 'sgstRate' => 9, 'igstRate' => 18, 'type' => 'HSN'],
        ['code' => '8471', 'name' => 'Computers & Automatic Data Processing', 'description' => 'Laptops, desktops, servers and IT hardware', 'gstRate' => 18, 'cgstRate' => 9, 'sgstRate' => 9, 'igstRate' => 18, 'type' => 'HSN'],
        ['code' => '8504', 'name' => 'Electrical Transformers & Inverters', 'description' => 'Electrical transformers and static converters', 'gstRate' => 18, 'cgstRate' => 9, 'sgstRate' => 9, 'igstRate' => 18, 'type' => 'HSN'],
        ['code' => '8537', 'name' => 'Electrical Control Panels & Switchgear', 'description' => 'Panels and cabinets for electrical control', 'gstRate' => 18, 'cgstRate' => 9, 'sgstRate' => 9, 'igstRate' => 18, 'type' => 'HSN'],
        ['code' => '8544', 'name' => 'Insulated Wires & Cables', 'description' => 'Insulated wire, cable and optical fibre', 'gstRate' => 18, 'cgstRate' => 9, 'sgstRate' => 9, 'igstRate' => 18, 'type' => 'HSN'],
        ['code' => '9403', 'name' => 'Office & Industrial Furniture', 'description' => 'Workstations, racks and furniture', 'gstRate' => 18, 'cgstRate' => 9, 'sgstRate' => 9, 'igstRate' => 18, 'type' => 'HSN'],
        ['code' => '9954', 'name' => 'Construction & Civil Works Services', 'description' => 'General construction and civil engineering works', 'gstRate' => 18, 'cgstRate' => 9, 'sgstRate' => 9, 'igstRate' => 18, 'type' => 'SAC'],
        ['code' => '9965', 'name' => 'Goods Transport Agency (GTA) / Freight', 'description' => 'Goods transport services by road/rail/air', 'gstRate' => 5, 'cgstRate' => 2.5, 'sgstRate' => 2.5, 'igstRate' => 5, 'type' => 'SAC'],
        ['code' => '9971', 'name' => 'Financial & Banking Charges', 'description' => 'Financial and related services', 'gstRate' => 18, 'cgstRate' => 9, 'sgstRate' => 9, 'igstRate' => 18, 'type' => 'SAC'],
        ['code' => '9972', 'name' => 'Real Estate & Commercial Rental Services', 'description' => 'Rental or leasing services of property', 'gstRate' => 18, 'cgstRate' => 9, 'sgstRate' => 9, 'igstRate' => 18, 'type' => 'SAC'],
        ['code' => '9982', 'name' => 'Legal, Accounting & Audit Services', 'description' => 'Legal, accounting, auditing and tax consultancy', 'gstRate' => 18, 'cgstRate' => 9, 'sgstRate' => 9, 'igstRate' => 18, 'type' => 'SAC'],
        ['code' => '9983', 'name' => 'IT Software, Engineering & Consultancy', 'description' => 'Software development and technical consultancy', 'gstRate' => 18, 'cgstRate' => 9, 'sgstRate' => 9, 'igstRate' => 18, 'type' => 'SAC'],
        ['code' => '9985', 'name' => 'Security, Manpower & Support Services', 'description' => 'Employment, security and business support', 'gstRate' => 18, 'cgstRate' => 9, 'sgstRate' => 9, 'igstRate' => 18, 'type' => 'SAC'],
        ['code' => '9987', 'name' => 'Maintenance, Repair & Installation (AMC)', 'description' => 'Maintenance, repair and installation services', 'gstRate' => 18, 'cgstRate' => 9, 'sgstRate' => 9, 'igstRate' => 18, 'type' => 'SAC'],
        ['code' => '9988', 'name' => 'Job Work & Manufacturing Services', 'description' => 'Manufacturing services on inputs owned by others', 'gstRate' => 12, 'cgstRate' => 6, 'sgstRate' => 6, 'igstRate' => 12, 'type' => 'SAC'],
    ];
}

function round2($n): float {
    return round((float)$n, 2);
}

function validateGstinChecksum(string $rawGstin): array {
    $chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    $gstin = strtoupper(trim($rawGstin));
    if (!preg_match('/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/', $gstin)) {
        return [
            'valid' => false,
            'gstin' => $gstin,
            'stateCode' => substr($gstin, 0, 2),
            'stateName' => '',
            'pan' => substr($gstin, 2, 10),
            'error' => 'Invalid 15-character GSTIN format.',
        ];
    }
    $sum = 0;
    for ($i = 0; $i < 14; $i++) {
        $cp = strpos($chars, $gstin[$i]);
        $factor = ($i % 2 === 0) ? 1 : 2;
        $prod = $cp * $factor;
        $sum += intdiv($prod, 36) + ($prod % 36);
    }
    $expected = $chars[(36 - ($sum % 36)) % 36];
    $stateCode = substr($gstin, 0, 2);
    $stateName = '';
    foreach (getIndianStates() as $s) {
        if ($s['code'] === $stateCode) {
            $stateName = $s['name'];
            break;
        }
    }
    if ($gstin[14] !== $expected) {
        return [
            'valid' => false,
            'gstin' => $gstin,
            'stateCode' => $stateCode,
            'stateName' => $stateName,
            'pan' => substr($gstin, 2, 10),
            'error' => "GSTIN checksum mismatch (expected '$expected').",
        ];
    }
    return [
        'valid' => true,
        'gstin' => $gstin,
        'stateCode' => $stateCode,
        'stateName' => $stateName,
        'pan' => substr($gstin, 2, 10),
    ];
}

function resolveStateFromInput(?string $stateOrCode, ?string $gstin): array {
    $states = getIndianStates();
    if ($gstin && strlen($gstin) >= 2) {
        $c = substr(strtoupper($gstin), 0, 2);
        foreach ($states as $s) {
            if ($s['code'] === $c) {
                return ['stateName' => $s['name'], 'stateCode' => $s['code']];
            }
        }
    }
    $q = strtolower(trim((string)$stateOrCode));
    if ($q !== '') {
        foreach ($states as $s) {
            if ($s['code'] === $q || strtolower($s['name']) === $q || strtolower($s['alphaCode']) === $q) {
                return ['stateName' => $s['name'], 'stateCode' => $s['code']];
            }
        }
    }
    return ['stateName' => (string)$stateOrCode, 'stateCode' => ''];
}

function determineSupplyType(?string $coStateCode, ?string $partyStateCode, ?string $partyGstin): string {
    $c = str_pad($coStateCode ?: '08', 2, '0', STR_PAD_LEFT);
    $pRaw = $partyStateCode ?: (($partyGstin && strlen($partyGstin) >= 2) ? substr($partyGstin, 0, 2) : $c);
    $p = str_pad($pRaw, 2, '0', STR_PAD_LEFT);
    return ($c === $p) ? 'Intra-State' : 'Inter-State';
}

function computeLineItemsTotals(array $items, array $charges, string $supplyType): array {
    $isInter = ($supplyType === 'Inter-State');
    $computed = [];
    $taxableTotal = 0.0;
    $cgstTotal = 0.0;
    $sgstTotal = 0.0;
    $igstTotal = 0.0;
    $cessTotal = 0.0;

    foreach ($items as $idx => $it) {
        $qty = (float)($it['qty'] ?? 0);
        $rate = (float)($it['rate'] ?? 0);
        $disc = (float)($it['discount'] ?? 0);
        $taxable = round2(max(0, $qty * $rate - $disc));
        $gstRate = (float)($it['gstRate'] ?? 0);
        $cessRate = (float)($it['cessRate'] ?? 0);

        $cgstRate = $isInter ? 0.0 : round2($gstRate / 2);
        $sgstRate = $isInter ? 0.0 : round2($gstRate / 2);
        $igstRate = $isInter ? $gstRate : 0.0;

        $cgstAmt = round2(($taxable * $cgstRate) / 100);
        $sgstAmt = round2(($taxable * $sgstRate) / 100);
        $igstAmt = round2(($taxable * $igstRate) / 100);
        $cessAmt = round2(($taxable * $cessRate) / 100);
        $lineTotal = round2($taxable + $cgstAmt + $sgstAmt + $igstAmt + $cessAmt);

        $taxableTotal = round2($taxableTotal + $taxable);
        $cgstTotal = round2($cgstTotal + $cgstAmt);
        $sgstTotal = round2($sgstTotal + $sgstAmt);
        $igstTotal = round2($igstTotal + $igstAmt);
        $cessTotal = round2($cessTotal + $cessAmt);

        $computed[] = [
            'id' => $it['id'] ?? ('li-' . ($idx + 1)),
            'itemId' => $it['itemId'] ?? null,
            'sku' => $it['sku'] ?? '',
            'description' => $it['description'] ?? '',
            'hsnSac' => $it['hsnSac'] ?? '',
            'qty' => $qty,
            'unit' => $it['unit'] ?? 'NOS',
            'rate' => $rate,
            'discount' => $disc,
            'taxableValue' => $taxable,
            'gstRate' => $gstRate,
            'cgstRate' => $cgstRate,
            'sgstRate' => $sgstRate,
            'igstRate' => $igstRate,
            'cgstAmount' => $cgstAmt,
            'sgstAmount' => $sgstAmt,
            'igstAmount' => $igstAmt,
            'cessRate' => $cessRate,
            'cessAmount' => $cessAmt,
            'totalAmount' => $lineTotal,
        ];
    }

    foreach ($charges as $ch) {
        $amt = (float)($ch['amount'] ?? 0);
        $signed = (($ch['type'] ?? 'Add') === 'Less') ? -$amt : $amt;
        $taxableTotal = round2($taxableTotal + $signed);
        $chGst = (float)($ch['gstRate'] ?? 0);
        if ($chGst > 0) {
            if ($isInter) {
                $igstTotal = round2($igstTotal + ($signed * $chGst) / 100);
            } else {
                $half = round2(($signed * ($chGst / 2)) / 100);
                $cgstTotal = round2($cgstTotal + $half);
                $sgstTotal = round2($sgstTotal + $half);
            }
        }
    }

    $rawTotal = round2($taxableTotal + $cgstTotal + $sgstTotal + $igstTotal + $cessTotal);
    $rounded = round($rawTotal);
    return [
        'items' => $computed,
        'taxableValue' => $taxableTotal,
        'cgstAmount' => $cgstTotal,
        'sgstAmount' => $sgstTotal,
        'igstAmount' => $igstTotal,
        'cessAmount' => $cessTotal,
        'roundOff' => round2($rounded - $rawTotal),
        'totalAmount' => $rounded,
    ];
}
