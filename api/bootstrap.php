<?php

declare(strict_types=1);

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}

header('Content-Type: application/json; charset=utf-8');

function app_config(): array
{
    static $config = null;

    if ($config === null) {
        $config = require __DIR__ . '/config.php';
    }

    return $config;
}

function json_response($data, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function json_error(string $message, int $status = 400, array $extra = []): void
{
    json_response(array_merge(['error' => $message], $extra), $status);
}

function request_method(): string
{
    return strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
}

function request_body(): array
{
    static $body = null;

    if ($body !== null) {
        return $body;
    }

    $raw = file_get_contents('php://input');
    if (!$raw) {
        $body = [];
        return $body;
    }

    $decoded = json_decode($raw, true);
    $body = is_array($decoded) ? $decoded : [];
    return $body;
}

function query_param(string $key, $default = null)
{
    return $_GET[$key] ?? $default;
}

function request_scheme(): string
{
    if (!empty($_SERVER['HTTP_X_FORWARDED_PROTO'])) {
        return $_SERVER['HTTP_X_FORWARDED_PROTO'];
    }

    if (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') {
        return 'https';
    }

    return 'http';
}

function absolute_api_url(string $relativePath = ''): string
{
    $config = app_config();
    $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
    $path = rtrim($config['api_path'], '/');
    $suffix = $relativePath !== '' ? '/' . ltrim($relativePath, '/') : '';
    return request_scheme() . '://' . $host . $path . $suffix;
}

function frontend_base_url(): string
{
    $config = app_config();

    if (!empty($config['frontend_url'])) {
        return rtrim((string) $config['frontend_url'], '/');
    }

    $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
    $basePath = preg_replace('#/api/?$#', '', (string) ($config['api_path'] ?? ''));
    return request_scheme() . '://' . $host . rtrim((string) $basePath, '/');
}

function mysql_server_dsn(): string
{
    $db = app_config()['db'];
    return sprintf('mysql:host=%s;port=%s;charset=%s', $db['host'], $db['port'], $db['charset']);
}

function mysql_database_dsn(): string
{
    $db = app_config()['db'];
    return sprintf('mysql:host=%s;port=%s;dbname=%s;charset=%s', $db['host'], $db['port'], $db['name'], $db['charset']);
}

function new_pdo(string $dsn): PDO
{
    $db = app_config()['db'];

    return new PDO($dsn, $db['user'], $db['pass'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
}

function db(): PDO
{
    static $pdo = null;

    if ($pdo instanceof PDO) {
        return $pdo;
    }

    ensure_database();
    $pdo = new_pdo(mysql_database_dsn());
    ensure_schema($pdo);

    return $pdo;
}

function ensure_database(): void
{
    static $done = false;

    if ($done) {
        return;
    }

    $config = app_config();
    $pdo = new_pdo(mysql_server_dsn());
    $pdo->exec(sprintf(
        'CREATE DATABASE IF NOT EXISTS `%s` CHARACTER SET %s COLLATE %s_unicode_ci',
        $config['db']['name'],
        $config['db']['charset'],
        $config['db']['charset']
    ));

    $done = true;
}

function ensure_schema(PDO $pdo): void
{
    static $done = false;

    if ($done) {
        return;
    }

    $hasCoreSchema = table_is_ready($pdo, 'users')
        && table_is_ready($pdo, 'packages')
        && table_is_ready($pdo, 'activity_logs')
        && table_is_ready($pdo, 'site_settings');

    if (!$hasCoreSchema) {
        $schemaPath = dirname(__DIR__) . '/database_setup.sql';
        $schemaSql = file_get_contents($schemaPath);

        if ($schemaSql === false) {
            throw new RuntimeException('Unable to read database schema file.');
        }

        $schemaSql = preg_replace('/^\s*DROP\s+DATABASE\b.*?;\s*$/im', '', $schemaSql);
        $schemaSql = preg_replace('/^\s*CREATE\s+DATABASE\b.*?;\s*$/im', '', $schemaSql);
        $schemaSql = preg_replace('/^\s*USE\b.*?;\s*$/im', '', $schemaSql);
        $schemaSql = preg_replace('/^\s*DROP\s+TABLE\b.*?;\s*$/im', '', $schemaSql);
        $schemaSql = preg_replace('/^\s*--\s*Dumping data for table.*?(?=^\s*--\s*--------------------------------------------------------|\z)/ims', '', $schemaSql);

        $pdo->exec($schemaSql);
    }
    ensure_runtime_schema($pdo);
    seed_default_data($pdo);

    $done = true;
}

function table_exists(PDO $pdo, string $tableName): bool
{
    $statement = $pdo->prepare(
        'SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = :table_name'
    );
    $statement->execute(['table_name' => $tableName]);
    return (int) $statement->fetchColumn() > 0;
}

function table_is_ready(PDO $pdo, string $tableName): bool
{
    if (!table_exists($pdo, $tableName)) {
        return false;
    }

    try {
        $pdo->query(sprintf('SELECT 1 FROM `%s` LIMIT 0', str_replace('`', '``', $tableName)));
        return true;
    } catch (PDOException $exception) {
        return false;
    }
}

function ensure_amenities_tables(PDO $pdo): void
{
    $foundItemsSql = 'CREATE TABLE `found_items` (
        `id` VARCHAR(64) PRIMARY KEY,
        `created_date` DATETIME NOT NULL,
        `updated_date` DATETIME NOT NULL,
        `item_name` VARCHAR(191) NOT NULL,
        `description` TEXT NULL,
        `date_found` DATE NOT NULL,
        `location_found` VARCHAR(191) NULL,
        `found_by` VARCHAR(191) NULL,
        `status` ENUM("unclaimed", "claimed") NOT NULL DEFAULT "unclaimed",
        `image_url` TEXT NULL,
        `claimed_guest_name` VARCHAR(191) NULL,
        `claimed_contact` VARCHAR(191) NULL,
        `claimed_reservation_id` VARCHAR(64) NULL,
        `proof_of_ownership` TEXT NULL,
        `released_by` VARCHAR(191) NULL,
        `date_claimed` DATE NULL,
        `is_active` TINYINT(1) NOT NULL DEFAULT 1
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci';

    $lostReportsSql = 'CREATE TABLE `lost_item_reports` (
        `id` VARCHAR(64) PRIMARY KEY,
        `created_date` DATETIME NOT NULL,
        `updated_date` DATETIME NOT NULL,
        `guest_name` VARCHAR(191) NOT NULL,
        `reservation_number` VARCHAR(64) NULL,
        `item_lost` VARCHAR(191) NOT NULL,
        `description` TEXT NULL,
        `date_lost` DATE NOT NULL,
        `contact_number` VARCHAR(64) NULL,
        `email` VARCHAR(191) NULL,
        `status` ENUM("searching", "matched", "claimed") NOT NULL DEFAULT "searching",
        `matched_item_id` VARCHAR(64) NULL,
        CONSTRAINT `fk_lost_item_reports_found_item`
            FOREIGN KEY (`matched_item_id`) REFERENCES `found_items`(`id`)
            ON DELETE SET NULL ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci';

    if (!table_is_ready($pdo, 'found_items')) {
        $pdo->exec('SET FOREIGN_KEY_CHECKS=0');
        $pdo->exec('DROP TABLE IF EXISTS `lost_item_reports`');
        $pdo->exec('DROP TABLE IF EXISTS `found_items`');
        $pdo->exec($foundItemsSql);
        $pdo->exec('SET FOREIGN_KEY_CHECKS=1');
    } elseif (!column_exists($pdo, 'found_items', 'is_active')) {
        $pdo->exec('ALTER TABLE `found_items` ADD COLUMN `is_active` TINYINT(1) NOT NULL DEFAULT 1');
    }

    if (!table_is_ready($pdo, 'lost_item_reports')) {
        $pdo->exec('DROP TABLE IF EXISTS `lost_item_reports`');
        $pdo->exec($lostReportsSql);
    }
}

function ensure_inquiry_tables(PDO $pdo): void
{
    $inquiriesSql = 'CREATE TABLE `inquiries` (
        `id` VARCHAR(64) PRIMARY KEY,
        `created_date` DATETIME NOT NULL,
        `updated_date` DATETIME NOT NULL,
        `guest_name` VARCHAR(191) NOT NULL,
        `guest_email` VARCHAR(191) NOT NULL,
        `guest_phone` VARCHAR(64) NULL,
        `subject` VARCHAR(191) NOT NULL,
        `status` ENUM("open", "in_progress", "resolved", "closed") NOT NULL DEFAULT "open",
        `user_id` VARCHAR(64) NULL,
        `assigned_admin_id` VARCHAR(64) NULL,
        `guest_token_hash` VARCHAR(64) NULL,
        `last_message_at` DATETIME NOT NULL,
        `last_message_preview` TEXT NULL,
        KEY `idx_inquiries_guest_email` (`guest_email`),
        KEY `idx_inquiries_user_id` (`user_id`),
        KEY `idx_inquiries_status` (`status`),
        KEY `idx_inquiries_last_message_at` (`last_message_at`),
        CONSTRAINT `fk_inquiries_user`
            FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
            ON DELETE SET NULL ON UPDATE CASCADE,
        CONSTRAINT `fk_inquiries_assigned_admin`
            FOREIGN KEY (`assigned_admin_id`) REFERENCES `users`(`id`)
            ON DELETE SET NULL ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci';

    $messagesSql = 'CREATE TABLE `inquiry_messages` (
        `id` VARCHAR(64) PRIMARY KEY,
        `created_date` DATETIME NOT NULL,
        `updated_date` DATETIME NOT NULL,
        `inquiry_id` VARCHAR(64) NOT NULL,
        `sender_type` ENUM("guest", "admin") NOT NULL,
        `sender_name` VARCHAR(191) NOT NULL,
        `sender_email` VARCHAR(191) NULL,
        `sender_user_id` VARCHAR(64) NULL,
        `message` TEXT NOT NULL,
        KEY `idx_inquiry_messages_inquiry_id` (`inquiry_id`),
        KEY `idx_inquiry_messages_created_date` (`created_date`),
        CONSTRAINT `fk_inquiry_messages_inquiry`
            FOREIGN KEY (`inquiry_id`) REFERENCES `inquiries`(`id`)
            ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT `fk_inquiry_messages_sender_user`
            FOREIGN KEY (`sender_user_id`) REFERENCES `users`(`id`)
            ON DELETE SET NULL ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci';

    if (!table_is_ready($pdo, 'inquiries')) {
        $pdo->exec('SET FOREIGN_KEY_CHECKS=0');
        $pdo->exec('DROP TABLE IF EXISTS `inquiry_messages`');
        $pdo->exec('DROP TABLE IF EXISTS `inquiries`');
        $pdo->exec($inquiriesSql);
        $pdo->exec($messagesSql);
        $pdo->exec('SET FOREIGN_KEY_CHECKS=1');
        return;
    }

    if (!column_exists($pdo, 'inquiries', 'user_id')) {
        $pdo->exec('ALTER TABLE `inquiries` ADD COLUMN `user_id` VARCHAR(64) NULL AFTER `status`');
    }
    if (!column_exists($pdo, 'inquiries', 'assigned_admin_id')) {
        $pdo->exec('ALTER TABLE `inquiries` ADD COLUMN `assigned_admin_id` VARCHAR(64) NULL AFTER `user_id`');
    }
    if (!column_exists($pdo, 'inquiries', 'guest_token_hash')) {
        $pdo->exec('ALTER TABLE `inquiries` ADD COLUMN `guest_token_hash` VARCHAR(64) NULL AFTER `assigned_admin_id`');
    }
    if (!column_exists($pdo, 'inquiries', 'last_message_at')) {
        $pdo->exec('ALTER TABLE `inquiries` ADD COLUMN `last_message_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER `guest_token_hash`');
    }
    if (!column_exists($pdo, 'inquiries', 'last_message_preview')) {
        $pdo->exec('ALTER TABLE `inquiries` ADD COLUMN `last_message_preview` TEXT NULL AFTER `last_message_at`');
    }

    if (!table_is_ready($pdo, 'inquiry_messages')) {
        $pdo->exec('DROP TABLE IF EXISTS `inquiry_messages`');
        $pdo->exec($messagesSql);
    }
}

function column_exists(PDO $pdo, string $tableName, string $columnName): bool
{
    $statement = $pdo->prepare(
        'SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = :table_name AND column_name = :column_name'
    );
    $statement->execute([
        'table_name' => $tableName,
        'column_name' => $columnName,
    ]);
    return (int) $statement->fetchColumn() > 0;
}

function ensure_runtime_schema(PDO $pdo): void
{
    $createdResortRulesTable = false;

    ensure_amenities_tables($pdo);
    ensure_inquiry_tables($pdo);

    $roleColumnTypeStatement = $pdo->prepare(
        'SELECT COLUMN_TYPE
         FROM information_schema.columns
         WHERE table_schema = DATABASE() AND table_name = :table_name AND column_name = :column_name
         LIMIT 1'
    );
    $roleColumnTypeStatement->execute([
        'table_name' => 'users',
        'column_name' => 'role',
    ]);
    $roleColumnType = (string) ($roleColumnTypeStatement->fetchColumn() ?: '');

    if ($roleColumnType !== '' && !str_contains($roleColumnType, 'super_admin')) {
        $pdo->exec("ALTER TABLE users MODIFY COLUMN role ENUM('super_admin', 'admin', 'guest') NOT NULL DEFAULT 'guest'");
    }

    if (!column_exists($pdo, 'users', 'phone')) {
        $pdo->exec('ALTER TABLE users ADD COLUMN phone VARCHAR(64) NULL AFTER full_name');
    }

    if (!column_exists($pdo, 'users', 'password_hash')) {
        $pdo->exec('ALTER TABLE users ADD COLUMN password_hash VARCHAR(255) NULL AFTER role');
    }

    if (!column_exists($pdo, 'users', 'failed_login_attempts')) {
        $pdo->exec('ALTER TABLE users ADD COLUMN failed_login_attempts INT NOT NULL DEFAULT 0 AFTER password_hash');
    }

    if (!column_exists($pdo, 'users', 'lockout_until')) {
        $pdo->exec('ALTER TABLE users ADD COLUMN lockout_until DATETIME NULL AFTER failed_login_attempts');
    }

    if (!column_exists($pdo, 'users', 'last_login_at')) {
        $pdo->exec('ALTER TABLE users ADD COLUMN last_login_at DATETIME NULL AFTER lockout_until');
    }

    if (!table_exists($pdo, 'password_reset_tokens')) {
        $pdo->exec(
            'CREATE TABLE password_reset_tokens (
                id VARCHAR(64) PRIMARY KEY,
                user_id VARCHAR(64) NOT NULL,
                token_hash VARCHAR(64) NOT NULL,
                created_date DATETIME NOT NULL,
                expires_at DATETIME NOT NULL,
                used_at DATETIME NULL,
                CONSTRAINT fk_password_reset_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
            )'
        );
    }

    if (!table_exists($pdo, 'upcoming_schedules')) {
        $pdo->exec(
            'CREATE TABLE upcoming_schedules (
                id VARCHAR(64) PRIMARY KEY,
                created_date DATETIME NOT NULL,
                updated_date DATETIME NOT NULL,
                title VARCHAR(191) NOT NULL,
                schedule_date DATE NOT NULL,
                start_time VARCHAR(16) NULL,
                end_time VARCHAR(16) NULL,
                location VARCHAR(191) NULL,
                description TEXT NULL,
                created_by_name VARCHAR(191) NULL,
                created_by_email VARCHAR(191) NULL
            )'
        );
    }

    if (!table_exists($pdo, 'resort_rules')) {
        $pdo->exec(
            'CREATE TABLE resort_rules (
                id VARCHAR(64) PRIMARY KEY,
                created_date DATETIME NOT NULL,
                updated_date DATETIME NOT NULL,
                title VARCHAR(191) NOT NULL,
                description TEXT NOT NULL,
                sort_order INT NOT NULL DEFAULT 1,
                is_active TINYINT(1) NOT NULL DEFAULT 1
            )'
        );
        $createdResortRulesTable = true;
    }

    if (!table_exists($pdo, 'site_settings')) {
        $pdo->exec(
            'CREATE TABLE site_settings (
                id VARCHAR(64) PRIMARY KEY,
                created_date DATETIME NOT NULL,
                updated_date DATETIME NOT NULL,
                site_name VARCHAR(191) NOT NULL DEFAULT "Kasa Ilaya",
                logo_url TEXT NULL,
                hero_image_url TEXT NULL,
                hero_images_json LONGTEXT NULL,
                packages_banner_url TEXT NULL,
                packages_banner_images_json LONGTEXT NULL,
                hero_badge_text VARCHAR(191) NULL,
                hero_title_line1 VARCHAR(191) NULL,
                hero_title_line2 VARCHAR(191) NULL,
                hero_description TEXT NULL,
                body_font_style VARCHAR(64) NOT NULL DEFAULT "inter",
                heading_font_style VARCHAR(64) NOT NULL DEFAULT "playfair",
                amenities_section_label VARCHAR(191) NULL,
                amenities_section_title VARCHAR(191) NULL,
                amenities_section_description TEXT NULL,
                resort_gallery_json LONGTEXT NULL,
                terms_title VARCHAR(191) NULL,
                terms_summary TEXT NULL,
                terms_content LONGTEXT NULL,
                amenities_json LONGTEXT NULL,
                require_strong_password TINYINT(1) NOT NULL DEFAULT 1,
                min_password_length INT NOT NULL DEFAULT 8,
                session_timeout_minutes INT NOT NULL DEFAULT 120,
                max_login_attempts INT NOT NULL DEFAULT 5,
                lockout_minutes INT NOT NULL DEFAULT 15,
                enable_login_notifications TINYINT(1) NOT NULL DEFAULT 1
            )'
        );
    } else {
        // Migrate: add amenities columns if missing
        $siteSettingsCols = $pdo->query("SHOW COLUMNS FROM site_settings")->fetchAll(PDO::FETCH_COLUMN);
        if (!in_array('amenities_section_label', $siteSettingsCols)) {
            $pdo->exec("ALTER TABLE site_settings ADD COLUMN amenities_section_label VARCHAR(191) NULL");
        }
        if (!in_array('amenities_section_title', $siteSettingsCols)) {
            $pdo->exec("ALTER TABLE site_settings ADD COLUMN amenities_section_title VARCHAR(191) NULL");
        }
        if (!in_array('amenities_section_description', $siteSettingsCols)) {
            $pdo->exec("ALTER TABLE site_settings ADD COLUMN amenities_section_description TEXT NULL");
        }
        if (!in_array('amenities_json', $siteSettingsCols)) {
            $pdo->exec("ALTER TABLE site_settings ADD COLUMN amenities_json LONGTEXT NULL");
        }
        if (!in_array('resort_gallery_json', $siteSettingsCols)) {
            $pdo->exec("ALTER TABLE site_settings ADD COLUMN resort_gallery_json LONGTEXT NULL");
        }
        if (!in_array('terms_title', $siteSettingsCols)) {
            $pdo->exec("ALTER TABLE site_settings ADD COLUMN terms_title VARCHAR(191) NULL");
        }
        if (!in_array('hero_images_json', $siteSettingsCols)) {
            $pdo->exec("ALTER TABLE site_settings ADD COLUMN hero_images_json LONGTEXT NULL");
        }
        if (!in_array('packages_banner_url', $siteSettingsCols)) {
            $pdo->exec("ALTER TABLE site_settings ADD COLUMN packages_banner_url TEXT NULL");
        }
        if (!in_array('packages_banner_images_json', $siteSettingsCols)) {
            $pdo->exec("ALTER TABLE site_settings ADD COLUMN packages_banner_images_json LONGTEXT NULL");
        }
        if (!in_array('terms_summary', $siteSettingsCols)) {
            $pdo->exec("ALTER TABLE site_settings ADD COLUMN terms_summary TEXT NULL");
        }
        if (!in_array('terms_content', $siteSettingsCols)) {
            $pdo->exec("ALTER TABLE site_settings ADD COLUMN terms_content LONGTEXT NULL");
        }
        if (!in_array('require_strong_password', $siteSettingsCols)) {
            $pdo->exec("ALTER TABLE site_settings ADD COLUMN require_strong_password TINYINT(1) NOT NULL DEFAULT 1");
        }
        if (!in_array('min_password_length', $siteSettingsCols)) {
            $pdo->exec("ALTER TABLE site_settings ADD COLUMN min_password_length INT NOT NULL DEFAULT 8");
        }
        if (!in_array('session_timeout_minutes', $siteSettingsCols)) {
            $pdo->exec("ALTER TABLE site_settings ADD COLUMN session_timeout_minutes INT NOT NULL DEFAULT 120");
        }
        if (!in_array('max_login_attempts', $siteSettingsCols)) {
            $pdo->exec("ALTER TABLE site_settings ADD COLUMN max_login_attempts INT NOT NULL DEFAULT 5");
        }
        if (!in_array('lockout_minutes', $siteSettingsCols)) {
            $pdo->exec("ALTER TABLE site_settings ADD COLUMN lockout_minutes INT NOT NULL DEFAULT 15");
        }
        if (!in_array('enable_login_notifications', $siteSettingsCols)) {
            $pdo->exec("ALTER TABLE site_settings ADD COLUMN enable_login_notifications TINYINT(1) NOT NULL DEFAULT 1");
        }
    }

    $siteSettingsCount = (int) $pdo->query('SELECT COUNT(*) FROM site_settings')->fetchColumn();
    if ($siteSettingsCount === 0) {
        $statement = $pdo->prepare(
            'INSERT INTO site_settings
            (id, created_date, updated_date, site_name, logo_url, hero_image_url, hero_images_json, packages_banner_url, packages_banner_images_json, hero_badge_text, hero_title_line1, hero_title_line2, hero_description, body_font_style, heading_font_style, resort_gallery_json, terms_title, terms_summary, terms_content, require_strong_password, min_password_length, session_timeout_minutes, max_login_attempts, lockout_minutes, enable_login_notifications)
            VALUES
            (:id, :created_date, :updated_date, :site_name, :logo_url, :hero_image_url, :hero_images_json, :packages_banner_url, :packages_banner_images_json, :hero_badge_text, :hero_title_line1, :hero_title_line2, :hero_description, :body_font_style, :heading_font_style, :resort_gallery_json, :terms_title, :terms_summary, :terms_content, :require_strong_password, :min_password_length, :session_timeout_minutes, :max_login_attempts, :lockout_minutes, :enable_login_notifications)'
        );

        $statement->execute([
            'id' => 'site-settings-main',
            'created_date' => now_mysql(),
            'updated_date' => now_mysql(),
            'site_name' => 'Kasa Ilaya',
            'logo_url' => null,
            'hero_image_url' => 'img/Logo.png',
            'hero_images_json' => '["img/Logo.png"]',
            'packages_banner_url' => 'img/Logo.png',
            'packages_banner_images_json' => '["img/Logo.png"]',
            'hero_badge_text' => 'Welcome to Paradise',
            'hero_title_line1' => 'Kasa Ilaya',
            'hero_title_line2' => 'Resort & Event Place',
            'hero_description' => 'Escape to serenity. Experience our premium resort packages with breathtaking views, world-class amenities, and unforgettable moments.',
            'body_font_style' => 'inter',
            'heading_font_style' => 'playfair',
            'resort_gallery_json' => '[{"src":"/img/room_Resort%20View.jpg","title":"Resort View","subtitle":"Wide-open leisure spaces and refreshing scenery."},{"src":"/img/room_eventplace.jpg","title":"Event Space","subtitle":"A venue designed for celebrations, reunions, and special occasions."},{"src":"/img/room_EntireHouse_EventPlace.jpg","title":"Private Stay","subtitle":"Comfortable accommodations for families and barkada getaways."},{"src":"/img/room_kubo.jpg","title":"Kubo Area","subtitle":"Relaxed corners for rest, dining, and poolside bonding."},{"src":"/img/kubo_accomodation.jpg","title":"Kubo Accommodation","subtitle":"A more rustic stay experience with resort comfort."}]',
            'terms_title' => 'Terms and Conditions',
            'terms_summary' => 'Please review the booking, payment, guest conduct, and cancellation rules before confirming your reservation.',
            'terms_content' => "1. All bookings are subject to availability and confirmation by Kasa Ilaya Resort.\n\n2. Guests must provide accurate personal information and valid contact details during reservation.\n\n3. A reservation payment is required to process the booking. Submitted payment proofs are reviewed before final confirmation.\n\n4. Guests must follow resort rules, safety guidelines, staff instructions, and capacity limits throughout their stay.\n\n5. Damages to resort property, missing items, or violations of house rules may result in additional charges or cancellation of the reservation.\n\n6. Rebooking, cancellation, refund, and no-show requests are subject to resort approval and the applicable payment policy.\n\n7. Kasa Ilaya Resort may decline or cancel a booking for policy violations, fraudulent transactions, safety concerns, or force majeure events.\n\n8. By proceeding with a reservation, the guest confirms that they have read and accepted these terms and conditions.",
            'require_strong_password' => 1,
            'min_password_length' => 8,
            'session_timeout_minutes' => 120,
            'max_login_attempts' => 5,
            'lockout_minutes' => 15,
            'enable_login_notifications' => 1,
        ]);
    }

    if ($createdResortRulesTable) {
        $statement = $pdo->prepare(
            'INSERT INTO resort_rules (id, created_date, updated_date, title, description, sort_order, is_active)
             VALUES (:id, :created_date, :updated_date, :title, :description, :sort_order, :is_active)'
        );

        $rules = [
            [
                'id' => 'rule-1',
                'created_date' => '2026-03-01 08:00:00',
                'updated_date' => '2026-03-01 08:00:00',
                'title' => 'Observe check-in schedule',
                'description' => 'Guests must arrive within their reserved tour time and present a valid booking reference at entry.',
                'sort_order' => 1,
                'is_active' => 1,
            ],
            [
                'id' => 'rule-2',
                'created_date' => '2026-03-01 08:00:00',
                'updated_date' => '2026-03-01 08:00:00',
                'title' => 'Respect guest capacity',
                'description' => 'Only the confirmed number of guests included in the reservation may enter unless approved by resort staff.',
                'sort_order' => 2,
                'is_active' => 1,
            ],
            [
                'id' => 'rule-3',
                'created_date' => '2026-03-01 08:00:00',
                'updated_date' => '2026-03-01 08:00:00',
                'title' => 'Keep the resort clean',
                'description' => 'Dispose of trash properly and help maintain cottages, pools, and shared areas in good condition.',
                'sort_order' => 3,
                'is_active' => 1,
            ],
            [
                'id' => 'rule-4',
                'created_date' => '2026-03-01 08:00:00',
                'updated_date' => '2026-03-01 08:00:00',
                'title' => 'Handle resort property carefully',
                'description' => 'Damaged or missing resort items may be charged to the guest responsible for the reservation.',
                'sort_order' => 4,
                'is_active' => 1,
            ],
            [
                'id' => 'rule-5',
                'created_date' => '2026-03-01 08:00:00',
                'updated_date' => '2026-03-01 08:00:00',
                'title' => 'Follow safety instructions',
                'description' => 'Pool, event, and activity areas must be used according to posted guidelines and staff instructions.',
                'sort_order' => 5,
                'is_active' => 1,
            ],
            [
                'id' => 'rule-6',
                'created_date' => '2026-03-01 08:00:00',
                'updated_date' => '2026-03-01 08:00:00',
                'title' => 'Payments are subject to verification',
                'description' => 'Reservation fees and uploaded payment proofs are reviewed by admin before final booking confirmation.',
                'sort_order' => 6,
                'is_active' => 1,
            ],
        ];

        foreach ($rules as $rule) {
            $statement->execute($rule);
        }
    }

    if (table_exists($pdo, 'activity_logs')) {
        $resortRuleSeedMarkerStatement = $pdo->prepare(
            'SELECT COUNT(*) FROM activity_logs WHERE entity_type = :entity_type AND entity_id = :entity_id'
        );
        $resortRuleSeedMarkerStatement->execute([
            'entity_type' => 'System',
            'entity_id' => 'resort-rules-seed',
        ]);
        $hasResortRuleSeedMarker = (int) $resortRuleSeedMarkerStatement->fetchColumn() > 0;

        $existingResortRuleCount = (int) $pdo->query('SELECT COUNT(*) FROM resort_rules')->fetchColumn();

        if (!$hasResortRuleSeedMarker && $existingResortRuleCount === 0) {
            $statement = $pdo->prepare(
                'INSERT INTO resort_rules (id, created_date, updated_date, title, description, sort_order, is_active)
                 VALUES (:id, :created_date, :updated_date, :title, :description, :sort_order, :is_active)'
            );

            $rules = [
                [
                    'id' => 'rule-1',
                    'created_date' => '2026-03-01 08:00:00',
                    'updated_date' => '2026-03-01 08:00:00',
                    'title' => 'Observe check-in schedule',
                    'description' => 'Guests must arrive within their reserved tour time and present a valid booking reference at entry.',
                    'sort_order' => 1,
                    'is_active' => 1,
                ],
                [
                    'id' => 'rule-2',
                    'created_date' => '2026-03-01 08:00:00',
                    'updated_date' => '2026-03-01 08:00:00',
                    'title' => 'Respect guest capacity',
                    'description' => 'Only the confirmed number of guests included in the reservation may enter unless approved by resort staff.',
                    'sort_order' => 2,
                    'is_active' => 1,
                ],
                [
                    'id' => 'rule-3',
                    'created_date' => '2026-03-01 08:00:00',
                    'updated_date' => '2026-03-01 08:00:00',
                    'title' => 'Keep the resort clean',
                    'description' => 'Dispose of trash properly and help maintain cottages, pools, and shared areas in good condition.',
                    'sort_order' => 3,
                    'is_active' => 1,
                ],
                [
                    'id' => 'rule-4',
                    'created_date' => '2026-03-01 08:00:00',
                    'updated_date' => '2026-03-01 08:00:00',
                    'title' => 'Handle resort property carefully',
                    'description' => 'Damaged or missing resort items may be charged to the guest responsible for the reservation.',
                    'sort_order' => 4,
                    'is_active' => 1,
                ],
                [
                    'id' => 'rule-5',
                    'created_date' => '2026-03-01 08:00:00',
                    'updated_date' => '2026-03-01 08:00:00',
                    'title' => 'Follow safety instructions',
                    'description' => 'Pool, event, and activity areas must be used according to posted guidelines and staff instructions.',
                    'sort_order' => 5,
                    'is_active' => 1,
                ],
                [
                    'id' => 'rule-6',
                    'created_date' => '2026-03-01 08:00:00',
                    'updated_date' => '2026-03-01 08:00:00',
                    'title' => 'Payments are subject to verification',
                    'description' => 'Reservation fees and uploaded payment proofs are reviewed by admin before final booking confirmation.',
                    'sort_order' => 6,
                    'is_active' => 1,
                ],
            ];

            foreach ($rules as $rule) {
                $statement->execute($rule);
            }

            $activityStatement = $pdo->prepare(
                'INSERT INTO activity_logs (id, created_date, updated_date, user_email, user_name, action, entity_type, entity_id, details)
                 VALUES (:id, :created_date, :updated_date, :user_email, :user_name, :action, :entity_type, :entity_id, :details)'
            );
            $activityStatement->execute([
                'id' => 'log-resort-rules-seed',
                'created_date' => now_mysql(),
                'updated_date' => now_mysql(),
                'user_email' => 'system@kasa-ilaya.local',
                'user_name' => 'System',
                'action' => 'Seeded Resort Rules',
                'entity_type' => 'System',
                'entity_id' => 'resort-rules-seed',
                'details' => 'Initialized default resort rules for editable admin management.',
            ]);
        }
    }

    if (!column_exists($pdo, 'packages', 'gallery_images')) {
        $pdo->exec('ALTER TABLE packages ADD COLUMN gallery_images LONGTEXT NULL AFTER inclusions');
    }

    if (!column_exists($pdo, 'packages', 'day_tour_price')) {
        $pdo->exec('ALTER TABLE packages ADD COLUMN day_tour_price DECIMAL(10, 2) NOT NULL DEFAULT 0 AFTER price');
    }

    if (!column_exists($pdo, 'packages', 'night_tour_price')) {
        $pdo->exec('ALTER TABLE packages ADD COLUMN night_tour_price DECIMAL(10, 2) NOT NULL DEFAULT 0 AFTER day_tour_price');
    }

    if (!column_exists($pdo, 'packages', 'twenty_two_hour_price')) {
        $pdo->exec('ALTER TABLE packages ADD COLUMN twenty_two_hour_price DECIMAL(10, 2) NOT NULL DEFAULT 0 AFTER night_tour_price');
    }

    $pdo->exec('UPDATE packages SET day_tour_price = price WHERE day_tour_price = 0');
    $pdo->exec('UPDATE packages SET night_tour_price = price WHERE night_tour_price = 0');
    $pdo->exec('UPDATE packages SET twenty_two_hour_price = price WHERE twenty_two_hour_price = 0');

    if (!column_exists($pdo, 'bookings', 'reservation_fee_amount')) {
        $pdo->exec('ALTER TABLE bookings ADD COLUMN reservation_fee_amount DECIMAL(10, 2) NOT NULL DEFAULT 0 AFTER total_amount');
    }

    if (!column_exists($pdo, 'bookings', 'payment_qr_code_id')) {
        $pdo->exec('ALTER TABLE bookings ADD COLUMN payment_qr_code_id VARCHAR(64) NULL AFTER reservation_fee_amount');
    }

    if (!column_exists($pdo, 'bookings', 'payment_qr_code_label')) {
        $pdo->exec('ALTER TABLE bookings ADD COLUMN payment_qr_code_label VARCHAR(191) NULL AFTER payment_qr_code_id');
    }

    if (!table_exists($pdo, 'payment_qr_codes')) {
        $pdo->exec(
            'CREATE TABLE payment_qr_codes (
                id VARCHAR(64) PRIMARY KEY,
                created_date DATETIME NOT NULL,
                updated_date DATETIME NOT NULL,
                label VARCHAR(191) NOT NULL,
                account_name VARCHAR(191) NULL,
                account_number VARCHAR(191) NULL,
                instructions TEXT NULL,
                image_url TEXT NOT NULL,
                display_order INT NOT NULL DEFAULT 1,
                is_active TINYINT(1) NOT NULL DEFAULT 1
            )'
        );
    }

    $packageGallerySeed = $pdo->query('SELECT id, image_url, gallery_images FROM packages');
    if ($packageGallerySeed !== false) {
        $updateGallery = $pdo->prepare('UPDATE packages SET gallery_images = :gallery_images WHERE id = :id');

        foreach ($packageGallerySeed->fetchAll() as $packageRow) {
            $galleryImages = json_decode((string) ($packageRow['gallery_images'] ?? ''), true);
            if (is_array($galleryImages) && count($galleryImages) > 0) {
                continue;
            }

            $imageUrl = trim((string) ($packageRow['image_url'] ?? ''));
            if ($imageUrl === '') {
                continue;
            }

            $updateGallery->execute([
                'id' => $packageRow['id'],
                'gallery_images' => json_encode([$imageUrl], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
            ]);
        }
    }

    if (!column_exists($pdo, 'mail_logs', 'status')) {
        $pdo->exec("ALTER TABLE mail_logs ADD COLUMN status VARCHAR(32) NOT NULL DEFAULT 'pending' AFTER body");
    }

    if (!column_exists($pdo, 'mail_logs', 'error_message')) {
        $pdo->exec('ALTER TABLE mail_logs ADD COLUMN error_message TEXT NULL AFTER status');
    }

    if (!column_exists($pdo, 'mail_logs', 'provider')) {
        $pdo->exec('ALTER TABLE mail_logs ADD COLUMN provider VARCHAR(64) NULL AFTER error_message');
    }
}

