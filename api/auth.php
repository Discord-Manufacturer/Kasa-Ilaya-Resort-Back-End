<?php

declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

$action = query_param('action', 'me');
$method = request_method();

function normalized_email(string $email): string
{
    return mb_strtolower(trim($email));
}

if (!function_exists('table_exists')) {
    function table_exists(string $table): bool
    {
        $stmt = db()->prepare("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = :table");
        $stmt->execute(['table' => $table]);
        return (bool) $stmt->fetchColumn();
    }
}

if (!function_exists('column_exists')) {
    function column_exists(string $table, string $column): bool
    {
        $stmt = db()->prepare("SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = :table AND column_name = :column");
        $stmt->execute(['table' => $table, 'column' => $column]);
        return (bool) $stmt->fetchColumn();
    }
}

function ensure_pending_registration_schema(): void
{
    $pdo = db();

    // Create pending_registrations table if it doesn't exist
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = :table");
    $stmt->execute(['table' => 'pending_registrations']);
    $exists = (int) $stmt->fetchColumn() > 0;

    if (!$exists) {
        $sql = "CREATE TABLE IF NOT EXISTS pending_registrations (
            id VARCHAR(64) NOT NULL PRIMARY KEY,
            created_date DATETIME NULL,
            updated_date DATETIME NULL,
            email VARCHAR(255) NULL,
            full_name VARCHAR(255) NULL,
            phone VARCHAR(50) NULL,
            password_hash TEXT NULL,
            role VARCHAR(50) NULL,
            app_id VARCHAR(100) NULL,
            app_role VARCHAR(50) NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;";
        try {
            $pdo->exec($sql);
        } catch (Throwable $e) {
            // ignore creation errors; operations below will handle missing schema gracefully
        }
    }

    // Add pending_registration_id column to registration_otps if missing
    $colStmt = $pdo->prepare("SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = :table AND column_name = :column");
    $colStmt->execute(['table' => 'registration_otps', 'column' => 'pending_registration_id']);
    $colExists = (int) $colStmt->fetchColumn() > 0;

    if (!$colExists) {
        try {
            $pdo->exec('ALTER TABLE registration_otps ADD COLUMN pending_registration_id VARCHAR(64) NULL');
        } catch (Throwable $e) {
            // ignore - older MySQL may not support IF NOT EXISTS on column add
        }
    }
}

function validate_password_rule(string $password): void
{
    $settings = security_settings();
    $minLength = max(6, (int) ($settings['min_password_length'] ?? 8));

    if (mb_strlen($password) < $minLength) {
        json_error('Password must be at least ' . $minLength . ' characters long.', 422);
    }

    if (!empty($settings['require_strong_password'])) {
        $hasUpper = preg_match('/[A-Z]/', $password) === 1;
        $hasLower = preg_match('/[a-z]/', $password) === 1;
        $hasNumber = preg_match('/\d/', $password) === 1;
        $hasSymbol = preg_match('/[^A-Za-z\d]/', $password) === 1;

        if (!$hasUpper || !$hasLower || !$hasNumber || !$hasSymbol) {
            json_error('Password must include uppercase, lowercase, number, and special character.', 422);
        }
    }
}

function validate_email_rule(string $email): void
{
    if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        json_error('Please provide a valid email address.', 422);
    }
}

function build_full_name_from_parts(string $firstName, string $middleName = '', string $lastName = ''): string
{
    return trim(implode(' ', array_values(array_filter([
        trim($firstName),
        trim($middleName),
        trim($lastName),
    ], static fn ($value) => $value !== ''))));
}

function start_authenticated_session(array $user): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        session_regenerate_id(true);
    }

    $_SESSION['user_id'] = $user['id'];
    $_SESSION['authenticated_at'] = time();
    $_SESSION['last_activity_at'] = time();
}

function destroy_authenticated_session(): void
{
    if (isset($_SESSION)) {
        $_SESSION = [];
    }

    if (ini_get('session.use_cookies')) {
        $params = session_get_cookie_params();
        @setcookie(session_name(), '', time() - 42000, '/');
        @setcookie(
            session_name(),
            '',
            time() - 42000,
            $params['path'] ?? '/',
            $params['domain'] ?? '',
            $params['secure'] ?? false,
            $params['httponly'] ?? true
        );

        if (!empty($_SERVER['HTTP_HOST'])) {
            @setcookie(session_name(), '', time() - 42000, $params['path'] ?? '/', $_SERVER['HTTP_HOST'], isset($_SERVER['HTTPS']), true);
        }

        if (isset($_COOKIE[session_name()])) {
            unset($_COOKIE[session_name()]);
        }
    }

    @session_destroy();
}

