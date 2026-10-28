import Fastify, { FastifyRequest, FastifyReply } from 'fastify';
import { checkRateLimit } from '@scalable/cache-layer';
import { query } from '@scalable/database';
import { Queue } from 'bullmq';
import { redis } from '@scalable/cache-layer';

const server = Fastify({ logger: true });

// Initialize queue publisher
const taskQueue = new Queue('system-task-queue', { connection: redis });

// Global rate limiting & security hook
server.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
  const clientIp = request.ip || '127.0.0.1';
  const { allowed, remaining } = await checkRateLimit(clientIp, 120, 60); // 120 requests per minute

  reply.header('X-RateLimit-Remaining', remaining);

  if (!allowed) {
    reply.code(429).send({
      error: 'Too Many Requests',
      message: 'Rate limit exceeded. Please try again later.',
    });
  }
});

// Health check and metrics endpoint
server.get('/health', async () => {
  const dbCheck = await query('SELECT NOW() as current_time');
  return {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    dbTime: dbCheck.rows[0].current_time,
  };
});

// High-throughput endpoint that dispatches async background tasks
server.post('/api/v1/tasks', async (request: FastifyRequest, reply: FastifyReply) => {
  const body = request.body as { action: string; payload: Record<string, any> };

  if (!body || !body.action) {
    return reply.code(400).send({ error: 'Missing required field: action' });
  }

  const taskId = `task_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  // Push job to BullMQ for asynchronous background processing
  await taskQueue.add(body.action, {
    taskId,
    action: body.action,
    payload: body.payload || {},
  }, {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
  });

  return reply.code(202).send({
    success: true,
    taskId,
    message: 'Task successfully queued for background processing.',
  });
});

// Start server
const start = async () => {
  try {
    const port = parseInt(process.env.PORT || '3000', 10);
    await server.listen({ port, host: '0.0.0.0' });
    console.log(`[API Gateway] Server running on port ${port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
