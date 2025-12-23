<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Models\Log;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller as BaseController;

class LogsController extends BaseController
{
    public function index(Request $request)
    {
        $readKey = env('API_KEY_READ', '');
        $writeKey = env('API_KEY_WRITE', '');
        $key = $this->getAuthKey($request);
        if (($readKey !== '' || $writeKey !== '') && $key !== $readKey && $key !== $writeKey) {
            return response()->json(['error' => 'Unauthorized: invalid read/write key'], 401);
        }

        if ((int)$request->query('verify', 0) === 1) {
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

        return response()->json(['data' => $data, 'meta' => ['total' => $total, 'page' => $page, 'per_page' => $perPage]]);
    }

    public function store(Request $request)
    {
        $writeKey = env('API_KEY_WRITE', '');
        $key = $this->getAuthKey($request);
        if ($writeKey !== '' && $key !== $writeKey) {
            return response()->json(['error' => 'Unauthorized: invalid write key'], 401);
        }

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

        $prevHash = (string)(Log::orderBy('id', 'desc')->value('hash') ?? '');
        $h = hash('sha256', $prevHash . '|' . $module . '|' . $action . '|' . $user . '|' . $now . '|' . (int)$success . '|' . $ip . '|' . $ua);

        $log = Log::create([
            'module' => $module,
            'action' => $action,
            'user' => $user,
            'ts' => $now,
            'success' => $success,
            'severity' => $severity,
            'ip' => $ip,
            'ua' => $ua,
            'details' => $details,
            'prev_hash' => $prevHash,
            'hash' => $h,
        ]);

        return response()->json($log->toArray());
    }

    private function getAuthKey(Request $request): string
    {
        $hdr = (string)$request->header('Authorization', '');
        if (preg_match('/Bearer\s+(.*)/i', $hdr, $m)) { return trim($m[1]); }
        return (string)$request->header('X-API-KEY', '');
    }
}