<?php

use Illuminate\Support\Facades\Route;
use Illuminate\Http\Response;

Route::get('/', function () {
    return view('welcome');
});

// Legacy endpoint notice for deprecated /api.php
Route::any('/api.php', function () {
    return response()->json([
        'error' => 'deprecated_endpoint',
        'message' => 'This endpoint has been removed. Please use Laravel routes under /api/* (e.g., /api/logs, /api/audits, /api/auth).',
        'docs' => url('/'),
    ], 410); // 410 Gone
});