function now_iso(): string
{
    return gmdate('Y-m-d\TH:i:s.000\Z');
}

function now_mysql(): string
{
    return gmdate('Y-m-d H:i:s');
}

function create_id(string $prefix): string
{
    return $prefix . '-' . bin2hex(random_bytes(4));
}

function encode_mail_header(string $value): string
{
    if ($value === '' || !preg_match('/[^\x20-\x7E]/', $value)) {
        return $value;
    }

    return '=?UTF-8?B?' . base64_encode($value) . '?=';
}

function plain_text_email_body(string $body): string
{
    $normalized = str_replace(["\r\n", "\r"], "\n", $body);
    $normalized = preg_replace('/<\s*br\s*\/?>/i', "\n", $normalized) ?? $normalized;
    $normalized = preg_replace('/<\/(p|div|h[1-6]|li|tr)>/i', "\n", $normalized) ?? $normalized;
    $text = strip_tags($normalized);
    $text = html_entity_decode($text, ENT_QUOTES | ENT_HTML5, 'UTF-8');
    $text = preg_replace("/\n{3,}/", "\n\n", $text) ?? $text;
    return trim($text);
}

function fold_smtp_lines(string $value): string
{
    $value = str_replace(["\r\n", "\r"], "\n", $value);
    $value = str_replace("\n.", "\n..", $value);
    return str_replace("\n", "\r\n", $value);
}

