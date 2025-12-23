<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Models\Log;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller as BaseController;
use Illuminate\Support\Facades\DB;

class StatsController extends BaseController
{
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
        $result['total'] = Log::where('ts', '>', $cutoff)->count();
        foreach (Log::select('severity', DB::raw('COUNT(*) AS c'))->where('ts', '>', $cutoff)->groupBy('severity')->get() as $row) {
            $result['by_severity'][$row->severity] = (int)$row->c;
        }
        foreach (Log::select('module', DB::raw('COUNT(*) AS c'))->where('ts', '>', $cutoff)->groupBy('module')->get() as $row) {
            $result['by_module'][$row->module] = (int)$row->c;
        }
        foreach (Log::select('action', DB::raw('COUNT(*) AS c'))->where('ts', '>', $cutoff)->groupBy('action')->get() as $row) {
            $result['by_action'][$row->action] = (int)$row->c;
        }
        foreach (Log::select('user', DB::raw('COUNT(*) AS c'))->where('ts', '>', $cutoff)->groupBy('user')->get() as $row) {
            $result['by_user'][$row->user] = (int)$row->c;
        }
        return response()->json($result);
    }
}