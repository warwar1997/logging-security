<?php

declare(strict_types=1);

namespace App\Services;

use Illuminate\Support\Facades\Config;

class AuthService
{
    /**
     * Resolve roles for the given API key.
     * @param string $key
     * @return array<int,string>
     */
    public function resolveRoles(string $key): array
    {
        $readKey = env('API_KEY_READ', Config::get('services.api_key_read', 'test-read'));
        $writeKey = env('API_KEY_WRITE', Config::get('services.api_key_write', 'test-write'));
        $readRoles = array_filter(array_map('trim', explode(',', (string)env('API_KEY_READ_ROLES', 'viewer'))));
        $writeRoles = array_filter(array_map('trim', explode(',', (string)env('API_KEY_WRITE_ROLES', 'admin,compliance'))));

        if (($readKey !== '' || $writeKey !== '') && $key !== $readKey && $key !== $writeKey) {
            return [];
        }
        if ($key === $writeKey) { return $writeRoles; }
        if ($key === $readKey) { return $readRoles; }
        return [];
    }
}