function record_mail_log(
    string $toEmail,
    string $subject,
    string $body,
    string $status = 'pending',
    ?string $errorMessage = null,
    ?string $provider = null
): string {
    $id = create_id('mail');

    $statement = db()->prepare(
        'INSERT INTO mail_logs (id, sent_at, to_email, subject, body, status, error_message, provider)
         VALUES (:id, :sent_at, :to_email, :subject, :body, :status, :error_message, :provider)'
    );
    $statement->execute([
        'id' => $id,
        'sent_at' => now_mysql(),
        'to_email' => $toEmail,
        'subject' => $subject,
        'body' => $body,
        'status' => $status,
        'error_message' => $errorMessage,
        'provider' => $provider,
    ]);

    return $id;
}

function update_mail_log(string $mailLogId, string $status, ?string $errorMessage = null, ?string $provider = null): void
{
    $statement = db()->prepare(
        'UPDATE mail_logs
         SET sent_at = :sent_at, status = :status, error_message = :error_message, provider = :provider
         WHERE id = :id'
    );
    $statement->execute([
        'id' => $mailLogId,
        'sent_at' => now_mysql(),
        'status' => $status,
        'error_message' => $errorMessage,
        'provider' => $provider,
    ]);
}

function smtp_read_response($stream, array $expectedCodes): string
{
    $response = '';

    while (($line = fgets($stream, 515)) !== false) {
        $response .= $line;
        if (strlen($line) < 4 || $line[3] !== '-') {
            break;
        }
    }

    if ($response === '') {
        throw new RuntimeException('SMTP server closed the connection unexpectedly.');
    }

    $code = (int) substr($response, 0, 3);
    if (!in_array($code, $expectedCodes, true)) {
        throw new RuntimeException('SMTP error: ' . trim($response));
    }

    return $response;
}

