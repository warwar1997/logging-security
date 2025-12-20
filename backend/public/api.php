<?php
// Lightweight API for logs: GET/POST, optional auth, SQLite storage, hash chaining
declare(strict_types=1);
header('Content-Type: application/json');
error_reporting(E_ALL);
ini_set('display_errors', '1');

// CORS for browser requests
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
header('Access-Control-Allow-Origin: ' . ($origin !== '' ? $origin : '*'));
header('Vary: Origin');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Authorization, X-API-KEY, Content-Type');
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Max-Age: 86400');
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// --- Minimal .env loader ---
function env(string $key, $default = '') {
    static $vars = null;
    if ($vars === null) {
        $vars = [];
        $envFile = __DIR__ . '/../.env';
        if (is_file($envFile)) {
            foreach (file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
                if (str_starts_with(trim($line), '#')) continue;
                $parts = explode('=', $line, 2);
                if (count($parts) === 2) { $vars[trim($parts[0])] = trim($parts[1]); }
            }
        }
    }
    return $vars[$key] ?? getenv($key) ?? $default;
}

// --- Helpers ---
function json_error(int $code, string $message) {
    http_response_code($code);
    echo json_encode(['error' => $message, 'code' => $code], JSON_UNESCAPED_SLASHES);
    exit;
}
function get_auth_key(): string {
    $hdr = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (preg_match('/Bearer\s+(.*)/i', $hdr, $m)) return trim($m[1]);
    return $_SERVER['HTTP_X_API_KEY'] ?? '';
}

// --- DB bootstrap ---
$pdo = null;
try {
    if (class_exists('PDO')) {
        $drivers = PDO::getAvailableDrivers();
        $driver = strtolower((string)env('DB_DRIVER', env('DB_CONNECTION', 'sqlite')));
        if ($driver === 'mysql' && in_array('mysql', $drivers, true)) {
            // MySQL connection via env
            $host = (string)env('DB_HOST', '127.0.0.1');
            $port = (string)env('DB_PORT', '3306');
            $db   = (string)env('DB_DATABASE', 'logging');
            $user = (string)env('DB_USERNAME', 'root');
            $pass = (string)env('DB_PASSWORD', '');
            $pdo = new PDO("mysql:host=$host;port=$port;dbname=$db;charset=utf8mb4", $user, $pass);
            $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
            // Create tables if not exist (MySQL)
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
            // Optional: basic retention
            $days = (int)env('RETENTION_DAYS', '0');
            if ($days > 0) {
                $cutoff = time() - ($days * 86400);
                $stmt = $pdo->prepare('DELETE FROM logs WHERE ts < ?');
                $stmt->execute([$cutoff]);
            }
            $pdo->exec("CREATE TABLE IF NOT EXISTS audits (
                id INT AUTO_INCREMENT PRIMARY KEY,
                ts BIGINT,
                type VARCHAR(50),
                actor VARCHAR(255),
                details TEXT
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
            // Ensure 'details' column exists (for upgrades)
            try {
                $stmt = $pdo->query("SHOW COLUMNS FROM logs LIKE 'details'");
                $exists = (bool)$stmt->fetch();
                if (!$exists) { $pdo->exec("ALTER TABLE logs ADD COLUMN details TEXT"); }
            } catch (Throwable $e) {}
            // DB immutability: create triggers to prevent updates and audit deletes (MySQL)
            try {
                $checkTrig = $pdo->prepare("SELECT COUNT(*) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = DATABASE() AND TRIGGER_NAME = ?");
                $strictImmutable = ((int)env('IMMUTABLE_STRICT', '0') === 1);
                // Block updates
                $checkTrig->execute(['logs_no_update']);
                if ((int)$checkTrig->fetchColumn(0) === 0) {
                    $pdo->exec("CREATE TRIGGER logs_no_update BEFORE UPDATE ON logs FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Immutable logs: UPDATE not allowed'; END");
                }
                // Audit deletes
                $checkTrig->execute(['logs_delete_audit']);
                if ((int)$checkTrig->fetchColumn(0) === 0) {
                    $pdo->exec("CREATE TRIGGER logs_delete_audit BEFORE DELETE ON logs FOR EACH ROW BEGIN INSERT INTO audits(ts,type,actor,details) VALUES (UNIX_TIMESTAMP(),'logs.delete','db-trigger', JSON_OBJECT('id', OLD.id, 'ts', OLD.ts, 'module', OLD.module, 'action', OLD.action, 'user', OLD.user)); END");
                }
                // Optional strict: block deletes entirely
                if ($strictImmutable) {
                    $checkTrig->execute(['logs_no_delete']);
                    if ((int)$checkTrig->fetchColumn(0) === 0) {
                        $pdo->exec("CREATE TRIGGER logs_no_delete BEFORE DELETE ON logs FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Immutable logs: DELETE not allowed'; END");
                    }
                }
            } catch (Throwable $e) { /* ignore trigger errors */ }
        } elseif (in_array('sqlite', $drivers, true)) {
            $dbPath = __DIR__ . '/../storage/logs.sqlite';
            if (!is_dir(dirname($dbPath))) @mkdir(dirname($dbPath), 0777, true);
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
                hash TEXT
            )');
            // Ensure 'details' column exists (for upgrades)
            try {
                $cols = $pdo->query("PRAGMA table_info(logs)")->fetchAll(PDO::FETCH_ASSOC);
                $hasDetails = false;
                foreach ($cols as $c) { if ((string)($c['name'] ?? '') === 'details') { $hasDetails = true; break; } }
                if (!$hasDetails) { $pdo->exec("ALTER TABLE logs ADD COLUMN details TEXT"); }
            } catch (Throwable $e) {}
            // Optional: basic retention
            $days = (int)env('RETENTION_DAYS', '0');
            if ($days > 0) {
                $cutoff = time() - ($days * 86400);
                $pdo->prepare('DELETE FROM logs WHERE ts < ?')->execute([$cutoff]);
            }
            // Audits table to record prune operations and integrity checks
            $pdo->exec('CREATE TABLE IF NOT EXISTS audits (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ts INTEGER,
                type TEXT,
                actor TEXT,
                details TEXT
            )');
            // DB immutability: SQLite triggers to prevent updates and audit deletes
            try {
                // Block updates
                $pdo->exec("CREATE TRIGGER IF NOT EXISTS logs_no_update BEFORE UPDATE ON logs BEGIN SELECT RAISE(ABORT, 'Immutable logs: UPDATE not allowed'); END;");
                // Audit deletes (details as plain text to avoid JSON1 dependency)
                $pdo->exec("CREATE TRIGGER IF NOT EXISTS logs_delete_audit BEFORE DELETE ON logs BEGIN INSERT INTO audits(ts,type,actor,details) VALUES (CAST(strftime('%s','now') AS INTEGER),'logs.delete','db-trigger', 'id='||OLD.id||';ts='||OLD.ts||';module='||IFNULL(OLD.module,'')||';action='||IFNULL(OLD.action,'')||';user='||IFNULL(OLD.user,'')); END;");
                // Optional strict: block deletes entirely if IMMUTABLE_STRICT=1
                if ((int)env('IMMUTABLE_STRICT', '0') === 1) {
                    $pdo->exec("CREATE TRIGGER IF NOT EXISTS logs_no_delete BEFORE DELETE ON logs BEGIN SELECT RAISE(ABORT, 'Immutable logs: DELETE not allowed'); END;");
                }
            } catch (Throwable $e) { /* ignore trigger errors */ }
        }
        // Scheduled retention cleanup (lazy scheduler)
        $freq = (int)env('RETENTION_FREQUENCY_SECONDS', '0');
        if ($freq > 0) {
            $stateFile = __DIR__ . '/../storage/retention_state.json';
            $last = 0;
            if (is_file($stateFile)) {
                $st = json_decode((string)file_get_contents($stateFile), true);
                if (is_array($st)) { $last = (int)($st['last_prune'] ?? 0); }
            }
            if (time() - $last >= $freq) {
                $days = (int)env('RETENTION_DAYS', '0');
                if ($days > 0) {
                    $cutoff = time() - ($days * 86400);
                    $res = prune_logs($pdo, $cutoff, false);
                    @file_put_contents($stateFile, json_encode(['last_prune' => time(), 'result' => $res]));
                    try {
                        $actor = 'system';
                        $details = json_encode($res, JSON_UNESCAPED_SLASHES);
                        $ins = $pdo->prepare('INSERT INTO audits (ts,type,actor,details) VALUES (?,?,?,?)');
                        $ins->execute([time(),'logs.prune.scheduled',$actor,$details]);
                    } catch (Throwable $e) {}
                }
            }
        }
    }
} catch (Throwable $e) {
    // Fallback to file if needed
    $pdo = null;
}

