<?php

declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

$entity = (string) query_param('entity', '');
$config = entity_config($entity);
$table = $config['table'];
$fields = $config['fields'];
$method = request_method();

function is_super_admin_actor(?array $actor): bool
{
    if (!$actor) {
        return false;
    }

    $role = (string) ($actor['role'] ?? '');
    $appRole = (string) ($actor['_app_role'] ?? $actor['app_role'] ?? '');

    return $role === 'super_admin' || $appRole === 'super_admin';
}

if ($entity === 'User') {
    $actor = current_user();

    if (!is_super_admin_actor($actor)) {
        json_error('Forbidden.', 403);
    }
}

function validate_booking_constraints(array $record, ?string $excludeId = null): void
{
    $packageId = (string) ($record['package_id'] ?? '');
    $guestCount = isset($record['guest_count']) ? (int) $record['guest_count'] : 0;
    $bookingDate = (string) ($record['booking_date'] ?? '');
    $tourType = (string) ($record['tour_type'] ?? '');
    $customerEmail = mb_strtolower(trim((string) ($record['customer_email'] ?? '')));
    $status = (string) ($record['status'] ?? 'pending');

    if ($packageId === '' || $guestCount < 1) {
        json_error('Booking must include a valid package and guest count.', 422);
    }

    if ($bookingDate === '' || $tourType === '') {
        json_error('Booking must include a valid date and tour type.', 422);
    }

    if ($customerEmail === '') {
        json_error('Booking must include a valid customer email.', 422);
    }

    $statement = db()->prepare('SELECT max_guests FROM packages WHERE id = :id LIMIT 1');
    $statement->execute(['id' => $packageId]);
    $package = $statement->fetch();

    if (!$package) {
        json_error('Selected package was not found.', 404);
    }

    $maxGuests = (int) ($package['max_guests'] ?? 0);
    if ($maxGuests < 1) {
        json_error('This package is not configured with a valid guest limit.', 422);
    }

    if ($guestCount > $maxGuests) {
        json_error('Guest count exceeds the allowed limit for this package.', 422);
    }

    $activeStatuses = ['pending', 'confirmed', 'completed'];
    if (!in_array($status, $activeStatuses, true)) {
        return;
    }

    $duplicateSql = 'SELECT id FROM bookings
        WHERE package_id = :package_id
          AND booking_date = :booking_date
          AND tour_type = :tour_type
          AND customer_email = :customer_email
          AND status IN (\'pending\', \'confirmed\', \'completed\')';

    $duplicateParams = [
        'package_id' => $packageId,
        'booking_date' => $bookingDate,
        'tour_type' => $tourType,
        'customer_email' => $customerEmail,
    ];

    if ($excludeId !== null) {
        $duplicateSql .= ' AND id <> :exclude_id';
        $duplicateParams['exclude_id'] = $excludeId;
    }

    $duplicateSql .= ' LIMIT 1';
    $duplicateStatement = db()->prepare($duplicateSql);
    $duplicateStatement->execute($duplicateParams);

    if ($duplicateStatement->fetch()) {
        json_error('You already have an active reservation for this package, date, and tour type.', 409);
    }

    $availabilitySql = 'SELECT COUNT(*) FROM bookings
        WHERE package_id = :package_id
          AND booking_date = :booking_date
          AND tour_type = :tour_type
          AND status IN (\'pending\', \'confirmed\', \'completed\')';

    $availabilityParams = [
        'package_id' => $packageId,
        'booking_date' => $bookingDate,
        'tour_type' => $tourType,
    ];

    if ($excludeId !== null) {
        $availabilitySql .= ' AND id <> :exclude_id';
        $availabilityParams['exclude_id'] = $excludeId;
    }

    $availabilityStatement = db()->prepare($availabilitySql);
    $availabilityStatement->execute($availabilityParams);
    $activeBookingCount = (int) $availabilityStatement->fetchColumn();

    if ($activeBookingCount >= 1) {
        json_error('This date is already fully reserved for the selected package and tour type.', 409);
    }
}

function validate_review_constraints(array &$record, ?string $excludeId = null): void
{
    $bookingId = (string) ($record['booking_id'] ?? '');
    $guestEmail = mb_strtolower(trim((string) ($record['guest_email'] ?? '')));
    $rating = isset($record['rating']) ? (int) $record['rating'] : 0;
    $reviewText = trim((string) ($record['review_text'] ?? ''));

    if ($bookingId === '' || $guestEmail === '' || $rating < 1 || $rating > 5 || $reviewText === '') {
        json_error('Review must include a valid booking, email, rating, and review text.', 422);
    }

    $bookingStatement = db()->prepare('SELECT * FROM bookings WHERE id = :id LIMIT 1');
    $bookingStatement->execute(['id' => $bookingId]);
    $booking = $bookingStatement->fetch();

    if (!$booking) {
        json_error('Booking for this review was not found.', 404);
    }

    if (!booking_review_is_available($booking)) {
        json_error('Reviews are available only after the booked stay or tour has ended.', 422);
    }

    if (mb_strtolower(trim((string) ($booking['customer_email'] ?? ''))) !== $guestEmail) {
        json_error('Review email does not match the booking owner.', 403);
    }

    $reviewSql = 'SELECT id FROM reviews WHERE booking_id = :booking_id';
    $reviewParams = ['booking_id' => $bookingId];

    if ($excludeId !== null) {
        $reviewSql .= ' AND id <> :exclude_id';
        $reviewParams['exclude_id'] = $excludeId;
    }

    $reviewSql .= ' LIMIT 1';
    $reviewStatement = db()->prepare($reviewSql);
    $reviewStatement->execute($reviewParams);

    if ($reviewStatement->fetch()) {
        json_error('A review has already been submitted for this booking.', 409);
    }

    $record['guest_name'] = (string) ($booking['customer_name'] ?? $record['guest_name'] ?? 'Guest');
    $record['package_name'] = (string) ($booking['package_name'] ?? $record['package_name'] ?? '');
    $record['booking_reference'] = (string) ($booking['booking_reference'] ?? $record['booking_reference'] ?? '');
    $record['is_approved'] = true;
}

function booking_review_is_available(array $booking): bool
{
    $status = (string) ($booking['status'] ?? '');
    if ($status === 'cancelled' || $status === 'pending') {
        return false;
    }

    $bookingDate = trim((string) ($booking['booking_date'] ?? ''));
    $tourType = trim((string) ($booking['tour_type'] ?? ''));

    if ($bookingDate === '' || $tourType === '') {
        return false;
    }

    try {
        $timezone = new DateTimeZone('Asia/Manila');
        $start = new DateTimeImmutable($bookingDate . ' 08:00:00', $timezone);

        if ($tourType === 'day_tour') {
            $end = new DateTimeImmutable($bookingDate . ' 18:00:00', $timezone);
        } elseif ($tourType === 'night_tour') {
            $start = new DateTimeImmutable($bookingDate . ' 18:00:00', $timezone);
            $end = $start->modify('+12 hours');
        } elseif ($tourType === '22_hours') {
            $end = $start->modify('+22 hours');
        } else {
            return false;
        }

        $now = new DateTimeImmutable('now', $timezone);
        return $now >= $end;
    } catch (Throwable $exception) {
        return false;
    }
}

function validate_upcoming_schedule_constraints(array &$record): void
{
    $title = trim((string) ($record['title'] ?? ''));
    $scheduleDate = trim((string) ($record['schedule_date'] ?? ''));
    $startTime = trim((string) ($record['start_time'] ?? ''));
    $endTime = trim((string) ($record['end_time'] ?? ''));

    if ($title === '' || $scheduleDate === '') {
        json_error('Schedule must include a title and date.', 422);
    }

    if ($startTime !== '' && !preg_match('/^\d{2}:\d{2}$/', $startTime)) {
        json_error('Start time must use HH:MM format.', 422);
    }

    if ($endTime !== '' && !preg_match('/^\d{2}:\d{2}$/', $endTime)) {
        json_error('End time must use HH:MM format.', 422);
    }

    if ($startTime !== '' && $endTime !== '' && strcmp($startTime, $endTime) >= 0) {
        json_error('End time must be later than start time.', 422);
    }

    $record['title'] = $title;
    $record['schedule_date'] = $scheduleDate;
    $record['start_time'] = $startTime === '' ? null : $startTime;
    $record['end_time'] = $endTime === '' ? null : $endTime;
    $record['location'] = trim((string) ($record['location'] ?? '')) ?: null;
    $record['description'] = trim((string) ($record['description'] ?? '')) ?: null;
    $record['created_by_name'] = trim((string) ($record['created_by_name'] ?? '')) ?: null;
    $record['created_by_email'] = trim((string) ($record['created_by_email'] ?? '')) ?: null;
}

function validate_payment_qr_code_constraints(array &$record, ?string $excludeId = null): void
{
    $label = trim((string) ($record['label'] ?? ''));
    $imageUrl = trim((string) ($record['image_url'] ?? ''));
    $displayOrder = isset($record['display_order']) ? (int) $record['display_order'] : 1;

    if ($label === '' || $imageUrl === '') {
        json_error('QR code entries must include a label and QR image.', 422);
    }

    if ($displayOrder < 1 || $displayOrder > 3) {
        json_error('QR code display order must be between 1 and 3.', 422);
    }

    $countSql = 'SELECT COUNT(*) FROM payment_qr_codes';
    $params = [];

    if ($excludeId !== null) {
        $countSql .= ' WHERE id <> :exclude_id';
        $params['exclude_id'] = $excludeId;
    }

    $statement = db()->prepare($countSql);
    $statement->execute($params);
    $otherCount = (int) $statement->fetchColumn();

    if ($otherCount >= 3) {
        json_error('You can manage up to 3 QR codes only.', 422);
    }

    $record['label'] = $label;
    $record['image_url'] = $imageUrl;
    $record['account_name'] = trim((string) ($record['account_name'] ?? '')) ?: null;
    $record['account_number'] = trim((string) ($record['account_number'] ?? '')) ?: null;
    $record['instructions'] = trim((string) ($record['instructions'] ?? '')) ?: null;
    $record['display_order'] = $displayOrder;
    $record['is_active'] = array_key_exists('is_active', $record) ? (bool) $record['is_active'] : true;
}

function validate_resort_rule_constraints(array &$record): void
{
    $title = trim((string) ($record['title'] ?? ''));
    $description = trim((string) ($record['description'] ?? ''));
    $sortOrder = isset($record['sort_order']) ? (int) $record['sort_order'] : 1;

    if ($title === '' || $description === '') {
        json_error('Resort rules must include a title and description.', 422);
    }

    $record['title'] = $title;
    $record['description'] = $description;
    $record['sort_order'] = max(1, $sortOrder);
    $record['is_active'] = array_key_exists('is_active', $record) ? (bool) $record['is_active'] : true;
}

try {
    if ($method === 'GET') {
        $sortField = (string) query_param('sort', '');
        $limit = query_param('limit');
        $filterJson = (string) query_param('filter', '');
        $filters = [];

        if ($filterJson !== '') {
            $decoded = json_decode($filterJson, true);
            if (is_array($decoded)) {
                $filters = $decoded;
            }
        }

        $where = [];
        $params = [];

        foreach ($filters as $field => $value) {
            if (!in_array($field, $fields, true)) {
                continue;
            }

            if (is_array($value) && !empty($value)) {
                $placeholders = [];
                foreach (array_values($value) as $index => $entry) {
                    $paramName = ':' . $field . '_' . $index;
                    $placeholders[] = $paramName;
                    $params[$paramName] = serialize_value($config, $field, $entry);
                }
                $where[] = sprintf('`%s` IN (%s)', $field, implode(', ', $placeholders));
                continue;
            }

            $paramName = ':' . $field;
            $where[] = sprintf('`%s` = %s', $field, $paramName);
            $params[$paramName] = serialize_value($config, $field, $value);
        }

        $sql = 'SELECT * FROM `' . $table . '`';
        if (!empty($where)) {
            $sql .= ' WHERE ' . implode(' AND ', $where);
        }

        if ($sortField !== '') {
            $descending = str_starts_with($sortField, '-');
            $fieldName = $descending ? substr($sortField, 1) : $sortField;
            if (in_array($fieldName, $fields, true)) {
                $sql .= ' ORDER BY `' . $fieldName . '` ' . ($descending ? 'DESC' : 'ASC');
            }
        }

        if ($limit !== null && ctype_digit((string) $limit)) {
            $sql .= ' LIMIT ' . (int) $limit;
        }

        $statement = db()->prepare($sql);
        $statement->execute($params);
        $rows = $statement->fetchAll();

        json_response(array_map(static fn(array $row): array => deserialize_row($config, $row), $rows));
    }

    if ($method === 'POST') {
        $payload = request_body();
        $now = now_mysql();
        $record = [
            'id' => $payload['id'] ?? create_id(strtolower($entity)),
            'created_date' => $payload['created_date'] ?? $now,
            'updated_date' => $payload['updated_date'] ?? $now,
        ];

        foreach ($fields as $field) {
            if (array_key_exists($field, $payload)) {
                $record[$field] = $payload[$field];
            }
        }

        if ($entity === 'Booking') {
            $record['booking_reference'] = $record['booking_reference'] ?? ('KI-' . strtoupper(substr(bin2hex(random_bytes(4)), 0, 8)));
            $record['status'] = $record['status'] ?? 'pending';
            $record['payment_status'] = $record['payment_status'] ?? (!empty($record['receipt_url']) ? 'pending_verification' : 'unpaid');
            validate_booking_constraints($record);
        }

        if ($entity === 'Review') {
            validate_review_constraints($record);
        }

        if ($entity === 'UpcomingSchedule') {
            validate_upcoming_schedule_constraints($record);
        }

        if ($entity === 'FoundItem') {
            $record['status'] = $record['status'] ?? 'unclaimed';
        }

        if ($entity === 'LostItemReport') {
            $record['status'] = $record['status'] ?? 'searching';
        }

        if ($entity === 'PaymentQrCode') {
            validate_payment_qr_code_constraints($record);
        }

        if ($entity === 'ResortRule') {
            validate_resort_rule_constraints($record);
        }

        $insertFields = [];
        $insertPlaceholders = [];
        $params = [];

        foreach ($fields as $field) {
            if (!array_key_exists($field, $record)) {
                continue;
            }

            $insertFields[] = '`' . $field . '`';
            $placeholder = ':' . $field;
            $insertPlaceholders[] = $placeholder;
            $params[$placeholder] = serialize_value($config, $field, $record[$field]);
        }

        $sql = sprintf(
            'INSERT INTO `%s` (%s) VALUES (%s)',
            $table,
            implode(', ', $insertFields),
            implode(', ', $insertPlaceholders)
        );

        $statement = db()->prepare($sql);
        $statement->execute($params);

        $fetch = db()->prepare('SELECT * FROM `' . $table . '` WHERE id = :id LIMIT 1');
        $fetch->execute(['id' => $record['id']]);
        $created = $fetch->fetch();

        json_response(deserialize_row($config, $created ?: []), 201);
    }

    if (in_array($method, ['PATCH', 'PUT'], true)) {
        $id = (string) query_param('id', '');
        if ($id === '') {
            json_error('Missing entity id.', 422);
        }

        $payload = request_body();
        $updates = [];
        $params = ['id' => $id];

        if ($entity === 'Booking') {
            $existingStatement = db()->prepare('SELECT * FROM `' . $table . '` WHERE id = :id LIMIT 1');
            $existingStatement->execute(['id' => $id]);
            $existingRecord = $existingStatement->fetch();

            if (!$existingRecord) {
                json_error('Record not found.', 404);
            }

            $bookingRecord = array_merge($existingRecord, $payload);
            validate_booking_constraints($bookingRecord, $id);
        }

        if ($entity === 'Review') {
            $existingStatement = db()->prepare('SELECT * FROM `' . $table . '` WHERE id = :id LIMIT 1');
            $existingStatement->execute(['id' => $id]);
            $existingRecord = $existingStatement->fetch();

            if (!$existingRecord) {
                json_error('Record not found.', 404);
            }

            $reviewRecord = array_merge($existingRecord, $payload);
            validate_review_constraints($reviewRecord, $id);
        }

        if ($entity === 'UpcomingSchedule') {
            $existingStatement = db()->prepare('SELECT * FROM `' . $table . '` WHERE id = :id LIMIT 1');
            $existingStatement->execute(['id' => $id]);
            $existingRecord = $existingStatement->fetch();

            if (!$existingRecord) {
                json_error('Record not found.', 404);
            }

            $scheduleRecord = array_merge($existingRecord, $payload);
            validate_upcoming_schedule_constraints($scheduleRecord);
            $payload = $scheduleRecord;
        }

        if ($entity === 'PaymentQrCode') {
            $existingStatement = db()->prepare('SELECT * FROM `' . $table . '` WHERE id = :id LIMIT 1');
            $existingStatement->execute(['id' => $id]);
            $existingRecord = $existingStatement->fetch();

            if (!$existingRecord) {
                json_error('Record not found.', 404);
            }

            $qrRecord = array_merge($existingRecord, $payload);
            validate_payment_qr_code_constraints($qrRecord, $id);
            $payload = $qrRecord;
        }

        if ($entity === 'ResortRule') {
            $existingStatement = db()->prepare('SELECT * FROM `' . $table . '` WHERE id = :id LIMIT 1');
            $existingStatement->execute(['id' => $id]);
            $existingRecord = $existingStatement->fetch();

            if (!$existingRecord) {
                json_error('Record not found.', 404);
            }

            $ruleRecord = array_merge($existingRecord, $payload);
            validate_resort_rule_constraints($ruleRecord);
            $payload = $ruleRecord;
        }

        foreach ($fields as $field) {
            if ($field === 'id' || $field === 'created_date' || $field === 'updated_date') {
                continue;
            }

            if (!array_key_exists($field, $payload)) {
                continue;
            }

            $updates[] = '`' . $field . '` = :' . $field;
            $params[$field] = serialize_value($config, $field, $payload[$field]);
        }

        $updates[] = '`updated_date` = :updated_date';
        $params['updated_date'] = now_mysql();

        $statement = db()->prepare('UPDATE `' . $table . '` SET ' . implode(', ', $updates) . ' WHERE id = :id');
        $statement->execute($params);

        $fetch = db()->prepare('SELECT * FROM `' . $table . '` WHERE id = :id LIMIT 1');
        $fetch->execute(['id' => $id]);
        $updated = $fetch->fetch();

        if (!$updated) {
            json_error('Record not found.', 404);
        }

        json_response(deserialize_row($config, $updated));
    }

    if ($method === 'DELETE') {
        $id = (string) query_param('id', '');
        if ($id === '') {
            json_error('Missing entity id.', 422);
        }

        $statement = db()->prepare('DELETE FROM `' . $table . '` WHERE id = :id');
        $statement->execute(['id' => $id]);

        json_response(['success' => true, 'id' => $id]);
    }

    json_error('Unsupported entity method.', 405);
} catch (Throwable $error) {
    json_error($error->getMessage(), 500);
}