function record_failed_login_attempt(array $user): void
{
    $settings = security_settings();
    $maxAttempts = max(1, (int) ($settings['max_login_attempts'] ?? 5));
    $lockoutMinutes = max(1, (int) ($settings['lockout_minutes'] ?? 15));
    $nextAttempts = ((int) ($user['failed_login_attempts'] ?? 0)) + 1;
    $lockoutUntil = null;

    if ($nextAttempts >= $maxAttempts) {
        $nextAttempts = 0;
        $lockoutUntil = (new DateTimeImmutable('+' . $lockoutMinutes . ' minutes'))->format('Y-m-d H:i:s');
    }

    $statement = db()->prepare(
        'UPDATE users
         SET failed_login_attempts = :failed_login_attempts,
             lockout_until = :lockout_until,
             updated_date = :updated_date
         WHERE id = :id'
    );
    $statement->execute([
        'id' => $user['id'],
        'failed_login_attempts' => $nextAttempts,
        'lockout_until' => $lockoutUntil,
        'updated_date' => now_mysql(),
    ]);
}

function clear_login_protection_state(string $userId): void
{
    $statement = db()->prepare(
        'UPDATE users
         SET failed_login_attempts = 0,
             lockout_until = NULL,
             last_login_at = :last_login_at,
             updated_date = :updated_date
         WHERE id = :id'
    );
    $statement->execute([
        'id' => $userId,
        'last_login_at' => now_mysql(),
        'updated_date' => now_mysql(),
    ]);
}

function reset_login_protection_state(string $userId): void
{
    $statement = db()->prepare(
        'UPDATE users
         SET failed_login_attempts = 0,
             lockout_until = NULL,
             updated_date = :updated_date
         WHERE id = :id'
    );
    $statement->execute([
        'id' => $userId,
        'updated_date' => now_mysql(),
    ]);
}

function ensure_user_not_locked(array $user): void
{
    $lockoutUntil = trim((string) ($user['lockout_until'] ?? ''));

    if ($lockoutUntil === '') {
        return;
    }

    $lockoutTimestamp = strtotime($lockoutUntil);
    if ($lockoutTimestamp === false) {
        return;
    }

    if ($lockoutTimestamp <= time()) {
        $statement = db()->prepare('UPDATE users SET lockout_until = NULL, failed_login_attempts = 0, updated_date = :updated_date WHERE id = :id');
        $statement->execute([
            'id' => $user['id'],
            'updated_date' => now_mysql(),
        ]);
        return;
    }

    $remainingMinutes = max(1, (int) ceil(($lockoutTimestamp - time()) / 60));
    json_error('Too many failed login attempts. Try again in ' . $remainingMinutes . ' minute(s).', 423, [
        'code' => 'account_locked',
        'locked_until' => $lockoutUntil,
    ]);
}

function send_login_notification(array $user): void
{
    $settings = security_settings();
    if (empty($settings['enable_login_notifications'])) {
        return;
    }

    $ipAddress = trim((string) ($_SERVER['REMOTE_ADDR'] ?? 'Unknown IP'));
    $userAgent = trim((string) ($_SERVER['HTTP_USER_AGENT'] ?? 'Unknown device'));
    $timestamp = (new DateTimeImmutable('now', new DateTimeZone('Asia/Manila')))->format('F j, Y g:i A');

    try {
        send_app_email(
            (string) $user['email'],
            'New sign-in to your Kasa Ilaya account',
            '<p>Hello ' . htmlspecialchars((string) ($user['full_name'] ?? 'Guest'), ENT_QUOTES | ENT_HTML5, 'UTF-8') . ',</p>'
            . '<p>Your account signed in successfully.</p>'
            . '<p><strong>Time:</strong> ' . htmlspecialchars($timestamp, ENT_QUOTES | ENT_HTML5, 'UTF-8') . '<br>'
            . '<strong>IP Address:</strong> ' . htmlspecialchars($ipAddress, ENT_QUOTES | ENT_HTML5, 'UTF-8') . '<br>'
            . '<strong>Device:</strong> ' . htmlspecialchars($userAgent, ENT_QUOTES | ENT_HTML5, 'UTF-8') . '</p>'
            . '<p>If this was not you, change your password immediately.</p>'
        );
    } catch (Throwable $exception) {
    }
}

function google_client_id(): string
{
    return trim((string) (app_config()['google']['client_id'] ?? ''));
}

function fetch_remote_json(string $url): array
{
    $response = null;

    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 10,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_HTTPHEADER => ['Accept: application/json'],
        ]);
        $response = curl_exec($ch);
        $statusCode = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);

        if ($response === false || $statusCode >= 400) {
            throw new RuntimeException($curlError !== '' ? $curlError : 'Remote authentication request failed.');
        }
    } else {
        $context = stream_context_create([
            'http' => [
                'method' => 'GET',
                'timeout' => 10,
                'header' => "Accept: application/json\r\n",
            ],
        ]);

        $response = @file_get_contents($url, false, $context);
        if ($response === false) {
            throw new RuntimeException('Unable to contact the Google verification service.');
        }
    }

    $decoded = json_decode((string) $response, true);
    if (!is_array($decoded)) {
        throw new RuntimeException('Invalid response from Google verification service.');
    }

    return $decoded;
}

