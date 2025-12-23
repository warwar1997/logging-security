<?php
return [
    // Base URL for the logging backend. Defaults to app.url or localhost:8080.
    'base_url' => env('APP_URL', 'http://127.0.0.1:8080'),

    // Write API key used to authenticate log writes.
    'write_key' => env('API_KEY_WRITE', ''),

    // Request timeout in seconds.
    'timeout' => env('HRMS_LOGGING_TIMEOUT', 5),
];