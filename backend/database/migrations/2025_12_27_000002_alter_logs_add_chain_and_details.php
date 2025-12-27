<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        if (Schema::hasTable('logs')) {
            Schema::table('logs', function (Blueprint $table) {
                if (!Schema::hasColumn('logs', 'details')) {
                    $table->text('details')->nullable()->after('ua');
                }
                if (!Schema::hasColumn('logs', 'prev_hash')) {
                    $table->string('prev_hash', 64)->default('')->after('details');
                }
                if (!Schema::hasColumn('logs', 'hash')) {
                    $table->string('hash', 64)->after('prev_hash');
                    $table->index('hash');
                }
                // Ensure indexes exist for common filters
                $table->index('module');
                $table->index('action');
                $table->index('user');
                $table->index('severity');
            });
            // Initialize prev_hash and hash for existing rows deterministically
            // Use empty prev_hash and compute hash from available fields with ts cast to UNIX timestamp where possible
            try {
                // For datetime ts, attempt UNIX_TIMESTAMP; for other types, cast to int
                DB::statement("
                    UPDATE logs
                    SET prev_hash = '',
                        hash = SHA2(CONCAT(
                            prev_hash, '|', COALESCE(module,''), '|', COALESCE(action,''), '|', COALESCE(user,''), '|',
                            COALESCE(CAST(UNIX_TIMESTAMP(ts) AS UNSIGNED), 0), '|', COALESCE(CAST(success AS UNSIGNED),0), '|',
                            COALESCE(ip,''), '|', COALESCE(ua,'')
                        ), 256)
                    WHERE hash IS NULL OR hash = ''
                ");
            } catch (\Throwable $e) {
                // ignore initialization errors; new rows will have proper chain
            }
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('logs')) {
            Schema::table('logs', function (Blueprint $table) {
                if (Schema::hasColumn('logs', 'hash')) {
                    $table->dropIndex(['hash']);
                    $table->dropColumn('hash');
                }
                if (Schema::hasColumn('logs', 'prev_hash')) {
                    $table->dropColumn('prev_hash');
                }
                if (Schema::hasColumn('logs', 'details')) {
                    $table->dropColumn('details');
                }
            });
        }
    }
};
