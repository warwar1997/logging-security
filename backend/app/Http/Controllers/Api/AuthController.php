<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use Illuminate\Http\Request;
use Illuminate\Routing\Controller as BaseController;
use Illuminate\Support\Facades\Config;

class AuthController extends BaseController
{
    public function index(Request $request)
    {
        // Mirror auth behavior: read & write keys exposed as roles
        $readKey = Config::get('services.api_key_read', env('API_KEY_READ', ''));
        $writeKey = Config::get('services.api_key_write', env('API_KEY_WRITE', ''));
        $readRoles = array_filter(array_map('trim', explode(',', (string)env('API_KEY_READ_ROLES', 'viewer'))));
        $writeRoles = array_filter(array_map('trim', explode(',', (string)env('API_KEY_WRITE_ROLES', 'admin,compliance'))));

        $key = $this->getAuthKey($request);
        if (($readKey !== '' || $writeKey !== '') && $key !== $readKey && $key !== $writeKey) {
            return response()->json(['error' => 'Unauthorized: invalid key'], 401);
        }
        $roles = [];
        if ($key === $writeKey) { $roles = $writeRoles; }
        elseif ($key === $readKey) { $roles = $readRoles; }
        return response()->json(['roles' => $roles]);
    }

    private function getAuthKey(Request $request): string
    {
        $hdr = (string)$request->header('Authorization', '');
        if (preg_match('/Bearer\s+(.*)/i', $hdr, $m)) { return trim($m[1]); }
        return (string)$request->header('X-API-KEY', '');
    }
}