// --- Authorization ---
$readKey = env('API_KEY_READ', '');
$writeKey = env('API_KEY_WRITE', '');
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$key = get_auth_key();
$resource = $_GET['resource'] ?? '';
if ($method === 'GET') {
    if ($resource === 'auth') {
        if (($readKey !== '' || $writeKey !== '') && $key !== $readKey && $key !== $writeKey) {
            json_error(401, 'Unauthorized: invalid key');
        }
    } else {
        // Allow reads with either read or write key
        if (($readKey !== '' || $writeKey !== '') && $key !== $readKey && $key !== $writeKey) {
            json_error(401, 'Unauthorized: invalid read/write key');
        }
    }
}
if (in_array($method, ['POST','PUT','DELETE'], true) && $writeKey !== '' && $key !== $writeKey) {
    json_error(401, 'Unauthorized: invalid write key');
}

// --- Routing ---
$resource = $_GET['resource'] ?? '';
if (!in_array($resource, ['logs','alerts','stats','auth','audits'], true)) {
    json_error(404, 'Resource not found');
}

// --- Stats endpoint (GET) ---
if ($resource === 'stats' && $method === 'GET') {
    $window = max(1, (int)($_GET['window'] ?? 86400)); // default 24h
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
            // additional dimensions
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
        } catch (Throwable $e) {
            // fall through to file-based
        }
    }
    if (!$pdo) {
        $file = __DIR__ . '/../storage/logs.json';
        if (is_file($file)) {
            $arr = json_decode((string)file_get_contents($file), true);
            if (is_array($arr)) {
                foreach ($arr as $row) {
                    $ts = (int)($row['ts'] ?? 0);
                    if ($ts <= $cutoff) continue;
                    $result['total']++;
                    $sev = (string)($row['severity'] ?? '');
                    $mod = (string)($row['module'] ?? '');
                    $act = (string)($row['action'] ?? '');
                    $usr = (string)($row['user'] ?? '');
                    if ($sev !== '') { $result['by_severity'][$sev] = ($result['by_severity'][$sev] ?? 0) + 1; }
                    if ($mod !== '') { $result['by_module'][$mod] = ($result['by_module'][$mod] ?? 0) + 1; }
                    if ($act !== '') { $result['by_action'][$act] = ($result['by_action'][$act] ?? 0) + 1; }
                    if ($usr !== '') { $result['by_user'][$usr] = ($result['by_user'][$usr] ?? 0) + 1; }
                }
            }
        }
    }
    // Buckets (optional): bucket=hour|day, points=n
    $bucketUnit = (string)($_GET['bucket'] ?? '');
    if ($bucketUnit === 'hour' || $bucketUnit === 'day') {
        $bucketSize = ($bucketUnit === 'hour') ? 3600 : 86400;
        $points = max(1, (int)($_GET['points'] ?? ($bucketUnit === 'hour' ? 24 : 30)));
        $seriesStartTs = time() - ($points * $bucketSize);
        $rawRows = [];
        if ($pdo) {
            try {
                $stmt = $pdo->prepare('SELECT ts FROM logs WHERE ts > ?');
                $stmt->execute([$seriesStartTs]);
                $rawRows = $stmt->fetchAll(PDO::FETCH_ASSOC);
            } catch (Throwable $e) {
                // ignore bucket db errors
            }
        }
        if (!$pdo || empty($rawRows)) {
            $lf = __DIR__ . '/../storage/logs.json';
            $arr = is_file($lf) ? json_decode((string)file_get_contents($lf), true) : [];
            if (is_array($arr)) {
                foreach ($arr as $r) { $ts = (int)($r['ts'] ?? 0); if ($ts > $seriesStartTs) { $rawRows[] = ['ts' => $ts]; } }
            }
        }
        $nowBucket = floor(time() / $bucketSize) * $bucketSize;
        $series = [];
        for ($i = $points - 1; $i >= 0; $i--) {
            $start = $nowBucket - ($i * $bucketSize);
            $end = $start + $bucketSize;
            $c = 0;
            foreach ($rawRows as $r) { $ts = (int)($r['ts'] ?? 0); if ($ts >= $start && $ts < $end) { $c++; } }
            $series[] = ['start' => $start, 'end' => $end, 'total' => $c];
        }
        $result['buckets'] = ['unit' => $bucketUnit, 'size' => $bucketSize, 'points' => $series];
    }
    echo json_encode($result, JSON_UNESCAPED_SLASHES);
    exit;
}

