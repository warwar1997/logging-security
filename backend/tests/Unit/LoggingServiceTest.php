<?php
declare(strict_types=1);

namespace Tests\Unit;

use App\Services\Hrms\LoggingService;
use Tests\TestCase;

class LoggingServiceTest extends TestCase
{
    public function testBuildPayloadNormalizesFields(): void
    {
        $svc = new LoggingService('http://localhost:8080', 'key');
        $ref = new \ReflectionClass($svc);
        $m = $ref->getMethod('buildPayload');
        $m->setAccessible(true);

        $payload = $m->invoke($svc, 'HRMS.Auth', 'login', [
            'user' => 'alice',
            'success' => true,
            'severity' => 'warning',
            'details' => ['k' => 'v'],
            'ip' => '1.2.3.4',
            'ua' => 'UA',
            'ts' => 123,
        ]);

        $this->assertSame('HRMS.Auth', $payload['module']);
        $this->assertSame('login', $payload['action']);
        $this->assertSame('alice', $payload['user']);
        $this->assertSame(1, $payload['success']);
        $this->assertSame('warning', $payload['severity']);
        $this->assertSame('1.2.3.4', $payload['ip']);
        $this->assertSame('UA', $payload['ua']);
        $this->assertSame(123, $payload['ts']);
        $this->assertSame('{"k":"v"}', $payload['details']);
    }
}