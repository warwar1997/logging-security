<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        if (!Schema::hasTable('logs')) {
            Schema::create('logs', function (Blueprint $table) {
                $table->increments('id');
                $table->string('module');
                $table->string('action');
                $table->string('user')->nullable();
                $table->bigInteger('ts')->index();
                $table->tinyInteger('success')->default(1)->index();
                $table->string('severity')->default('info')->index();
                $table->string('ip', 45)->nullable();
                $table->string('ua', 255)->nullable();
                $table->text('details')->nullable();
                $table->string('prev_hash', 64)->default('');
                $table->string('hash', 64)->index();

                $table->index(['module']);
                $table->index(['action']);
                $table->index(['user']);
            });
        }
        if (!Schema::hasTable('audits')) {
            Schema::create('audits', function (Blueprint $table) {
                $table->increments('id');
                $table->bigInteger('ts')->index();
                $table->string('type', 50);
                $table->string('actor')->nullable();
                $table->text('details')->nullable();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('logs');
        Schema::dropIfExists('audits');
    }
};