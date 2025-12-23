<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Audit extends Model
{
    protected $table = 'audits';
    public $timestamps = false;

    protected $fillable = [
        'ts',
        'type',
        'actor',
        'details',
    ];

    protected $casts = [
        'ts' => 'integer',
    ];
}