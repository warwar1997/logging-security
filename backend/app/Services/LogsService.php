<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\Log;
use Illuminate\Http\Request;

class LogsService
{
    /**
     * Verify the hash chain integrity of logs.
     * @return array{valid: bool, break_at_id: int|null, checked: int}
     */
    public function verifyChain(): array
    {
        $checked = 0; $valid = true; $breakAtId = null; $prevHash = '';
        Log::orderBy('id', 'asc')
            ->select(['id','module','action','user','ts','success','ip','ua','prev_hash','hash'])
            ->chunk(500, function ($chunk) use (&$checked, &$valid, &$breakAtId, &$prevHash) {
                if (!$valid) { return false; }
                foreach ($chunk as $row) {
                    $expectedPrev = $prevHash;
                    if ((string)($row->prev_hash ?? '') !== $expectedPrev) { $valid = false; $breakAtId = (int)$row->id; return false; }
                    $recalc = hash('sha256', $expectedPrev . '|' . (string)$row->module . '|' . (string)$row->action . '|' . (string)$row->user . '|' . (int)$row->ts . '|' . (int)$row->success . '|' . ((string)$row->ip ?? '') . '|' . ((string)$row->ua ?? ''));
                    if ((string)($row->hash ?? '') !== $recalc) { $valid = false; $breakAtId = (int)$row->id; return false; }
                    $prevHash = (string)$row->hash;
                    $checked++;
                }
            });
        return ['valid' => $valid, 'break_at_id' => $breakAtId, 'checked' => $checked];
    }

    /**
     * Filter + paginate logs.
     * @param array{module?:string,action?:string,user?:string,severity?:string,success?:string|int,from?:string,to?:string,q?:string,page?:int,per_page?:int} $filters
     * @return array{data: array<int, array<string,mixed>>, meta: array<string,int>}
     */
    public function getLogs(array $filters): array
    {
        $module = (string)($filters['module'] ?? '');
        $action = (string)($filters['action'] ?? '');
        $user = (string)($filters['user'] ?? '');
        $severity = (string)($filters['severity'] ?? '');
        $successParam = $filters['success'] ?? '';
        $from = (string)($filters['from'] ?? '');
        $to = (string)($filters['to'] ?? '');
        $q = (string)($filters['q'] ?? '');
        $page = max(1, (int)($filters['page'] ?? 1));
        $perPage = max(1, min(100, (int)($filters['per_page'] ?? 25)));
        $offset = ($page - 1) * $perPage;

        $query = Log::query();
        if ($module !== '') { $query->where('module', $module); }
        if ($action !== '') { $query->where('action', $action); }
        if ($user !== '') { $query->where('user', $user); }
        if ($severity !== '') { $query->where('severity', $severity); }
        if ($successParam !== '' && in_array((int)$successParam, [0, 1], true)) { $query->where('success', (int)$successParam); }
        if ($from !== '') { $fromTs = strtotime($from . ' 00:00:00') ?: 0; if ($fromTs > 0) { $query->where('ts', '>=', $fromTs); } }
        if ($to !== '') { $toTs = strtotime($to . ' 23:59:59') ?: 0; if ($toTs > 0) { $query->where('ts', '<=', $toTs); } }
        if ($q !== '') {
            $like = '%' . $q . '%';
            $query->where(function ($qq) use ($like) {
                $qq->where('module', 'like', $like)
                    ->orWhere('action', 'like', $like)
                    ->orWhere('user', 'like', $like)
                    ->orWhere('severity', 'like', $like)
                    ->orWhere('ip', 'like', $like)
                    ->orWhere('ua', 'like', $like)
                    ->orWhere('details', 'like', $like);
            });
        }

        $total = (clone $query)->count();
        $data = $query->orderBy('ts', 'desc')->skip($offset)->take($perPage)->get()->toArray();
        return ['data' => $data, 'meta' => ['total' => $total, 'page' => $page, 'per_page' => $perPage]];
    }

    /**
     * Parse payload from Request with robustness and normalize values.
     * @return array{module:string,action:string,user:string,success:int,severity:string,ip:string,ua:string,details:string}
     */
    public function parsePayloadFromRequest(Request $request): array
    {
        $payload = [];
        try { $payload = $request->json()->all(); } catch (\Throwable $e) { $payload = []; }
        if (empty($payload) && stripos((string)$request->header('Content-Type', ''), 'application/json') !== false) {
            $raw = (string)$request->getContent();
            $decoded = json_decode($raw, true);
            if (is_array($decoded)) { $payload = $decoded; }
        }
        $module = (string)($payload['module'] ?? $request->input('module', ''));
        $action = (string)($payload['action'] ?? $request->input('action', ''));
        $user = (string)($payload['user'] ?? $request->input('user', ''));
        $success = (int)($payload['success'] ?? $request->input('success', 1)); $success = $success === 0 ? 0 : 1;
        $severity = (string)($payload['severity'] ?? $request->input('severity', 'info'));
        $ip = (string)($payload['ip'] ?? $request->input('ip', $request->ip()));
        $ua = (string)($payload['ua'] ?? $request->input('ua', (string)$request->header('User-Agent', '')));
        $detailsInput = $payload['details'] ?? $request->input('details', '');
        $details = '';
        if (is_array($detailsInput) || is_object($detailsInput)) {
            $details = json_encode($detailsInput, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        } else {
            $details = trim((string)$detailsInput);
        }
        return compact('module','action','user','success','severity','ip','ua','details');
    }

    /**
     * Create a log record from normalized payload.
     * @param array{module:string,action:string,user:string,success:int,severity:string,ip:string,ua:string,details:string} $payload
     * @return array<string,mixed>
     */
    public function createLog(array $payload): array
    {
        $now = time();
        $prevHash = (string)(Log::orderBy('id', 'desc')->value('hash') ?? '');
        $h = hash('sha256', $prevHash . '|' . $payload['module'] . '|' . $payload['action'] . '|' . $payload['user'] . '|' . $now . '|' . (int)$payload['success'] . '|' . $payload['ip'] . '|' . $payload['ua']);

        $log = Log::create([
            'module' => $payload['module'],
            'action' => $payload['action'],
            'user' => $payload['user'],
            'ts' => $now,
            'success' => (int)$payload['success'],
            'severity' => $payload['severity'],
            'ip' => $payload['ip'],
            'ua' => $payload['ua'],
            'details' => $payload['details'],
            'prev_hash' => $prevHash,
            'hash' => $h,
        ]);

        return $log->toArray();
    }
}