function verify_google_id_token(string $credential): array
{
    $clientId = google_client_id();
    if ($clientId === '') {
        throw new RuntimeException('Google sign-in is not configured.');
    }

    $payload = fetch_remote_json('https://oauth2.googleapis.com/tokeninfo?id_token=' . urlencode($credential));

    if (($payload['aud'] ?? '') !== $clientId) {
        throw new RuntimeException('Google token audience is invalid.');
    }

    $issuer = (string) ($payload['iss'] ?? '');
    if (!in_array($issuer, ['accounts.google.com', 'https://accounts.google.com'], true)) {
        throw new RuntimeException('Google token issuer is invalid.');
    }

    $email = normalized_email((string) ($payload['email'] ?? ''));
    if ($email === '' || ($payload['email_verified'] ?? '') !== 'true') {
        throw new RuntimeException('Google account email is not verified.');
    }

    return $payload;
}

function temporary_registration_otp(): string
{
    $config = app_config();
    return trim((string) ($config['registration']['temporary_verification_code'] ?? ''));
}

function send_registration_otp_email(
    string $email,
    string $recipientName,
    ?string $userId = null,
    ?string $pendingRegistrationId = null,
    string $ignoreMessage = 'If you did not request this, you can ignore this email.'
): array {
    if ($userId === null && $pendingRegistrationId === null) {
        throw new InvalidArgumentException('A user or pending registration is required to send an OTP.');
    }

    if ($pendingRegistrationId !== null) {
        ensure_pending_registration_schema();
    }

    if ($userId !== null) {
        $invalidate = db()->prepare('UPDATE registration_otps SET used_at = :used_at WHERE user_id = :user_id AND used_at IS NULL');
        $invalidate->execute([
            'user_id' => $userId,
            'used_at' => now_mysql(),
        ]);
    }

    if ($pendingRegistrationId !== null) {
        $invalidate = db()->prepare('UPDATE registration_otps SET used_at = :used_at WHERE pending_registration_id = :pending_id AND used_at IS NULL');
        $invalidate->execute([
            'pending_id' => $pendingRegistrationId,
            'used_at' => now_mysql(),
        ]);
    }

    $otp = strval(random_int(100000, 999999));
    $otpHash = hash('sha256', $otp);
    $expiresAt = (new DateTimeImmutable('+10 minutes'))->format('Y-m-d H:i:s');

    if ($userId !== null) {
        $statement = db()->prepare(
            'INSERT INTO registration_otps (id, user_id, otp_hash, created_date, expires_at)
             VALUES (:id, :user_id, :otp_hash, :created_date, :expires_at)'
        );

        try {
            $statement->execute([
                'id' => create_id('regotp'),
                'user_id' => $userId,
                'otp_hash' => $otpHash,
                'created_date' => now_mysql(),
                'expires_at' => $expiresAt,
            ]);
        } catch (PDOException $e) {
            $fallback = db()->prepare('INSERT INTO registration_otps (id, otp_hash, created_date, expires_at) VALUES (:id, :otp_hash, :created_date, :expires_at)');
            $fallback->execute([
                'id' => create_id('regotp'),
                'otp_hash' => $otpHash,
                'created_date' => now_mysql(),
                'expires_at' => $expiresAt,
            ]);
        }
    }

    if ($pendingRegistrationId !== null) {
        $statement = db()->prepare(
            'INSERT INTO registration_otps (id, pending_registration_id, otp_hash, created_date, expires_at)
             VALUES (:id, :pending_id, :otp_hash, :created_date, :expires_at)'
        );

        try {
            $statement->execute([
                'id' => create_id('regotp'),
                'pending_id' => $pendingRegistrationId,
                'otp_hash' => $otpHash,
                'created_date' => now_mysql(),
                'expires_at' => $expiresAt,
            ]);
        } catch (PDOException $e) {
            $fallback = db()->prepare('INSERT INTO registration_otps (id, otp_hash, created_date, expires_at) VALUES (:id, :otp_hash, :created_date, :expires_at)');
            $fallback->execute([
                'id' => create_id('regotp'),
                'otp_hash' => $otpHash,
                'created_date' => now_mysql(),
                'expires_at' => $expiresAt,
            ]);
        }
    }

    $mailResult = send_app_email(
        $email,
        'Kasa Ilaya verification code',
        '<p>Hello ' . htmlspecialchars($recipientName !== '' ? $recipientName : 'Guest', ENT_QUOTES | ENT_HTML5, 'UTF-8') . ',</p>'
        . '<p>Your verification code is: <strong>' . htmlspecialchars($otp, ENT_QUOTES | ENT_HTML5, 'UTF-8') . '</strong>. It expires in 10 minutes.</p>'
        . '<p>' . htmlspecialchars($ignoreMessage, ENT_QUOTES | ENT_HTML5, 'UTF-8') . '</p>'
    );

    return [
        'mail_sent' => (bool) ($mailResult['sent'] ?? false),
        'mail_error' => $mailResult['error'] ?? null,
    ];
}

function registration_otp_matches(string $otp, string $otpHash): bool
{
    $temporaryOtp = temporary_registration_otp();

    if ($temporaryOtp !== '' && hash_equals($temporaryOtp, trim($otp))) {
        return true;
    }

    return hash_equals($otpHash, hash('sha256', $otp));
}

