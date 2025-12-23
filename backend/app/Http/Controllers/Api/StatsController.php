<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use Illuminate\Http\Request;
use Illuminate\Routing\Controller as BaseController;
use PDO;
use Throwable;

class StatsController extends BaseController
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
        $window = max(1, (int)$request->query('window', 86400));
        $cutoff = time() - $window;
        $result = [
            'window' => $window,
            'since' => $cutoff,
            'total' => 0,
            'by_severity' => [],
            'by_module' => [],
            'by_action' => [],
            'by_user' => [],
        ];
        $pdo = $this->db();
        if ($pdo) {
            try {
                $tStmt = $pdo->prepare('SELECT COUNT(*) FROM logs WHERE ts > ?');
                $tStmt->execute([$cutoff]);
                $result['total'] = (int)$tStmt->fetchColumn(0);

                $sStmt = $pdo->prepare('SELECT severity, COUNT(*) AS c FROM logs WHERE ts > ? GROUP BY severity');
                $sStmt->execute([$cutoff]);
                foreach ($sStmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
                    $result['by_severity'][$row['severity']] = (int)$row['c'];
                }
                $mStmt = $pdo->prepare('SELECT module, COUNT(*) AS c FROM logs WHERE ts > ? GROUP BY module');
                $mStmt->execute([$cutoff]);
                foreach ($mStmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
                    $result['by_module'][$row['module']] = (int)$row['c'];
                }
                $aStmt = $pdo->prepare('SELECT action, COUNT(*) AS c FROM logs WHERE ts > ? GROUP BY action');
                $aStmt->execute([$cutoff]);
                foreach ($aStmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
                    $result['by_action'][$row['action']] = (int)$row['c'];
                }
                $uStmt = $pdo->prepare('SELECT user, COUNT(*) AS c FROM logs WHERE ts > ? GROUP BY user');
                $uStmt->execute([$cutoff]);
                foreach ($uStmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
                    $result['by_user'][$row['user']] = (int)$row['c'];
                }
            } catch (Throwable $e) {}
        }
        return response()->json($result);
    }
}