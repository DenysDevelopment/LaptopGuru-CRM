import { Injectable, Logger } from '@nestjs/common';
import {
  MediaConvertClient,
  CreateJobCommand,
  GetJobCommand,
  DescribeEndpointsCommand,
} from '@aws-sdk/client-mediaconvert';

@Injectable()
export class MediaConvertService {
  private readonly logger = new Logger(MediaConvertService.name);
  private client: MediaConvertClient | null = null;
  private readonly region = process.env.AWS_REGION || 'eu-central-1';
  private readonly roleArn = process.env.AWS_MEDIACONVERT_ROLE_ARN || '';
  private readonly queueArn = process.env.AWS_MEDIACONVERT_QUEUE_ARN || '';
  private readonly bucket = process.env.AWS_S3_VIDEO_BUCKET || 'shorterlink-videos-eu-central-1';

  private async getClient(): Promise<MediaConvertClient> {
    if (this.client) return this.client;

    // Discover the account-specific endpoint
    const discoveryClient = new MediaConvertClient({ region: this.region });
    const endpoints = await discoveryClient.send(
      new DescribeEndpointsCommand({ MaxResults: 1 }),
    );
    const endpoint = endpoints.Endpoints?.[0]?.Url;
    if (!endpoint) throw new Error('MediaConvert endpoint not found');

    this.client = new MediaConvertClient({
      region: this.region,
      endpoint,
    });
    this.logger.log(`MediaConvert endpoint: ${endpoint}`);
    return this.client;
  }

  async createTranscodeJob(opts: {
    videoId: string;
    companyId: string;
    inputKey: string;
  }): Promise<string> {
    const client = await this.getClient();
    const outputPrefix = `outputs/${opts.companyId}/${opts.videoId}/`;

    const res = await client.send(
      new CreateJobCommand({
        Role: this.roleArn,
        Queue: this.queueArn || undefined,
        UserMetadata: {
          videoId: opts.videoId,
          companyId: opts.companyId,
        },
        Settings: {
          Inputs: [
            {
              FileInput: `s3://${this.bucket}/${opts.inputKey}`,
              AudioSelectors: {
                'Audio Selector 1': { DefaultSelection: 'DEFAULT' },
              },
              VideoSelector: {},
            },
          ],
          OutputGroups: [
            {
              Name: 'File Group',
              OutputGroupSettings: {
                Type: 'FILE_GROUP_SETTINGS',
                FileGroupSettings: {
                  Destination: `s3://${this.bucket}/${outputPrefix}`,
                },
              },
              Outputs: [
                // 720p video output
                {
                  NameModifier: 'video',
                  ContainerSettings: {
                    Container: 'MP4',
                    Mp4Settings: {},
                  },
                  VideoDescription: {
                    CodecSettings: {
                      Codec: 'H_264',
                      H264Settings: {
                        RateControlMode: 'CBR',
                        Bitrate: 2_500_000,
                        MaxBitrate: 3_000_000,
                        CodecProfile: 'HIGH',
                        CodecLevel: 'AUTO',
                      },
                    },
                    Width: 1280,
                    Height: 720,
                    ScalingBehavior: 'DEFAULT',
                  },
                  AudioDescriptions: [
                    {
                      AudioSourceName: 'Audio Selector 1',
                      CodecSettings: {
                        Codec: 'AAC',
                        AacSettings: {
                          Bitrate: 128_000,
                          CodingMode: 'CODING_MODE_2_0',
                          SampleRate: 48_000,
                        },
                      },
                    },
                  ],
                },
                // Thumbnail output
                {
                  NameModifier: 'thumb',
                  ContainerSettings: {
                    Container: 'RAW',
                  },
                  VideoDescription: {
                    CodecSettings: {
                      Codec: 'FRAME_CAPTURE',
                      FrameCaptureSettings: {
                        FramerateNumerator: 1,
                        FramerateDenominator: 3600,
                        MaxCaptures: 1,
                        Quality: 80,
                      },
                    },
                    Width: 1280,
                    Height: 720,
                  },
                },
              ],
            },
          ],
        },
      }),
    );

    const jobId = res.Job?.Id;
    if (!jobId) throw new Error('MediaConvert job creation returned no ID');
    this.logger.log(`MediaConvert job ${jobId} created for video ${opts.videoId}`);
    return jobId;
  }

  async getJob(jobId: string) {
    const client = await this.getClient();
    return client.send(new GetJobCommand({ Id: jobId }));
  }
}
