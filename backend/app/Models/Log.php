<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Log extends Model
{
    protected $table = 'logs';
    public $timestamps = false;

    protected $fillable = [
        'module',
        'action',
        'user',
        'ts',
        'success',
        'severity',
        'ip',
        'ua',
        'details',
        'prev_hash',
        'hash',
    ];

    protected $casts = [
        'ts' => 'integer',
        'success' => 'integer',
    ];
}