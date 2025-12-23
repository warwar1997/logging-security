<?php
declare(strict_types=1);

namespace App\Providers;

use App\Services\Hrms\LoggingService;
use Illuminate\Support\ServiceProvider;

class HrmsLoggingServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->singleton(LoggingService::class, function ($app) {
            return new LoggingService();
        });
    }

    public function boot(): void
    {
        // No boot logic required
    }
}