<?php
// HRMS Logging Helper: standardize and send events to the logging API
// Usage:
//   hrms_set_logging_config('http://localhost:8000', 'YOUR_WRITE_API_KEY');
//   hrms_log_action('HRMS.Auth', 'login', [ 'user' => 'alice', 'success' => 1, 'severity' => 'info', 'details' => ['tenant' => 'acme'] ]);
declare(strict_types=1);

/**
 * Global configuration holder
 */
class HRMSLoggingConfig {
    public string $baseUrl;
    public string $apiKey;
    public function __construct(string $baseUrl, string $apiKey) {
        $this->baseUrl = rtrim($baseUrl, '/');
        $this->apiKey = $apiKey;
    }
}

/** @var HRMSLoggingConfig|null */
$GLOBALS['HRMS_LOG_CFG'] = $GLOBALS['HRMS_LOG_CFG'] ?? null;

/**
 * Set logging API base URL and write key once in app bootstrap
 */
function hrms_set_logging_config(string $baseUrl, string $apiKey): void {
    $GLOBALS['HRMS_LOG_CFG'] = new HRMSLoggingConfig($baseUrl, $apiKey);
}

/**
 * Send a standardized event to the logging API.
 * Required: module, action
 * Optional keys in $params: user, success(0|1|bool), severity('info'|'warning'|'danger'), details(mixed), ip, ua, ts(int)
 * Returns decoded response array on success.
 * Throws Exception on failure.
 */
function hrms_log_action(string $module, string $action, array $params = []): array {
    $cfg = $GLOBALS['HRMS_LOG_CFG'] ?? null;
    if (!$cfg instanceof HRMSLoggingConfig) {
        throw new RuntimeException('HRMS logging not configured. Call hrms_set_logging_config(baseUrl, apiKey)');
    }
    if ($module === '' || $action === '') {
        throw new InvalidArgumentException('module and action are required');
    }
    $user = isset($params['user']) ? (string)$params['user'] : '';
    $successRaw = $params['success'] ?? 1;
    $success = is_bool($successRaw) ? ($successRaw ? 1 : 0) : (int)$successRaw;
    if ($success !== 0) { $success = 1; }
    $severity = isset($params['severity']) ? (string)$params['severity'] : 'info';
    if (!in_array($severity, ['info','warning','danger'], true)) { $severity = 'info'; }
    $ip = isset($params['ip']) ? (string)$params['ip'] : '';
    $ua = isset($params['ua']) ? (string)$params['ua'] : '';
    $ts = isset($params['ts']) ? (int)$params['ts'] : null; // normally server-side
    $detailsVal = $params['details'] ?? null;
    if (is_array($detailsVal) || is_object($detailsVal)) { $details = json_encode($detailsVal, JSON_UNESCAPED_SLASHES); }
    else if ($detailsVal === null) { $details = ''; }
    else { $details = (string)$detailsVal; }

    $payload = [
        'module' => $module,
        'action' => $action,
        'user' => $user,
        'success' => $success,
        'severity' => $severity,
        'ip' => $ip,
        'ua' => $ua,
        'details' => $details,
    ];
    // If caller provides ts, include it (API will otherwise use current time)
    if ($ts !== null && $ts > 0) { $payload['ts'] = $ts; }

    $url = $cfg->baseUrl . '/api/logs';
    $resp = http_post_json_with_bearer($url, $payload, $cfg->apiKey);
    $decoded = json_decode($resp, true);
    if (!is_array($decoded)) {
        throw new RuntimeException('Invalid response from logging API: ' . substr($resp, 0, 200));
    }
    // Basic success heuristic
    if (!isset($decoded['id'])) {
        // some errors come as { error: message }
        if (isset($decoded['error'])) {
            throw new RuntimeException('Logging API error: ' . (string)$decoded['error']);
        }
        // else just return decoded payload
    }
    return $decoded;
}

/**
 * Low-level POST helper using stream context (no cURL dependency).
 */
function http_post_json_with_bearer(string $url, array $payload, string $apiKey, int $timeoutSec = 5): string {
    $opts = [
        'http' => [
            'method' => 'POST',
            'header' => "Content-Type: application/json\r\nAuthorization: Bearer " . $apiKey . "\r\n",
            'content' => json_encode($payload, JSON_UNESCAPED_SLASHES),
            'timeout' => $timeoutSec,
        ]
    ];
    $ctx = stream_context_create($opts);
    $resp = @file_get_contents($url, false, $ctx);
    if ($resp === false) {
        $err = error_get_last();
        throw new RuntimeException('HTTP POST failed: ' . ($err['message'] ?? 'unknown error'));
    }
    return $resp;
}

// Convenience helper: wrap try/catch and return boolean
function hrms_try_log_action(string $module, string $action, array $params = []): bool {
    try { hrms_log_action($module, $action, $params); return true; }
    catch (Throwable $e) { return false; }
}