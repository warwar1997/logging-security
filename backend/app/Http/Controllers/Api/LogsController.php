<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use Illuminate\Http\Request;
use Illuminate\Routing\Controller as BaseController;
use Illuminate\Support\Facades\Config;
use PDO;
use Throwable;

class LogsController extends BaseController
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
                $pdo->exec("CREATE TABLE IF NOT EXISTS logs (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    module VARCHAR(255),
                    action VARCHAR(255),
                    user VARCHAR(255),
                    ts BIGINT,
                    success TINYINT,
                    severity VARCHAR(50),
                    ip VARCHAR(45),
                    ua VARCHAR(255),
                    details TEXT,
                    prev_hash VARCHAR(64),
                    hash VARCHAR(64)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
                $pdo->exec("CREATE TABLE IF NOT EXISTS audits (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    ts BIGINT,
                    type VARCHAR(50),
                    actor VARCHAR(255),
                    details TEXT
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
                return $pdo;
            }
            // sqlite
            $dbPath = base_path('storage/logs.sqlite');
            $pdo = new PDO('sqlite:' . $dbPath);
            $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
            $pdo->exec('CREATE TABLE IF NOT EXISTS logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                module TEXT,
                action TEXT,
                user TEXT,
                ts INTEGER,
                success INTEGER,
                severity TEXT,
                ip TEXT,
                ua TEXT,
                prev_hash TEXT,
                hash TEXT,
                details TEXT
            )');
            $pdo->exec('CREATE TABLE IF NOT EXISTS audits (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ts INTEGER,
                type TEXT,
                actor TEXT,
                details TEXT
            )');
            return $pdo;
        } catch (Throwable $e) {
            return null;
        }
    }

    public function index(Request $request)
    {
        $readKey = env('API_KEY_READ', '');
        $writeKey = env('API_KEY_WRITE', '');
        $key = $this->getAuthKey($request);
        if (($readKey !== '' || $writeKey !== '') && $key !== $readKey && $key !== $writeKey) {
            return response()->json(['error' => 'Unauthorized: invalid read/write key'], 401);
        }
        // optional integrity verification
        if ((int)$request->query('verify', 0) === 1) {
            $pdo = $this->db();
            $checked = 0; $valid = true; $breakAtId = null; $prevHash = '';
            if ($pdo) {
                try {
                    $stmt = $pdo->query('SELECT id,module,action,user,ts,success,ip,ua,prev_hash,hash FROM logs ORDER BY id ASC');
                    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                        $expectedPrev = $prevHash;
                        if ((string)($row['prev_hash'] ?? '') !== $expectedPrev) { $valid = false; $breakAtId = (int)$row['id']; break; }
                        $recalc = hash('sha256', $expectedPrev . '|' . $row['module'] . '|' . $row['action'] . '|' . $row['user'] . '|' . $row['ts'] . '|' . (int)$row['success'] . '|' . ($row['ip'] ?? '') . '|' . ($row['ua'] ?? ''));
                        if ((string)($row['hash'] ?? '') !== $recalc) { $valid = false; $breakAtId = (int)$row['id']; break; }
                        $prevHash = (string)$row['hash'];
                        $checked++;
                    }
                } catch (Throwable $e) {}
            }
            return response()->json(['valid' => $valid, 'break_at_id' => $breakAtId, 'checked' => $checked]);
        }
        // filters + pagination
        $module = (string)$request->query('module', '');
        $action = (string)$request->query('action', '');
        $user = (string)$request->query('user', '');
        $severity = (string)$request->query('severity', '');
        $successParam = $request->query('success', '');
        $from = (string)$request->query('from', '');
        $to = (string)$request->query('to', '');
        $q = (string)$request->query('q', '');
        $page = max(1, (int)$request->query('page', 1));
        $perPage = max(1, min(100, (int)$request->query('per_page', 25)));

        $filters = []; $params = [];
        if ($module !== '') { $filters[] = 'module = ?'; $params[] = $module; }
        if ($action !== '') { $filters[] = 'action = ?'; $params[] = $action; }
        if ($user !== '') { $filters[] = 'user = ?'; $params[] = $user; }
        if ($severity !== '') { $filters[] = 'severity = ?'; $params[] = $severity; }
        if ($successParam !== '' && in_array((int)$successParam, [0,1], true)) { $filters[] = 'success = ?'; $params[] = (int)$successParam; }
        if ($from !== '') { $fromTs = strtotime($from . ' 00:00:00') ?: 0; if ($fromTs > 0) { $filters[] = 'ts >= ?'; $params[] = $fromTs; } }
        if ($to !== '') { $toTs = strtotime($to . ' 23:59:59') ?: 0; if ($toTs > 0) { $filters[] = 'ts <= ?'; $params[] = $toTs; } }
        if ($q !== '') {
            $filters[] = '(module LIKE ? OR action LIKE ? OR user LIKE ? OR severity LIKE ? OR ip LIKE ? OR ua LIKE ? OR details LIKE ?)';
            $like = '%' . $q . '%';
            array_push($params, $like, $like, $like, $like, $like, $like, $like);
        }
        $where = count($filters) ? ('WHERE ' . implode(' AND ', $filters)) : '';
        $order = 'ORDER BY ts DESC';
        $offset = ($page - 1) * $perPage;

        $data = []; $total = 0; $pdo = $this->db();
        if ($pdo) {
            try {
                $countStmt = $pdo->prepare('SELECT COUNT(*) FROM logs ' . $where);
                foreach ($params as $i => $v) { $countStmt->bindValue($i+1, $v); }
                $countStmt->execute();
                $total = (int)$countStmt->fetchColumn(0);

                $sql = 'SELECT * FROM logs ' . $where . ' ' . $order . ' LIMIT ? OFFSET ?';
                $stmt = $pdo->prepare($sql);
                $bindParams = $params; $bindParams[] = $perPage; $bindParams[] = $offset;
                foreach ($bindParams as $i => $v) { $stmt->bindValue($i+1, $v); }
                $stmt->execute();
                $data = $stmt->fetchAll(PDO::FETCH_ASSOC);
            } catch (Throwable $e) {}
        }
        return response()->json(['data' => $data, 'meta' => ['total' => $total, 'page' => $page, 'per_page' => $perPage]]);
    }

    public function store(Request $request)
    {
        $writeKey = env('API_KEY_WRITE', '');
        $key = $this->getAuthKey($request);
        if ($writeKey !== '' && $key !== $writeKey) {
            return response()->json(['error' => 'Unauthorized: invalid write key'], 401);
        }
        $pdo = $this->db();
        $now = time();
        $module = (string)$request->input('module', '');
        $action = (string)$request->input('action', '');
        $user = (string)$request->input('user', '');
        $success = (int)$request->input('success', 1); $success = $success === 0 ? 0 : 1;
        $severity = (string)$request->input('severity', 'info');
        $ip = (string)$request->input('ip', $request->ip());
        $ua = (string)$request->input('ua', (string)$request->header('User-Agent', ''));
        $details = (string)$request->input('details', '');
        if ($module === '' || $action === '') {
            return response()->json(['error' => 'module and action are required'], 422);
        }
        $prevHash = '';
        if ($pdo) {
            try {
                $s = $pdo->query('SELECT hash FROM logs ORDER BY id DESC LIMIT 1');
                $prevHash = (string)($s->fetchColumn(0) ?: '');
            } catch (Throwable $e) {}
        }
        $h = hash('sha256', $prevHash . '|' . $module . '|' . $action . '|' . $user . '|' . $now . '|' . (int)$success . '|' . $ip . '|' . $ua);

        if ($pdo) {
            try {
                $ins = $pdo->prepare('INSERT INTO logs (module,action,user,ts,success,severity,ip,ua,details,prev_hash,hash) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
                $ins->execute([$module,$action,$user,$now,$success,$severity,$ip,$ua,$details,$prevHash,$h]);
                $id = (int)$pdo->lastInsertId();
                return response()->json(['id'=>$id,'module'=>$module,'action'=>$action,'user'=>$user,'ts'=>$now,'success'=>$success,'severity'=>$severity,'ip'=>$ip,'ua'=>$ua,'details'=>$details,'prev_hash'=>$prevHash,'hash'=>$h]);
            } catch (Throwable $e) {}
        }
        // Fallback to file (if needed)
        return response()->json(['error' => 'Storage unavailable'], 500);
    }

    private function getAuthKey(Request $request): string
    {
        $hdr = (string)$request->header('Authorization', '');
        if (preg_match('/Bearer\s+(.*)/i', $hdr, $m)) { return trim($m[1]); }
        return (string)$request->header('X-API-KEY', '');
    }
}