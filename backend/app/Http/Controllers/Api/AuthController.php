<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use Illuminate\Http\Request;
use Illuminate\Routing\Controller as BaseController;
use App\Services\AuthService;

class AuthController extends BaseController
{
    public function index(Request $request)
    {
        $key = $this->getAuthKey($request);
        $service = new AuthService();
        $roles = $service->resolveRoles($key);
        if (empty($roles) && ($key !== '')) {
            return response()->json(['error' => 'Unauthorized: invalid key'], 401);
        }
        return response()->json(['roles' => $roles]);
    }

    private function getAuthKey(Request $request): string
    {
        $hdr = (string)$request->header('Authorization', '');
        if (preg_match('/Bearer\s+(.*)/i', $hdr, $m)) { return trim($m[1]); }
        return (string)$request->header('X-API-KEY', '');
    }
}