// --- Alerts endpoint (GET) ---
if ($resource === 'auth' && $method === 'GET') {
    $roles = [];
    if ($readKey !== '' && $key === $readKey) { $roles = array_values(array_unique(array_merge($roles, ['viewer','compliance']))); }
    if ($writeKey !== '' && $key === $writeKey) { $roles = array_values(array_unique(array_merge($roles, ['admin']))); }
    if (empty($roles)) { json_error(401, 'Unauthorized: invalid key'); }
    echo json_encode(['roles' => $roles], JSON_UNESCAPED_SLASHES);
    exit;
}
if ($resource === 'alerts' && $method === 'GET') {
    $file = __DIR__ . '/../storage/alerts.json';
    $rules = is_file($file) ? json_decode((string)file_get_contents($file), true) : [];
    if (!is_array($rules)) $rules = [];
    $evaluate = (int)($_GET['evaluate'] ?? 0) === 1;
    $windowOverride = isset($_GET['window']) ? (int)$_GET['window'] : null;
    // Filters & pagination
    $typeParam = isset($_GET['type']) ? (string)$_GET['type'] : '';
    $enabledParam = isset($_GET['enabled']) ? $_GET['enabled'] : null; // ''|0|1
    $qParam = isset($_GET['q']) ? (string)$_GET['q'] : '';
    $page = max(1, (int)($_GET['page'] ?? 1));
    $perPage = max(1, min(100, (int)($_GET['per_page'] ?? 20)));

    $filtered = array_values(array_filter($rules, function($r) use ($typeParam, $enabledParam, $qParam) {
        if ($typeParam !== '' && (string)($r['type'] ?? '') !== $typeParam) return false;
        if ($enabledParam !== null && $enabledParam !== '' && ((int)($r['enabled'] ?? 1) !== (int)$enabledParam)) return false;
        if ($qParam !== '') {
            $hay = strtolower((string)($r['module'] ?? '') . '|' . (string)($r['action'] ?? '') . '|' . (string)($r['user'] ?? '') . '|' . (string)($r['severity'] ?? '') . '|' . (string)($r['pattern'] ?? ''));
            if (strpos($hay, strtolower($qParam)) === false) return false;
        }
        return true;
    }));
    $total = count($filtered);
    $start = ($page - 1) * $perPage;
    $paged = array_slice($filtered, $start, $perPage);

    $resp = [
        'supported' => ['threshold','pattern'],
        'rules' => $paged,
        'meta' => ['total' => $total, 'page' => $page, 'per_page' => $perPage],
    ];

    if ($evaluate) {
        $resp['evaluation'] = [];
        foreach ($paged as $rule) {
            if (!($rule['enabled'] ?? true)) continue;
            $type = (string)($rule['type'] ?? '');
            $window = max(1, (int)($windowOverride ?? ($rule['window'] ?? 3600)));
            $cutoff = time() - $window;

            // Build filters
            $filters = [];
            $params = [];
            $module = (string)($rule['module'] ?? '');
            $action = (string)($rule['action'] ?? '');
            $user = (string)($rule['user'] ?? '');
            $severity = (string)($rule['severity'] ?? '');
            $success = $rule['success'] ?? '';
            if ($module !== '') { $filters[] = 'module = ?'; $params[] = $module; }
            if ($action !== '') { $filters[] = 'action = ?'; $params[] = $action; }
            if ($user !== '') { $filters[] = 'user = ?'; $params[] = $user; }
            if ($severity !== '') { $filters[] = 'severity = ?'; $params[] = $severity; }
            if ($success !== '' && ($success === 0 || $success === 1)) { $filters[] = 'success = ?'; $params[] = (int)$success; }
            $filters[] = 'ts > ?';
            $params[] = $cutoff;
            $where = 'WHERE ' . implode(' AND ', $filters);

            $count = 0;
            $matches = 0;
            $matchRows = [];

            if ($pdo) {
                try {
                    $stmt = $pdo->prepare('SELECT * FROM logs ' . $where . ' ORDER BY ts DESC');
                    foreach ($params as $i => $v) {
                        $stmt->bindValue($i+1, $v);
                    }
                    $stmt->execute();
                    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
                    $count = count($rows);
                    if ($type === 'pattern') {
                        $pattern = (string)($rule['pattern'] ?? '');
                        if ($pattern !== '') {
                            foreach ($rows as $r) {
                                $text = ($r['action'] ?? '') . '|' . ($r['module'] ?? '') . '|' . ($r['user'] ?? '') . '|' . ($r['severity'] ?? '');
                                if (@preg_match($pattern, $text)) { $matches++; $matchRows[] = $r; }
                            }
                        }
                    } else {
                        $matchRows = $rows; // threshold: all filtered rows
                    }
                } catch (Throwable $e) {
                    $pdo = null; // fall back
                }
            }
            if (!$pdo) {
                $lf = __DIR__ . '/../storage/logs.json';
                $arr = is_file($lf) ? json_decode((string)file_get_contents($lf), true) : [];
                if (!is_array($arr)) $arr = [];
                foreach ($arr as $r) {
                    $ts = (int)($r['ts'] ?? 0);
                    if ($ts <= $cutoff) continue;
                    if ($module !== '' && (string)($r['module'] ?? '') !== $module) continue;
                    if ($action !== '' && (string)($r['action'] ?? '') !== $action) continue;
                    if ($user !== '' && (string)($r['user'] ?? '') !== $user) continue;
                    if ($severity !== '' && (string)($r['severity'] ?? '') !== $severity) continue;
                    if ($success !== '' && (int)($r['success'] ?? -1) !== (int)$success) continue;
                    $count++;
                    if ($type === 'pattern') {
                        $pattern = (string)($rule['pattern'] ?? '');
                        if ($pattern !== '') {
                            $text = ($r['action'] ?? '') . '|' . ($r['module'] ?? '') . '|' . ($r['user'] ?? '') . '|' . ($r['severity'] ?? '');
                            if (@preg_match($pattern, $text)) { $matches++; $matchRows[] = $r; }
                        }
                    } else {
                        $matchRows[] = $r;
                    }
                }
                // sort by ts desc
                usort($matchRows, function($a, $b) { return (int)($b['ts'] ?? 0) <=> (int)($a['ts'] ?? 0); });
            }

            $triggered = false;
            if ($type === 'threshold') {
                $threshold = max(1, (int)($rule['threshold'] ?? 1));
                $triggered = ($count >= $threshold);
            } elseif ($type === 'pattern') {
                $triggered = ($matches > 0);
            }
            $samples = array_slice($matchRows, 0, 3);
            $sampleOut = [];
            foreach ($samples as $x) {
                $sampleOut[] = [
                    'id' => (int)($x['id'] ?? 0),
                    'ts' => (int)($x['ts'] ?? 0),
                    'module' => (string)($x['module'] ?? ''),
                    'action' => (string)($x['action'] ?? ''),
                    'user' => (string)($x['user'] ?? ''),
                    'severity' => (string)($x['severity'] ?? ''),
                    'success' => (int)($x['success'] ?? -1),
                ];
            }
            $resp['evaluation'][] = [
                'rule_id' => (int)($rule['id'] ?? 0),
                'type' => $type,
                'window' => $window,
                'count' => $count,
                'matches' => $matches,
                'triggered' => $triggered,
                'samples' => $sampleOut,
            ];
        }
    }

    echo json_encode($resp, JSON_UNESCAPED_SLASHES);
    exit;
}

