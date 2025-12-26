<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use Illuminate\Http\Request;
use Illuminate\Routing\Controller as BaseController;
use App\Services\StatsService;

class StatsController extends BaseController
{
    public function index(Request $request)
    {
        $window = max(1, (int)$request->query('window', 86400));
        $service = new StatsService();
        $result = $service->compute($window);
        return response()->json($result);
    }
}