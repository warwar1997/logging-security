<?php
declare(strict_types=1);

require __DIR__ . '/../helper/hrms_logging_helper.php';

hrms_set_logging_config('http://127.0.0.1:8000', 'test-write');

try {
    $res = hrms_log_action('HRMS.HelperCheck', 'smoke', [
        'user' => 'trae',
        'details' => [
            'source' => 'helper',
            'time' => time(),
        ],
        'severity' => 'info',
        'success' => 1,
    ]);
    echo "RES=" . json_encode($res, JSON_UNESCAPED_SLASHES) . "\n";
    exit(0);
} catch (Throwable $e) {
    echo "ERR=" . $e->getMessage() . "\n";
    exit(1);
}