<?php

require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/gst_catalog.php';

$method = $_SERVER['REQUEST_METHOD'];
$uriPath = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$path = preg_replace('#^/api#', '', $uriPath);
$path = rtrim($path, '/') ?: '/';

if ($method === 'GET' && $path === '/health') {
    jsonOut(['ok' => true, 'service' => 'vyaparledger-erp-php']);
}

$user = requireAuthUser();
$pdo = getPdo();

function parseCompanyId(array $body = []): int {
    $raw = $_GET['companyId'] ?? $body['companyId'] ?? $_SERVER['HTTP_X_COMPANY_ID'] ?? 0;
    $id = (int)$raw;
    if ($id <= 0) {
        jsonOut(['error' => 'Valid companyId is required.'], 400);
    }
    return $id;
}

function logAudit(PDO $pdo, string $email, string $action, string $entityType = '', string $detail = '', ?int $companyId = null): void {
    $pdo->prepare('INSERT INTO audit_logs (company_id, actor_email, action, entity_type, detail) VALUES (?, ?, ?, ?, ?)')
        ->execute([$companyId, $email, $action, $entityType, $detail]);
}

function seedMasterDataIfEmpty(PDO $pdo): void {
    $count = (int)$pdo->query('SELECT COUNT(*) FROM gst_master_data')->fetchColumn();
    if ($count > 0) {
        return;
    }
    upsertAllMasterCatalog($pdo, 'GSTN Master Registry');
}

function upsertAllMasterCatalog(PDO $pdo, string $source): int {
    $sql = 'INSERT INTO gst_master_data (category, code, name, description, gst_rate, cgst_rate, sgst_rate, igst_rate, extra, source, synced_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
            ON DUPLICATE KEY UPDATE name=VALUES(name), description=VALUES(description), gst_rate=VALUES(gst_rate),
            cgst_rate=VALUES(cgst_rate), sgst_rate=VALUES(sgst_rate), igst_rate=VALUES(igst_rate), extra=VALUES(extra),
            source=VALUES(source), synced_at=NOW()';
    $stmt = $pdo->prepare($sql);
    $n = 0;

    foreach (getIndianStates() as $s) {
        $stmt->execute(['state', $s['code'], $s['name'], $s['type'] . ' (' . $s['alphaCode'] . ')', null, null, null, null, json_encode(['alphaCode' => $s['alphaCode'], 'type' => $s['type']]), $source]);
        $n++;
    }
    foreach (getGstnUqcUnits() as $u) {
        $stmt->execute(['uqc', $u['code'], $u['name'], $u['description'], null, null, null, null, '{}', $source]);
        $n++;
    }
    foreach (getIsoCountries() as $c) {
        $stmt->execute(['country', $c['code'], $c['name'], 'Currency: ' . ($c['currency'] ?? 'ISO'), null, null, null, null, json_encode(['currency' => $c['currency'] ?? '']), $source]);
        $n++;
    }
    foreach (getHsnSacCatalog() as $h) {
        $stmt->execute(['hsn', $h['code'], $h['name'], $h['description'], $h['gstRate'], $h['cgstRate'], $h['sgstRate'], $h['igstRate'], json_encode(['type' => $h['type']]), $source]);
        $n++;
    }
    return $n;
}

function seedCompanyDefaults(PDO $pdo, int $companyId, string $stateName = 'Rajasthan'): void {
    $pdo->prepare('INSERT INTO warehouses (company_id, code, name, location, state, is_default, active) VALUES (?, "WH-MAIN", "Main Central Warehouse", "Head Office Store", ?, 1, 1)')
        ->execute([$companyId, $stateName]);

    $groups = [
        ['Capital Account', 'Liability', 'Primary'],
        ['Current Liabilities', 'Liability', 'Primary'],
        ['Sundry Creditors', 'Liability', 'Current Liabilities'],
        ['Duties & Taxes', 'Liability', 'Current Liabilities'],
        ['Fixed Assets', 'Asset', 'Primary'],
        ['Current Assets', 'Asset', 'Primary'],
        ['Sundry Debtors', 'Asset', 'Current Assets'],
        ['Bank Accounts', 'Asset', 'Current Assets'],
        ['Cash-in-Hand', 'Asset', 'Current Assets'],
        ['Closing Stock', 'Asset', 'Current Assets'],
        ['Sales Accounts', 'Income', 'Primary'],
        ['Direct Incomes', 'Income', 'Primary'],
        ['Purchase Accounts', 'Expense', 'Primary'],
        ['Direct Expenses', 'Expense', 'Primary'],
        ['Indirect Expenses', 'Expense', 'Primary'],
    ];
    $gStmt = $pdo->prepare('INSERT INTO account_groups (company_id, name, nature, parent_group, is_system) VALUES (?, ?, ?, ?, 1)');
    foreach ($groups as $g) {
        $gStmt->execute([$companyId, $g[0], $g[1], $g[2]]);
    }

    $ledgers = [
        ['Cash Account', 'Cash-in-Hand', 'Asset'],
        ['Primary Bank Account', 'Bank Accounts', 'Asset'],
        ['Sales Account (GST)', 'Sales Accounts', 'Income'],
        ['Purchase Account (GST)', 'Purchase Accounts', 'Expense'],
        ['Output CGST', 'Duties & Taxes', 'Liability'],
        ['Output SGST', 'Duties & Taxes', 'Liability'],
        ['Output IGST', 'Duties & Taxes', 'Liability'],
        ['Input CGST (ITC)', 'Duties & Taxes', 'Asset'],
        ['Input SGST (ITC)', 'Duties & Taxes', 'Asset'],
        ['Input IGST (ITC)', 'Duties & Taxes', 'Asset'],
        ['TDS Payable', 'Duties & Taxes', 'Liability'],
    ];
    $lStmt = $pdo->prepare('INSERT INTO ledgers (company_id, name, group_name, nature, opening_balance, opening_type) VALUES (?, ?, ?, ?, 0, "Dr")');
    foreach ($ledgers as $l) {
        $lStmt->execute([$companyId, $l[0], $l[1], $l[2]]);
    }

    $tStmt = $pdo->prepare('INSERT INTO terms_templates (company_id, name, doc_type, content, is_default) VALUES (?, ?, ?, ?, 1)');
    $tStmt->execute([$companyId, 'Standard Purchase Order Terms', 'Purchase Order', "1. Prices are exclusive of GST unless specified.\n2. Material must match specifications and carry valid e-Way Bill / Tax Invoice.\n3. Payment within 30 days after GRN inspection."]);
    $tStmt->execute([$companyId, 'Standard Tax Invoice Terms', 'Tax Invoice', "1. Goods once sold will not be taken back.\n2. Interest @18% p.a. will be charged on delayed payments beyond due date.\n3. Subject to local jurisdiction only."]);
}

function getCompanyBundle(PDO $pdo, int $companyId): array {
    $cStmt = $pdo->prepare('SELECT * FROM companies WHERE id = ? LIMIT 1');
    $cStmt->execute([$companyId]);
    $company = hydrateRow($cStmt->fetch());
    if (!$company) {
        jsonOut(['error' => 'Company not found.'], 404);
    }

    $fetchAll = function (string $table, string $order = 'id DESC') use ($pdo, $companyId): array {
        $st = $pdo->prepare("SELECT * FROM `$table` WHERE company_id = ? ORDER BY $order");
        $st->execute([$companyId]);
        return hydrateRows($st->fetchAll());
    };

    $snapSt = $pdo->prepare('SELECT id, company_id, label, created_by, record_count, created_at FROM db_snapshots WHERE company_id = ? ORDER BY id DESC');
    $snapSt->execute([$companyId]);

    $auditSt = $pdo->prepare('SELECT * FROM audit_logs WHERE company_id = ? ORDER BY id DESC LIMIT 80');
    $auditSt->execute([$companyId]);

    return [
        'company' => $company,
        'vendors' => $fetchAll('vendors'),
        'warehouses' => $fetchAll('warehouses', 'id ASC'),
        'inventoryItems' => $fetchAll('inventory_items'),
        'inventoryMovements' => $fetchAll('inventory_movements'),
        'purchaseOrders' => $fetchAll('purchase_orders'),
        'workOrders' => $fetchAll('work_orders'),
        'vouchers' => $fetchAll('vouchers'),
        'bills' => $fetchAll('bills'),
        'paymentSheets' => $fetchAll('payment_sheets'),
        'gatePasses' => $fetchAll('gate_passes'),
        'accountGroups' => $fetchAll('account_groups', 'id ASC'),
        'ledgers' => $fetchAll('ledgers', 'id ASC'),
        'termsTemplates' => $fetchAll('terms_templates', 'id ASC'),
        'auditLogs' => hydrateRows($auditSt->fetchAll()),
        'snapshots' => hydrateRows($snapSt->fetchAll()),
    ];
}