// --- Logs endpoint (GET) ---
if ($resource === 'logs' && $method === 'GET') {
    // Integrity verification: verify=1 to check hash chain consistency
    if ((int)($_GET['verify'] ?? 0) === 1) {
        $checked = 0; $valid = true; $breakAtId = null;
        $prevHash = '';
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
            } catch (Throwable $e) { $pdo = null; }
        }
        if (!$pdo) {
            $lf = __DIR__ . '/../storage/logs.json';
            $arr = is_file($lf) ? json_decode((string)file_get_contents($lf), true) : [];
            if (!is_array($arr)) $arr = [];
            foreach ($arr as $row) {
                $expectedPrev = $prevHash;
                if ((string)($row['prev_hash'] ?? '') !== $expectedPrev) { $valid = false; $breakAtId = (int)($row['id'] ?? 0); break; }
                $recalc = hash('sha256', $expectedPrev . '|' . ($row['module'] ?? '') . '|' . ($row['action'] ?? '') . '|' . ($row['user'] ?? '') . '|' . ($row['ts'] ?? 0) . '|' . (int)($row['success'] ?? 0) . '|' . ($row['ip'] ?? '') . '|' . ($row['ua'] ?? ''));
                if ((string)($row['hash'] ?? '') !== $recalc) { $valid = false; $breakAtId = (int)($row['id'] ?? 0); break; }
                $prevHash = (string)($row['hash'] ?? '');
                $checked++;
            }
        }
        // Record audit entry for integrity verification
        if ($pdo) {
            try {
                $actor = get_auth_key() !== '' ? 'key:' . substr(get_auth_key(), 0, 6) : 'system';
                $details = json_encode(['checked' => $checked, 'valid' => $valid, 'break_at_id' => $breakAtId], JSON_UNESCAPED_SLASHES);
                $ins = $pdo->prepare('INSERT INTO audits (ts,type,actor,details) VALUES (?,?,?,?)');
                $ins->execute([time(),'integrity.verify',$actor,$details]);
            } catch (Throwable $e) {}
        }
        echo json_encode(['valid' => $valid, 'break_at_id' => $breakAtId, 'checked' => $checked], JSON_UNESCAPED_SLASHES);
        exit;
    }
    $module = isset($_GET['module']) ? (string)$_GET['module'] : '';
    $action = isset($_GET['action']) ? (string)$_GET['action'] : '';
    $user = isset($_GET['user']) ? (string)$_GET['user'] : '';
    $severity = isset($_GET['severity']) ? (string)$_GET['severity'] : '';
    $successParam = isset($_GET['success']) ? $_GET['success'] : '';
    if ($successParam !== '' && !in_array((int)$successParam, [0,1], true)) { $successParam = ''; }
    $fromDate = isset($_GET['from']) ? (string)$_GET['from'] : '';
    $toDate = isset($_GET['to']) ? (string)$_GET['to'] : '';
    $qParam = isset($_GET['q']) ? (string)$_GET['q'] : '';
    $page = max(1, (int)($_GET['page'] ?? 1));
    $perPage = max(1, min(100, (int)($_GET['per_page'] ?? 25)));

    $filters = [];
    $params = [];
    if ($module !== '') { $filters[] = 'module = ?'; $params[] = $module; }
    if ($action !== '') { $filters[] = 'action = ?'; $params[] = $action; }
    if ($user !== '') { $filters[] = 'user = ?'; $params[] = $user; }
    if ($severity !== '') { $filters[] = 'severity = ?'; $params[] = $severity; }
    if ($successParam !== '' && in_array((int)$successParam, [0,1], true)) { $filters[] = 'success = ?'; $params[] = (int)$successParam; }
    if ($fromDate !== '') { $fromTs = strtotime($fromDate . ' 00:00:00') ?: 0; if ($fromTs > 0) { $filters[] = 'ts >= ?'; $params[] = $fromTs; } }
    if ($toDate !== '') { $toTs = strtotime($toDate . ' 23:59:59') ?: 0; if ($toTs > 0) { $filters[] = 'ts <= ?'; $params[] = $toTs; } }
    if ($qParam !== '') {
        $filters[] = '(module LIKE ? OR action LIKE ? OR user LIKE ? OR severity LIKE ? OR ip LIKE ? OR ua LIKE ? OR details LIKE ?)';
        $like = '%' . $qParam . '%';
        $params[] = $like; $params[] = $like; $params[] = $like; $params[] = $like; $params[] = $like; $params[] = $like; $params[] = $like;
    }
    $where = count($filters) ? ('WHERE ' . implode(' AND ', $filters)) : '';
    $order = 'ORDER BY ts DESC';
    $offset = ($page - 1) * $perPage;

    $data = [];
    $total = 0;

    if ($pdo) {
        try {
            $countSql = 'SELECT COUNT(*) FROM logs ' . $where;
            $countStmt = $pdo->prepare($countSql);
            foreach ($params as $i => $v) { $countStmt->bindValue($i+1, $v); }
            $countStmt->execute();
            $total = (int)$countStmt->fetchColumn(0);

            $sql = 'SELECT * FROM logs ' . $where . ' ' . $order . ' LIMIT ? OFFSET ?';
            $stmt = $pdo->prepare($sql);
            $bindParams = $params;
            $bindParams[] = $perPage;
            $bindParams[] = $offset;
            foreach ($bindParams as $i => $v) { $stmt->bindValue($i+1, $v); }
            $stmt->execute();
            $data = $stmt->fetchAll(PDO::FETCH_ASSOC);
        } catch (Throwable $e) {
            $pdo = null;
        }
    }

    if (!$pdo) {
        $lf = __DIR__ . '/../storage/logs.json';
        $arr = is_file($lf) ? json_decode((string)file_get_contents($lf), true) : [];
        if (!is_array($arr)) { $arr = []; }
        $filtered = [];
        foreach ($arr as $r) {
            if ($module !== '' && (string)($r['module'] ?? '') !== $module) continue;
            if ($action !== '' && (string)($r['action'] ?? '') !== $action) continue;
            if ($user !== '' && (string)($r['user'] ?? '') !== $user) continue;
            if ($severity !== '' && (string)($r['severity'] ?? '') !== $severity) continue;
            if ($successParam !== '' && (int)($r['success'] ?? -1) !== (int)$successParam) continue;
            $ts = (int)($r['ts'] ?? 0);
            if ($fromDate !== '' && $ts < (strtotime($fromDate . ' 00:00:00') ?: 0)) continue;
            if ($toDate !== '' && $ts > (strtotime($toDate . ' 23:59:59') ?: PHP_INT_MAX)) continue;
            if ($qParam !== '') {
                $hay = strtolower((string)($r['module'] ?? '') . '|' . (string)($r['action'] ?? '') . '|' . (string)($r['user'] ?? '') . '|' . (string)($r['severity'] ?? '') . '|' . (string)($r['ip'] ?? '') . '|' . (string)($r['ua'] ?? '') . '|' . (string)($r['details'] ?? ''));
                if (strpos($hay, strtolower($qParam)) === false) continue;
            }
            $filtered[] = $r;
        }
        usort($filtered, function($a, $b) { return (int)($b['ts'] ?? 0) <=> (int)($a['ts'] ?? 0); });
        $total = count($filtered);
        $data = array_slice($filtered, $offset, $perPage);
    }

    echo json_encode(['data' => $data, 'meta' => ['total' => $total, 'page' => $page, 'per_page' => $perPage]], JSON_UNESCAPED_SLASHES);
    exit;
}

