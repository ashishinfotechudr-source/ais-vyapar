<?php

require_once __DIR__ . '/db.php';

function base64UrlEncode(string $input): string {
    return rtrim(strtr(base64_encode($input), '+/', '-_'), '=');
}

function base64UrlDecode(string $input): string {
    $remainder = strlen($input) % 4;
    if ($remainder) {
        $input .= str_repeat('=', 4 - $remainder);
    }
    return base64_decode(strtr($input, '-_', '+/')) ?: '';
}

function getAuthSecret(): string {
    $secret = defined('AUTH_SECRET') ? (string)AUTH_SECRET : '';
    if ($secret === '' || $secret === 'REPLACE_WITH_RANDOM_64_CHAR_HEX_SECRET') {
        // Fallback derived deterministically from DB credentials if user has not rotated AUTH_SECRET yet
        return hash('sha256', DB_HOST . '|' . DB_NAME . '|' . DB_USER . '|' . __FILE__);
    }
    return $secret;
}

function sanitizeUserRow(?array $row): ?array {
    if ($row === null) {
        return null;
    }
    unset($row['password_hash'], $row['passwordHash']);
    return $row;
}

function issueSessionToken(array $user): string {
    $now = time();
    $header = base64UrlEncode(json_encode(['alg' => 'HS256', 'typ' => 'JWT']));
    $payload = base64UrlEncode(json_encode([
        'sub' => $user['uid'],
        'email' => $user['email'],
        'username' => $user['username'] ?? $user['name'] ?? '',
        'role' => $user['role'] ?? 'Accountant',
        'iat' => $now,
        'exp' => $now + 86400,
    ]));
    $sig = base64UrlEncode(hash_hmac('sha256', $header . '.' . $payload, getAuthSecret(), true));
    return $header . '.' . $payload . '.' . $sig;
}