function load_reset_token_record(string $token): ?array
{
    $statement = db()->prepare(
        'SELECT prt.*, u.email, u.full_name FROM password_reset_tokens prt INNER JOIN users u ON u.id = prt.user_id WHERE prt.token_hash = :token_hash LIMIT 1'
    );
    $statement->execute(['token_hash' => hash('sha256', $token)]);
    $record = $statement->fetch();
    return $record ?: null;
}

try {
    if ($action === 'google-config' && $method === 'GET') {
        $clientId = google_client_id();

        json_response([
            'enabled' => $clientId !== '',
            'client_id' => $clientId !== '' ? $clientId : null,
        ]);
    }

    if ($action === 'me' && $method === 'GET') {
        $user = current_user();

        if ($user === null) {
            json_error('Not authenticated.', 401);
        }

        json_response($user);
    }

    if ($action === 'login' && $method === 'POST') {
        $payload = request_body();
        $nextUrl = (string) ($payload['next_url'] ?? '/');
        $email = normalized_email((string) ($payload['email'] ?? ''));
        $password = (string) ($payload['password'] ?? '');

        if ($email === '' || $password === '') {
            json_error('Email and password are required.', 422);
        }

        validate_email_rule($email);

        $user = find_user_by_email($email);

        if ($user) {
            ensure_user_not_locked($user);
        }

        if (!$user || empty($user['password_hash']) || !password_verify($password, (string) $user['password_hash'])) {
            if ($user) {
                record_failed_login_attempt($user);
            }
            json_error('Invalid email or password.', 401);
        }

        if ((int) ($user['is_verified'] ?? 0) !== 1) {
            json_error('Please verify your email address before signing in.', 403, [
                'code' => 'email_not_verified',
            ]);
        }

        if ((int) $user['disabled'] === 1) {
            json_error('This account is disabled.', 403);
        }

        clear_login_protection_state((string) $user['id']);
        start_authenticated_session($user);
        send_login_notification($user);
        json_response([
            'success' => true,
            'next_url' => $nextUrl,
            'user' => current_user(),
        ]);
    }

    if ($action === 'register' && $method === 'POST') {
        $payload = request_body();
        $firstName = trim((string) ($payload['first_name'] ?? ''));
        $middleName = trim((string) ($payload['middle_name'] ?? ''));
        $lastName = trim((string) ($payload['last_name'] ?? ''));
        $fullName = trim((string) ($payload['full_name'] ?? ''));
        $email = normalized_email((string) ($payload['email'] ?? ''));
        $phone = trim((string) ($payload['phone'] ?? ''));
        $password = (string) ($payload['password'] ?? '');
        $nextUrl = (string) ($payload['next_url'] ?? '/');

        if ($fullName === '') {
            $fullName = build_full_name_from_parts($firstName, $middleName, $lastName);
        }

        if ($fullName === '' || $email === '' || $password === '') {
            json_error('Full name, email, and password are required.', 422);
        }

        validate_email_rule($email);
        validate_password_rule($password);

        if (find_user_by_email($email)) {
            json_error('An account with that email already exists.', 409);
        }

        // If a pending registration already exists for this email, update it and return pending
        ensure_pending_registration_schema();
        $pendingCheck = db()->prepare('SELECT * FROM pending_registrations WHERE email = :email LIMIT 1');
        $pendingCheck->execute(['email' => $email]);
        $existingPending = $pendingCheck->fetch();

        $now = now_mysql();

        if ($existingPending) {
            // Update existing pending registration with latest details
            $update = db()->prepare('UPDATE pending_registrations SET full_name = :full_name, phone = :phone, password_hash = :password_hash, updated_date = :updated_date WHERE id = :id');
            $update->execute([
                'id' => $existingPending['id'],
                'full_name' => $fullName,
                'phone' => $phone !== '' ? $phone : null,
                'password_hash' => password_hash($password, PASSWORD_DEFAULT),
                'updated_date' => $now,
            ]);

            $mailStatus = send_registration_otp_email(
                $email,
                (string) ($existingPending['full_name'] ?? $fullName),
                null,
                (string) $existingPending['id'],
                'If you did not create this account, you can ignore this email.'
            );

            json_response([
                'success' => true,
                'next_url' => $nextUrl,
                'pending' => true,
                'email' => $email,
                'mail_sent' => $mailStatus['mail_sent'],
                'mail_error' => $mailStatus['mail_error'],
            ], 200);
        }

        // Create a pending registration instead of a user until email verification completes
        $pendingId = create_id('pending');

        $statement = db()->prepare(
            'INSERT INTO pending_registrations (id, created_date, updated_date, email, full_name, phone, password_hash, role, app_id, app_role)
             VALUES (:id, :created_date, :updated_date, :email, :full_name, :phone, :password_hash, :role, :app_id, :app_role)'
        );
        $statement->execute([
            'id' => $pendingId,
            'created_date' => $now,
            'updated_date' => $now,
            'email' => $email,
            'full_name' => $fullName,
            'phone' => $phone !== '' ? $phone : null,
            'password_hash' => password_hash($password, PASSWORD_DEFAULT),
            'role' => 'guest',
            'app_id' => 'local-kasa-ilaya',
            'app_role' => 'guest',
        ]);

        $mailStatus = send_registration_otp_email(
            $email,
            $fullName,
            null,
            $pendingId,
            'If you did not create this account, you can ignore this email.'
        );

        json_response([
            'success' => true,
            'next_url' => $nextUrl,
            'pending' => true,
            'email' => $email,
            'mail_sent' => $mailStatus['mail_sent'],
            'mail_error' => $mailStatus['mail_error'],
        ], 201);
    }

    if ($action === 'google-login' && $method === 'POST') {
        $payload = request_body();
        $credential = trim((string) ($payload['credential'] ?? ''));
        $nextUrl = (string) ($payload['next_url'] ?? '/');

        if ($credential === '') {
            json_error('Google credential is required.', 422);
        }

        try {
            $googleUser = verify_google_id_token($credential);
        } catch (Throwable $error) {
            json_error($error->getMessage(), 401);
        }

        $email = normalized_email((string) ($googleUser['email'] ?? ''));
        $user = find_user_by_email($email);

        if ($user) {
            ensure_user_not_locked($user);
        }

        if ($user && (int) ($user['disabled'] ?? 0) === 1) {
            json_error('This account is disabled.', 403);
        }

        if (!$user) {
            $name = trim((string) ($googleUser['name'] ?? ''));
            $givenName = trim((string) ($googleUser['given_name'] ?? ''));
            $familyName = trim((string) ($googleUser['family_name'] ?? ''));
            $fullName = $name !== '' ? $name : build_full_name_from_parts($givenName, '', $familyName);

            if ($fullName === '') {
                $fullName = strstr($email, '@', true) ?: 'Google User';
            }

            $createUser = db()->prepare(
                'INSERT INTO users (id, created_date, updated_date, email, full_name, phone, role, password_hash, disabled, is_verified, app_id, is_service, app_role)
                 VALUES (:id, :created_date, :updated_date, :email, :full_name, :phone, :role, :password_hash, :disabled, :is_verified, :app_id, :is_service, :app_role)'
            );
            $createUser->execute([
                'id' => create_id('user'),
                'created_date' => now_mysql(),
                'updated_date' => now_mysql(),
                'email' => $email,
                'full_name' => $fullName,
                'phone' => null,
                'role' => 'guest',
                'password_hash' => null,
                'disabled' => 0,
                'is_verified' => 1,
                'app_id' => 'local-kasa-ilaya',
                'is_service' => 0,
                'app_role' => 'guest',
            ]);
        } else {
            if ((int) ($user['is_verified'] ?? 0) !== 1) {
                $updateUser = db()->prepare('UPDATE users SET is_verified = 1, updated_date = :updated_date WHERE id = :id');
                $updateUser->execute([
                    'id' => $user['id'],
                    'updated_date' => now_mysql(),
                ]);
            }
        }

        $user = find_user_by_email($email);
        if (!$user) {
            json_error('Unable to complete Google sign-in.', 500);
        }

        clear_login_protection_state((string) $user['id']);
        start_authenticated_session($user);
        send_login_notification($user);
        json_response([
            'success' => true,
            'next_url' => $nextUrl,
            'user' => current_user(),
        ]);
    }

    if ($action === 'send-registration-otp' && $method === 'POST') {
        $payload = request_body();
        $email = normalized_email((string) ($payload['email'] ?? ''));

        if ($email === '') {
            json_error('Email is required.', 422);
        }

        // Try existing verified user
        $user = find_user_by_email($email);
        if ($user) {
            if ((int) $user['is_verified'] === 1) {
                json_response(['success' => true, 'message' => 'Account already verified.']);
            }

            $mailStatus = send_registration_otp_email(
                $email,
                (string) ($user['full_name'] ?? 'Guest'),
                (string) $user['id']
            );

            json_response([
                'success' => true,
                'mail_sent' => $mailStatus['mail_sent'],
                'mail_error' => $mailStatus['mail_error'],
            ]);
        }

        // Look for a pending registration
        // Ensure DB schema for pending registrations / otps exists (in case migrations weren't run)
        ensure_pending_registration_schema();

        $pendingStmt = db()->prepare('SELECT * FROM pending_registrations WHERE email = :email LIMIT 1');
        $pendingStmt->execute(['email' => $email]);
        $pending = $pendingStmt->fetch();

        if (!$pending) {
            json_error('No pending registration found for this email. Please register first.', 404);
        }

        $mailStatus = send_registration_otp_email(
            $email,
            (string) ($pending['full_name'] ?? 'Guest'),
            null,
            (string) $pending['id'],
            'If you did not create this account, you can ignore this email.'
        );

        json_response([
            'success' => true,
            'mail_sent' => $mailStatus['mail_sent'],
            'mail_error' => $mailStatus['mail_error'],
        ]);
    }

    // Debug helper: inspect pending registration and OTPs for an email
    if ($action === 'inspect-pending' && $method === 'GET') {
        $email = normalized_email((string) query_param('email', ''));
        if ($email === '') {
            json_error('Email is required.', 422);
        }

        ensure_pending_registration_schema();

        $pendingStmt = db()->prepare('SELECT * FROM pending_registrations WHERE email = :email');
        $pendingStmt->execute(['email' => $email]);
        $pendings = $pendingStmt->fetchAll();

        $otpStmt = db()->prepare('SELECT * FROM registration_otps WHERE user_id IN (SELECT id FROM users WHERE email = :email) OR pending_registration_id IN (SELECT id FROM pending_registrations WHERE email = :email) ORDER BY created_date DESC');
        $otpStmt->execute(['email' => $email]);
        $otps = $otpStmt->fetchAll();

        json_response(['pendings' => $pendings ?: [], 'otps' => $otps ?: []]);
    }

    // Debug: return recent mail_logs for an email (or global recent if none provided)
    if ($action === 'mail-logs' && $method === 'GET') {
        $email = normalized_email((string) query_param('email', ''));
        $pdo = db();

        if ($email !== '') {
            $stmt = $pdo->prepare('SELECT * FROM mail_logs WHERE to_email = :email ORDER BY sent_at DESC LIMIT 50');
            $stmt->execute(['email' => $email]);
            $rows = $stmt->fetchAll();
            json_response(['logs' => $rows]);
        }

        $stmt = $pdo->prepare('SELECT * FROM mail_logs ORDER BY sent_at DESC LIMIT 50');
        $stmt->execute();
        $rows = $stmt->fetchAll();
        json_response(['logs' => $rows]);
    }

    // Send a test email to verify SMTP is working
    if ($action === 'send-test-email' && in_array($method, ['GET', 'POST'], true)) {
        $email = normalized_email((string) query_param('email', ''));
        if ($email === '') {
            json_error('Email is required.', 422);
        }

        $subject = 'Kasa Ilaya - Test email';
        $body = '<p>This is a test email from Kasa Ilaya. If you receive this, SMTP is configured correctly.</p>';

        try {
            $result = send_app_email($email, $subject, $body);
            json_response(['success' => true, 'result' => $result]);
        } catch (Throwable $e) {
            json_error('Failed to send test email: ' . $e->getMessage(), 500);
        }
    }

    // Temporary endpoint to apply pending registration schema migration
    if ($action === 'apply-pending-migration' && in_array($method, ['GET', 'POST'], true)) {
        try {
            ensure_pending_registration_schema();
            json_response(['success' => true, 'message' => 'Pending registration schema ensured.']);
        } catch (Throwable $e) {
            json_error('Failed to apply migration: ' . $e->getMessage(), 500);
        }
    }

    // Repair foreign keys on registration_otps to avoid strict FK failures for orphaned OTPs
    if ($action === 'repair-registration-otps-fk' && in_array($method, ['GET', 'POST'], true)) {
        $pdo = db();
        try {
            // Attempt to drop existing FKs if they exist
            try {
                $pdo->exec('ALTER TABLE registration_otps DROP FOREIGN KEY fk_registration_otp_user');
            } catch (Throwable $e) {
                // ignore if not exists
            }

            try {
                $pdo->exec('ALTER TABLE registration_otps DROP FOREIGN KEY fk_registration_otp_pending');
            } catch (Throwable $e) {
                // ignore if not exists
            }

            // Recreate constraints with ON DELETE SET NULL to avoid blocking inserts when parents are removed
            try {
                $pdo->exec('ALTER TABLE registration_otps ADD CONSTRAINT fk_registration_otp_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE');
            } catch (Throwable $e) {
                // ignore if cannot add
            }

            try {
                $pdo->exec('ALTER TABLE registration_otps ADD CONSTRAINT fk_registration_otp_pending FOREIGN KEY (pending_registration_id) REFERENCES pending_registrations(id) ON DELETE SET NULL ON UPDATE CASCADE');
            } catch (Throwable $e) {
                // ignore if cannot add
            }

            json_response(['success' => true, 'message' => 'Repaired registration_otps foreign keys (set ON DELETE SET NULL).']);
        } catch (Throwable $e) {
            json_error('Failed to repair foreign keys: ' . $e->getMessage(), 500);
        }
    }

    if ($action === 'verify-registration-otp' && $method === 'POST') {
        $payload = request_body();
        $email = normalized_email((string) ($payload['email'] ?? ''));
        $otp = (string) ($payload['otp'] ?? '');

        if ($email === '' || $otp === '') {
            json_error('Email and OTP are required.', 422);
        }

        // First try to find an OTP for a verified user
        $user = find_user_by_email($email);
        $record = null;

        if ($user) {
            $statement = db()->prepare('SELECT * FROM registration_otps WHERE user_id = :user_id AND used_at IS NULL ORDER BY created_date DESC LIMIT 1');
            $statement->execute(['user_id' => $user['id']]);
            $record = $statement->fetch();

            if ($record) {
                if (strtotime((string) $record['expires_at']) < time()) {
                    json_error('The verification code has expired. Please request a new one.', 400);
                }
                if (!registration_otp_matches($otp, (string) $record['otp_hash'])) {
                    json_error('Invalid verification code.', 401);
                }

                $consume = db()->prepare('UPDATE registration_otps SET used_at = :used_at WHERE id = :id');
                $consume->execute([
                    'id' => $record['id'],
                    'used_at' => now_mysql(),
                ]);

                $updateUser = db()->prepare('UPDATE users SET is_verified = 1, updated_date = :updated_date WHERE id = :id');
                $updateUser->execute([
                    'id' => $user['id'],
                    'updated_date' => now_mysql(),
                ]);

                json_response(['success' => true]);
            }
        }

        // Otherwise, check pending registrations
        // Ensure DB schema for pending registrations/otps exists
        ensure_pending_registration_schema();

        $pendingStmt = db()->prepare('SELECT * FROM pending_registrations WHERE email = :email LIMIT 1');
        $pendingStmt->execute(['email' => $email]);
        $pending = $pendingStmt->fetch();

        if (!$pending) {
            json_error('No registration or account found for this email.', 404);
        }

        $otpStmt = db()->prepare('SELECT * FROM registration_otps WHERE pending_registration_id = :pending_id AND used_at IS NULL ORDER BY created_date DESC LIMIT 1');
        $otpStmt->execute(['pending_id' => $pending['id']]);
        $record = $otpStmt->fetch();

        if (!$record) {
            json_error('No active verification code found. Please request a new one.', 404);
        }

        if (strtotime((string) $record['expires_at']) < time()) {
            json_error('The verification code has expired. Please request a new one.', 400);
        }

        if (!registration_otp_matches($otp, (string) $record['otp_hash'])) {
            json_error('Invalid verification code.', 401);
        }

        // Consume OTP
        $consume = db()->prepare('UPDATE registration_otps SET used_at = :used_at WHERE id = :id');
        $consume->execute([
            'id' => $record['id'],
            'used_at' => now_mysql(),
        ]);

        // Create the real user from pending registration
        $now = now_mysql();
        $newId = create_id('user');
        $createUser = db()->prepare(
            'INSERT INTO users (id, created_date, updated_date, email, full_name, phone, role, password_hash, disabled, is_verified, app_id, is_service, app_role)
             VALUES (:id, :created_date, :updated_date, :email, :full_name, :phone, :role, :password_hash, :disabled, :is_verified, :app_id, :is_service, :app_role)'
        );
        $createUser->execute([
            'id' => $newId,
            'created_date' => $now,
            'updated_date' => $now,
            'email' => $pending['email'],
            'full_name' => $pending['full_name'],
            'phone' => $pending['phone'],
            'role' => $pending['role'] ?? 'guest',
            'password_hash' => $pending['password_hash'],
            'disabled' => 0,
            'is_verified' => 1,
            'app_id' => $pending['app_id'] ?? 'local-kasa-ilaya',
            'is_service' => 0,
            'app_role' => $pending['app_role'] ?? 'guest',
        ]);

        // Optionally remove pending registration (or keep for audit)
        $delPending = db()->prepare('DELETE FROM pending_registrations WHERE id = :id');
        $delPending->execute(['id' => $pending['id']]);

        json_response(['success' => true]);
    }

    if ($action === 'logout' && $method === 'POST') {
        $payload = request_body();
        $redirectUrl = (string) ($payload['redirect_url'] ?? '/');
        destroy_authenticated_session();
        json_response([
            'success' => true,
            'redirect_url' => $redirectUrl,
        ]);
    }

    if ($action === 'update-me' && in_array($method, ['PATCH', 'PUT'], true)) {
        $user = current_user();
        if ($user === null) {
            json_error('Not authenticated.', 401);
        }

        $payload = request_body();
        $fields = [];
        $params = ['id' => $user['id']];

        foreach (['full_name', 'email', 'phone'] as $field) {
            if (array_key_exists($field, $payload)) {
                $fields[] = $field . ' = :' . $field;
                $params[$field] = $field === 'email'
                    ? normalized_email((string) $payload[$field])
                    : ((string) $payload[$field] !== '' ? (string) $payload[$field] : null);
            }
        }

        if (isset($params['email'])) {
            $otherUser = find_user_by_email((string) $params['email']);
            if ($otherUser && $otherUser['id'] !== $user['id']) {
                json_error('That email address is already in use.', 409);
            }
        }

        if (empty($fields)) {
            json_response($user);
        }

        $fields[] = 'updated_date = :updated_date';
        $params['updated_date'] = now_mysql();

        $sql = 'UPDATE users SET ' . implode(', ', $fields) . ' WHERE id = :id';
        $statement = db()->prepare($sql);
        $statement->execute($params);

        json_response(current_user());
    }

    if ($action === 'change-password' && $method === 'POST') {
        $user = current_user();
        if ($user === null) {
            json_error('Not authenticated.', 401);
        }

        $payload = request_body();
        $currentPassword = (string) ($payload['current_password'] ?? '');
        $newPassword = (string) ($payload['new_password'] ?? '');

        validate_password_rule($newPassword);

        $dbUser = find_user_by_email($user['email']);
        if (!$dbUser || empty($dbUser['password_hash']) || !password_verify($currentPassword, (string) $dbUser['password_hash'])) {
            json_error('Current password is incorrect.', 401);
        }

        $statement = db()->prepare('UPDATE users SET password_hash = :password_hash, updated_date = :updated_date WHERE id = :id');
        $statement->execute([
            'id' => $user['id'],
            'password_hash' => password_hash($newPassword, PASSWORD_DEFAULT),
            'updated_date' => now_mysql(),
        ]);

        reset_login_protection_state((string) $user['id']);

        json_response(['success' => true]);
    }

    if ($action === 'forgot-password' && $method === 'POST') {
        $payload = request_body();
        $email = normalized_email((string) ($payload['email'] ?? ''));
        $resetPageUrl = trim((string) ($payload['reset_page_url'] ?? ''));

        if ($email === '') {
            json_error('Email is required.', 422);
        }

        $user = find_user_by_email($email);
        if ($user) {
            $token = bin2hex(random_bytes(24));
            $expiresAt = (new DateTimeImmutable('+1 hour'))->format('Y-m-d H:i:s');

            $invalidate = db()->prepare('UPDATE password_reset_tokens SET used_at = :used_at WHERE user_id = :user_id AND used_at IS NULL');
            $invalidate->execute([
                'user_id' => $user['id'],
                'used_at' => now_mysql(),
            ]);

            $statement = db()->prepare(
                'INSERT INTO password_reset_tokens (id, user_id, token_hash, created_date, expires_at, used_at)
                 VALUES (:id, :user_id, :token_hash, :created_date, :expires_at, NULL)'
            );
            $statement->execute([
                'id' => create_id('reset'),
                'user_id' => $user['id'],
                'token_hash' => hash('sha256', $token),
                'created_date' => now_mysql(),
                'expires_at' => $expiresAt,
            ]);

            $baseResetUrl = $resetPageUrl !== '' ? $resetPageUrl : frontend_base_url() . '/ResetPassword';
            $separator = str_contains($baseResetUrl, '?') ? '&' : '?';
            $resetUrl = $baseResetUrl . $separator . 'token=' . urlencode($token);

            $mailResult = send_app_email(
                $email,
                'Reset your Kasa Ilaya password',
                '<p>Hello ' . htmlspecialchars((string) ($user['full_name'] ?? 'Guest'), ENT_QUOTES | ENT_HTML5, 'UTF-8') . ',</p>'
                . '<p>Use the link below to reset your Kasa Ilaya password. This link expires in 1 hour.</p>'
                . '<p><a href="' . htmlspecialchars($resetUrl, ENT_QUOTES | ENT_HTML5, 'UTF-8') . '">' . htmlspecialchars($resetUrl, ENT_QUOTES | ENT_HTML5, 'UTF-8') . '</a></p>'
                . '<p>If you did not request this change, you can ignore this email.</p>'
            );

            json_response([
                'success' => true,
                'message' => 'If the email exists, a reset link has been generated.',
                'reset_url' => $resetUrl,
                'mail_sent' => (bool) ($mailResult['sent'] ?? false),
                'mail_error' => $mailResult['error'] ?? null,
            ]);
        }

        json_response([
            'success' => true,
            'message' => 'If the email exists, a reset link has been generated.',
        ]);
    }

    if ($action === 'validate-reset-token' && $method === 'GET') {
        $token = (string) query_param('token', '');
        if ($token === '') {
            json_error('Reset token is required.', 422);
        }

        $record = load_reset_token_record($token);
        if (!$record || !empty($record['used_at']) || strtotime((string) $record['expires_at']) < time()) {
            json_error('This reset link is invalid or expired.', 404);
        }

        json_response([
            'valid' => true,
            'email' => $record['email'],
            'full_name' => $record['full_name'],
        ]);
    }

    if ($action === 'reset-password' && $method === 'POST') {
        $payload = request_body();
        $token = (string) ($payload['token'] ?? '');
        $newPassword = (string) ($payload['new_password'] ?? '');

        if ($token === '') {
            json_error('Reset token is required.', 422);
        }

        validate_password_rule($newPassword);

        $record = load_reset_token_record($token);
        if (!$record || !empty($record['used_at']) || strtotime((string) $record['expires_at']) < time()) {
            json_error('This reset link is invalid or expired.', 404);
        }

        $updateUser = db()->prepare('UPDATE users SET password_hash = :password_hash, updated_date = :updated_date WHERE id = :id');
        $updateUser->execute([
            'id' => $record['user_id'],
            'password_hash' => password_hash($newPassword, PASSWORD_DEFAULT),
            'updated_date' => now_mysql(),
        ]);

        reset_login_protection_state((string) $record['user_id']);

        $consumeToken = db()->prepare('UPDATE password_reset_tokens SET used_at = :used_at WHERE id = :id');
        $consumeToken->execute([
            'id' => $record['id'],
            'used_at' => now_mysql(),
        ]);

        json_response(['success' => true]);
    }

    json_error('Unsupported auth action.', 405);
} catch (Throwable $error) {
    json_error($error->getMessage(), 500);
}