function smtp_command($stream, string $command, array $expectedCodes): string
{
    if (fwrite($stream, $command . "\r\n") === false) {
        throw new RuntimeException('Unable to write SMTP command.');
    }

    return smtp_read_response($stream, $expectedCodes);
}

function smtp_provider_name(array $mailConfig): string
{
    $host = strtolower((string) ($mailConfig['host'] ?? 'smtp'));
    return str_contains($host, 'gmail') ? 'gmail-smtp' : 'smtp';
}

function smtp_send_email(string $toEmail, string $subject, string $htmlBody): void
{
    $mailConfig = app_config()['mail'] ?? [];
    $host = trim((string) ($mailConfig['host'] ?? ''));
    $port = (int) ($mailConfig['port'] ?? 0);
    $username = trim((string) ($mailConfig['username'] ?? ''));
    $configuredPassword = (string) ($mailConfig['password'] ?? '');
    $configuredApiKey = (string) ($mailConfig['api_key'] ?? '');
    $isGmailSmtp = str_contains(strtolower($host), 'gmail');
    $isMailjetSmtp = str_contains(strtolower($host), 'mailjet');
    if ($isGmailSmtp && $configuredPassword !== '') {
        $configuredPassword = preg_replace('/\s+/', '', $configuredPassword) ?? $configuredPassword;
    }
    $password = (string) ($configuredPassword !== '' ? $configuredPassword : (!$isGmailSmtp ? $configuredApiKey : ''));
    $encryption = strtolower(trim((string) ($mailConfig['encryption'] ?? 'tls')));
    $fromEmail = trim((string) ($mailConfig['from_email'] ?? ''));
    $fromName = trim((string) ($mailConfig['from_name'] ?? 'Kasa Ilaya Resort'));
    $replyToEmail = trim((string) ($mailConfig['reply_to_email'] ?? ''));
    $replyToName = trim((string) ($mailConfig['reply_to_name'] ?? ''));
    $timeout = max(5, (int) ($mailConfig['timeout'] ?? 20));

    if ($isGmailSmtp && $configuredPassword === '') {
        throw new RuntimeException('Gmail SMTP requires a Gmail App Password. Set KASA_SMTP_PASS or mail.password to a valid 16-character App Password.');
    }

    if ($isMailjetSmtp && $configuredPassword === '') {
        throw new RuntimeException('Mailjet SMTP requires your API Key as the username and your Secret Key as the password. Set mail.password to your Mailjet Secret Key.');
    }

    if ($host === '' || $port < 1 || $username === '' || $password === '' || $fromEmail === '') {
        throw new RuntimeException('Mail is not fully configured. Set KASA_SMTP_HOST, KASA_SMTP_PORT, KASA_SMTP_USER, either KASA_SMTP_PASS or KASA_SMTP_API_KEY, and KASA_MAIL_FROM_EMAIL.');
    }

    if (!filter_var($toEmail, FILTER_VALIDATE_EMAIL)) {
        throw new InvalidArgumentException('A valid recipient email is required.');
    }

    if (!filter_var($fromEmail, FILTER_VALIDATE_EMAIL)) {
        throw new RuntimeException('KASA_MAIL_FROM_EMAIL must be a valid email address.');
    }

    $remote = $encryption === 'ssl' ? 'ssl://' . $host : 'tcp://' . $host;
    $stream = @stream_socket_client($remote . ':' . $port, $errorNumber, $errorMessage, $timeout, STREAM_CLIENT_CONNECT);

    if (!is_resource($stream)) {
        throw new RuntimeException(sprintf('Unable to connect to SMTP server: %s (%s).', $errorMessage ?: 'connection failed', $errorNumber));
    }

    stream_set_timeout($stream, $timeout);

    try {
        smtp_read_response($stream, [220]);
        smtp_command($stream, 'EHLO localhost', [250]);

        if ($encryption === 'tls' || $encryption === 'starttls') {
            smtp_command($stream, 'STARTTLS', [220]);
            $cryptoEnabled = stream_socket_enable_crypto($stream, true, STREAM_CRYPTO_METHOD_TLS_CLIENT);
            if ($cryptoEnabled !== true) {
                throw new RuntimeException('Unable to negotiate TLS with the SMTP server.');
            }
            smtp_command($stream, 'EHLO localhost', [250]);
        }

        smtp_command($stream, 'AUTH LOGIN', [334]);
        smtp_command($stream, base64_encode($username), [334]);
        smtp_command($stream, base64_encode($password), [235]);
        smtp_command($stream, 'MAIL FROM:<' . $fromEmail . '>', [250]);
        smtp_command($stream, 'RCPT TO:<' . $toEmail . '>', [250, 251]);
        smtp_command($stream, 'DATA', [354]);

        $boundary = 'b1_' . bin2hex(random_bytes(12));
        $plainTextBody = plain_text_email_body($htmlBody);
        $headers = [
            'Date: ' . gmdate('D, d M Y H:i:s O'),
            'From: ' . encode_mail_header($fromName) . ' <' . $fromEmail . '>',
            'To: <' . $toEmail . '>',
            'Subject: ' . encode_mail_header($subject),
            'MIME-Version: 1.0',
            'Content-Type: multipart/alternative; boundary="' . $boundary . '"',
        ];

        if ($replyToEmail !== '') {
            $headers[] = 'Reply-To: ' . encode_mail_header($replyToName !== '' ? $replyToName : $fromName) . ' <' . $replyToEmail . '>';
        }

        $message = implode("\r\n", $headers)
            . "\r\n\r\n"
            . '--' . $boundary . "\r\n"
            . "Content-Type: text/plain; charset=UTF-8\r\n"
            . "Content-Transfer-Encoding: 8bit\r\n\r\n"
            . fold_smtp_lines($plainTextBody !== '' ? $plainTextBody : 'This email contains HTML content.') . "\r\n\r\n"
            . '--' . $boundary . "\r\n"
            . "Content-Type: text/html; charset=UTF-8\r\n"
            . "Content-Transfer-Encoding: 8bit\r\n\r\n"
            . fold_smtp_lines($htmlBody) . "\r\n\r\n"
            . '--' . $boundary . "--\r\n.";

        if (fwrite($stream, $message . "\r\n") === false) {
            throw new RuntimeException('Unable to send the email body to the SMTP server.');
        }

        smtp_read_response($stream, [250]);
        smtp_command($stream, 'QUIT', [221]);
    } finally {
        fclose($stream);
    }
}

