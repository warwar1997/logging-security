<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\LogsController;
use App\Http\Controllers\Api\StatsController;
use App\Http\Controllers\Api\AuditsController;
use App\Http\Controllers\Api\AlertsController;

/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
| These routes implement the logging backend using Laravel conventions.
| They mirror the existing public/api.php endpoints to maintain compatibility
| with the frontend, while providing a proper controller-based structure.
*/

Route::get('/auth', [AuthController::class, 'index']);

Route::get('/logs', [LogsController::class, 'index']);
Route::post('/logs', [LogsController::class, 'store']);

Route::get('/audits', [AuditsController::class, 'index']);

Route::get('/stats', [StatsController::class, 'index']);

Route::get('/alerts', [AlertsController::class, 'index']);