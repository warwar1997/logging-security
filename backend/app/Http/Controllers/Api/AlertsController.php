<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use Illuminate\Http\Request;
use Illuminate\Routing\Controller as BaseController;
use App\Services\AlertsService;

class AlertsController extends BaseController
{
    public function index(Request $request)
    {
        $readKey = env('API_KEY_READ', '');
        $writeKey = env('API_KEY_WRITE', '');
        $key = $this->getAuthKey($request);
        if (($readKey !== '' || $writeKey !== '') && $key !== $readKey && $key !== $writeKey) {
            return response()->json(['error' => 'Unauthorized: invalid read/write key'], 401);
        }
        // delegate filtering + pagination + evaluation to service
        $service = new AlertsService();
        $result = $service->list([
            'type' => (string)$request->query('type', ''),
            'enabled' => (string)$request->query('enabled', ''),
            'q' => (string)$request->query('q', ''),
            'page' => max(1, (int)$request->query('page', 1)),
            'per_page' => max(1, min(200, (int)$request->query('per_page', 20))),
            'evaluate' => (int)$request->query('evaluate', 0) === 1,
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
        // validation stays in controller
        $payload = $request->json()->all();
        if (!is_array($payload)) { return response()->json(['error' => 'Invalid JSON body'], 400); }
        $type = (string)($payload['type'] ?? '');
        if ($type === '') { return response()->json(['error' => 'type is required'], 422); }
        if ($type === 'threshold') {
            $window = (int)($payload['window'] ?? 0);
            $threshold = (int)($payload['threshold'] ?? 0);
            if ($window <= 0) { return response()->json(['error' => 'window is required'], 422); }
            if ($threshold <= 0) { return response()->json(['error' => 'threshold is required'], 422); }
        }
        $service = new AlertsService();
        $created = $service->create($payload);
        return response()->json(['created' => 1, 'rule' => $created]);
    }

    public function update(Request $request)
    {
        $writeKey = env('API_KEY_WRITE', '');
        $key = $this->getAuthKey($request);
        if ($writeKey !== '' && $key !== $writeKey) {
            return response()->json(['error' => 'Unauthorized: invalid write key'], 401);
        }
        $payload = $request->json()->all();
        if (!is_array($payload)) { return response()->json(['error' => 'Invalid JSON body'], 400); }
        $id = (int)($request->route('id') ?? $request->query('id', $payload['id'] ?? 0));
        if ($id <= 0) { return response()->json(['error' => 'id is required'], 422); }
        $service = new AlertsService();
        $updated = $service->update($id, $payload);
        if ($updated === null) { return response()->json(['error' => 'Rule not found'], 404); }
        return response()->json(['updated' => 1, 'rule' => $updated]);
    }

    public function destroy(Request $request)
    {
        $writeKey = env('API_KEY_WRITE', '');
        $key = $this->getAuthKey($request);
        if ($writeKey !== '' && $key !== $writeKey) {
            return response()->json(['error' => 'Unauthorized: invalid write key'], 401);
        }
        $id = (int)($request->route('id') ?? $request->query('id', 0));
        if ($id <= 0) { return response()->json(['error' => 'id is required'], 422); }
        $service = new AlertsService();
        $deleted = $service->delete($id);
        if (!$deleted) { return response()->json(['error' => 'Rule not found'], 404); }
        return response()->json(['deleted' => 1, 'id' => $id]);
    }

    private function getAuthKey(Request $request): string
    {
        $hdr = (string)$request->header('Authorization', '');
        if (preg_match('/Bearer\s+(.*)/i', $hdr, $m)) { return trim($m[1]); }
        return (string)$request->header('X-API-KEY', '');
    }
}