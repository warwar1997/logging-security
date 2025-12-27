<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        if (Schema::hasTable('logs')) {
            try { DB::statement('ALTER TABLE logs MODIFY COLUMN ts BIGINT'); }
            catch (\Throwable $e) { }
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('logs')) {
            try { DB::statement('ALTER TABLE logs MODIFY COLUMN ts DATETIME'); }
            catch (\Throwable $e) { }
        }
    }
};
