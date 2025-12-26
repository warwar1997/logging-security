<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\Audit;

class AuditsService
{
    /**
     * Filter + paginate audits.
     * @param array{type?:string,actor?:string,from?:string,to?:string,q?:string,page?:int,per_page?:int} $filters
     * @return array{data: array<int, array<string,mixed>>, meta: array<string,int>}
     */
    public function getAudits(array $filters): array
    {
        $type = (string)($filters['type'] ?? '');
        $actor = (string)($filters['actor'] ?? '');
        $from = (string)($filters['from'] ?? '');
        $to = (string)($filters['to'] ?? '');
        $q = (string)($filters['q'] ?? '');
        $page = max(1, (int)($filters['page'] ?? 1));
        $perPage = max(1, min(100, (int)($filters['per_page'] ?? 25)));
        $offset = ($page - 1) * $perPage;

        $query = Audit::query();
        if ($type !== '') { $query->where('type', $type); }
        if ($actor !== '') { $query->where('actor', $actor); }
        if ($from !== '') { $fromTs = strtotime($from . ' 00:00:00') ?: 0; if ($fromTs > 0) { $query->where('ts', '>=', $fromTs); } }
        if ($to !== '') { $toTs = strtotime($to . ' 23:59:59') ?: 0; if ($toTs > 0) { $query->where('ts', '<=', $toTs); } }
        if ($q !== '') { $like = '%' . $q . '%'; $query->where(function($qq) use($like) { $qq->where('type','like',$like)->orWhere('actor','like',$like)->orWhere('details','like',$like); }); }

        $total = (clone $query)->count();
        $data = $query->orderBy('ts', 'desc')->skip($offset)->take($perPage)->get()->toArray();
        return ['data' => $data, 'meta' => ['total' => $total, 'page' => $page, 'per_page' => $perPage]];
    }
}