function send_app_email(string $toEmail, string $subject, string $body): array
{
    $trimmedTo = trim($toEmail);
    $trimmedSubject = trim($subject);
    $provider = smtp_provider_name(app_config()['mail'] ?? []);

    if ($trimmedTo === '' || !filter_var($trimmedTo, FILTER_VALIDATE_EMAIL)) {
        throw new InvalidArgumentException('A valid recipient email is required.');
    }

    if ($trimmedSubject === '') {
        throw new InvalidArgumentException('Email subject is required.');
    }

    if (trim($body) === '') {
        throw new InvalidArgumentException('Email body is required.');
    }

    $mailLogId = record_mail_log($trimmedTo, $trimmedSubject, $body, 'pending', null, $provider);
    $mailConfig = app_config()['mail'] ?? [];

    if (!($mailConfig['enabled'] ?? false)) {
        $errorMessage = 'Mail delivery is disabled. Set KASA_MAIL_ENABLED=true and provide valid SMTP credentials.';
        update_mail_log($mailLogId, 'disabled', $errorMessage, $provider);

        return [
            'success' => false,
            'sent' => false,
            'log_id' => $mailLogId,
            'error' => $errorMessage,
        ];
    }

    try {
        smtp_send_email($trimmedTo, $trimmedSubject, $body);
        update_mail_log($mailLogId, 'sent', null, $provider);

        return [
            'success' => true,
            'sent' => true,
            'log_id' => $mailLogId,
        ];
    } catch (Throwable $error) {
        update_mail_log($mailLogId, 'failed', $error->getMessage(), $provider);

        return [
            'success' => false,
            'sent' => false,
            'log_id' => $mailLogId,
            'error' => $error->getMessage(),
        ];
    }
}

function mysql_datetime(string $value): string
{
    try {
        return (new DateTimeImmutable($value))->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s');
    } catch (Throwable $error) {
        return now_mysql();
    }
}

