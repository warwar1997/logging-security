<?php

return [
    // Paths that should be processed by the CORS middleware
    'paths' => ['api/*'],

    // Allowed HTTP methods
    'allowed_methods' => ['*'],

    // Allowed origins (Vite dev servers)
    'allowed_origins' => [
        'http://localhost:5177',
        'http://localhost:5179',
        'http://127.0.0.1:5177',
        'http://127.0.0.1:5179',
        '*',
    ],

    // Origin patterns (none)
    'allowed_origins_patterns' => [],

    // Allowed headers
    'allowed_headers' => ['Authorization', 'X-API-KEY', 'Content-Type', 'X-Requested-With'],

    // Exposed headers
    'exposed_headers' => [],

    // How long the results of a preflight request can be cached
    'max_age' => 86400,

    // Whether or not the response can be exposed when the credentials flag is true
    'supports_credentials' => false,
];