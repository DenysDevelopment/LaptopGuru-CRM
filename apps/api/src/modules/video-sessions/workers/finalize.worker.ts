import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';

@Processor('video-session-finalize')
export class FinalizeWorker extends WorkerHost {
  async process(_job: Job): Promise<void> {
    // implemented in Task 11
  }
}
