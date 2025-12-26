<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use Illuminate\Http\Request;
use Illuminate\Routing\Controller as BaseController;
use App\Services\AuditsService;

class AuditsController extends BaseController
{
    public function index(Request $request)
    {
        $readKey = env('API_KEY_READ', '');
        $writeKey = env('API_KEY_WRITE', '');
        $key = $this->getAuthKey($request);
        if (($readKey !== '' || $writeKey !== '') && $key !== $readKey && $key !== $writeKey) {
            return response()->json(['error' => 'Unauthorized: invalid read/write key'], 401);
        }

        $service = new AuditsService();
        $result = $service->getAudits([
            'type' => (string)$request->query('type', ''),
            'actor' => (string)$request->query('actor', ''),
            'from' => (string)$request->query('from', ''),
            'to' => (string)$request->query('to', ''),
            'q' => (string)$request->query('q', ''),
            'page' => max(1, (int)$request->query('page', 1)),
            'per_page' => max(1, min(100, (int)$request->query('per_page', 25))),
        ]);

        return response()->json($result);
    }

    private function getAuthKey(Request $request): string
    {
        $hdr = (string)$request->header('Authorization', '');
        if (preg_match('/Bearer\s+(.*)/i', $hdr, $m)) { return trim($m[1]); }
        return (string)$request->header('X-API-KEY', '');
    }
}