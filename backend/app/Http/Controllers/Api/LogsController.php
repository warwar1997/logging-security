<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use Illuminate\Http\Request;
use Illuminate\Routing\Controller as BaseController;
use App\Services\LogsService;

class LogsController extends BaseController
{
    public function index(Request $request)
    {
        $readKey = env('API_KEY_READ', '');
        $writeKey = env('API_KEY_WRITE', '');
        $key = $this->getAuthKey($request);
        if (($readKey !== '' || $writeKey !== '') && $key !== $readKey && $key !== $writeKey) {
            return response()->json(['error' => 'Unauthorized: invalid read/write key'], 401);
        }

        $service = new LogsService();
        if ((int)$request->query('verify', 0) === 1) {
            $result = $service->verifyChain();
            return response()->json($result);
        }

        $result = $service->getLogs([
            'module' => (string)$request->query('module', ''),
            'action' => (string)$request->query('action', ''),
            'user' => (string)$request->query('user', ''),
            'severity' => (string)$request->query('severity', ''),
            'success' => $request->query('success', ''),
            'from' => (string)$request->query('from', ''),
            'to' => (string)$request->query('to', ''),
            'q' => (string)$request->query('q', ''),
            'page' => max(1, (int)$request->query('page', 1)),
            'per_page' => max(1, min(100, (int)$request->query('per_page', 25))),
        ]);

        return response()->json($result);
    }

    public function store(Request $request)
    {
        $writeKey = env('API_KEY_WRITE', '');
        $key = $this->getAuthKey($request);
        if ($writeKey !== '' && $key !== $writeKey) {
            return response()->json(['error' => 'Unauthorized: invalid write key'], 401);
        }

        $service = new LogsService();
        $payload = $service->parsePayloadFromRequest($request);
        if ($payload['module'] === '' || $payload['action'] === '') {
            return response()->json(['error' => 'module and action are required'], 422);
        }
        $log = $service->createLog($payload);
        return response()->json($log);
    }

    private function getAuthKey(Request $request): string
    {
        $hdr = (string)$request->header('Authorization', '');
        if (preg_match('/Bearer\s+(.*)/i', $hdr, $m)) { return trim($m[1]); }
        return (string)$request->header('X-API-KEY', '');
    }
}