try {
    // 1. BOOTSTRAP
    if ($method === 'GET' && $path === '/bootstrap') {
        seedMasterDataIfEmpty($pdo);
        $list = hydrateRows($pdo->query('SELECT * FROM companies WHERE deleted = 0 ORDER BY id ASC')->fetchAll());
        if (empty($list)) {
            $code = 'CO-' . strtoupper(substr(md5((string)microtime(true)), 0, 4));
            $numbering = json_encode([
                'sales' => ['prefix' => 'INV/26-27/', 'nextNo' => 1001],
                'purchase' => ['prefix' => 'PUR/26-27/', 'nextNo' => 1001],
                'receipt' => ['prefix' => 'RCP/26-27/', 'nextNo' => 1001],
                'payment' => ['prefix' => 'PAY/26-27/', 'nextNo' => 1001],
                'journal' => ['prefix' => 'JV/26-27/', 'nextNo' => 1001],
                'proforma' => ['prefix' => 'PI/26-27/', 'nextNo' => 1001],
                'service' => ['prefix' => 'SRV/26-27/', 'nextNo' => 1001],
                'po' => ['prefix' => 'PO/26-27/', 'nextNo' => 1001],
                'wo' => ['prefix' => 'WO/26-27/', 'nextNo' => 1001],
                'bill' => ['prefix' => 'BL/26-27/', 'nextNo' => 1001],
                'gatepass' => ['prefix' => 'GP/26-27/', 'nextNo' => 1001],
            ]);
            $pdo->prepare('INSERT INTO companies (code, name, legal_name, state, state_code, email, banks, numbering, financial_year_start, owner_uid) VALUES (?, "Primary Enterprise", "Primary Enterprise Pvt Ltd", "Rajasthan", "08", ?, "[]", ?, "2026-04-01", ?)')
                ->execute([$code, $user['email'], $numbering, $user['uid']]);
            $cid = (int)$pdo->lastInsertId();
            seedCompanyDefaults($pdo, $cid, 'Rajasthan');
            $list = hydrateRows($pdo->query('SELECT * FROM companies WHERE deleted = 0 ORDER BY id ASC')->fetchAll());
        }

        $reqCoId = (int)($_GET['companyId'] ?? 0);
        $activeCo = $list[0];
        foreach ($list as $c) {
            if ($c['id'] === $reqCoId) {
                $activeCo = $c;
                break;
            }
        }

        $masterRows = hydrateRows($pdo->query('SELECT * FROM gst_master_data ORDER BY category ASC, code ASC')->fetchAll());
        jsonOut([
            'user' => $user,
            'companies' => $list,
            'activeCompanyId' => $activeCo['id'],
            'bundle' => getCompanyBundle($pdo, $activeCo['id']),
            'masterData' => $masterRows,
        ]);
    }

    // 2. COMPANIES
    if ($method === 'POST' && $path === '/companies') {
        $b = getJsonBody();
        $name = trim((string)($b['name'] ?? ''));
        if ($name === '') jsonOut(['error' => 'Company name is required.'], 400);
        $code = 'CO-' . strtoupper(substr(md5((string)microtime(true)), 0, 5));
        $st = resolveStateFromInput($b['state'] ?? 'Rajasthan', $b['gstin'] ?? '');
        $pdo->prepare('INSERT INTO companies (code, name, legal_name, gstin, state, state_code, city, email, banks, numbering, financial_year_start, owner_uid) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, "2026-04-01", ?)')
            ->execute([$code, $name, $b['legalName'] ?? $name, strtoupper($b['gstin'] ?? ''), $st['stateName'] ?: 'Rajasthan', $st['stateCode'] ?: '08', $b['city'] ?? '', $b['email'] ?? '', json_encode($b['banks'] ?? []), json_encode($b['numbering'] ?? new stdClass()), $user['uid']]);
        $cid = (int)$pdo->lastInsertId();
        seedCompanyDefaults($pdo, $cid, $st['stateName'] ?: 'Rajasthan');
        $row = hydrateRow($pdo->query("SELECT * FROM companies WHERE id = $cid")->fetch());
        logAudit($pdo, $user['email'], 'Company Created', 'company', $name, $cid);
        jsonOut($row);
    }

    if ($method === 'PUT' && preg_match('#^/companies/(\d+)$#', $path, $m)) {
        $cid = (int)$m[1];
        $b = getJsonBody();
        $allowed = ['name', 'legalName', 'gstin', 'pan', 'tan', 'cin', 'address', 'city', 'state', 'stateCode', 'pincode', 'country', 'email', 'phone', 'website', 'logoUrl', 'signatureUrl', 'banks', 'numbering', 'financialYearStart'];
        $sets = [];
        $vals = [];
        $map = [
            'legalName' => 'legal_name', 'stateCode' => 'state_code', 'logoUrl' => 'logo_url',
            'signatureUrl' => 'signature_url', 'financialYearStart' => 'financial_year_start'
        ];
        foreach ($allowed as $k) {
            if (array_key_exists($k, $b)) {
                $col = $map[$k] ?? $k;
                $sets[] = "`$col` = ?";
                $vals[] = in_array($k, ['banks', 'numbering'], true) ? json_encode($b[$k]) : $b[$k];
            }
        }
        if ($sets) {
            $vals[] = $cid;
            $pdo->prepare('UPDATE companies SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($vals);
        }
        $st = $pdo->prepare('SELECT * FROM companies WHERE id = ?');
        $st->execute([$cid]);
        $row = hydrateRow($st->fetch());
        if (!$row) jsonOut(['error' => 'Company not found.'], 404);
        jsonOut($row);
    }

    if ($method === 'DELETE' && preg_match('#^/companies/(\d+)$#', $path, $m)) {
        $cid = (int)$m[1];
        $cnt = (int)$pdo->query('SELECT COUNT(*) FROM companies WHERE deleted = 0')->fetchColumn();
        if ($cnt <= 1) jsonOut(['error' => 'At least one active company must remain.'], 400);
        $pdo->prepare('UPDATE companies SET deleted = 1 WHERE id = ?')->execute([$cid]);
        jsonOut(['ok' => true]);
    }

    // 3. GSTIN VERIFY (Tally Portal + Mod-36 Checksum)
    if ($method === 'POST' && $path === '/gst/verify') {
        $b = getJsonBody();
        $check = validateGstinChecksum((string)($b['gstin'] ?? ''));
        if (!$check['valid']) {
            jsonOut(['error' => $check['error'], 'parsed' => $check], 400);
        }

        $remote = null;
        $source = 'Checksum & GSTN Structure';
        $ch = curl_init('https://tallysolutions.com/wp-content/themes/tally/api/gstin-serach-api.php');
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => http_build_query(['gstin' => $check['gstin']]),
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 9,
            CURLOPT_HTTPHEADER => ['User-Agent: Mozilla/5.0'],
        ]);
        $raw = curl_exec($ch);
        curl_close($ch);
        if ($raw && str_starts_with(trim($raw), '{')) {
            $parsed = json_decode($raw, true);
            if (is_array($parsed) && (!empty($parsed['status']) || !empty($parsed['legal_name']) || !empty($parsed['trade_name']))) {
                $remote = $parsed;
                $source = 'Tally GSTIN Verification Portal';
            }
        }

        $addr = trim((string)($remote['address'] ?? ''));
        $pincode = preg_match('/\b(\d{6})\b/', $addr, $pm) ? $pm[1] : '';
        $parts = array_values(array_filter(array_map('trim', explode(',', $addr))));
        $city = count($parts) >= 3 ? $parts[count($parts) - 3] : (count($parts) >= 2 ? $parts[count($parts) - 2] : '');

        jsonOut([
            'verified' => true,
            'source' => $source,
            'gstin' => $check['gstin'],
            'pan' => $check['pan'],
            'stateCode' => $check['stateCode'],
            'state' => $check['stateName'],
            'placeOfSupply' => $check['stateCode'] . '-' . $check['stateName'],
            'legalName' => $remote['legal_name'] ?? '',
            'tradeName' => $remote['trade_name'] ?? ($remote['legal_name'] ?? ''),
            'gstStatus' => $remote['gstin_status'] ?? 'Format & Checksum Valid',
            'gstType' => !empty($remote['registration_type']) ? ('Registered - ' . $remote['registration_type']) : 'Registered - Regular',
            'businessConstitution' => $remote['business_constitution'] ?? '',
            'businessActivity' => $remote['business_activity'] ?? '',
            'address' => $addr,
            'city' => $city,
            'pincode' => $pincode,
            'remoteFound' => $remote !== null,
        ]);
    }

    // 4. IFSC LOOKUP
    if ($method === 'GET' && preg_match('#^/ifsc/([A-Za-z0-9]+)$#', $path, $m)) {
        $ifsc = strtoupper($m[1]);
        if (!preg_match('/^[A-Z]{4}0[A-Z0-9]{6}$/', $ifsc)) {
            jsonOut(['error' => 'Invalid 11-character IFSC format.'], 400);
        }
        $ch = curl_init("https://ifsc.razorpay.com/$ifsc");
        curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 7]);
        $raw = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        if ($code !== 200 || !$raw) jsonOut(['error' => 'IFSC code not found.'], 404);
        $data = json_decode($raw, true);
        jsonOut([
            'ifsc' => $data['IFSC'] ?? $ifsc,
            'bankName' => $data['BANK'] ?? '',
            'branch' => $data['BRANCH'] ?? '',
            'city' => $data['CITY'] ?? '',
            'state' => $data['STATE'] ?? '',
        ]);
    }

    // 5. MASTER DATA
    if ($method === 'GET' && $path === '/master-data') {
        $rows = hydrateRows($pdo->query('SELECT * FROM gst_master_data ORDER BY category ASC, code ASC')->fetchAll());
        jsonOut($rows);
    }

    if ($method === 'POST' && $path === '/master-data/sync') {
        $ch = curl_init('https://my.gstzen.in/p/useful-tools/master-data/');
        curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 5, CURLOPT_USERAGENT => 'VyaparLedgerERP/1.0']);
        curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        $reachable = ($httpCode >= 200 && $httpCode < 400);
        $count = upsertAllMasterCatalog($pdo, $reachable ? 'my.gstzen.in + GSTN Registry' : 'GSTN Master Registry');
        $rows = hydrateRows($pdo->query('SELECT * FROM gst_master_data ORDER BY category ASC, code ASC')->fetchAll());
        jsonOut(['synced' => $count, 'livePortalReachable' => $reachable, 'total' => count($rows), 'rows' => $rows]);
    }

    // 6. VENDORS
    if ($method === 'POST' && $path === '/vendors') {
        $b = getJsonBody();
        $cid = parseCompanyId($b);
        if (trim((string)($b['vendorName'] ?? '')) === '') jsonOut(['error' => 'Vendor name is required.'], 400);
        $st = resolveStateFromInput($b['state'] ?? '', $b['gstin'] ?? '');
        $gstin = strtoupper(trim((string)($b['gstin'] ?? '')));
        $pan = strtoupper((string)($b['pan'] ?? (strlen($gstin) >= 12 ? substr($gstin, 2, 10) : '')));
        $stmt = $pdo->prepare('INSERT INTO vendors (company_id, vendor_code, vendor_name, trade_name, vendor_category, contact_person, mobile, email, website, gst_type, gstin, gst_status, business_constitution, pan, tan, msme_reg_no, address, city, state, state_code, pincode, country, place_of_supply, bank_name, bank_branch, account_no, ifsc_code, account_type, payment_terms, credit_limit, opening_balance, tds_applicable, tds_section, tds_rate, status, notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
        $stmt->execute([
            $cid,
            $b['vendorCode'] ?: ('VND-' . strtoupper(substr(md5((string)microtime(true)), 0, 5))),
            trim($b['vendorName']), $b['tradeName'] ?? '', $b['vendorCategory'] ?? 'Supplier',
            $b['contactPerson'] ?? '', $b['mobile'] ?? '', $b['email'] ?? '', $b['website'] ?? '',
            $b['gstType'] ?? ($gstin ? 'Registered - Regular' : 'Unregistered'),
            $gstin, $b['gstStatus'] ?? '', $b['businessConstitution'] ?? '', $pan, strtoupper($b['tan'] ?? ''),
            $b['msmeRegNo'] ?? '', $b['address'] ?? '', $b['city'] ?? '', $st['stateName'] ?: ($b['state'] ?? ''),
            $b['stateCode'] ?: $st['stateCode'], $b['pincode'] ?? '', $b['country'] ?? 'India',
            $b['placeOfSupply'] ?: ($st['stateCode'] ? ($st['stateCode'] . '-' . $st['stateName']) : ''),
            $b['bankName'] ?? '', $b['bankBranch'] ?? '', $b['accountNo'] ?? '', strtoupper($b['ifscCode'] ?? ''),
            $b['accountType'] ?? 'Current', $b['paymentTerms'] ?? '30 Days',
            (float)($b['creditLimit'] ?? 0), (float)($b['openingBalance'] ?? 0),
            !empty($b['tdsApplicable']) ? 1 : 0, $b['tdsSection'] ?? '', (float)($b['tdsRate'] ?? 0),
            $b['status'] ?? 'Active', $b['notes'] ?? '',
        ]);
        $id = (int)$pdo->lastInsertId();
        jsonOut(hydrateRow($pdo->query("SELECT * FROM vendors WHERE id = $id")->fetch()));
    }

    if ($method === 'PUT' && preg_match('#^/vendors/(\d+)$#', $path, $m)) {
        $id = (int)$m[1];
        $b = getJsonBody();
        $cid = parseCompanyId($b);
        $st = resolveStateFromInput($b['state'] ?? '', $b['gstin'] ?? '');
        $pdo->prepare('UPDATE vendors SET vendor_name=?, trade_name=?, vendor_category=?, contact_person=?, mobile=?, email=?, gst_type=?, gstin=?, gst_status=?, business_constitution=?, pan=?, tan=?, msme_reg_no=?, address=?, city=?, state=?, state_code=?, pincode=?, place_of_supply=?, bank_name=?, bank_branch=?, account_no=?, ifsc_code=?, payment_terms=?, opening_balance=?, tds_applicable=?, tds_rate=?, status=?, notes=? WHERE id=? AND company_id=?')
            ->execute([
                $b['vendorName'] ?? '', $b['tradeName'] ?? '', $b['vendorCategory'] ?? 'Supplier',
                $b['contactPerson'] ?? '', $b['mobile'] ?? '', $b['email'] ?? '',
                $b['gstType'] ?? 'Registered - Regular', strtoupper($b['gstin'] ?? ''), $b['gstStatus'] ?? '',
                $b['businessConstitution'] ?? '', strtoupper($b['pan'] ?? ''), strtoupper($b['tan'] ?? ''),
                $b['msmeRegNo'] ?? '', $b['address'] ?? '', $b['city'] ?? '',
                $st['stateName'] ?: ($b['state'] ?? ''), $b['stateCode'] ?: $st['stateCode'],
                $b['pincode'] ?? '', $b['placeOfSupply'] ?? '', $b['bankName'] ?? '', $b['bankBranch'] ?? '',
                $b['accountNo'] ?? '', strtoupper($b['ifscCode'] ?? ''), $b['paymentTerms'] ?? '30 Days',
                (float)($b['openingBalance'] ?? 0), !empty($b['tdsApplicable']) ? 1 : 0,
                (float)($b['tdsRate'] ?? 0), $b['status'] ?? 'Active', $b['notes'] ?? '', $id, $cid
            ]);
        $st2 = $pdo->prepare('SELECT * FROM vendors WHERE id=?');
        $st2->execute([$id]);
        jsonOut(hydrateRow($st2->fetch()));
    }

    if ($method === 'DELETE' && preg_match('#^/vendors/(\d+)$#', $path, $m)) {
        $cid = parseCompanyId();
        $pdo->prepare('DELETE FROM vendors WHERE id=? AND company_id=?')->execute([(int)$m[1], $cid]);
        jsonOut(['ok' => true]);
    }

    if ($method === 'POST' && $path === '/vendors/bulk') {
        $b = getJsonBody();
        $cid = parseCompanyId($b);
        $rows = $b['rows'] ?? [];
        $count = 0;
        $stmt = $pdo->prepare('INSERT INTO vendors (company_id, vendor_code, vendor_name, trade_name, vendor_category, contact_person, mobile, email, gst_type, gstin, pan, address, city, state, state_code, pincode, bank_name, account_no, ifsc_code, payment_terms, opening_balance, tds_rate, status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, "Active")');
        foreach ($rows as $idx => $r) {
            if (trim((string)($r['vendorName'] ?? '')) === '') continue;
            $gstin = strtoupper(trim((string)($r['gstin'] ?? '')));
            $st = resolveStateFromInput($r['state'] ?? '', $gstin);
            $stmt->execute([
                $cid, $r['vendorCode'] ?? ('VND-' . substr((string)time(), -4) . $idx),
                trim($r['vendorName']), $r['tradeName'] ?? '', $r['vendorCategory'] ?? 'Supplier',
                $r['contactPerson'] ?? '', (string)($r['mobile'] ?? ''), $r['email'] ?? '',
                $r['gstType'] ?? ($gstin ? 'Registered - Regular' : 'Unregistered'),
                $gstin, strtoupper($r['pan'] ?? (strlen($gstin) >= 12 ? substr($gstin, 2, 10) : '')),
                $r['address'] ?? '', $r['city'] ?? '', $st['stateName'] ?: ($r['state'] ?? ''),
                $st['stateCode'], (string)($r['pincode'] ?? ''), $r['bankName'] ?? '',
                (string)($r['accountNo'] ?? ''), strtoupper($r['ifscCode'] ?? ''),
                $r['paymentTerms'] ?? '30 Days', (float)($r['openingBalance'] ?? 0), (float)($r['tdsRate'] ?? 0)
            ]);
            $count++;
        }
        jsonOut(['imported' => $count]);
    }

    // 7. WAREHOUSES & INVENTORY
    if ($method === 'POST' && $path === '/warehouses') {
        $b = getJsonBody();
        $cid = parseCompanyId($b);
        $pdo->prepare('INSERT INTO warehouses (company_id, code, name, location, state, in_charge, is_default, active) VALUES (?, ?, ?, ?, ?, ?, ?, 1)')
            ->execute([$cid, $b['code'] ?: ('WH-' . rand(100, 999)), $b['name'], $b['location'] ?? '', $b['state'] ?? '', $b['inCharge'] ?? '', !empty($b['isDefault']) ? 1 : 0]);
        $id = (int)$pdo->lastInsertId();
        jsonOut(hydrateRow($pdo->query("SELECT * FROM warehouses WHERE id=$id")->fetch()));
    }

    if ($method === 'DELETE' && preg_match('#^/warehouses/(\d+)$#', $path, $m)) {
        $cid = parseCompanyId();
        $pdo->prepare('DELETE FROM warehouses WHERE id=? AND company_id=?')->execute([(int)$m[1], $cid]);
        jsonOut(['ok' => true]);
    }

    if ($method === 'POST' && $path === '/inventory/items') {
        $b = getJsonBody();
        $cid = parseCompanyId($b);
        $open = (float)($b['openingStock'] ?? 0);
        $cur = isset($b['currentStock']) ? (float)$b['currentStock'] : $open;
        $pdo->prepare('INSERT INTO inventory_items (company_id, sku, name, description, category, item_type, hsn_sac, gst_rate, cess_rate, unit, alt_unit, conversion_factor, valuation_method, purchase_rate, selling_rate, mrp, opening_stock, current_stock, min_stock, reorder_level, max_stock, warehouse_id, bin_location, batch_tracked, serial_tracked, active) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)')
            ->execute([
                $cid, $b['sku'] ?: ('SKU-' . rand(1000, 9999)), trim($b['name']), $b['description'] ?? '',
                $b['category'] ?? 'Raw Material', $b['itemType'] ?? 'Goods', $b['hsnSac'] ?? '',
                (float)($b['gstRate'] ?? 18), (float)($b['cessRate'] ?? 0), $b['unit'] ?? 'NOS',
                $b['altUnit'] ?? '', (float)($b['conversionFactor'] ?? 1), $b['valuationMethod'] ?? 'Weighted Average',
                (float)($b['purchaseRate'] ?? 0), (float)($b['sellingRate'] ?? 0), (float)($b['mrp'] ?? 0),
                $open, $cur, (float)($b['minStock'] ?? 0), (float)($b['reorderLevel'] ?? 0),
                (float)($b['maxStock'] ?? 0), !empty($b['warehouseId']) ? (int)$b['warehouseId'] : null,
                $b['binLocation'] ?? '', !empty($b['batchTracked']) ? 1 : 0, !empty($b['serialTracked']) ? 1 : 0
            ]);
        $id = (int)$pdo->lastInsertId();
        jsonOut(hydrateRow($pdo->query("SELECT * FROM inventory_items WHERE id=$id")->fetch()));
    }

    if ($method === 'PUT' && preg_match('#^/inventory/items/(\d+)$#', $path, $m)) {
        $id = (int)$m[1];
        $b = getJsonBody();
        $cid = parseCompanyId($b);
        $pdo->prepare('UPDATE inventory_items SET sku=?, name=?, category=?, item_type=?, hsn_sac=?, gst_rate=?, unit=?, valuation_method=?, purchase_rate=?, selling_rate=?, min_stock=?, reorder_level=?, max_stock=?, bin_location=?, batch_tracked=?, serial_tracked=? WHERE id=? AND company_id=?')
            ->execute([
                $b['sku'] ?? '', $b['name'] ?? '', $b['category'] ?? 'Raw Material', $b['itemType'] ?? 'Goods',
                $b['hsnSac'] ?? '', (float)($b['gstRate'] ?? 18), $b['unit'] ?? 'NOS',
                $b['valuationMethod'] ?? 'Weighted Average', (float)($b['purchaseRate'] ?? 0), (float)($b['sellingRate'] ?? 0),
                (float)($b['minStock'] ?? 0), (float)($b['reorderLevel'] ?? 0), (float)($b['maxStock'] ?? 0),
                $b['binLocation'] ?? '', !empty($b['batchTracked']) ? 1 : 0, !empty($b['serialTracked']) ? 1 : 0, $id, $cid
            ]);
        jsonOut(hydrateRow($pdo->query("SELECT * FROM inventory_items WHERE id=$id")->fetch()));
    }

    if ($method === 'DELETE' && preg_match('#^/inventory/items/(\d+)$#', $path, $m)) {
        $cid = parseCompanyId();
        $pdo->prepare('DELETE FROM inventory_items WHERE id=? AND company_id=?')->execute([(int)$m[1], $cid]);
        jsonOut(['ok' => true]);
    }

    if ($method === 'POST' && $path === '/inventory/items/bulk') {
        $b = getJsonBody();
        $cid = parseCompanyId($b);
        $stmt = $pdo->prepare('INSERT INTO inventory_items (company_id, sku, name, category, item_type, hsn_sac, gst_rate, unit, valuation_method, purchase_rate, selling_rate, opening_stock, current_stock, min_stock, reorder_level, max_stock, bin_location, active) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)');
        $cnt = 0;
        foreach (($b['rows'] ?? []) as $idx => $r) {
            if (trim((string)($r['name'] ?? '')) === '') continue;
            $open = (float)($r['openingStock'] ?? $r['currentStock'] ?? 0);
            $stmt->execute([
                $cid, $r['sku'] ?: ('SKU-' . time() . $idx), trim($r['name']),
                $r['category'] ?? 'Raw Material', $r['itemType'] ?? 'Goods', (string)($r['hsnSac'] ?? ''),
                (float)($r['gstRate'] ?? 18), strtoupper($r['unit'] ?? 'NOS'),
                $r['valuationMethod'] ?? 'Weighted Average', (float)($r['purchaseRate'] ?? 0),
                (float)($r['sellingRate'] ?? 0), $open, $open, (float)($r['minStock'] ?? 0),
                (float)($r['reorderLevel'] ?? 0), (float)($r['maxStock'] ?? 0), $r['binLocation'] ?? ''
            ]);
            $cnt++;
        }
        jsonOut(['imported' => $cnt]);
    }

    if ($method === 'POST' && $path === '/inventory/movements') {
        $b = getJsonBody();
        $cid = parseCompanyId($b);
        $itemId = (int)($b['itemId'] ?? 0);
        $st = $pdo->prepare('SELECT * FROM inventory_items WHERE id=? AND company_id=?');
        $st->execute([$itemId, $cid]);
        $item = $st->fetch();
        if (!$item) jsonOut(['error' => 'Inventory item not found.'], 404);

        $qty = (float)($b['qty'] ?? 0);
        $rate = (float)($b['unitRate'] ?? 0);
        $cur = (float)$item['current_stock'];
        $pRate = (float)$item['purchase_rate'];
        $mType = $b['movementType'];
        $next = $cur;

        if ($mType === 'IN_GRN' || $mType === 'OPENING') {
            $next = round2($cur + $qty);
            if ($item['valuation_method'] === 'Weighted Average' && $rate > 0 && $next > 0) {
                $pRate = round2((max(0, $cur) * $pRate + $qty * $rate) / $next);
            }
        } elseif ($mType === 'OUT_ISSUE') {
            $next = round2($cur - $qty);
        } elseif ($mType === 'ADJUSTMENT') {
            $next = round2($cur + $qty);
        }

        $pdo->prepare('INSERT INTO inventory_movements (company_id, entry_no, entry_date, movement_type, item_id, warehouse_id, to_warehouse_id, batch_no, expiry_date, serial_numbers, qty, unit_rate, total_value, ref_doc_type, ref_doc_no, vendor_id, remarks, created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
            ->execute([
                $cid, $b['entryNo'] ?: ('STK-' . substr((string)time(), -6)),
                $b['entryDate'] ?: date('Y-m-d'), $mType, $itemId,
                !empty($b['warehouseId']) ? (int)$b['warehouseId'] : null,
                !empty($b['toWarehouseId']) ? (int)$b['toWarehouseId'] : null,
                $b['batchNo'] ?? '', $b['expiryDate'] ?? '',
                json_encode($b['serialNumbers'] ?? []), $qty, $rate,
                round2(abs($qty) * $rate), $b['refDocType'] ?? '', $b['refDocNo'] ?? '',
                !empty($b['vendorId']) ? (int)$b['vendorId'] : null,
                $b['remarks'] ?? '', $user['email']
            ]);
        $mid = (int)$pdo->lastInsertId();
        $pdo->prepare('UPDATE inventory_items SET current_stock=?, purchase_rate=? WHERE id=?')->execute([$next, $pRate, $itemId]);
        jsonOut(hydrateRow($pdo->query("SELECT * FROM inventory_movements WHERE id=$mid")->fetch()));
    }

    // 8. PURCHASE ORDERS & WORK ORDERS
    if ($method === 'POST' && $path === '/purchase-orders') {
        $b = getJsonBody();
        $cid = parseCompanyId($b);
        $co = $pdo->query("SELECT state_code, address FROM companies WHERE id=$cid")->fetch();
        $sup = $b['supplyType'] ?? determineSupplyType($co['state_code'] ?? '08', $b['vendorStateCode'] ?? '', $b['vendorGstin'] ?? '');
        $tot = computeLineItemsTotals($b['items'] ?? [], $b['charges'] ?? [], $sup);
        $pdo->prepare('INSERT INTO purchase_orders (company_id, po_number, po_date, expected_delivery, vendor_id, vendor_name, vendor_gstin, vendor_state, vendor_state_code, vendor_address, delivery_address, warehouse_id, payment_terms, terms_text, items, charges, taxable_value, cgst_amount, sgst_amount, igst_amount, cess_amount, total_amount, supply_type, status, notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
            ->execute([
                $cid, $b['poNumber'] ?: ('PO-' . substr((string)time(), -6)), $b['poDate'] ?: date('Y-m-d'),
                $b['expectedDelivery'] ?? '', !empty($b['vendorId']) ? (int)$b['vendorId'] : null,
                $b['vendorName'] ?? 'Supplier', $b['vendorGstin'] ?? '', $b['vendorState'] ?? '',
                $b['vendorStateCode'] ?? '', $b['vendorAddress'] ?? '', $b['deliveryAddress'] ?? ($co['address'] ?? ''),
                !empty($b['warehouseId']) ? (int)$b['warehouseId'] : null, $b['paymentTerms'] ?? '30 Days',
                $b['termsText'] ?? '', json_encode($tot['items']), json_encode($b['charges'] ?? []),
                $tot['taxableValue'], $tot['cgstAmount'], $tot['sgstAmount'], $tot['igstAmount'],
                $tot['cessAmount'], $tot['totalAmount'], $sup, $b['status'] ?? 'Pending', $b['notes'] ?? ''
            ]);
        $id = (int)$pdo->lastInsertId();
        jsonOut(hydrateRow($pdo->query("SELECT * FROM purchase_orders WHERE id=$id")->fetch()));
    }

    if ($method === 'PUT' && preg_match('#^/purchase-orders/(\d+)$#', $path, $m)) {
        $id = (int)$m[1];
        $b = getJsonBody();
        $cid = parseCompanyId($b);
        $co = $pdo->query("SELECT state_code FROM companies WHERE id=$cid")->fetch();
        $sup = $b['supplyType'] ?? determineSupplyType($co['state_code'] ?? '08', $b['vendorStateCode'] ?? '', $b['vendorGstin'] ?? '');
        $tot = computeLineItemsTotals($b['items'] ?? [], $b['charges'] ?? [], $sup);
        $pdo->prepare('UPDATE purchase_orders SET po_number=?, po_date=?, expected_delivery=?, vendor_name=?, vendor_gstin=?, vendor_state=?, vendor_state_code=?, payment_terms=?, terms_text=?, items=?, charges=?, taxable_value=?, cgst_amount=?, sgst_amount=?, igst_amount=?, cess_amount=?, total_amount=?, supply_type=?, status=?, notes=? WHERE id=? AND company_id=?')
            ->execute([
                $b['poNumber'], $b['poDate'], $b['expectedDelivery'] ?? '', $b['vendorName'], $b['vendorGstin'] ?? '',
                $b['vendorState'] ?? '', $b['vendorStateCode'] ?? '', $b['paymentTerms'] ?? '30 Days', $b['termsText'] ?? '',
                json_encode($tot['items']), json_encode($b['charges'] ?? []), $tot['taxableValue'],
                $tot['cgstAmount'], $tot['sgstAmount'], $tot['igstAmount'], $tot['cessAmount'], $tot['totalAmount'],
                $sup, $b['status'] ?? 'Pending', $b['notes'] ?? '', $id, $cid
            ]);
        jsonOut(hydrateRow($pdo->query("SELECT * FROM purchase_orders WHERE id=$id")->fetch()));
    }

    if ($method === 'DELETE' && preg_match('#^/purchase-orders/(\d+)$#', $path, $m)) {
        $cid = parseCompanyId();
        $pdo->prepare('DELETE FROM purchase_orders WHERE id=? AND company_id=?')->execute([(int)$m[1], $cid]);
        jsonOut(['ok' => true]);
    }

    if ($method === 'POST' && $path === '/purchase-orders/bulk') {
        $b = getJsonBody();
        $cid = parseCompanyId($b);
        $co = $pdo->query("SELECT state_code FROM companies WHERE id=$cid")->fetch();
        $cnt = 0;
        $stmt = $pdo->prepare('INSERT INTO purchase_orders (company_id, po_number, po_date, vendor_name, vendor_gstin, vendor_state, payment_terms, items, charges, taxable_value, cgst_amount, sgst_amount, igst_amount, cess_amount, total_amount, supply_type, status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
        foreach (($b['rows'] ?? []) as $idx => $r) {
            $sup = determineSupplyType($co['state_code'] ?? '08', '', $r['vendorGstin'] ?? '');
            $tot = computeLineItemsTotals($r['items'] ?? [], [], $sup);
            $stmt->execute([
                $cid, $r['poNumber'] ?: ('PO-IMP-' . $idx), $r['poDate'] ?: date('Y-m-d'),
                $r['vendorName'] ?? 'Supplier', $r['vendorGstin'] ?? '', $r['vendorState'] ?? '',
                $r['paymentTerms'] ?? '30 Days', json_encode($tot['items']), '[]',
                $tot['taxableValue'], $tot['cgstAmount'], $tot['sgstAmount'], $tot['igstAmount'],
                $tot['cessAmount'], $tot['totalAmount'], $sup, $r['status'] ?? 'Pending'
            ]);
            $cnt++;
        }
        jsonOut(['imported' => $cnt]);
    }

    if ($method === 'POST' && $path === '/work-orders') {
        $b = getJsonBody();
        $cid = parseCompanyId($b);
        $co = $pdo->query("SELECT state_code FROM companies WHERE id=$cid")->fetch();
        $sup = $b['supplyType'] ?? determineSupplyType($co['state_code'] ?? '08', $b['vendorStateCode'] ?? '', $b['vendorGstin'] ?? '');
        $tot = computeLineItemsTotals($b['items'] ?? [], $b['charges'] ?? [], $sup);
        $pdo->prepare('INSERT INTO work_orders (company_id, wo_number, wo_date, completion_date, vendor_id, contractor_name, vendor_gstin, vendor_state, vendor_state_code, site_location, scope_of_work, terms_text, items, charges, taxable_value, cgst_amount, sgst_amount, igst_amount, total_amount, supply_type, status, notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
            ->execute([
                $cid, $b['woNumber'] ?: ('WO-' . substr((string)time(), -6)), $b['woDate'] ?: date('Y-m-d'),
                $b['completionDate'] ?? '', !empty($b['vendorId']) ? (int)$b['vendorId'] : null,
                $b['contractorName'] ?? 'Contractor', $b['vendorGstin'] ?? '', $b['vendorState'] ?? '',
                $b['vendorStateCode'] ?? '', $b['siteLocation'] ?? '', $b['scopeOfWork'] ?? '',
                $b['termsText'] ?? '', json_encode($tot['items']), json_encode($b['charges'] ?? []),
                $tot['taxableValue'], $tot['cgstAmount'], $tot['sgstAmount'], $tot['igstAmount'],
                $tot['totalAmount'], $sup, $b['status'] ?? 'Pending', $b['notes'] ?? ''
            ]);
        $id = (int)$pdo->lastInsertId();
        jsonOut(hydrateRow($pdo->query("SELECT * FROM work_orders WHERE id=$id")->fetch()));
    }

    if ($method === 'PUT' && preg_match('#^/work-orders/(\d+)$#', $path, $m)) {
        $id = (int)$m[1];
        $b = getJsonBody();
        $cid = parseCompanyId($b);
        $co = $pdo->query("SELECT state_code FROM companies WHERE id=$cid")->fetch();
        $sup = $b['supplyType'] ?? determineSupplyType($co['state_code'] ?? '08', $b['vendorStateCode'] ?? '', $b['vendorGstin'] ?? '');
        $tot = computeLineItemsTotals($b['items'] ?? [], $b['charges'] ?? [], $sup);
        $pdo->prepare('UPDATE work_orders SET wo_number=?, wo_date=?, completion_date=?, contractor_name=?, vendor_gstin=?, vendor_state=?, site_location=?, scope_of_work=?, terms_text=?, items=?, charges=?, taxable_value=?, cgst_amount=?, sgst_amount=?, igst_amount=?, total_amount=?, supply_type=?, status=?, notes=? WHERE id=? AND company_id=?')
            ->execute([
                $b['woNumber'], $b['woDate'], $b['completionDate'] ?? '', $b['contractorName'], $b['vendorGstin'] ?? '',
                $b['vendorState'] ?? '', $b['siteLocation'] ?? '', $b['scopeOfWork'] ?? '', $b['termsText'] ?? '',
                json_encode($tot['items']), json_encode($b['charges'] ?? []), $tot['taxableValue'],
                $tot['cgstAmount'], $tot['sgstAmount'], $tot['igstAmount'], $tot['totalAmount'],
                $sup, $b['status'] ?? 'Pending', $b['notes'] ?? '', $id, $cid
            ]);
        jsonOut(hydrateRow($pdo->query("SELECT * FROM work_orders WHERE id=$id")->fetch()));
    }

    if ($method === 'DELETE' && preg_match('#^/work-orders/(\d+)$#', $path, $m)) {
        $cid = parseCompanyId();
        $pdo->prepare('DELETE FROM work_orders WHERE id=? AND company_id=?')->execute([(int)$m[1], $cid]);
        jsonOut(['ok' => true]);
    }

    if ($method === 'POST' && $path === '/work-orders/bulk') {
        $b = getJsonBody();
        $cid = parseCompanyId($b);
        $co = $pdo->query("SELECT state_code FROM companies WHERE id=$cid")->fetch();
        $cnt = 0;
        $stmt = $pdo->prepare('INSERT INTO work_orders (company_id, wo_number, wo_date, contractor_name, vendor_gstin, vendor_state, site_location, items, charges, taxable_value, cgst_amount, sgst_amount, igst_amount, total_amount, supply_type, status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
        foreach (($b['rows'] ?? []) as $idx => $r) {
            $sup = determineSupplyType($co['state_code'] ?? '08', '', $r['vendorGstin'] ?? '');
            $tot = computeLineItemsTotals($r['items'] ?? [], [], $sup);
            $stmt->execute([
                $cid, $r['woNumber'] ?: ('WO-IMP-' . $idx), $r['woDate'] ?: date('Y-m-d'),
                $r['contractorName'] ?? 'Contractor', $r['vendorGstin'] ?? '', $r['vendorState'] ?? '',
                $r['siteLocation'] ?? '', json_encode($tot['items']), '[]',
                $tot['taxableValue'], $tot['cgstAmount'], $tot['sgstAmount'], $tot['igstAmount'],
                $tot['totalAmount'], $sup, $r['status'] ?? 'Pending'
            ]);
            $cnt++;
        }
        jsonOut(['imported' => $cnt]);
    }

    // 9. VOUCHERS
    if ($method === 'POST' && $path === '/vouchers') {
        $b = getJsonBody();
        $cid = parseCompanyId($b);
        $co = $pdo->query("SELECT state_code FROM companies WHERE id=$cid")->fetch();
        $kind = $b['voucherKind'] ?? 'sales';
        $st = resolveStateFromInput($b['partyState'] ?? '', $b['partyGstin'] ?? '');
        $pCode = $b['partyStateCode'] ?: ($st['stateCode'] ?: ($co['state_code'] ?? '08'));
        $sup = $b['supplyType'] ?? determineSupplyType($co['state_code'] ?? '08', $pCode, $b['partyGstin'] ?? '');

        $taxable = (float)($b['taxableValue'] ?? 0);
        $cgst = (float)($b['cgstAmount'] ?? 0);
        $sgst = (float)($b['sgstAmount'] ?? 0);
        $igst = (float)($b['igstAmount'] ?? 0);
        $cess = (float)($b['cessAmount'] ?? 0);
        $roundOff = (float)($b['roundOff'] ?? 0);
        $total = (float)($b['totalAmount'] ?? 0);
        $items = $b['items'] ?? [];

        if (!empty($items) && in_array($kind, ['sales', 'purchase', 'proforma', 'service'], true)) {
            $calc = computeLineItemsTotals($items, $b['charges'] ?? [], $sup);
            $items = $calc['items'];
            $taxable = $calc['taxableValue'];
            $cgst = $calc['cgstAmount'];
            $sgst = $calc['sgstAmount'];
            $igst = $calc['igstAmount'];
            $cess = $calc['cessAmount'];
            $roundOff = $calc['roundOff'];
            $total = $calc['totalAmount'];
        } elseif ($kind === 'journal' && !empty($b['journalLines'])) {
            $total = array_reduce($b['journalLines'], fn($s, $l) => $s + (float)($l['drAmount'] ?? 0), 0.0);
            $taxable = $total;
        }

        $gstin = strtoupper(trim((string)($b['partyGstin'] ?? '')));
        $invType = $b['invoiceType'] ?: (strlen($gstin) === 15 ? 'B2B' : ($sup === 'Inter-State' && $total > 250000 ? 'B2CL' : 'B2CS'));

        $pdo->prepare('INSERT INTO vouchers (company_id, voucher_kind, voucher_no, voucher_date, due_date, party_id, party_name, party_gstin, party_state, party_state_code, party_address, place_of_supply, supply_type, invoice_type, reverse_charge, itc_eligibility, ref_no, ref_date, payment_mode, bank_account, tds_percent, tds_amount, items, charges, journal_lines, taxable_value, cgst_amount, sgst_amount, igst_amount, cess_amount, round_off, total_amount, paid_amount, narration, terms_text, status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
            ->execute([
                $cid, $kind, $b['voucherNo'] ?: (strtoupper(substr($kind, 0, 3)) . '-' . substr((string)time(), -6)),
                $b['voucherDate'] ?: date('Y-m-d'), $b['dueDate'] ?? '',
                !empty($b['partyId']) ? (int)$b['partyId'] : null, $b['partyName'] ?? 'Party',
                $gstin, $st['stateName'] ?: ($b['partyState'] ?? ''), $pCode, $b['partyAddress'] ?? '',
                $b['placeOfSupply'] ?: ($pCode . '-' . ($st['stateName'] ?: ($b['partyState'] ?? ''))),
                $sup, $invType, !empty($b['reverseCharge']) ? 1 : 0, $b['itcEligibility'] ?? 'Eligible',
                $b['refNo'] ?? '', $b['refDate'] ?? '', $b['paymentMode'] ?? 'Bank Transfer', $b['bankAccount'] ?? '',
                (float)($b['tdsPercent'] ?? 0), (float)($b['tdsAmount'] ?? 0),
                json_encode($items), json_encode($b['charges'] ?? []), json_encode($b['journalLines'] ?? []),
                $taxable, $cgst, $sgst, $igst, $cess, $roundOff, $total, (float)($b['paidAmount'] ?? 0),
                $b['narration'] ?? '', $b['termsText'] ?? '', $b['status'] ?? 'Posted'
            ]);
        $id = (int)$pdo->lastInsertId();
        jsonOut(hydrateRow($pdo->query("SELECT * FROM vouchers WHERE id=$id")->fetch()));
    }

    if ($method === 'PUT' && preg_match('#^/vouchers/(\d+)$#', $path, $m)) {
        $id = (int)$m[1];
        $b = getJsonBody();
        $cid = parseCompanyId($b);
        $co = $pdo->query("SELECT state_code FROM companies WHERE id=$cid")->fetch();
        $kind = $b['voucherKind'] ?? 'sales';
        $st = resolveStateFromInput($b['partyState'] ?? '', $b['partyGstin'] ?? '');
        $pCode = $b['partyStateCode'] ?: ($st['stateCode'] ?: ($co['state_code'] ?? '08'));
        $sup = $b['supplyType'] ?? determineSupplyType($co['state_code'] ?? '08', $pCode, $b['partyGstin'] ?? '');
        $items = $b['items'] ?? [];
        if (!empty($items) && in_array($kind, ['sales', 'purchase', 'proforma', 'service'], true)) {
            $calc = computeLineItemsTotals($items, $b['charges'] ?? [], $sup);
            $items = $calc['items'];
            $taxable = $calc['taxableValue'];
            $cgst = $calc['cgstAmount'];
            $sgst = $calc['sgstAmount'];
            $igst = $calc['igstAmount'];
            $cess = $calc['cessAmount'];
            $roundOff = $calc['roundOff'];
            $total = $calc['totalAmount'];
        } else {
            $total = (float)($b['totalAmount'] ?? 0);
            $taxable = (float)($b['taxableValue'] ?? $total);
            $cgst = (float)($b['cgstAmount'] ?? 0);
            $sgst = (float)($b['sgstAmount'] ?? 0);
            $igst = (float)($b['igstAmount'] ?? 0);
            $cess = (float)($b['cessAmount'] ?? 0);
            $roundOff = (float)($b['roundOff'] ?? 0);
        }

        $pdo->prepare('UPDATE vouchers SET voucher_no=?, voucher_date=?, due_date=?, party_name=?, party_gstin=?, party_state=?, party_state_code=?, party_address=?, supply_type=?, invoice_type=?, reverse_charge=?, itc_eligibility=?, payment_mode=?, items=?, charges=?, journal_lines=?, taxable_value=?, cgst_amount=?, sgst_amount=?, igst_amount=?, cess_amount=?, round_off=?, total_amount=?, narration=?, terms_text=?, status=? WHERE id=? AND company_id=?')
            ->execute([
                $b['voucherNo'], $b['voucherDate'], $b['dueDate'] ?? '', $b['partyName'],
                strtoupper($b['partyGstin'] ?? ''), $st['stateName'] ?: ($b['partyState'] ?? ''), $pCode,
                $b['partyAddress'] ?? '', $sup, $b['invoiceType'] ?? 'B2B', !empty($b['reverseCharge']) ? 1 : 0,
                $b['itcEligibility'] ?? 'Eligible', $b['paymentMode'] ?? 'Bank Transfer',
                json_encode($items), json_encode($b['charges'] ?? []), json_encode($b['journalLines'] ?? []),
                $taxable, $cgst, $sgst, $igst, $cess, $roundOff, $total,
                $b['narration'] ?? '', $b['termsText'] ?? '', $b['status'] ?? 'Posted', $id, $cid
            ]);
        jsonOut(hydrateRow($pdo->query("SELECT * FROM vouchers WHERE id=$id")->fetch()));
    }

    if ($method === 'DELETE' && preg_match('#^/vouchers/(\d+)$#', $path, $m)) {
        $cid = parseCompanyId();
        $pdo->prepare('DELETE FROM vouchers WHERE id=? AND company_id=?')->execute([(int)$m[1], $cid]);
        jsonOut(['ok' => true]);
    }

    if ($method === 'POST' && $path === '/vouchers/bulk') {
        $b = getJsonBody();
        $cid = parseCompanyId($b);
        $co = $pdo->query("SELECT state_code FROM companies WHERE id=$cid")->fetch();
        $cnt = 0;
        $stmt = $pdo->prepare('INSERT INTO vouchers (company_id, voucher_kind, voucher_no, voucher_date, party_name, party_gstin, party_state, party_state_code, place_of_supply, supply_type, invoice_type, reverse_charge, itc_eligibility, payment_mode, items, charges, journal_lines, taxable_value, cgst_amount, sgst_amount, igst_amount, cess_amount, round_off, total_amount, narration, status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, "Posted")');
        foreach (($b['rows'] ?? []) as $idx => $r) {
            $kind = $r['voucherKind'] ?? 'sales';
            $gstin = strtoupper(trim((string)($r['partyGstin'] ?? '')));
            $st = resolveStateFromInput($r['partyState'] ?? '', $gstin);
            $pCode = $st['stateCode'] ?: ($co['state_code'] ?? '08');
            $sup = determineSupplyType($co['state_code'] ?? '08', $pCode, $gstin);
            $calc = (!empty($r['items']) && in_array($kind, ['sales', 'purchase', 'proforma', 'service'], true))
                ? computeLineItemsTotals($r['items'], [], $sup)
                : null;
            $total = $calc ? $calc['totalAmount'] : (float)($r['totalAmount'] ?? 0);
            $invType = $r['invoiceType'] ?: (strlen($gstin) === 15 ? 'B2B' : ($sup === 'Inter-State' && $total > 250000 ? 'B2CL' : 'B2CS'));
            $stmt->execute([
                $cid, $kind, $r['voucherNo'] ?: (strtoupper(substr($kind, 0, 3)) . '-IMP-' . $idx),
                $r['voucherDate'] ?: date('Y-m-d'), $r['partyName'] ?? 'Party', $gstin,
                $st['stateName'] ?: ($r['partyState'] ?? ''), $pCode, $pCode . '-' . ($st['stateName'] ?: ($r['partyState'] ?? '')),
                $sup, $invType, !empty($r['reverseCharge']) ? 1 : 0, 'Eligible', $r['paymentMode'] ?? 'Bank Transfer',
                json_encode($calc ? $calc['items'] : []), '[]', '[]',
                $calc ? $calc['taxableValue'] : $total, $calc ? $calc['cgstAmount'] : 0,
                $calc ? $calc['sgstAmount'] : 0, $calc ? $calc['igstAmount'] : 0,
                $calc ? $calc['cessAmount'] : 0, $calc ? $calc['roundOff'] : 0, $total, $r['narration'] ?? ''
            ]);
            $cnt++;
        }
        jsonOut(['imported' => $cnt]);
    }

    // 10. BILLS, PAYMENT SHEETS, GATE PASSES, LEDGERS, TERMS
    if ($method === 'POST' && $path === '/bills') {
        $b = getJsonBody();
        $cid = parseCompanyId($b);
        $amt = (float)($b['amount'] ?? 0);
        $gst = (float)($b['gstAmount'] ?? 0);
        $tds = (float)($b['tdsAmount'] ?? 0);
        $ded = (float)($b['deduction'] ?? 0);
        $net = isset($b['netAmount']) ? (float)$b['netAmount'] : ($amt + $gst - $tds - $ded);
        $pdo->prepare('INSERT INTO bills (company_id, bill_no, bill_date, vendor_id, vendor_name, vendor_gstin, doc_no, doc_date, po_wo_ref, amount, gst_amount, cgst_amount, sgst_amount, igst_amount, tds_amount, deduction, net_amount, pay_from_bank, payment_mode, status, narration) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
            ->execute([$cid, $b['billNo'], $b['billDate'] ?: date('Y-m-d'), !empty($b['vendorId']) ? (int)$b['vendorId'] : null, $b['vendorName'], $b['vendorGstin'] ?? '', $b['docNo'] ?? '', $b['docDate'] ?? '', $b['poWoRef'] ?? '', $amt, $gst, (float)($b['cgstAmount'] ?? $gst / 2), (float)($b['sgstAmount'] ?? $gst / 2), (float)($b['igstAmount'] ?? 0), $tds, $ded, $net, $b['payFromBank'] ?? '', $b['paymentMode'] ?? 'NEFT', $b['status'] ?? 'Pending', $b['narration'] ?? '']);
        $id = (int)$pdo->lastInsertId();
        jsonOut(hydrateRow($pdo->query("SELECT * FROM bills WHERE id=$id")->fetch()));
    }
    if ($method === 'DELETE' && preg_match('#^/bills/(\d+)$#', $path, $m)) {
        $cid = parseCompanyId();
        $pdo->prepare('DELETE FROM bills WHERE id=? AND company_id=?')->execute([(int)$m[1], $cid]);
        jsonOut(['ok' => true]);
    }

    if ($method === 'POST' && $path === '/payment-sheets') {
        $b = getJsonBody();
        $cid = parseCompanyId($b);
        $billIds = array_map('intval', $b['billIds'] ?? []);
        $pdo->prepare('INSERT INTO payment_sheets (company_id, sheet_no, sheet_date, pay_from_bank, payment_mode, bill_ids, total_net_amount, status, remarks) VALUES (?,?,?,?,?,?,?,?,?)')
            ->execute([$cid, $b['sheetNo'], $b['sheetDate'] ?: date('Y-m-d'), $b['payFromBank'] ?? '', $b['paymentMode'] ?? 'NEFT', json_encode($billIds), (float)($b['totalNetAmount'] ?? 0), $b['status'] ?? 'Initiated', $b['remarks'] ?? '']);
        $id = (int)$pdo->lastInsertId();
        foreach ($billIds as $bid) {
            $pdo->prepare('UPDATE bills SET payment_sheet_id=?, status=? WHERE id=? AND company_id=?')->execute([$id, ($b['status'] ?? '') === 'Paid' ? 'Paid' : 'Approved', $bid, $cid]);
        }
        jsonOut(hydrateRow($pdo->query("SELECT * FROM payment_sheets WHERE id=$id")->fetch()));
    }
    if ($method === 'PUT' && preg_match('#^/payment-sheets/(\d+)$#', $path, $m)) {
        $id = (int)$m[1];
        $b = getJsonBody();
        $cid = parseCompanyId($b);
        $pdo->prepare('UPDATE payment_sheets SET status=?, remarks=? WHERE id=? AND company_id=?')->execute([$b['status'] ?? 'Paid', $b['remarks'] ?? '', $id, $cid]);
        $row = hydrateRow($pdo->query("SELECT * FROM payment_sheets WHERE id=$id")->fetch());
        if ($row && ($b['status'] ?? '') === 'Paid') {
            foreach (($row['billIds'] ?? []) as $bid) {
                $pdo->prepare('UPDATE bills SET status="Paid" WHERE id=?')->execute([(int)$bid]);
            }
        }
        jsonOut($row);
    }

    if ($method === 'POST' && $path === '/gate-passes') {
        $b = getJsonBody();
        $cid = parseCompanyId($b);
        $pdo->prepare('INSERT INTO gate_passes (company_id, pass_no, pass_date, pass_type, direction, party_name, vehicle_no, driver_name, items, status, remarks) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
            ->execute([$cid, $b['passNo'], $b['passDate'] ?: date('Y-m-d'), $b['passType'] ?? 'Returnable', $b['direction'] ?? 'Outward', $b['partyName'], $b['vehicleNo'] ?? '', $b['driverName'] ?? '', json_encode($b['items'] ?? []), $b['status'] ?? 'Open', $b['remarks'] ?? '']);
        $id = (int)$pdo->lastInsertId();
        jsonOut(hydrateRow($pdo->query("SELECT * FROM gate_passes WHERE id=$id")->fetch()));
    }
    if ($method === 'DELETE' && preg_match('#^/gate-passes/(\d+)$#', $path, $m)) {
        $cid = parseCompanyId();
        $pdo->prepare('DELETE FROM gate_passes WHERE id=? AND company_id=?')->execute([(int)$m[1], $cid]);
        jsonOut(['ok' => true]);
    }

    if ($method === 'POST' && $path === '/ledgers') {
        $b = getJsonBody();
        $cid = parseCompanyId($b);
        $pdo->prepare('INSERT INTO ledgers (company_id, name, group_name, nature, opening_balance, opening_type, gstin, state) VALUES (?,?,?,?,?,?,?,?)')
            ->execute([$cid, $b['name'], $b['groupName'] ?? 'Indirect Expenses', $b['nature'] ?? 'Expense', (float)($b['openingBalance'] ?? 0), $b['openingType'] ?? 'Dr', $b['gstin'] ?? '', $b['state'] ?? '']);
        $id = (int)$pdo->lastInsertId();
        jsonOut(hydrateRow($pdo->query("SELECT * FROM ledgers WHERE id=$id")->fetch()));
    }
    if ($method === 'DELETE' && preg_match('#^/ledgers/(\d+)$#', $path, $m)) {
        $cid = parseCompanyId();
        $pdo->prepare('DELETE FROM ledgers WHERE id=? AND company_id=?')->execute([(int)$m[1], $cid]);
        jsonOut(['ok' => true]);
    }

    if ($method === 'POST' && $path === '/terms') {
        $b = getJsonBody();
        $cid = parseCompanyId($b);
        $pdo->prepare('INSERT INTO terms_templates (company_id, name, doc_type, content, is_default) VALUES (?,?,?,?,?)')
            ->execute([$cid, $b['name'], $b['docType'] ?? 'Purchase Order', $b['content'] ?? '', !empty($b['isDefault']) ? 1 : 0]);
        $id = (int)$pdo->lastInsertId();
        jsonOut(hydrateRow($pdo->query("SELECT * FROM terms_templates WHERE id=$id")->fetch()));
    }
    if ($method === 'DELETE' && preg_match('#^/terms/(\d+)$#', $path, $m)) {
        $cid = parseCompanyId();
        $pdo->prepare('DELETE FROM terms_templates WHERE id=? AND company_id=?')->execute([(int)$m[1], $cid]);
        jsonOut(['ok' => true]);
    }

    // 11. GST COMPLIANCE REPORTS (GSTR-1, GSTR-2, GSTR-3B)
    if ($method === 'GET' && $path === '/gst/reports') {
        $cid = parseCompanyId();
        $from = $_GET['fromDate'] ?? '';
        $to = $_GET['toDate'] ?? '';
        $inRange = fn(?string $d) => (!$d || ((!$from || $d >= $from) && (!$to || $d <= $to)));

        $vRows = hydrateRows($pdo->query("SELECT * FROM vouchers WHERE company_id=$cid AND status != 'Cancelled'")->fetchAll());
        $bRows = hydrateRows($pdo->query("SELECT * FROM bills WHERE company_id=$cid AND status != 'Cancelled'")->fetchAll());

        $sales = array_values(array_filter($vRows, fn($v) => $v['voucherKind'] === 'sales' && $inRange($v['voucherDate'])));
        $purchases = array_values(array_filter($vRows, fn($v) => $v['voucherKind'] === 'purchase' && $inRange($v['voucherDate'])));
        $bills = array_values(array_filter($bRows, fn($b) => $inRange($b['billDate'])));

        $b2b = array_values(array_filter($sales, fn($v) => strlen(trim($v['partyGstin'])) === 15 && $v['invoiceType'] !== 'EXP'));
        $b2cl = array_values(array_filter($sales, fn($v) => strlen(trim($v['partyGstin'])) < 15 && $v['supplyType'] === 'Inter-State' && (float)$v['totalAmount'] > 250000));
        $b2cs = array_values(array_filter($sales, fn($v) => strlen(trim($v['partyGstin'])) < 15 && !($v['supplyType'] === 'Inter-State' && (float)$v['totalAmount'] > 250000) && $v['invoiceType'] !== 'EXP' && $v['invoiceType'] !== 'NIL'));

        $hsnMap = [];
        foreach ($sales as $v) {
            foreach (($v['items'] ?? []) as $it) {
                $k = ($it['hsnSac'] ?: 'NA') . '__' . ($it['unit'] ?: 'NOS');
                if (!isset($hsnMap[$k])) {
                    $hsnMap[$k] = ['hsn' => $it['hsnSac'] ?: 'NA', 'uqc' => $it['unit'] ?: 'NOS', 'qty' => 0, 'taxableValue' => 0, 'igst' => 0, 'cgst' => 0, 'sgst' => 0, 'cess' => 0, 'totalValue' => 0];
                }
                $hsnMap[$k]['qty'] = round2($hsnMap[$k]['qty'] + (float)$it['qty']);
                $hsnMap[$k]['taxableValue'] = round2($hsnMap[$k]['taxableValue'] + (float)$it['taxableValue']);
                $hsnMap[$k]['igst'] = round2($hsnMap[$k]['igst'] + (float)$it['igstAmount']);
                $hsnMap[$k]['cgst'] = round2($hsnMap[$k]['cgst'] + (float)$it['cgstAmount']);
                $hsnMap[$k]['sgst'] = round2($hsnMap[$k]['sgst'] + (float)$it['sgstAmount']);
                $hsnMap[$k]['cess'] = round2($hsnMap[$k]['cess'] + (float)($it['cessAmount'] ?? 0));
                $hsnMap[$k]['totalValue'] = round2($hsnMap[$k]['totalValue'] + (float)$it['totalAmount']);
            }
        }

        $g2 = [];
        foreach ($purchases as $p) {
            $g2[] = ['id' => 'V-' . $p['id'], 'docNo' => $p['voucherNo'], 'date' => $p['voucherDate'], 'supplier' => $p['partyName'], 'gstin' => $p['partyGstin'], 'supplyType' => $p['supplyType'], 'reverseCharge' => $p['reverseCharge'], 'itcEligibility' => $p['itcEligibility'], 'taxableValue' => (float)$p['taxableValue'], 'cgst' => (float)$p['cgstAmount'], 'sgst' => (float)$p['sgstAmount'], 'igst' => (float)$p['igstAmount'], 'cess' => (float)$p['cessAmount'], 'total' => (float)$p['totalAmount']];
        }
        foreach ($bills as $bl) {
            if ((float)$bl['gstAmount'] <= 0) continue;
            $g2[] = ['id' => 'B-' . $bl['id'], 'docNo' => $bl['docNo'] ?: $bl['billNo'], 'date' => $bl['billDate'], 'supplier' => $bl['vendorName'], 'gstin' => $bl['vendorGstin'], 'supplyType' => (float)$bl['igstAmount'] > 0 ? 'Inter-State' : 'Intra-State', 'reverseCharge' => false, 'itcEligibility' => 'Eligible', 'taxableValue' => (float)$bl['amount'], 'cgst' => (float)$bl['cgstAmount'], 'sgst' => (float)$bl['sgstAmount'], 'igst' => (float)$bl['igstAmount'], 'cess' => 0, 'total' => (float)$bl['amount'] + (float)$bl['gstAmount']];
        }

        $sumField = fn($arr, $f) => round2(array_reduce($arr, fn($s, $r) => $s + (float)($r[$f] ?? 0), 0.0));
        $outTaxable = $sumField($sales, 'taxableValue');
        $outIgst = $sumField($sales, 'igstAmount');
        $outCgst = $sumField($sales, 'cgstAmount');
        $outSgst = $sumField($sales, 'sgstAmount');
        $outCess = $sumField($sales, 'cessAmount');

        $rcmPurchases = array_values(array_filter($purchases, fn($v) => $v['reverseCharge']));
        $rcmIgst = $sumField($rcmPurchases, 'igstAmount');
        $rcmCgst = $sumField($rcmPurchases, 'cgstAmount');
        $rcmSgst = $sumField($rcmPurchases, 'sgstAmount');

        $eligG2 = array_values(array_filter($g2, fn($e) => $e['itcEligibility'] !== 'Ineligible'));
        $itcIgst = $sumField($eligG2, 'igst');
        $itcCgst = $sumField($eligG2, 'cgst');
        $itcSgst = $sumField($eligG2, 'sgst');
        $itcCess = $sumField($eligG2, 'cess');

        // Rule 88A / Sec 49(4) Table 6.1 ITC Set-off
        $remIgst = $itcIgst;
        $remCgst = $itcCgst;
        $remSgst = $itcSgst;

        $igstByIgst = min($outIgst, $remIgst);
        $remIgst = round2($remIgst - $igstByIgst);
        $cgstByIgst = min($outCgst, $remIgst);
        $remIgst = round2($remIgst - $cgstByIgst);
        $sgstByIgst = min($outSgst, $remIgst);
        $remIgst = round2($remIgst - $sgstByIgst);

        $needIgst = round2($outIgst - $igstByIgst);
        $igstByCgst = min($needIgst, $remCgst);
        $remCgst = round2($remCgst - $igstByCgst);
        $igstBySgst = min(round2($needIgst - $igstByCgst), $remSgst);
        $remSgst = round2($remSgst - $igstBySgst);

        $cgstByCgst = min(round2($outCgst - $cgstByIgst), $remCgst);
        $remCgst = round2($remCgst - $cgstByCgst);
        $sgstBySgst = min(round2($outSgst - $sgstByIgst), $remSgst);
        $remSgst = round2($remSgst - $sgstBySgst);

        $cashIgst = round2(max(0, $outIgst - $igstByIgst - $igstByCgst - $igstBySgst) + $rcmIgst);
        $cashCgst = round2(max(0, $outCgst - $cgstByIgst - $cgstByCgst) + $rcmCgst);
        $cashSgst = round2(max(0, $outSgst - $sgstByIgst - $sgstBySgst) + $rcmSgst);
        $cessByCess = min($outCess, $itcCess);
        $cashCess = round2(max(0, $outCess - $cessByCess));

        jsonOut([
            'gstr1' => [
                'summary' => ['totalInvoices' => count($sales), 'taxableValue' => $outTaxable, 'igst' => $outIgst, 'cgst' => $outCgst, 'sgst' => $outSgst, 'cess' => $outCess, 'totalTax' => round2($outIgst + $outCgst + $outSgst + $outCess)],
                'b2b' => $b2b, 'b2cl' => $b2cl, 'b2cs' => $b2cs, 'exports' => [],
                'hsnSummary' => array_values($hsnMap),
            ],
            'gstr2' => [
                'summary' => ['totalEntries' => count($g2), 'eligibleTaxable' => $sumField($eligG2, 'taxableValue'), 'eligibleItcTotal' => round2($itcIgst + $itcCgst + $itcSgst + $itcCess), 'ineligibleItcTotal' => 0, 'igst' => $itcIgst, 'cgst' => $itcCgst, 'sgst' => $itcSgst],
                'entries' => $g2,
            ],
            'gstr3b' => [
                'table3_1' => [
                    'outwardTaxable' => ['taxableValue' => $outTaxable, 'igst' => $outIgst, 'cgst' => $outCgst, 'sgst' => $outSgst, 'cess' => $outCess],
                    'inwardRcm' => ['taxableValue' => $sumField($rcmPurchases, 'taxableValue'), 'igst' => $rcmIgst, 'cgst' => $rcmCgst, 'sgst' => $rcmSgst, 'cess' => 0],
                ],
                'table4' => ['eligibleItc' => ['igst' => $itcIgst, 'cgst' => $itcCgst, 'sgst' => $itcSgst, 'cess' => $itcCess], 'ineligibleCount' => count($g2) - count($eligG2)],
                'table6_1' => [
                    'offset' => [
                        'igst' => ['paidByIgst' => $igstByIgst, 'paidByCgst' => $igstByCgst, 'paidBySgst' => $igstBySgst, 'paidInCash' => $cashIgst],
                        'cgst' => ['paidByIgst' => $cgstByIgst, 'paidByCgst' => $cgstByCgst, 'paidBySgst' => 0, 'paidInCash' => $cashCgst],
                        'sgst' => ['paidByIgst' => $sgstByIgst, 'paidByCgst' => 0, 'paidBySgst' => $sgstBySgst, 'paidInCash' => $cashSgst],
                        'cess' => ['paidByCess' => $cessByCess, 'paidInCash' => $cashCess],
                    ],
                    'closingItcBalance' => ['igst' => $remIgst, 'cgst' => $remCgst, 'sgst' => $remSgst, 'cess' => round2($itcCess - $cessByCess)],
                    'totalNetCashPayable' => round2($cashIgst + $cashCgst + $cashSgst + $cashCess),
                ],
            ],
        ]);
    }

    // 12. SQL SNAPSHOT & RESTORE
    if ($method === 'POST' && $path === '/backup/snapshot') {
        $b = getJsonBody();
        $cid = parseCompanyId($b);
        $bundle = getCompanyBundle($pdo, $cid);
        unset($bundle['snapshots'], $bundle['auditLogs']);
        $recCount = count($bundle['vendors']) + count($bundle['inventoryItems']) + count($bundle['purchaseOrders']) + count($bundle['workOrders']) + count($bundle['vouchers']) + count($bundle['bills']) + count($bundle['ledgers']);
        $label = $b['label'] ?? ('Manual Snapshot ' . date('Y-m-d H:i'));
        $pdo->prepare('INSERT INTO db_snapshots (company_id, label, created_by, record_count, payload) VALUES (?,?,?,?,?)')
            ->execute([$cid, $label, $user['email'], $recCount, json_encode($bundle)]);
        $id = (int)$pdo->lastInsertId();
        $snap = hydrateRow($pdo->query("SELECT id, company_id, label, created_by, record_count, created_at FROM db_snapshots WHERE id=$id")->fetch());
        jsonOut(['snapshot' => $snap, 'data' => $bundle]);
    }

    if ($method === 'GET' && preg_match('#^/backup/snapshot/(\d+)$#', $path, $m)) {
        $id = (int)$m[1];
        $row = hydrateRow($pdo->query("SELECT * FROM db_snapshots WHERE id=$id")->fetch());
        if (!$row) jsonOut(['error' => 'Snapshot not found.'], 404);
        jsonOut($row);
    }

    if ($method === 'POST' && $path === '/backup/restore') {
        $b = getJsonBody();
        $cid = parseCompanyId($b);
        $payload = $b['payload'] ?? null;
        if (!$payload && !empty($b['snapshotId'])) {
            $snap = hydrateRow($pdo->query('SELECT * FROM db_snapshots WHERE id=' . (int)$b['snapshotId'])->fetch());
            $payload = $snap['payload'] ?? null;
        }
        if (!is_array($payload)) jsonOut(['error' => 'Valid backup payload required.'], 400);

        $pdo->beginTransaction();
        foreach (['inventory_movements', 'inventory_items', 'warehouses', 'purchase_orders', 'work_orders', 'vouchers', 'bills', 'payment_sheets', 'gate_passes', 'vendors', 'ledgers', 'account_groups', 'terms_templates'] as $tbl) {
            $pdo->prepare("DELETE FROM `$tbl` WHERE company_id=?")->execute([$cid]);
        }
        foreach (($payload['warehouses'] ?? []) as $w) {
            $pdo->prepare('INSERT INTO warehouses (company_id, code, name, location, state, in_charge, is_default, active) VALUES (?,?,?,?,?,?,?,?)')
                ->execute([$cid, $w['code'] ?? 'WH', $w['name'], $w['location'] ?? '', $w['state'] ?? '', $w['inCharge'] ?? '', !empty($w['isDefault']) ? 1 : 0, 1]);
        }
        foreach (($payload['vendors'] ?? []) as $v) {
            $pdo->prepare('INSERT INTO vendors (company_id, vendor_code, vendor_name, trade_name, vendor_category, contact_person, mobile, email, gst_type, gstin, pan, address, city, state, state_code, pincode, bank_name, account_no, ifsc_code, payment_terms, opening_balance, tds_rate, status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
                ->execute([$cid, $v['vendorCode'] ?? '', $v['vendorName'], $v['tradeName'] ?? '', $v['vendorCategory'] ?? 'Supplier', $v['contactPerson'] ?? '', $v['mobile'] ?? '', $v['email'] ?? '', $v['gstType'] ?? 'Registered - Regular', $v['gstin'] ?? '', $v['pan'] ?? '', $v['address'] ?? '', $v['city'] ?? '', $v['state'] ?? '', $v['stateCode'] ?? '', $v['pincode'] ?? '', $v['bankName'] ?? '', $v['accountNo'] ?? '', $v['ifscCode'] ?? '', $v['paymentTerms'] ?? '30 Days', (float)($v['openingBalance'] ?? 0), (float)($v['tdsRate'] ?? 0), $v['status'] ?? 'Active']);
        }
        foreach (($payload['inventoryItems'] ?? []) as $it) {
            $pdo->prepare('INSERT INTO inventory_items (company_id, sku, name, category, item_type, hsn_sac, gst_rate, unit, valuation_method, purchase_rate, selling_rate, opening_stock, current_stock, min_stock, reorder_level, max_stock, bin_location, active) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)')
                ->execute([$cid, $it['sku'], $it['name'], $it['category'] ?? 'Raw Material', $it['itemType'] ?? 'Goods', $it['hsnSac'] ?? '', (float)($it['gstRate'] ?? 18), $it['unit'] ?? 'NOS', $it['valuationMethod'] ?? 'Weighted Average', (float)($it['purchaseRate'] ?? 0), (float)($it['sellingRate'] ?? 0), (float)($it['openingStock'] ?? 0), (float)($it['currentStock'] ?? 0), (float)($it['minStock'] ?? 0), (float)($it['reorderLevel'] ?? 0), (float)($it['maxStock'] ?? 0), $it['binLocation'] ?? '']);
        }
        foreach (($payload['purchaseOrders'] ?? []) as $po) {
            $pdo->prepare('INSERT INTO purchase_orders (company_id, po_number, po_date, vendor_name, vendor_gstin, vendor_state, payment_terms, items, charges, taxable_value, cgst_amount, sgst_amount, igst_amount, total_amount, supply_type, status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
                ->execute([$cid, $po['poNumber'], $po['poDate'], $po['vendorName'], $po['vendorGstin'] ?? '', $po['vendorState'] ?? '', $po['paymentTerms'] ?? '30 Days', json_encode($po['items'] ?? []), json_encode($po['charges'] ?? []), (float)($po['taxableValue'] ?? 0), (float)($po['cgstAmount'] ?? 0), (float)($po['sgstAmount'] ?? 0), (float)($po['igstAmount'] ?? 0), (float)($po['totalAmount'] ?? 0), $po['supplyType'] ?? 'Intra-State', $po['status'] ?? 'Pending']);
        }
        foreach (($payload['workOrders'] ?? []) as $wo) {
            $pdo->prepare('INSERT INTO work_orders (company_id, wo_number, wo_date, contractor_name, vendor_gstin, site_location, items, charges, taxable_value, cgst_amount, sgst_amount, igst_amount, total_amount, supply_type, status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
                ->execute([$cid, $wo['woNumber'], $wo['woDate'], $wo['contractorName'], $wo['vendorGstin'] ?? '', $wo['siteLocation'] ?? '', json_encode($wo['items'] ?? []), json_encode($wo['charges'] ?? []), (float)($wo['taxableValue'] ?? 0), (float)($wo['cgstAmount'] ?? 0), (float)($wo['sgstAmount'] ?? 0), (float)($wo['igstAmount'] ?? 0), (float)($wo['totalAmount'] ?? 0), $wo['supplyType'] ?? 'Intra-State', $wo['status'] ?? 'Pending']);
        }
        foreach (($payload['vouchers'] ?? []) as $v) {
            $pdo->prepare('INSERT INTO vouchers (company_id, voucher_kind, voucher_no, voucher_date, party_name, party_gstin, party_state, party_state_code, supply_type, invoice_type, reverse_charge, itc_eligibility, payment_mode, items, charges, journal_lines, taxable_value, cgst_amount, sgst_amount, igst_amount, total_amount, narration, status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
                ->execute([$cid, $v['voucherKind'], $v['voucherNo'], $v['voucherDate'], $v['partyName'], $v['partyGstin'] ?? '', $v['partyState'] ?? '', $v['partyStateCode'] ?? '', $v['supplyType'] ?? 'Intra-State', $v['invoiceType'] ?? 'B2B', !empty($v['reverseCharge']) ? 1 : 0, $v['itcEligibility'] ?? 'Eligible', $v['paymentMode'] ?? 'Bank Transfer', json_encode($v['items'] ?? []), json_encode($v['charges'] ?? []), json_encode($v['journalLines'] ?? []), (float)($v['taxableValue'] ?? 0), (float)($v['cgstAmount'] ?? 0), (float)($v['sgstAmount'] ?? 0), (float)($v['igstAmount'] ?? 0), (float)($v['totalAmount'] ?? 0), $v['narration'] ?? '', $v['status'] ?? 'Posted']);
        }
        foreach (($payload['bills'] ?? []) as $bl) {
            $pdo->prepare('INSERT INTO bills (company_id, bill_no, bill_date, vendor_name, vendor_gstin, amount, gst_amount, tds_amount, net_amount, status) VALUES (?,?,?,?,?,?,?,?,?,?)')
                ->execute([$cid, $bl['billNo'], $bl['billDate'], $bl['vendorName'], $bl['vendorGstin'] ?? '', (float)($bl['amount'] ?? 0), (float)($bl['gstAmount'] ?? 0), (float)($bl['tdsAmount'] ?? 0), (float)($bl['netAmount'] ?? 0), $bl['status'] ?? 'Pending']);
        }
        foreach (($payload['ledgers'] ?? []) as $l) {
            $pdo->prepare('INSERT INTO ledgers (company_id, name, group_name, nature, opening_balance, opening_type) VALUES (?,?,?,?,?,?)')
                ->execute([$cid, $l['name'], $l['groupName'], $l['nature'], (float)($l['openingBalance'] ?? 0), $l['openingType'] ?? 'Dr']);
        }
        $pdo->commit();
        jsonOut(['ok' => true, 'bundle' => getCompanyBundle($pdo, $cid)]);
    }

    // 13. USERS
    if ($method === 'GET' && $path === '/users') {
        jsonOut(hydrateRows($pdo->query('SELECT * FROM users ORDER BY id ASC')->fetchAll()));
    }
    if ($method === 'PUT' && preg_match('#^/users/(\d+)$#', $path, $m)) {
        $id = (int)$m[1];
        $b = getJsonBody();
        $pdo->prepare('UPDATE users SET role=?, active=? WHERE id=?')->execute([$b['role'] ?? 'Admin', !empty($b['active']) ? 1 : 0, $id]);
        jsonOut(hydrateRow($pdo->query("SELECT * FROM users WHERE id=$id")->fetch()));
    }

    jsonOut(['error' => 'Endpoint not found: ' . $method . ' ' . $path], 404);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    jsonOut(['error' => $e->getMessage()], 500);
}
