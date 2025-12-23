<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use Illuminate\Http\Request;
use Illuminate\Routing\Controller as BaseController;
use PDO;
use Throwable;

class AuditsController extends BaseController
{
    private function db(): ?PDO
    {
        try {
            $driver = strtolower((string)env('DB_DRIVER', env('DB_CONNECTION', 'sqlite')));
            if ($driver === 'mysql') {
                $host = (string)env('DB_HOST', '127.0.0.1');
                $port = (string)env('DB_PORT', '3306');
                $db   = (string)env('DB_DATABASE', 'logging');
                $user = (string)env('DB_USERNAME', 'root');
                $pass = (string)env('DB_PASSWORD', '');
                $pdo = new PDO("mysql:host=$host;port=$port;dbname=$db;charset=utf8mb4", $user, $pass);
                $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
                return $pdo;
            }
            $dbPath = base_path('storage/logs.sqlite');
            $pdo = new PDO('sqlite:' . $dbPath);
            $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
            return $pdo;
        } catch (Throwable $e) { return null; }
    }

    public function index(Request $request)
    {
        $readKey = env('API_KEY_READ', '');
        $writeKey = env('API_KEY_WRITE', '');
        $key = $this->getAuthKey($request);
        if (($readKey !== '' || $writeKey !== '') && $key !== $readKey && $key !== $writeKey) {
            return response()->json(['error' => 'Unauthorized: invalid read/write key'], 401);
        }
        $page = max(1, (int)$request->query('page', 1));
        $perPage = max(1, min(100, (int)$request->query('per_page', 25)));
        $offset = ($page - 1) * $perPage;

        $pdo = $this->db();
        $data = []; $total = 0;
        if ($pdo) {
            try {
                $countStmt = $pdo->query('SELECT COUNT(*) FROM audits');
                $total = (int)$countStmt->fetchColumn(0);
                $stmt = $pdo->prepare('SELECT * FROM audits ORDER BY ts DESC LIMIT ? OFFSET ?');
                $stmt->execute([$perPage, $offset]);
                $data = $stmt->fetchAll(PDO::FETCH_ASSOC);
            } catch (Throwable $e) {}
        }
        return response()->json(['data' => $data, 'meta' => ['total' => $total, 'page' => $page, 'per_page' => $perPage]]);
    }

    private function getAuthKey(Request $request): string
    {
        $hdr = (string)$request->header('Authorization', '');
        if (preg_match('/Bearer\s+(.*)/i', $hdr, $m)) { return trim($m[1]); }
        return (string)$request->header('X-API-KEY', '');
    }
}