function mysql_date(string $value): string
{
    try {
        return (new DateTimeImmutable($value))->format('Y-m-d');
    } catch (Throwable $error) {
        return gmdate('Y-m-d');
    }
}

function seed_default_data(PDO $pdo): void
{
    $activityCount = (int) $pdo->query('SELECT COUNT(*) FROM activity_logs')->fetchColumn();
    if ($activityCount > 0) {
        return;
    }

    $removeResetTokens = $pdo->prepare(
        'DELETE prt FROM password_reset_tokens prt INNER JOIN users u ON u.id = prt.user_id WHERE u.email IN (:admin_email, :guest_email)'
    );
    $removeResetTokens->execute([
        'admin_email' => 'admin@kasa-ilaya.local',
        'guest_email' => 'guest@kasa-ilaya.local',
    ]);

    $removeDemoUsers = $pdo->prepare('DELETE FROM users WHERE email IN (:admin_email, :guest_email)');
    $removeDemoUsers->execute([
        'admin_email' => 'admin@kasa-ilaya.local',
        'guest_email' => 'guest@kasa-ilaya.local',
    ]);

    $packageCount = (int) $pdo->query('SELECT COUNT(*) FROM packages')->fetchColumn();
    if ($packageCount === 0) {
        $statement = $pdo->prepare(
            'INSERT INTO packages (id, created_date, updated_date, name, description, tour_type, price, day_tour_price, night_tour_price, twenty_two_hour_price, max_guests, inclusions, gallery_images, image_url, is_active)
             VALUES (:id, :created_date, :updated_date, :name, :description, :tour_type, :price, :day_tour_price, :night_tour_price, :twenty_two_hour_price, :max_guests, :inclusions, :gallery_images, :image_url, :is_active)'
        );

        $packages = [
            [
                'id' => 'pkg-day',
                'created_date' => '2026-02-01 08:00:00',
                'updated_date' => '2026-02-01 08:00:00',
                'name' => 'Sunrise Day Escape',
                'description' => 'A daytime pool and cottage experience for families and barkadas.',
                'tour_type' => 'day_tour',
                'price' => 2499,
                'day_tour_price' => 2499,
                'night_tour_price' => 3299,
                'twenty_two_hour_price' => 5999,
                'max_guests' => 12,
                'inclusions' => json_encode(['Private cottage', 'Pool access', 'Welcome drinks', 'Grilling station']),
                'gallery_images' => json_encode(['/img/PackageD.jpg', '/img/room_eventplace.jpg', '/img/room_Resort%20View.jpg']),
                'image_url' => '/img/PackageD.jpg',
                'is_active' => 1,
            ],
            [
                'id' => 'pkg-night',
                'created_date' => '2026-02-02 08:00:00',
                'updated_date' => '2026-02-02 08:00:00',
                'name' => 'Moonlight Chill Night Tour',
                'description' => 'An evening getaway with dinner setup and ambient lighting.',
                'tour_type' => 'night_tour',
                'price' => 3299,
                'day_tour_price' => 2699,
                'night_tour_price' => 3299,
                'twenty_two_hour_price' => 6299,
                'max_guests' => 10,
                'inclusions' => json_encode(['Night pool access', 'Dinner setup', 'Sound system access', 'Bonfire corner']),
                'gallery_images' => json_encode(['/img/room_eventplace.jpg', '/img/room_EntireHouse_EventPlace.jpg', '/img/Logo.png']),
                'image_url' => '/img/room_eventplace.jpg',
                'is_active' => 1,
            ],
            [
                'id' => 'pkg-stay',
                'created_date' => '2026-02-03 08:00:00',
                'updated_date' => '2026-02-03 08:00:00',
                'name' => '22-Hour Resort Stay',
                'description' => 'A longer stay package for celebrations, reunions, and overnight events.',
                'tour_type' => '22_hours',
                'price' => 5999,
                'day_tour_price' => 3199,
                'night_tour_price' => 3899,
                'twenty_two_hour_price' => 5999,
                'max_guests' => 16,
                'inclusions' => json_encode(['Overnight access', 'Air-conditioned room', 'Breakfast for four', 'Extended venue use']),
                'gallery_images' => json_encode(['/img/kubo_accomodation.jpg', '/img/room_kubo.jpg', '/img/room_Resort%20View.jpg']),
                'image_url' => '/img/kubo_accomodation.jpg',
                'is_active' => 1,
            ],
        ];

        foreach ($packages as $package) {
            $statement->execute($package);
        }
    }

    $bookingCount = (int) $pdo->query('SELECT COUNT(*) FROM bookings')->fetchColumn();
    if ($bookingCount === 0) {
        $statement = $pdo->prepare(
            'INSERT INTO bookings (id, created_date, updated_date, booking_reference, package_id, package_name, tour_type, booking_date, guest_count, customer_name, customer_email, customer_phone, special_requests, total_amount, receipt_url, status, payment_status)
             VALUES (:id, :created_date, :updated_date, :booking_reference, :package_id, :package_name, :tour_type, :booking_date, :guest_count, :customer_name, :customer_email, :customer_phone, :special_requests, :total_amount, :receipt_url, :status, :payment_status)'
        );

        $bookings = [
            [
                'id' => 'booking-1',
                'created_date' => '2026-02-20 08:00:00',
                'updated_date' => '2026-02-20 08:00:00',
                'booking_reference' => 'KI-240220-001',
                'package_id' => 'pkg-day',
                'package_name' => 'Sunrise Day Escape',
                'tour_type' => 'day_tour',
                'booking_date' => '2026-03-20',
                'guest_count' => 8,
                'customer_name' => 'Local Guest',
                'customer_email' => 'guest@kasa-ilaya.local',
                'customer_phone' => '09171234567',
                'special_requests' => 'Birthday setup near the pool.',
                'total_amount' => 2499,
                'receipt_url' => '',
                'status' => 'confirmed',
                'payment_status' => 'paid',
            ],
            [
                'id' => 'booking-2',
                'created_date' => '2026-02-15 08:00:00',
                'updated_date' => '2026-02-15 08:00:00',
                'booking_reference' => 'KI-240215-002',
                'package_id' => 'pkg-night',
                'package_name' => 'Moonlight Chill Night Tour',
                'tour_type' => 'night_tour',
                'booking_date' => '2026-02-28',
                'guest_count' => 6,
                'customer_name' => 'Local Guest',
                'customer_email' => 'guest@kasa-ilaya.local',
                'customer_phone' => '09171234567',
                'special_requests' => 'Need a quieter dining spot.',
                'total_amount' => 3299,
                'receipt_url' => '',
                'status' => 'completed',
                'payment_status' => 'paid',
            ],
            [
                'id' => 'booking-3',
                'created_date' => '2026-03-01 08:00:00',
                'updated_date' => '2026-03-01 08:00:00',
                'booking_reference' => 'KI-240301-003',
                'package_id' => 'pkg-stay',
                'package_name' => '22-Hour Resort Stay',
                'tour_type' => '22_hours',
                'booking_date' => '2026-04-05',
                'guest_count' => 12,
                'customer_name' => 'Kasa Ilaya Admin',
                'customer_email' => 'admin@kasa-ilaya.local',
                'customer_phone' => '09998887777',
                'special_requests' => 'Corporate retreat setup.',
                'total_amount' => 5999,
                'receipt_url' => '',
                'status' => 'pending',
                'payment_status' => 'pending_verification',
            ],
        ];

        foreach ($bookings as $booking) {
            $statement->execute($booking);
        }
    }

    $reviewCount = (int) $pdo->query('SELECT COUNT(*) FROM reviews')->fetchColumn();
    if ($reviewCount === 0) {
        $statement = $pdo->prepare(
            'INSERT INTO reviews (id, created_date, updated_date, booking_id, booking_reference, guest_name, guest_email, package_name, rating, review_text, is_approved)
             VALUES (:id, :created_date, :updated_date, :booking_id, :booking_reference, :guest_name, :guest_email, :package_name, :rating, :review_text, :is_approved)'
        );

        $reviews = [
            [
                'id' => 'review-1',
                'created_date' => '2026-02-18 08:00:00',
                'updated_date' => '2026-02-18 08:00:00',
                'booking_id' => 'booking-2',
                'booking_reference' => 'KI-240215-002',
                'guest_name' => 'Local Guest',
                'guest_email' => 'guest@kasa-ilaya.local',
                'package_name' => 'Moonlight Chill Night Tour',
                'rating' => 5,
                'review_text' => 'Very clean pool area and the staff handled our requests quickly.',
                'is_approved' => 1,
            ],
            [
                'id' => 'review-2',
                'created_date' => '2026-02-10 08:00:00',
                'updated_date' => '2026-02-10 08:00:00',
                'booking_id' => 'booking-1',
                'booking_reference' => 'KI-240220-001',
                'guest_name' => 'Celine Ramos',
                'guest_email' => 'celine@example.com',
                'package_name' => 'Sunrise Day Escape',
                'rating' => 4,
                'review_text' => 'The venue was easy to find and the cottage setup was worth it.',
                'is_approved' => 1,
            ],
        ];

        foreach ($reviews as $review) {
            $statement->execute($review);
        }
    }

    $foundItemCount = (int) $pdo->query('SELECT COUNT(*) FROM found_items')->fetchColumn();
    if ($foundItemCount === 0) {
        $statement = $pdo->prepare(
            'INSERT INTO found_items (id, created_date, updated_date, item_name, description, date_found, location_found, found_by, status, image_url, claimed_guest_name, claimed_contact, claimed_reservation_id, proof_of_ownership, released_by, date_claimed)
             VALUES (:id, :created_date, :updated_date, :item_name, :description, :date_found, :location_found, :found_by, :status, :image_url, :claimed_guest_name, :claimed_contact, :claimed_reservation_id, :proof_of_ownership, :released_by, :date_claimed)'
        );

        $items = [
            [
                'id' => 'found-1',
                'created_date' => '2026-03-01 08:00:00',
                'updated_date' => '2026-03-01 08:00:00',
                'item_name' => 'Black Wallet',
                'description' => 'Leather wallet with a silver zipper.',
                'date_found' => '2026-03-01',
                'location_found' => 'Reception',
                'found_by' => 'Front Desk Team',
                'status' => 'unclaimed',
                'image_url' => '',
                'claimed_guest_name' => null,
                'claimed_contact' => null,
                'claimed_reservation_id' => null,
                'proof_of_ownership' => null,
                'released_by' => null,
                'date_claimed' => null,
            ],
            [
                'id' => 'found-2',
                'created_date' => '2026-03-03 08:00:00',
                'updated_date' => '2026-03-03 08:00:00',
                'item_name' => 'Blue Water Bottle',
                'description' => 'Insulated tumbler left by the pool.',
                'date_found' => '2026-03-03',
                'location_found' => 'Pool Area',
                'found_by' => 'Pool Attendant',
                'status' => 'unclaimed',
                'image_url' => '',
                'claimed_guest_name' => null,
                'claimed_contact' => null,
                'claimed_reservation_id' => null,
                'proof_of_ownership' => null,
                'released_by' => null,
                'date_claimed' => null,
            ],
        ];

        foreach ($items as $item) {
            $statement->execute($item);
        }
    }

    $lostReportCount = (int) $pdo->query('SELECT COUNT(*) FROM lost_item_reports')->fetchColumn();
    if ($lostReportCount === 0) {
        $statement = $pdo->prepare(
            'INSERT INTO lost_item_reports (id, created_date, updated_date, guest_name, reservation_number, item_lost, description, date_lost, contact_number, email, status, matched_item_id)
             VALUES (:id, :created_date, :updated_date, :guest_name, :reservation_number, :item_lost, :description, :date_lost, :contact_number, :email, :status, :matched_item_id)'
        );

        $reports = [
            [
                'id' => 'lost-1',
                'created_date' => '2026-03-04 08:00:00',
                'updated_date' => '2026-03-04 08:00:00',
                'guest_name' => 'Local Guest',
                'reservation_number' => 'KI-240220-001',
                'item_lost' => 'Wallet',
                'description' => 'Black wallet with company ID inside.',
                'date_lost' => '2026-03-02',
                'contact_number' => '09171234567',
                'email' => 'guest@kasa-ilaya.local',
                'status' => 'searching',
                'matched_item_id' => null,
            ],
        ];

        foreach ($reports as $report) {
            $statement->execute($report);
        }
    }

    $activityCount = (int) $pdo->query('SELECT COUNT(*) FROM activity_logs')->fetchColumn();
    if ($activityCount === 0) {
        $statement = $pdo->prepare(
            'INSERT INTO activity_logs (id, created_date, updated_date, user_email, user_name, action, entity_type, entity_id, details)
             VALUES (:id, :created_date, :updated_date, :user_email, :user_name, :action, :entity_type, :entity_id, :details)'
        );

        $statement->execute([
            'id' => 'log-1',
            'created_date' => '2026-03-01 08:00:00',
            'updated_date' => '2026-03-01 08:00:00',
            'user_email' => 'admin@kasa-ilaya.local',
            'user_name' => 'Kasa Ilaya Admin',
            'action' => 'Seeded Database',
            'entity_type' => 'System',
            'entity_id' => 'database-seed',
            'details' => 'Initialized MySQL demo data for local development.',
        ]);
    }

    $scheduleCount = (int) $pdo->query('SELECT COUNT(*) FROM upcoming_schedules')->fetchColumn();
    if ($scheduleCount === 0) {
        $statement = $pdo->prepare(
            'INSERT INTO upcoming_schedules (id, created_date, updated_date, title, schedule_date, start_time, end_time, location, description, created_by_name, created_by_email)
             VALUES (:id, :created_date, :updated_date, :title, :schedule_date, :start_time, :end_time, :location, :description, :created_by_name, :created_by_email)'
        );

        $schedules = [
            [
                'id' => 'schedule-1',
                'created_date' => '2026-03-05 08:00:00',
                'updated_date' => '2026-03-05 08:00:00',
                'title' => 'Family Swim Day',
                'schedule_date' => '2026-03-18',
                'start_time' => '09:00',
                'end_time' => '17:00',
                'location' => 'Main Pool Area',
                'description' => 'Reserved for a family pool day with cottage setup and lunch service.',
                'created_by_name' => 'Kasa Ilaya Admin',
                'created_by_email' => 'admin@kasa-ilaya.local',
            ],
            [
                'id' => 'schedule-2',
                'created_date' => '2026-03-06 10:30:00',
                'updated_date' => '2026-03-06 10:30:00',
                'title' => 'Corporate Team Building',
                'schedule_date' => '2026-03-22',
                'start_time' => '08:00',
                'end_time' => '20:00',
                'location' => 'Event Pavilion',
                'description' => 'Whole-day company event with venue styling and sound system support.',
                'created_by_name' => 'Kasa Ilaya Admin',
                'created_by_email' => 'admin@kasa-ilaya.local',
            ],
        ];

        foreach ($schedules as $schedule) {
            $statement->execute($schedule);
        }
    }

    $ruleCount = (int) $pdo->query('SELECT COUNT(*) FROM resort_rules')->fetchColumn();
    if ($ruleCount === 0) {
        $statement = $pdo->prepare(
            'INSERT INTO resort_rules (id, created_date, updated_date, title, description, sort_order, is_active)
             VALUES (:id, :created_date, :updated_date, :title, :description, :sort_order, :is_active)'
        );

        $rules = [
            [
                'id' => 'rule-1',
                'created_date' => '2026-03-01 08:00:00',
                'updated_date' => '2026-03-01 08:00:00',
                'title' => 'Observe check-in schedule',
                'description' => 'Guests must arrive within their reserved tour time and present a valid booking reference at entry.',
                'sort_order' => 1,
                'is_active' => 1,
            ],
            [
                'id' => 'rule-2',
                'created_date' => '2026-03-01 08:00:00',
                'updated_date' => '2026-03-01 08:00:00',
                'title' => 'Respect guest capacity',
                'description' => 'Only the confirmed number of guests included in the reservation may enter unless approved by resort staff.',
                'sort_order' => 2,
                'is_active' => 1,
            ],
            [
                'id' => 'rule-3',
                'created_date' => '2026-03-01 08:00:00',
                'updated_date' => '2026-03-01 08:00:00',
                'title' => 'Keep the resort clean',
                'description' => 'Dispose of trash properly and help maintain cottages, pools, and shared areas in good condition.',
                'sort_order' => 3,
                'is_active' => 1,
            ],
            [
                'id' => 'rule-4',
                'created_date' => '2026-03-01 08:00:00',
                'updated_date' => '2026-03-01 08:00:00',
                'title' => 'Handle resort property carefully',
                'description' => 'Damaged or missing resort items may be charged to the guest responsible for the reservation.',
                'sort_order' => 4,
                'is_active' => 1,
            ],
            [
                'id' => 'rule-5',
                'created_date' => '2026-03-01 08:00:00',
                'updated_date' => '2026-03-01 08:00:00',
                'title' => 'Follow safety instructions',
                'description' => 'Pool, event, and activity areas must be used according to posted guidelines and staff instructions.',
                'sort_order' => 5,
                'is_active' => 1,
            ],
            [
                'id' => 'rule-6',
                'created_date' => '2026-03-01 08:00:00',
                'updated_date' => '2026-03-01 08:00:00',
                'title' => 'Payments are subject to verification',
                'description' => 'Reservation fees and uploaded payment proofs are reviewed by admin before final booking confirmation.',
                'sort_order' => 6,
                'is_active' => 1,
            ],
        ];

        foreach ($rules as $rule) {
            $statement->execute($rule);
        }
    }
}

