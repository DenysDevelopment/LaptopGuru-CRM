import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';

@Processor('video-session-reaper')
export class ReaperProcessor extends WorkerHost {
  async process(_job: Job): Promise<void> {
    // implemented in Task 12
  }
}
