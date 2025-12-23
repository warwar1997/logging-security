<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Models\Audit;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller as BaseController;

class AuditsController extends BaseController
{
    public function index(Request $request)
    {
        $readKey = env('API_KEY_READ', '');
        $writeKey = env('API_KEY_WRITE', '');
        $key = $this->getAuthKey($request);
        if (($readKey !== '' || $writeKey !== '') && $key !== $readKey && $key !== $writeKey) {
            return response()->json(['error' => 'Unauthorized: invalid read/write key'], 401);
        }

        // filters + pagination (mirror legacy api.php)
        $type = (string)$request->query('type', '');
        $actor = (string)$request->query('actor', '');
        $from = (string)$request->query('from', '');
        $to = (string)$request->query('to', '');
        $q = (string)$request->query('q', '');
        $page = max(1, (int)$request->query('page', 1));
        $perPage = max(1, min(100, (int)$request->query('per_page', 25)));
        $offset = ($page - 1) * $perPage;

        $query = Audit::query();
        if ($type !== '') { $query->where('type', $type); }
        if ($actor !== '') { $query->where('actor', $actor); }
        if ($from !== '') { $fromTs = strtotime($from . ' 00:00:00') ?: 0; if ($fromTs > 0) { $query->where('ts', '>=', $fromTs); } }
        if ($to !== '') { $toTs = strtotime($to . ' 23:59:59') ?: 0; if ($toTs > 0) { $query->where('ts', '<=', $toTs); } }
        if ($q !== '') { $like = '%' . $q . '%'; $query->where(function($qq) use($like) { $qq->where('type','like',$like)->orWhere('actor','like',$like)->orWhere('details','like',$like); }); }

        $total = (clone $query)->count();
        $data = $query->orderBy('ts', 'desc')->skip($offset)->take($perPage)->get()->toArray();

        return response()->json(['data' => $data, 'meta' => ['total' => $total, 'page' => $page, 'per_page' => $perPage]]);
    }

    private function getAuthKey(Request $request): string
    {
        $hdr = (string)$request->header('Authorization', '');
        if (preg_match('/Bearer\s+(.*)/i', $hdr, $m)) { return trim($m[1]); }
        return (string)$request->header('X-API-KEY', '');
    }
}