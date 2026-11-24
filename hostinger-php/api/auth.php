<?php

require_once __DIR__ . '/db.php';

function base64UrlDecode(string $input): string {
    $remainder = strlen($input) % 4;
    if ($remainder) {
        $input .= str_repeat('=', 4 - $remainder);
    }
    return base64_decode(strtr($input, '-_', '+/')) ?: '';
}

function fetchGoogleCerts(): array {
    $cacheFile = sys_get_temp_dir() . '/firebase_google_certs_cache.json';
    if (file_exists($cacheFile) && (time() - filemtime($cacheFile)) < 3600) {
        $cached = json_decode(file_get_contents($cacheFile), true);
        if (is_array($cached) && count($cached) > 0) {
            return $cached;
        }
    }

    $url = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 10,
    ]);
    $raw = curl_exec($ch);
    curl_close($ch);

    $certs = json_decode($raw ?: '', true);
    if (!is_array($certs) || empty($certs)) {
        throw new Exception('Unable to fetch Google Firebase public certificates.');
    }
    @file_put_contents($cacheFile, json_encode($certs));
    return $certs;
}

function verifyFirebaseIdToken(string $jwt): array {
    $parts = explode('.', $jwt);
    if (count($parts) !== 3) {
        throw new Exception('Malformed Bearer token.');
    }
    [$headB64, $payloadB64, $sigB64] = $parts;
    $header = json_decode(base64UrlDecode($headB64), true);
    $payload = json_decode(base64UrlDecode($payloadB64), true);
    $sig = base64UrlDecode($sigB64);

    if (!is_array($header) || !is_array($payload) || empty($header['kid'])) {
        throw new Exception('Invalid JWT header or payload.');
    }

    $certs = fetchGoogleCerts();
    $kid = $header['kid'];
    if (empty($certs[$kid])) {
        throw new Exception('Signing key not found.');
    }

    $pubKey = openssl_pkey_get_public($certs[$kid]);
    if (!$pubKey) {
        throw new Exception('Invalid public certificate.');
    }
    $ok = openssl_verify($headB64 . '.' . $payloadB64, $sig, $pubKey, OPENSSL_ALGO_SHA256);
    if ($ok !== 1) {
        throw new Exception('Invalid Firebase token signature.');
    }

    $projectId = FIREBASE_PROJECT_ID;
    $now = time();
    if (($payload['aud'] ?? '') !== $projectId) {
        throw new Exception('Token audience mismatch.');
    }
    if (($payload['iss'] ?? '') !== 'https://securetoken.google.com/' . $projectId) {
        throw new Exception('Token issuer mismatch.');
    }
    if (($payload['exp'] ?? 0) < $now) {
        throw new Exception('Session expired. Please sign in again.');
    }
    if (empty($payload['sub'])) {
        throw new Exception('Missing subject in token.');
    }

    return [
        'uid' => $payload['sub'],
        'email' => $payload['email'] ?? ($payload['sub'] . '@user.local'),
        'name' => $payload['name'] ?? ($payload['email'] ?? 'ERP User'),
    ];
}

function getBearerToken(): string {
    $auth = $_SERVER['HTTP_AUTHORIZATION']
        ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION']
        ?? '';
    if (!$auth && function_exists('apache_request_headers')) {
        $headers = apache_request_headers();
        $auth = $headers['Authorization'] ?? $headers['authorization'] ?? '';
    }
    if (stripos($auth, 'Bearer ') === 0) {
        return trim(substr($auth, 7));
    }
    return '';
}

function requireAuthUser(): array {
    $token = getBearerToken();
    if (!$token) {
        jsonOut(['error' => 'Unauthorized: Missing Bearer token'], 401);
    }

    try {
        $claims = verifyFirebaseIdToken($token);
    } catch (Throwable $e) {
        jsonOut(['error' => 'Unauthorized: ' . $e->getMessage()], 401);
    }

    $pdo = getPdo();
    $stmt = $pdo->prepare('SELECT * FROM users WHERE uid = ? LIMIT 1');
    $stmt->execute([$claims['uid']]);
    $existing = $stmt->fetch();

    if ($existing) {
        $pdo->prepare('UPDATE users SET last_login = NOW(), email = COALESCE(NULLIF(?, ""), email) WHERE id = ?')
            ->execute([$claims['email'], $existing['id']]);
        if (!$existing['active']) {
            jsonOut(['error' => 'Account disabled by administrator.'], 403);
        }
        return hydrateRow($existing);
    }

    $defaultPerms = json_encode([
        'menus' => [
            'dashboard' => 'edit',
            'vendors' => 'edit',
            'orders' => 'edit',
            'vouchers' => 'edit',
            'bills' => 'edit',
            'inventory' => 'edit',
            'gst' => 'edit',
            'accounts' => 'edit',
            'backup' => 'edit',
            'setup' => 'edit',
        ],
        'options' => ['delete' => true, 'export' => true],
    ]);

    $ins = $pdo->prepare('INSERT INTO users (uid, email, name, role, active, perms, last_login) VALUES (?, ?, ?, "Admin", 1, ?, NOW())');
    $ins->execute([$claims['uid'], $claims['email'], $claims['name'], $defaultPerms]);
    $id = (int)$pdo->lastInsertId();
    $stmt2 = $pdo->prepare('SELECT * FROM users WHERE id = ?');
    $stmt2->execute([$id]);
    return hydrateRow($stmt2->fetch());
}
