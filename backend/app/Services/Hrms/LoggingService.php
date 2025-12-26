<?php
declare(strict_types=1);

namespace App\Services\Hrms;

use Illuminate\Support\Facades\Http;
use RuntimeException;

/**
 * Structured HRMS Logging service for Laravel.
 * Provides a clean API to send standardized log events to the backend,
 * using the Laravel route /api/logs.
 */
class LoggingService
{
    private string $baseUrl;
    private string $apiKey;
    private int $timeoutSec;

    public function __construct(?string $baseUrl = null, ?string $apiKey = null, ?int $timeoutSec = null)
    {
        $this->baseUrl = rtrim($baseUrl ?? (config('hrms_logging.base_url') ?? config('app.url') ?? 'http://127.0.0.1:8080'), '/');
        $this->apiKey = $apiKey ?? (config('hrms_logging.write_key') ?? env('API_KEY_WRITE', ''));
        $this->timeoutSec = $timeoutSec ?? (int) (config('hrms_logging.timeout') ?? 5);
    }

    public function setConfig(string $baseUrl, string $apiKey, ?int $timeoutSec = null): void
    {
        $this->baseUrl = rtrim($baseUrl, '/');
        $this->apiKey = $apiKey;
        if ($timeoutSec !== null && $timeoutSec > 0) {
            $this->timeoutSec = $timeoutSec;
        }
    }

    /**
      * Log a standardized action.
      * @param array{user?:string,success?:int|bool,severity?:string,details?:mixed,ip?:string,ua?:string,ts?:int} $params
      * @return array Decoded JSON response
      */
     public function logAction(string $module, string $action, array $params = []): array
     {
         if ($module === '' || $action === '') {
             throw new \InvalidArgumentException('module and action are required');
         }
         $payload = $this->buildPayload($module, $action, $params);

        // Always use Laravel API route.
        $url = $this->baseUrl . '/api/logs';

        $resp = $this->postJson($url, $payload);
        if ($resp === null) {
            throw new RuntimeException('Logging API not reachable');
        }
        $decoded = json_decode($resp, true);
        if (!is_array($decoded)) {
            throw new RuntimeException('Invalid response from logging API: ' . substr($resp, 0, 200));
        }
        if (isset($decoded['error'])) {
            throw new RuntimeException('Logging API error: ' . (string) $decoded['error']);
        }
        return $decoded;
     }

    /**
     * Convenience: returns boolean and never throws.
     */
    public function tryLogAction(string $module, string $action, array $params = []): bool
    {
        try {
            $this->logAction($module, $action, $params);
            return true;
        } catch (\Throwable $e) {
            return false;
        }
    }

    /**
     * Build normalized payload for the API.
     * @param array{user?:string,success?:int|bool,severity?:string,details?:mixed,ip?:string,ua?:string,ts?:int} $params
     */
    private function buildPayload(string $module, string $action, array $params): array
    {
        $user = isset($params['user']) ? (string) $params['user'] : '';
        $successRaw = $params['success'] ?? 1;
        $success = is_bool($successRaw) ? ($successRaw ? 1 : 0) : (int) $successRaw;
        if ($success !== 0) { $success = 1; }
        $severity = isset($params['severity']) ? (string) $params['severity'] : 'info';
        if (!in_array($severity, ['info', 'warning', 'danger'], true)) { $severity = 'info'; }
        $ip = isset($params['ip']) ? (string) $params['ip'] : '';
        $ua = isset($params['ua']) ? (string) $params['ua'] : '';
        $ts = isset($params['ts']) ? (int) $params['ts'] : null;
        $detailsVal = $params['details'] ?? null;
        if (is_array($detailsVal) || is_object($detailsVal)) { $details = json_encode($detailsVal, JSON_UNESCAPED_SLASHES); }
        else if ($detailsVal === null) { $details = ''; }
        else { $details = (string) $detailsVal; }

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
        if ($ts !== null && $ts > 0) { $payload['ts'] = $ts; }
        return $payload;
    }

    /**
     * POST JSON with Bearer token. Returns raw body on 2xx, null otherwise.
     */
    private function postJson(string $url, array $payload): ?string
    {
        try {
            $res = Http::withToken($this->apiKey)
                ->timeout($this->timeoutSec)
                ->acceptJson()
                ->asJson()
                ->post($url, $payload);
            if ($res->successful()) {
                return $res->body();
            }
            return null;
        } catch (\Throwable $e) {
            return null;
        }
    }
}