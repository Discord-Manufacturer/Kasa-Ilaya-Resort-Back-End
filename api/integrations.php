<?php

declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

$action = (string) query_param('action', '');
$method = request_method();

function packages_summary(): array
{
    $statement = db()->query('SELECT name, price, max_guests FROM packages WHERE is_active = 1 ORDER BY created_date DESC');
    return $statement->fetchAll();
}

try {
    if ($action === 'upload-file' && $method === 'POST') {
        if (!isset($_FILES['file']) || !is_array($_FILES['file'])) {
            json_error('No file uploaded.', 422);
        }

        $file = $_FILES['file'];
        if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
            json_error('File upload failed.', 422);
        }

        $config = app_config();
        $extension = pathinfo((string) $file['name'], PATHINFO_EXTENSION);
        $targetDir = $config['uploads_path'] . '/' . gmdate('Y/m');
        if (!is_dir($targetDir) && !mkdir($targetDir, 0777, true) && !is_dir($targetDir)) {
            throw new RuntimeException('Unable to create upload directory.');
        }

        $fileName = uniqid('upload_', true) . ($extension ? '.' . strtolower($extension) : '');
        $targetPath = $targetDir . '/' . $fileName;

        if (!move_uploaded_file((string) $file['tmp_name'], $targetPath)) {
            throw new RuntimeException('Unable to save uploaded file.');
        }

        $relative = 'uploads/' . gmdate('Y/m') . '/' . $fileName;
        json_response([
            'file_url' => absolute_api_url($relative),
        ]);
    }

    if ($action === 'send-email' && $method === 'POST') {
        $payload = request_body();
        $result = send_app_email(
            (string) ($payload['to'] ?? ''),
            (string) ($payload['subject'] ?? ''),
            (string) ($payload['body'] ?? '')
        );

        json_response($result, ($result['sent'] ?? false) ? 200 : 202);
    }

    if ($action === 'invoke-llm' && $method === 'POST') {
        $payload = request_body();
        $prompt = strtolower((string) ($payload['prompt'] ?? ''));
        $packages = packages_summary();

        if (str_contains($prompt, 'package') || str_contains($prompt, 'price')) {
            $lines = array_map(
                static fn(array $item): string => '- ' . $item['name'] . ': PHP ' . number_format((float) $item['price'], 0) . ' for up to ' . $item['max_guests'] . ' guests',
                $packages
            );
            json_response(['response' => "Here are the current packages:\n" . implode("\n", $lines) . "\n\nYou can open the Packages page and book directly."]);
        }

        if (str_contains($prompt, 'book')) {
            json_response(['response' => 'To make a booking, open the Packages page, choose a package, and submit the reservation form. Your booking will be stored in the local database.']);
        }

        if (str_contains($prompt, 'lost') || str_contains($prompt, 'found')) {
            json_response(['response' => 'The Lost and Found pages are connected to the local database. Guests can submit reports, and admins can manage found items and claim records.']);
        }

        json_response(['response' => 'I can help with packages, bookings, amenities, and lost-and-found questions for Kasa Ilaya Resort.']);
    }

    json_error('Unsupported integration action.', 405);
} catch (Throwable $error) {
    json_error($error->getMessage(), 500);
}