// --- Audits endpoint (GET) ---
if ($resource === 'audits' && $method === 'GET') {
  $type = isset($_GET['type']) ? (string)$_GET['type'] : '';
  $actor = isset($_GET['actor']) ? (string)$_GET['actor'] : '';
  $fromDate = isset($_GET['from']) ? (string)$_GET['from'] : '';
  $toDate = isset($_GET['to']) ? (string)$_GET['to'] : '';
  $qParam = isset($_GET['q']) ? (string)$_GET['q'] : '';
  $page = max(1, (int)($_GET['page'] ?? 1));
  $perPage = max(1, min(100, (int)($_GET['per_page'] ?? 25)));

  $filters = [];
  $params = [];
  if ($type !== '') { $filters[] = 'type = ?'; $params[] = $type; }
  if ($actor !== '') { $filters[] = 'actor = ?'; $params[] = $actor; }
  if ($fromDate !== '') { $fromTs = strtotime($fromDate . ' 00:00:00') ?: 0; if ($fromTs > 0) { $filters[] = 'ts >= ?'; $params[] = $fromTs; } }
  if ($toDate !== '') { $toTs = strtotime($toDate . ' 23:59:59') ?: 0; if ($toTs > 0) { $filters[] = 'ts <= ?'; $params[] = $toTs; } }
  if ($qParam !== '') { $filters[] = '(type LIKE ? OR actor LIKE ? OR details LIKE ?)'; $like = '%' . $qParam . '%'; $params[] = $like; $params[] = $like; $params[] = $like; }
  $where = count($filters) ? ('WHERE ' . implode(' AND ', $filters)) : '';
  $offset = ($page - 1) * $perPage;

  $data = [];
  $total = 0;
  if ($pdo) {
    try {
      $countSql = 'SELECT COUNT(*) FROM audits ' . $where;
      $countStmt = $pdo->prepare($countSql);
      $countStmt->execute($params);
      $total = (int)$countStmt->fetchColumn(0);

      $sql = 'SELECT id,ts,type,actor,details FROM audits ' . $where . ' ORDER BY ts DESC LIMIT ' . (int)$perPage . ' OFFSET ' . (int)$offset;
      $stmt = $pdo->prepare($sql);
      $stmt->execute($params);
      while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $detailsRaw = (string)($row['details'] ?? '');
        $parsed = json_decode($detailsRaw, true);
        if (!is_array($parsed)) { $parsed = $detailsRaw; }
        $data[] = [
          'id' => (int)($row['id'] ?? 0),
          'ts' => (int)($row['ts'] ?? 0),
          'type' => (string)($row['type'] ?? ''),
          'actor' => (string)($row['actor'] ?? ''),
          'details' => $parsed,
        ];
      }
    } catch (Throwable $e) { /* fallthrough with empty data */ }
  }
  echo json_encode(['data' => $data, 'meta' => ['page' => $page, 'per_page' => $perPage, 'total' => $total]], JSON_UNESCAPED_SLASHES);
  exit;
}

