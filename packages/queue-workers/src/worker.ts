import { Worker, Job } from 'bullmq';
import { redis } from '@scalable/cache-layer'; // Pulling from our shared cache package

interface SystemTaskData {
  taskId: string;
  action: string;
  payload: Record<string, any>;
}

// Define background worker with concurrency and auto-retry rules
export const systemWorker = new Worker<SystemTaskData>(
  'system-task-queue',
  async (job: Job<SystemTaskData>) => {
    const { taskId, action, payload } = job.data;
    
    console.log(`[Worker] Processing task ${taskId} | Action: ${action}`);

    try {
      // Simulate heavy processing / async execution (e.g., event logging, state synchronization)
      switch (action) {
        case 'SYNC_STATE':
          await handleStateSync(payload);
          break;
        case 'DISPATCH_EVENT':
          await handleEventDispatch(payload);
          break;
        default:
          throw new Error(`Unknown system action: ${action}`);
      }

      console.log(`[Worker] Successfully completed task ${taskId}`);
      return { success: true, processedAt: new Date().toISOString() };
    } catch (error: any) {
      console.error(`[Worker] Failed task ${taskId}:`, error.message);
      throw error; // Triggers BullMQ automated retry policy
    }
  },
  {
    connection: redis,
    concurrency: 10, // Process up to 10 jobs concurrently per worker instance
    limiter: {
      max: 1000,
      duration: 5000, // Rate limit protection: max 1000 jobs per 5 seconds
    },
  }
);

systemWorker.on('completed', (job) => {
  console.log(`Job ${job.id} has completed successfully.`);
});

systemWorker.on('failed', (job, err) => {
  console.error(`Job ${job?.id} failed with error: ${err.message}`);
});

async function handleStateSync(payload: Record<string, any>) {
  // Placeholder for high-throughput state synchronization logic
  await new Promise((resolve) => setTimeout(resolve, 500));
}

async function handleEventDispatch(payload: Record<string, any>) {
  // Placeholder for asynchronous event dispatching
  await new Promise((resolve) => setTimeout(resolve, 300));
}