function entity_map(): array
{
    return [
        'ActivityLog' => [
            'table' => 'activity_logs',
            'fields' => ['id', 'created_date', 'updated_date', 'user_email', 'user_name', 'action', 'entity_type', 'entity_id', 'details'],
            'date_fields' => ['created_date', 'updated_date'],
        ],
        'Booking' => [
            'table' => 'bookings',
            'fields' => ['id', 'created_date', 'updated_date', 'booking_reference', 'package_id', 'package_name', 'tour_type', 'booking_date', 'guest_count', 'customer_name', 'customer_email', 'customer_phone', 'special_requests', 'total_amount', 'reservation_fee_amount', 'payment_qr_code_id', 'payment_qr_code_label', 'receipt_url', 'status', 'payment_status'],
            'date_fields' => ['created_date', 'updated_date'],
            'plain_date_fields' => ['booking_date'],
            'numeric_fields' => ['guest_count', 'total_amount', 'reservation_fee_amount'],
        ],
        'FoundItem' => [
            'table' => 'found_items',
            'fields' => ['id', 'created_date', 'updated_date', 'item_name', 'description', 'date_found', 'location_found', 'found_by', 'status', 'image_url', 'claimed_guest_name', 'claimed_contact', 'claimed_reservation_id', 'proof_of_ownership', 'released_by', 'date_claimed', 'is_active'],
            'date_fields' => ['created_date', 'updated_date'],
            'plain_date_fields' => ['date_found', 'date_claimed'],
            'bool_fields' => ['is_active'],
        ],
        'LostItemReport' => [
            'table' => 'lost_item_reports',
            'fields' => ['id', 'created_date', 'updated_date', 'guest_name', 'reservation_number', 'item_lost', 'description', 'date_lost', 'contact_number', 'email', 'status', 'matched_item_id'],
            'date_fields' => ['created_date', 'updated_date'],
            'plain_date_fields' => ['date_lost'],
        ],
        'Package' => [
            'table' => 'packages',
            'fields' => ['id', 'created_date', 'updated_date', 'name', 'description', 'tour_type', 'price', 'day_tour_price', 'night_tour_price', 'twenty_two_hour_price', 'max_guests', 'inclusions', 'gallery_images', 'image_url', 'is_active'],
            'date_fields' => ['created_date', 'updated_date'],
            'json_fields' => ['inclusions', 'gallery_images'],
            'bool_fields' => ['is_active'],
            'numeric_fields' => ['price', 'day_tour_price', 'night_tour_price', 'twenty_two_hour_price', 'max_guests'],
        ],
        'PaymentQrCode' => [
            'table' => 'payment_qr_codes',
            'fields' => ['id', 'created_date', 'updated_date', 'label', 'account_name', 'account_number', 'instructions', 'image_url', 'display_order', 'is_active'],
            'date_fields' => ['created_date', 'updated_date'],
            'bool_fields' => ['is_active'],
            'numeric_fields' => ['display_order'],
        ],
        'ResortRule' => [
            'table' => 'resort_rules',
            'fields' => ['id', 'created_date', 'updated_date', 'title', 'description', 'sort_order', 'is_active'],
            'date_fields' => ['created_date', 'updated_date'],
            'bool_fields' => ['is_active'],
            'numeric_fields' => ['sort_order'],
        ],
        'SiteSetting' => [
            'table' => 'site_settings',
            'fields' => ['id', 'created_date', 'updated_date', 'site_name', 'logo_url', 'hero_image_url', 'hero_images_json', 'packages_banner_url', 'packages_banner_images_json', 'hero_badge_text', 'hero_title_line1', 'hero_title_line2', 'hero_description', 'body_font_style', 'heading_font_style', 'amenities_section_label', 'amenities_section_title', 'amenities_section_description', 'resort_gallery_json', 'terms_title', 'terms_summary', 'terms_content', 'amenities_json', 'require_strong_password', 'min_password_length', 'session_timeout_minutes', 'max_login_attempts', 'lockout_minutes', 'enable_login_notifications'],
            'date_fields' => ['created_date', 'updated_date'],
            'bool_fields' => ['require_strong_password', 'enable_login_notifications'],
            'numeric_fields' => ['min_password_length', 'session_timeout_minutes', 'max_login_attempts', 'lockout_minutes'],
            'json_fields' => ['hero_images_json', 'packages_banner_images_json', 'resort_gallery_json', 'amenities_json'],
        ],
        'User' => [
            'table' => 'users',
            'fields' => ['id', 'created_date', 'updated_date', 'email', 'full_name', 'phone', 'role', 'disabled', 'is_verified', 'app_id', 'is_service', 'app_role'],
            'date_fields' => ['created_date', 'updated_date'],
            'bool_fields' => ['disabled', 'is_verified', 'is_service'],
        ],
        'UpcomingSchedule' => [
            'table' => 'upcoming_schedules',
            'fields' => ['id', 'created_date', 'updated_date', 'title', 'schedule_date', 'start_time', 'end_time', 'location', 'description', 'created_by_name', 'created_by_email'],
            'date_fields' => ['created_date', 'updated_date'],
            'plain_date_fields' => ['schedule_date'],
        ],
        'Review' => [
            'table' => 'reviews',
            'fields' => ['id', 'created_date', 'updated_date', 'booking_id', 'booking_reference', 'guest_name', 'guest_email', 'package_name', 'rating', 'review_text', 'is_approved'],
            'date_fields' => ['created_date', 'updated_date'],
            'bool_fields' => ['is_approved'],
            'numeric_fields' => ['rating'],
        ],
    ];
}

