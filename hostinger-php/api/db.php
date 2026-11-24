<?php

require_once __DIR__ . '/config.php';

function getPdo(): PDO {
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $dsn = sprintf('mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4', DB_HOST, DB_PORT, DB_NAME);
    $pdo = new PDO($dsn, DB_USER, DB_PASS, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    return $pdo;
}

function snakeToCamel(string $key): string {
    return lcfirst(str_replace(' ', '', ucwords(str_replace('_', ' ', $key))));
}

function hydrateRow(?array $row): ?array {
    if ($row === null) {
        return null;
    }

    static $jsonKeys = [
        'perms', 'company_ids', 'banks', 'numbering', 'serial_numbers',
        'items', 'charges', 'journal_lines', 'bill_ids', 'extra', 'payload'
    ];
    static $boolKeys = [
        'active', 'deleted', 'tds_applicable', 'is_default',
        'batch_tracked', 'serial_tracked', 'reverse_charge', 'is_system'
    ];
    static $intKeys = [
        'id', 'company_id', 'vendor_id', 'warehouse_id', 'to_warehouse_id',
        'preferred_vendor_id', 'item_id', 'party_id', 'payment_sheet_id', 'record_count'
    ];

    $out = [];
    foreach ($row as $k => $v) {
        $camel = snakeToCamel($k);
        if (in_array($k, $jsonKeys, true)) {
            if (is_string($v) && $v !== '') {
                $decoded = json_decode($v, true);
                $out[$camel] = json_last_error() === JSON_ERROR_NONE ? $decoded : [];
            } else {
                $out[$camel] = ($k === 'perms' || $k === 'company_ids' || $k === 'extra') ? null : [];
            }
        } elseif (in_array($k, $boolKeys, true)) {
            $out[$camel] = (bool)$v;
        } elseif (in_array($k, $intKeys, true)) {
            $out[$camel] = $v === null ? null : (int)$v;
        } else {
            $out[$camel] = $v;
        }
    }
    return $out;
}

function hydrateRows(array $rows): array {
    return array_map(fn($r) => hydrateRow($r), $rows);
}

function jsonOut($data, int $status = 200): void {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function getJsonBody(): array {
    $raw = file_get_contents('php://input');
    if (!$raw) {
        return [];
    }
    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}