function verifySessionToken(string $token): array {
    $parts = explode('.', $token);
    if (count($parts) !== 3) {
        throw new Exception('Malformed session token.');
    }
    [$headerB64, $payloadB64, $sigB64] = $parts;
    $expectedSig = base64UrlEncode(hash_hmac('sha256', $headerB64 . '.' . $payloadB64, getAuthSecret(), true));
    if (!hash_equals($expectedSig, $sigB64)) {
        throw new Exception('Invalid session signature.');
    }
    $payload = json_decode(base64UrlDecode($payloadB64), true);
    if (!is_array($payload) || empty($payload['sub'])) {
        throw new Exception('Invalid session payload.');
    }
    if ((int)($payload['exp'] ?? 0) < time()) {
        throw new Exception('Session expired. Please sign in again.');
    }
    return $payload;
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

function defaultPermsForRole(string $role): string {
    if ($role === 'Admin') {
        return json_encode([
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
    }
    return json_encode([
        'menus' => [
            'dashboard' => 'view',
            'vendors' => 'edit',
            'orders' => 'edit',
            'vouchers' => 'edit',
            'bills' => 'edit',
            'inventory' => 'edit',
            'gst' => 'view',
            'accounts' => 'view',
            'backup' => 'view',
            'setup' => 'none',
        ],
        'options' => ['delete' => false, 'export' => true],
    ]);
}

function signupWithCredentials(PDO $pdo, array $input): array {
    $username = trim((string)($input['username'] ?? ''));
    $email = strtolower(trim((string)($input['email'] ?? '')));
    $password = (string)($input['password'] ?? '');

    if (strlen($username) < 2) {
        jsonOut(['error' => 'Username must be at least 2 characters.'], 400);
    }
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        jsonOut(['error' => 'Please enter a valid Email ID.'], 400);
    }
    if (strlen($password) < 6) {
        jsonOut(['error' => 'Password must be at least 6 characters.'], 400);
    }

    $stEmail = $pdo->prepare('SELECT * FROM users WHERE LOWER(email) = ? LIMIT 1');
    $stEmail->execute([$email]);
    $existingEmail = $stEmail->fetch();
    if ($existingEmail && !empty($existingEmail['password_hash'])) {
        jsonOut(['error' => 'An account with this Email ID already exists. Duplicate Email ID is not allowed.'], 409);
    }

    $stUser = $pdo->prepare('SELECT id FROM users WHERE LOWER(username) = ? LIMIT 1');
    $stUser->execute([strtolower($username)]);
    $existingUsername = $stUser->fetch();
    if ($existingUsername && (!$existingEmail || (int)$existingUsername['id'] !== (int)$existingEmail['id'])) {
        jsonOut(['error' => 'This Username is already taken. Please choose another username.'], 409);
    }

    $passwordedCount = (int)$pdo->query('SELECT COUNT(*) FROM users WHERE password_hash IS NOT NULL')->fetchColumn();
    $isFirstAccount = ($passwordedCount === 0);
    $role = $isFirstAccount ? 'Admin' : 'Accountant';
    $perms = defaultPermsForRole($role);
    $pwHash = password_hash($password, PASSWORD_BCRYPT);

    if ($existingEmail && empty($existingEmail['password_hash'])) {
        $finalRole = $isFirstAccount ? 'Admin' : ($existingEmail['role'] ?: 'Accountant');
        $pdo->prepare('UPDATE users SET username = ?, name = ?, email = ?, password_hash = ?, role = ?, active = 1, perms = ?, last_login = NOW() WHERE id = ?')
            ->execute([$username, $username, $email, $pwHash, $finalRole, $perms, $existingEmail['id']]);
        $st = $pdo->prepare('SELECT * FROM users WHERE id = ? LIMIT 1');
        $st->execute([$existingEmail['id']]);
        return sanitizeUserRow(hydrateRow($st->fetch()));
    }

    $uid = 'usr_' . bin2hex(random_bytes(12));
    $pdo->prepare('INSERT INTO users (uid, username, email, name, password_hash, role, active, perms, last_login) VALUES (?, ?, ?, ?, ?, ?, 1, ?, NOW())')
        ->execute([$uid, $username, $email, $username, $pwHash, $role, $perms]);
    $id = (int)$pdo->lastInsertId();
    $st = $pdo->prepare('SELECT * FROM users WHERE id = ? LIMIT 1');
    $st->execute([$id]);
    return sanitizeUserRow(hydrateRow($st->fetch()));
}

function loginWithCredentials(PDO $pdo, array $input): array {
    $username = trim((string)($input['username'] ?? ''));
    $email = strtolower(trim((string)($input['email'] ?? '')));
    $password = (string)($input['password'] ?? '');

    if ($username === '' || $email === '' || $password === '') {
        jsonOut(['error' => 'Username, Email ID, and Password are required.'], 400);
    }

    $st = $pdo->prepare('SELECT * FROM users WHERE LOWER(email) = ? LIMIT 1');
    $st->execute([$email]);
    $row = $st->fetch();

    if (!$row || empty($row['password_hash'])) {
        jsonOut(['error' => 'Invalid username, email ID, or password.'], 401);
    }

    $storedUsername = strtolower(trim((string)($row['username'] ?: $row['name'] ?: '')));
    if ($storedUsername !== strtolower($username)) {
        jsonOut(['error' => 'Invalid username, email ID, or password.'], 401);
    }

    if (!password_verify($password, (string)$row['password_hash'])) {
        jsonOut(['error' => 'Invalid username, email ID, or password.'], 401);
    }

    if (empty($row['active'])) {
        jsonOut(['error' => 'Account is disabled. Contact the Administrator.'], 403);
    }

    $pdo->prepare('UPDATE users SET last_login = NOW() WHERE id = ?')->execute([$row['id']]);
    $st2 = $pdo->prepare('SELECT * FROM users WHERE id = ? LIMIT 1');
    $st2->execute([$row['id']]);
    return sanitizeUserRow(hydrateRow($st2->fetch()));
}

function requireAuthUser(): array {
    $token = getBearerToken();
    if (!$token) {
        jsonOut(['error' => 'Unauthorized: Missing session token'], 401);
    }

    try {
        $claims = verifySessionToken($token);
    } catch (Throwable $e) {
        jsonOut(['error' => 'Unauthorized: ' . $e->getMessage()], 401);
    }

    $pdo = getPdo();
    $stmt = $pdo->prepare('SELECT * FROM users WHERE uid = ? LIMIT 1');
    $stmt->execute([$claims['sub']]);
    $existing = $stmt->fetch();

    if (!$existing) {
        jsonOut(['error' => 'User account not found. Please sign in again.'], 401);
    }
    if (empty($existing['active'])) {
        jsonOut(['error' => 'Account disabled by administrator.'], 403);
    }

    return sanitizeUserRow(hydrateRow($existing));
}

function requireAdminUser(array $user): void {
    if (($user['role'] ?? '') !== 'Admin') {
        jsonOut(['error' => 'Administrator permissions required.'], 403);
    }
}
