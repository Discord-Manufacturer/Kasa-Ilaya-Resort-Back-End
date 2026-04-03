<?php

declare(strict_types=1);

function merge_local_config(array $base, array $overrides): array
{
    foreach ($overrides as $key => $value) {
        if (is_array($value) && isset($base[$key]) && is_array($base[$key])) {
            $base[$key] = merge_local_config($base[$key], $value);
            continue;
        }

        $base[$key] = $value;
    }

    return $base;
}

$projectName = basename(dirname(__DIR__));

$config = [
    'db' => [
        'host' => getenv('KASA_DB_HOST') ?: '127.0.0.1',
        'port' => getenv('KASA_DB_PORT') ?: '3306',
        'name' => getenv('KASA_DB_NAME') ?: 'kasa_ilaya_resort',
        'user' => getenv('KASA_DB_USER') ?: 'root',
        'pass' => getenv('KASA_DB_PASS') ?: '',
        'charset' => 'utf8mb4',
    ],
    'project_name' => $projectName,
    'api_path' => '/' . $projectName . '/api',
    'uploads_path' => __DIR__ . '/uploads',
    'frontend_url' => rtrim((string) (getenv('KASA_FRONTEND_URL') ?: ''), '/'),
    'mail' => [
        'enabled' => filter_var(getenv('KASA_MAIL_ENABLED') ?: 'false', FILTER_VALIDATE_BOOLEAN),
        'host' => getenv('KASA_SMTP_HOST') ?: 'smtp.gmail.com',
        'port' => (int) (getenv('KASA_SMTP_PORT') ?: 587),
        'username' => getenv('KASA_SMTP_USER') ?: '',
        'password' => getenv('KASA_SMTP_PASS') ?: '',
        'api_key' => getenv('KASA_SMTP_API_KEY') ?: '',
        'encryption' => strtolower((string) (getenv('KASA_SMTP_ENCRYPTION') ?: 'tls')),
        'from_email' => getenv('KASA_MAIL_FROM_EMAIL') ?: (getenv('KASA_SMTP_USER') ?: ''),
        'from_name' => getenv('KASA_MAIL_FROM_NAME') ?: 'Kasa Ilaya Resort',
        'reply_to_email' => getenv('KASA_MAIL_REPLY_TO_EMAIL') ?: '',
        'reply_to_name' => getenv('KASA_MAIL_REPLY_TO_NAME') ?: '',
        'timeout' => (int) (getenv('KASA_SMTP_TIMEOUT') ?: 20),
    ],
    'registration' => [
        'temporary_verification_code' => trim((string) (getenv('KASA_TEMP_REGISTRATION_OTP') ?: '123456')),
    ],
    'google' => [
        'client_id' => trim((string) (getenv('KASA_GOOGLE_CLIENT_ID') ?: '')),
    ],
];

$localConfigPath = __DIR__ . '/config.local.php';
if (is_file($localConfigPath)) {
    $localConfig = require $localConfigPath;
    if (is_array($localConfig)) {
        $config = merge_local_config($config, $localConfig);
    }
}

return $config;