// --- Logs endpoint (POST) ---
if ($resource === 'logs' && $method === 'POST') {
    $raw = file_get_contents('php://input');
    $payload = json_decode($raw, true);
    if (!is_array($payload)) { $payload = []; }
    // Early prune handling
    $isPruneReq = ((string)($_GET['prune'] ?? '0') === '1') || (isset($payload['prune']) && ($payload['prune'] === 1 || $payload['prune'] === true));
    if ($isPruneReq) {
        $days = null;
        if (isset($_GET['older_than_days'])) { $days = (int)$_GET['older_than_days']; }
        elseif (isset($payload['older_than_days'])) { $days = (int)$payload['older_than_days']; }
        if ($days === null || $days <= 0) { $days = (int)env('RETENTION_DAYS', '0'); }
        if ($days <= 0) { json_error(422, 'older_than_days required or set RETENTION_DAYS'); }
        $dryRun = ((int)($_GET['dry_run'] ?? ($payload['dry_run'] ?? 0)) === 1);
        $cutoff = time() - ($days * 86400);
        $res = prune_logs($pdo, $cutoff, $dryRun);
        $res['older_than_days'] = $days;
        echo json_encode($res, JSON_UNESCAPED_SLASHES);
        exit;
    }
    $now = time();
    $module = (string)($payload['module'] ?? '');
    $action = (string)($payload['action'] ?? '');
    $user = (string)($payload['user'] ?? '');
    $success = isset($payload['success']) ? (int)$payload['success'] : 1;
    $severity = (string)($payload['severity'] ?? 'info');
    $ip = (string)($payload['ip'] ?? ($_SERVER['REMOTE_ADDR'] ?? ''));
    $ua = (string)($payload['ua'] ?? ($_SERVER['HTTP_USER_AGENT'] ?? ''));
    if ($module === '' || $action === '') { json_error(422, 'module and action are required'); }

    // New: normalize optional details
    $detailsVal = $payload['details'] ?? null;
    if (is_array($detailsVal) || is_object($detailsVal)) { $details = json_encode($detailsVal, JSON_UNESCAPED_SLASHES); }
    else if ($detailsVal === null) { $details = ''; }
    else { $details = (string)$detailsVal; }

    if ($pdo) {
        $prevHash = '';
        $stmt = $pdo->query('SELECT hash FROM logs ORDER BY id DESC LIMIT 1');
        $last = $stmt->fetchColumn(0);
        if ($last) $prevHash = (string)$last;
        $h = hash('sha256', $prevHash . '|' . $module . '|' . $action . '|' . $user . '|' . $now . '|' . $success . '|' . $ip . '|' . $ua);
        $ins = $pdo->prepare('INSERT INTO logs (module,action,user,ts,success,severity,ip,ua,details,prev_hash,hash) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
        $ins->execute([$module,$action,$user,$now,$success,$severity,$ip,$ua,$details,$prevHash,$h]);
        $id = (int)$pdo->lastInsertId();
        // Alert notifications via webhook when rules are triggered
        try {
            $webhook = (string)env('ALERT_WEBHOOK_URL', '');
            if ($webhook !== '') {
                $file = __DIR__ . '/../storage/alerts.json';
                $rules = is_file($file) ? json_decode((string)file_get_contents($file), true) : [];
                if (!is_array($rules)) $rules = [];
                foreach ($rules as $rule) {
                    if (!($rule['enabled'] ?? true)) continue;
                    $type = (string)($rule['type'] ?? '');
                    $window = max(1, (int)($rule['window'] ?? 3600));
                    $cutoff = $now - $window;
                    // filters
                    $fMod = (string)($rule['module'] ?? '');
                    $fAct = (string)($rule['action'] ?? '');
                    $fUsr = (string)($rule['user'] ?? '');
                    $fSev = (string)($rule['severity'] ?? '');
                    $fSuc = $rule['success'] ?? '';
                    // Event must satisfy filters
                    if ($fMod !== '' && $module !== $fMod) continue;
                    if ($fAct !== '' && $action !== $fAct) continue;
                    if ($fUsr !== '' && $user !== $fUsr) continue;
                    if ($fSev !== '' && $severity !== $fSev) continue;
                    if ($fSuc !== '' && ($fSuc === 0 || $fSuc === 1) && (int)$success !== (int)$fSuc) continue;
                    $triggered = false; $matches = 0; $count = 0;
                    if ($type === 'pattern') {
                        $pattern = (string)($rule['pattern'] ?? '');
                        if ($pattern !== '') {
                            $text = $action . '|' . $module . '|' . $user . '|' . $severity;
                            if (@preg_match($pattern, $text)) { $triggered = true; $matches = 1; }
                        }
                    } else { // threshold
                        // Count recent logs that satisfy rule filters
                        $filters = ['ts > ?']; $params = [$cutoff];
                        if ($fMod !== '') { $filters[] = 'module = ?'; $params[] = $fMod; }
                        if ($fAct !== '') { $filters[] = 'action = ?'; $params[] = $fAct; }
                        if ($fUsr !== '') { $filters[] = 'user = ?'; $params[] = $fUsr; }
                        if ($fSev !== '') { $filters[] = 'severity = ?'; $params[] = $fSev; }
                        if ($fSuc !== '' && ($fSuc === 0 || $fSuc === 1)) { $filters[] = 'success = ?'; $params[] = (int)$fSuc; }
                        $where = 'WHERE ' . implode(' AND ', $filters);
                        $st = $pdo->prepare('SELECT COUNT(*) FROM logs ' . $where);
                        foreach ($params as $i => $v) { $st->bindValue($i+1, $v); }
                        $st->execute();
                        $count = (int)$st->fetchColumn(0);
                        $threshold = max(1, (int)($rule['threshold'] ?? 1));
                        $triggered = ($count >= $threshold);
                    }
                    if ($triggered) {
                        $body = [
                            'rule' => [
                                'id' => (int)($rule['id'] ?? 0),
                                'type' => $type,
                                'module' => $fMod,
                                'action' => $fAct,
                                'user' => $fUsr,
                                'severity' => $fSev,
                                'success' => ($fSuc === '' ? '' : (int)$fSuc),
                                'threshold' => (int)($rule['threshold'] ?? 0),
                                'pattern' => (string)($rule['pattern'] ?? ''),
                                'window' => $window,
                            ],
                            'event' => [
                                'id' => $id,
                                'module' => $module,
                                'action' => $action,
                                'user' => $user,
                                'ts' => $now,
                                'success' => $success,
                                'severity' => $severity,
                                'ip' => $ip,
                                'ua' => $ua,
                            ],
                            'stats' => ['count' => $count, 'matches' => $matches]
                        ];
                        // Send webhook
                        $ctx = stream_context_create([
                            'http' => [
                                'method' => 'POST',
                                'header' => "Content-Type: application/json\r\n",
                                'content' => json_encode($body, JSON_UNESCAPED_SLASHES),
                                'timeout' => 3,
                            ]
                        ]);
                        @file_get_contents($webhook, false, $ctx);
                    }
                }
            }
        } catch (Throwable $e) { /* ignore webhook errors */ }
        echo json_encode(['id'=>$id,'module'=>$module,'action'=>$action,'user'=>$user,'ts'=>$now,'success'=>$success,'severity'=>$severity,'ip'=>$ip,'ua'=>$ua,'details'=>$details,'prev_hash'=>$prevHash,'hash'=>$h], JSON_UNESCAPED_SLASHES);
        exit;
    }
    // Fallback: append to file
    $file = __DIR__ . '/../storage/logs.json';
    $arr = is_file($file) ? json_decode((string)file_get_contents($file), true) : [];
    if (!is_array($arr)) $arr = [];
    $prevHash = count($arr) ? (string)($arr[count($arr)-1]['hash'] ?? '') : '';
    $h = hash('sha256', $prevHash . '|' . $module . '|' . $action . '|' . $user . '|' . $now . '|' . $success . '|' . $ip . '|' . $ua);
    $row = ['id'=>count($arr)+1,'module'=>$module,'action'=>$action,'user'=>$user,'ts'=>$now,'success'=>$success,'severity'=>$severity,'ip'=>$ip,'ua'=>$ua,'prev_hash'=>$prevHash,'hash'=>$h];
    $arr[] = $row;
    @file_put_contents($file, json_encode($arr));
    echo json_encode($row, JSON_UNESCAPED_SLASHES);
    exit;
}

// Removed: json_error(405, 'Method not allowed');

// Prune endpoint for logs (POST with prune=1 or DELETE)
if ($resource === 'logs' && ($method === 'POST' || $method === 'DELETE')) {
    $isPruneReq = ((string)($_GET['prune'] ?? '0') === '1');
    $rawBody = file_get_contents('php://input');
    $payload = json_decode($rawBody, true);
    if (!is_array($payload)) { $payload = []; }
    $isPruneReq = $isPruneReq || (isset($payload['prune']) && ($payload['prune'] === 1 || $payload['prune'] === true));
    if ($isPruneReq || $method === 'DELETE') {
        $days = null;
        if (isset($_GET['older_than_days'])) { $days = (int)$_GET['older_than_days']; }
        elseif (isset($payload['older_than_days'])) { $days = (int)$payload['older_than_days']; }
        if ($days === null || $days <= 0) { $days = (int)env('RETENTION_DAYS', '0'); }
        if ($days <= 0) { json_error(422, 'older_than_days required or set RETENTION_DAYS'); }
        // Protections: max_days and min_remaining
        $maxDaysParam = isset($_GET['max_days']) ? (int)$_GET['max_days'] : (isset($payload['max_days']) ? (int)$payload['max_days'] : 0);
        $maxDaysEnv = (int)env('PRUNE_MAX_DAYS', '0');
        $maxDays = $maxDaysParam > 0 ? $maxDaysParam : $maxDaysEnv;
        if ($maxDays > 0 && $days > $maxDays) { json_error(422, 'older_than_days exceeds max_days protection'); }
        $dryRun = ((int)($_GET['dry_run'] ?? ($payload['dry_run'] ?? 0)) === 1);
        $cutoff = time() - ($days * 86400);
        $minRemainParam = isset($_GET['min_remaining']) ? (int)$_GET['min_remaining'] : (isset($payload['min_remaining']) ? (int)$payload['min_remaining'] : 0);
        $minRemainEnv = (int)env('PRUNE_MIN_REMAINING', '0');
        $minRemaining = $minRemainParam > 0 ? $minRemainParam : $minRemainEnv;
        if ($minRemaining > 0) {
            $total = 0; $matched = 0;
            if ($pdo) {
                try {
                    $stTotal = $pdo->query('SELECT COUNT(*) FROM logs');
                    $total = (int)$stTotal->fetchColumn(0);
                    $stMatch = $pdo->prepare('SELECT COUNT(*) FROM logs WHERE ts < ?');
                    $stMatch->execute([$cutoff]);
                    $matched = (int)$stMatch->fetchColumn(0);
                } catch (Throwable $e) { $pdo = null; }
            }
            if (!$pdo) {
                $lf = __DIR__ . '/../storage/logs.json';
                $arr = is_file($lf) ? json_decode((string)file_get_contents($lf), true) : [];
                if (!is_array($arr)) $arr = [];
                $total = count($arr);
                foreach ($arr as $row) { $ts = (int)($row['ts'] ?? 0); if ($ts < $cutoff) { $matched++; } }
            }
            $remaining = max(0, $total - $matched);
            if ($remaining < $minRemaining) { json_error(422, 'min_remaining would be violated'); }
        }
        $res = prune_logs($pdo, $cutoff, $dryRun);
        $res['older_than_days'] = $days;
        $minRemaining = $minRemaining ?? 0;
        $res['protections'] = ['max_days' => $maxDays, 'min_remaining' => $minRemaining];
        // Record audit entry for prune operation
        if ($pdo) {
            try {
                $actor = get_auth_key() !== '' ? 'key:' . substr(get_auth_key(), 0, 6) : 'system';
                $details = json_encode($res, JSON_UNESCAPED_SLASHES);
                $ins = $pdo->prepare('INSERT INTO audits (ts,type,actor,details) VALUES (?,?,?,?)');
                $ins->execute([time(),'logs.prune',$actor,$details]);
            } catch (Throwable $e) {}
        }
        echo json_encode($res, JSON_UNESCAPED_SLASHES);
        exit;
    }
}

// --- Helpers ---
function prune_logs($pdo, int $cutoff, bool $dryRun = false): array {
    $deleted = 0;
    $matched = 0;
    if ($pdo) {
        try {
            $countStmt = $pdo->prepare('SELECT COUNT(*) FROM logs WHERE ts < ?');
            $countStmt->execute([$cutoff]);
            $matched = (int)$countStmt->fetchColumn(0);
            if (!$dryRun && $matched > 0) {
                $delStmt = $pdo->prepare('DELETE FROM logs WHERE ts < ?');
                $delStmt->execute([$cutoff]);
                $deleted = $delStmt->rowCount();
                if ($deleted === 0) { $deleted = $matched; }
            }
        } catch (Throwable $e) {
            $pdo = null;
        }
    }
    if (!$pdo) {
        $lf = __DIR__ . '/../storage/logs.json';
        $arr = is_file($lf) ? json_decode((string)file_get_contents($lf), true) : [];
        if (!is_array($arr)) $arr = [];
        $keep = [];
        foreach ($arr as $row) {
            $ts = (int)($row['ts'] ?? 0);
            if ($ts < $cutoff) { $matched++; } else { $keep[] = $row; }
        }
        if (!$dryRun) {
            @file_put_contents($lf, json_encode($keep));
            $deleted = $matched;
        }
    }
    return ['deleted' => $deleted, 'matched' => $matched, 'cutoff' => $cutoff, 'dry_run' => $dryRun];
}



// Alerts update (PUT)
if ($resource === 'alerts' && $method === 'PUT') {
    $file = __DIR__ . '/../storage/alerts.json';
    $raw = file_get_contents('php://input');
    $payload = json_decode($raw, true);
    if (!is_array($payload)) { json_error(400, 'Invalid JSON body'); }
    $id = isset($_GET['id']) ? (int)$_GET['id'] : (int)($payload['id'] ?? 0);
    if ($id <= 0) { json_error(422, 'id is required'); }
    $rules = is_file($file) ? json_decode((string)file_get_contents($file), true) : [];
    if (!is_array($rules)) $rules = [];
    $updated = null;
    foreach ($rules as &$rule) {
        if ((int)($rule['id'] ?? 0) === $id) {
            $allowed = ['type','window','module','action','user','severity','success','enabled','threshold','pattern'];
            foreach ($allowed as $k) {
                if (array_key_exists($k, $payload)) {
                    if ($k === 'success') { $rule[$k] = ($payload[$k] === '' ? '' : (int)$payload[$k]); }
                    else { $rule[$k] = $payload[$k]; }
                }
            }
            // validation
            $type = (string)($rule['type'] ?? '');
            if (!in_array($type, ['threshold','pattern'], true)) { json_error(422, 'type must be threshold or pattern'); }
            if ($type === 'threshold') { $rule['threshold'] = max(1, (int)($rule['threshold'] ?? 1)); }
            if ($type === 'pattern') { $rule['pattern'] = (string)($rule['pattern'] ?? ''); if ($rule['pattern'] === '') { json_error(422, 'pattern is required for pattern rules'); } }
            $updated = $rule;
            break;
        }
    }
    unset($rule);
    if ($updated === null) { json_error(404, 'Rule not found'); }
    @file_put_contents($file, json_encode($rules));
    echo json_encode(['updated' => 1, 'rule' => $updated], JSON_UNESCAPED_SLASHES);
    exit;
}
// Alerts delete (DELETE)
if ($resource === 'alerts' && $method === 'DELETE') {
    $file = __DIR__ . '/../storage/alerts.json';
    $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
    if ($id <= 0) { json_error(422, 'id is required'); }
    $rules = is_file($file) ? json_decode((string)file_get_contents($file), true) : [];
    if (!is_array($rules)) $rules = [];
    $before = count($rules);
    $rules = array_values(array_filter($rules, fn($r) => (int)($r['id'] ?? 0) !== $id));
    if (count($rules) === $before) { json_error(404, 'Rule not found'); }
    @file_put_contents($file, json_encode($rules));
    echo json_encode(['deleted' => 1, 'id' => $id], JSON_UNESCAPED_SLASHES);
    exit;
}

// Alerts create (POST)
if ($resource === 'alerts' && $method === 'POST') {
    $file = __DIR__ . '/../storage/alerts.json';
    $raw = file_get_contents('php://input');
    $payload = json_decode($raw, true);
    if (!is_array($payload)) { json_error(400, 'Invalid JSON body'); }
    $type = (string)($payload['type'] ?? '');
    if (!in_array($type, ['threshold','pattern'], true)) { json_error(422, 'type must be threshold or pattern'); }
    $window = max(1, (int)($payload['window'] ?? 3600));
    $module = (string)($payload['module'] ?? '');
    $action = (string)($payload['action'] ?? '');
    $user = (string)($payload['user'] ?? '');
    $severity = (string)($payload['severity'] ?? '');
    $successVal = ($payload['success'] ?? '');
    if ($successVal !== '' && !in_array((int)$successVal, [0,1], true)) { json_error(422, 'success must be 0, 1, or ""'); }
    $enabled = (bool)($payload['enabled'] ?? true);
    $rule = [
        'type' => $type,
        'window' => $window,
        'module' => $module,
        'action' => $action,
        'user' => $user,
        'severity' => $severity,
        'success' => ($successVal === '' ? '' : (int)$successVal),
        'enabled' => $enabled ? 1 : 0,
    ];
    if ($type === 'threshold') {
        $rule['threshold'] = max(1, (int)($payload['threshold'] ?? 1));
    } else { // pattern
        $pattern = (string)($payload['pattern'] ?? '');
        if ($pattern === '') { json_error(422, 'pattern is required for pattern rules'); }
        $rule['pattern'] = $pattern;
    }
    $rules = is_file($file) ? json_decode((string)file_get_contents($file), true) : [];
    if (!is_array($rules)) { $rules = []; }
    $maxId = 0; foreach ($rules as $r) { $mid = (int)($r['id'] ?? 0); if ($mid > $maxId) $maxId = $mid; }
    $rule['id'] = $maxId + 1;
    $rules[] = $rule;
    @file_put_contents($file, json_encode($rules));
    echo json_encode(['created' => 1, 'rule' => $rule], JSON_UNESCAPED_SLASHES);
    exit;
}