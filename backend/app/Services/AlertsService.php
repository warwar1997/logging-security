<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\Log;

class AlertsService
{
    private string $filePath;

    public function __construct()
    {
        $this->filePath = base_path('storage/alerts.json');
    }

    /**
     * Load all alert rules from storage.
     * @return array<int, array<string,mixed>>
     */
    public function loadAll(): array
    {
        $json = is_file($this->filePath) ? (string)file_get_contents($this->filePath) : '[]';
        $arr = json_decode($json, true);
        return is_array($arr) ? $arr : [];
    }

    /**
     * Persist rules back to storage.
     * @param array<int, array<string,mixed>> $rules
     */
    public function saveAll(array $rules): void
    {
        @file_put_contents($this->filePath, json_encode($rules));
    }

    /**
     * Filter + paginate rules, with optional evaluation.
     * @param array{type?:string,enabled?:string,q?:string,page?:int,per_page?:int,evaluate?:bool} $filters
     * @return array{rules: array<int, array<string,mixed>>, meta: array<string,int>, evaluation: array<int,array<string,mixed>>}
     */
    public function list(array $filters): array
    {
        $type = (string)($filters['type'] ?? '');
        $enabled = (string)($filters['enabled'] ?? '');
        $q = (string)($filters['q'] ?? '');
        $page = max(1, (int)($filters['page'] ?? 1));
        $perPage = max(1, min(200, (int)($filters['per_page'] ?? 20)));
        $evaluate = (bool)($filters['evaluate'] ?? false);

        $arr = $this->loadAll();
        $filtered = array_values(array_filter($arr, function ($r) use ($type, $enabled, $q) {
            if ($type !== '' && (string)($r['type'] ?? '') !== $type) return false;
            if ($enabled !== '' && (string)($r['enabled'] ?? '') !== $enabled) return false;
            if ($q !== '') {
                $hay = json_encode($r, JSON_UNESCAPED_SLASHES);
                if (stripos((string)$hay, $q) === false) return false;
            }
            return true;
        }));

        $total = count($filtered);
        $offset = ($page - 1) * $perPage;
        $rules = array_slice($filtered, $offset, $perPage);

        $evaluation = $evaluate ? $this->evaluateRules($rules) : [];

        return [
            'rules' => $rules,
            'meta' => ['page' => $page, 'per_page' => $perPage, 'total' => $total],
            'evaluation' => $evaluation,
        ];
    }

    /**
     * Create a new rule and persist it.
     * @param array<string,mixed> $payload
     * @return array<string,mixed>
     */
    public function create(array $payload): array
    {
        $arr = $this->loadAll();
        $maxId = 0; foreach ($arr as $r) { $maxId = max($maxId, (int)($r['id'] ?? 0)); }
        $payload['id'] = $maxId + 1;
        $payload['enabled'] = (int)($payload['enabled'] ?? 1);
        $arr[] = $payload;
        $this->saveAll($arr);
        return $payload;
    }

    /**
     * Update a rule by id.
     * @param int $id
     * @param array<string,mixed> $payload
     * @return array<string,mixed>|null Updated rule or null if not found
     */
    public function update(int $id, array $payload): ?array
    {
        $arr = $this->loadAll();
        $updated = null;
        foreach ($arr as &$rule) {
            if ((int)($rule['id'] ?? 0) === $id) {
                foreach (['enabled','type','window','threshold','module','action','user','severity','success','pattern'] as $k) {
                    if (array_key_exists($k, $payload)) { $rule[$k] = $payload[$k]; }
                }
                $updated = $rule;
                break;
            }
        }
        unset($rule);
        if ($updated === null) { return null; }
        $this->saveAll($arr);
        return $updated;
    }

    /**
     * Delete a rule by id.
     * @return bool True if deleted, false if not found
     */
    public function delete(int $id): bool
    {
        $arr = $this->loadAll();
        $before = count($arr);
        $arr = array_values(array_filter($arr, fn($r) => (int)($r['id'] ?? 0) !== $id));
        if (count($arr) === $before) { return false; }
        $this->saveAll($arr);
        return true;
    }

    /**
     * Evaluate threshold rules against recent logs.
     * @param array<int, array<string,mixed>> $rules
     * @return array<int, array<string,mixed>>
     */
    public function evaluateRules(array $rules): array
    {
        $now = time();
        $evaluation = [];
        foreach ($rules as $r) {
            $rid = (int)($r['id'] ?? 0);
            $typeR = (string)($r['type'] ?? '');
            $enabledR = (int)($r['enabled'] ?? 0) === 1;
            if (!$enabledR) {
                $evaluation[] = [
                    'rule_id' => $rid,
                    'triggered' => false,
                    'count' => 0,
                    'window' => (int)($r['window'] ?? 0),
                ];
                continue;
            }
            if ($typeR === 'threshold') {
                $window = max(1, (int)($r['window'] ?? 60));
                $fromTs = $now - $window;
                $qLogs = Log::query()->where('ts', '>=', $fromTs);
                $module = (string)($r['module'] ?? '');
                $action = (string)($r['action'] ?? '');
                $user = (string)($r['user'] ?? '');
                $severity = (string)($r['severity'] ?? '');
                $success = $r['success'] ?? '';
                if ($module !== '') $qLogs->where('module', $module);
                if ($action !== '') $qLogs->where('action', $action);
                if ($user !== '') $qLogs->where('user', $user);
                if ($severity !== '') $qLogs->where('severity', $severity);
                if ($success !== '') $qLogs->where('success', (int)$success);
                $count = (int)$qLogs->count();
                $qLogs2 = clone $qLogs;
                $sampleRows = $qLogs2->orderBy('ts', 'desc')->limit(3)->get(['id','ts','module','action','user','severity','success']);
                $sampleOut = [];
                foreach ($sampleRows as $x) {
                    $sampleOut[] = [
                        'id' => (int)$x->id,
                        'ts' => (int)$x->ts,
                        'module' => (string)$x->module,
                        'action' => (string)$x->action,
                        'user' => (string)$x->user,
                        'severity' => (string)$x->severity,
                        'success' => (int)$x->success,
                    ];
                }
                $threshold = max(1, (int)($r['threshold'] ?? 1));
                $evaluation[] = [
                    'rule_id' => $rid,
                    'triggered' => $count >= $threshold,
                    'count' => $count,
                    'window' => $window,
                    'samples' => $sampleOut,
                ];
            } else {
                $evaluation[] = [
                    'rule_id' => $rid,
                    'triggered' => false,
                    'count' => 0,
                    'window' => (int)($r['window'] ?? 0),
                    'samples' => [],
                ];
            }
        }
        return $evaluation;
    }
}