function entity_config(string $entity): array
{
    $map = entity_map();

    if (!isset($map[$entity])) {
        json_error('Unsupported entity: ' . $entity, 404);
    }

    return $map[$entity];
}

function serialize_value(array $config, string $field, $value)
{
    if (in_array($field, $config['json_fields'] ?? [], true)) {
        return $value === null ? null : json_encode($value, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    }

    if (in_array($field, $config['bool_fields'] ?? [], true)) {
        return $value ? 1 : 0;
    }

    if (in_array($field, $config['date_fields'] ?? [], true)) {
        return $value ? mysql_datetime((string) $value) : null;
    }

    if (in_array($field, $config['plain_date_fields'] ?? [], true)) {
        return $value ? mysql_date((string) $value) : null;
    }

    return $value;
}

function deserialize_row(array $config, array $row): array
{
    foreach ($row as $field => $value) {
        if ($value === null) {
            continue;
        }

        if (in_array($field, $config['json_fields'] ?? [], true)) {
            $decoded = json_decode((string) $value, true);
            $row[$field] = is_array($decoded) ? $decoded : [];
            continue;
        }

        if (in_array($field, $config['bool_fields'] ?? [], true)) {
            $row[$field] = (bool) $value;
            continue;
        }

        if (in_array($field, $config['numeric_fields'] ?? [], true)) {
            $number = (float) $value;
            $row[$field] = floor($number) === $number ? (int) $number : $number;
            continue;
        }

        if (in_array($field, $config['date_fields'] ?? [], true)) {
            $row[$field] = str_replace(' ', 'T', (string) $value) . '.000Z';
        }
    }

    return $row;
}

function current_user(): ?array
{
    $userId = $_SESSION['user_id'] ?? null;
    if (!$userId) {
        return null;
    }

    $settings = security_settings();
    $timeoutSeconds = max(10, (int) ($settings['session_timeout_minutes'] ?? 120)) * 60;
    $lastActivityAt = (int) ($_SESSION['last_activity_at'] ?? $_SESSION['authenticated_at'] ?? 0);

    if ($lastActivityAt > 0 && (time() - $lastActivityAt) > $timeoutSeconds) {
        unset($_SESSION['user_id'], $_SESSION['authenticated_at'], $_SESSION['last_activity_at']);
        return null;
    }

    $statement = db()->prepare('SELECT * FROM users WHERE id = :id LIMIT 1');
    $statement->execute(['id' => $userId]);
    $user = $statement->fetch();

    if (!$user || (int) ($user['disabled'] ?? 0) === 1) {
        unset($_SESSION['user_id'], $_SESSION['authenticated_at'], $_SESSION['last_activity_at']);
        return null;
    }

    $_SESSION['last_activity_at'] = time();

    return public_user_payload($user);
}

function security_settings_defaults(): array
{
    return [
        'require_strong_password' => true,
        'min_password_length' => 8,
        'session_timeout_minutes' => 120,
        'max_login_attempts' => 5,
        'lockout_minutes' => 15,
        'enable_login_notifications' => true,
    ];
}

function security_settings(): array
{
    static $cached = null;

    if ($cached !== null) {
        return $cached;
    }

    $defaults = security_settings_defaults();
    $pdo = db();

    if (!table_exists($pdo, 'site_settings')) {
        $cached = $defaults;
        return $cached;
    }

    try {
        $statement = $pdo->query(
            'SELECT require_strong_password, min_password_length, session_timeout_minutes, max_login_attempts, lockout_minutes, enable_login_notifications
             FROM site_settings
             ORDER BY updated_date DESC, created_date DESC
             LIMIT 1'
        );
        $record = $statement->fetch();
    } catch (Throwable $exception) {
        $cached = $defaults;
        return $cached;
    }

    if (!$record) {
        $cached = $defaults;
        return $cached;
    }

    $cached = [
        'require_strong_password' => array_key_exists('require_strong_password', $record) ? (bool) $record['require_strong_password'] : $defaults['require_strong_password'],
        'min_password_length' => max(6, (int) ($record['min_password_length'] ?? $defaults['min_password_length'])),
        'session_timeout_minutes' => max(10, (int) ($record['session_timeout_minutes'] ?? $defaults['session_timeout_minutes'])),
        'max_login_attempts' => max(1, (int) ($record['max_login_attempts'] ?? $defaults['max_login_attempts'])),
        'lockout_minutes' => max(1, (int) ($record['lockout_minutes'] ?? $defaults['lockout_minutes'])),
        'enable_login_notifications' => array_key_exists('enable_login_notifications', $record) ? (bool) $record['enable_login_notifications'] : $defaults['enable_login_notifications'],
    ];

    return $cached;
}

function public_user_payload(array $user): array
{
    return [
        'id' => $user['id'],
        'created_date' => str_replace(' ', 'T', (string) $user['created_date']) . '.000Z',
        'updated_date' => str_replace(' ', 'T', (string) $user['updated_date']) . '.000Z',
        'email' => $user['email'],
        'full_name' => $user['full_name'],
        'phone' => $user['phone'] ?? null,
        'disabled' => (bool) $user['disabled'],
        'is_verified' => (bool) $user['is_verified'],
        'app_id' => $user['app_id'],
        'is_service' => (bool) $user['is_service'],
        '_app_role' => $user['app_role'],
        'role' => $user['role'],
    ];
}

function find_user_by_email(string $email): ?array
{
    $statement = db()->prepare('SELECT * FROM users WHERE email = :email LIMIT 1');
    $statement->execute(['email' => mb_strtolower(trim($email))]);
    $user = $statement->fetch();
    return $user ?: null;
}
