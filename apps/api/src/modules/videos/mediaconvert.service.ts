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
  private readonly region = process.env.AWS_MEDIACONVERT_REGION || 'eu-central-1';
  private readonly roleArn = process.env.AWS_MEDIACONVERT_ROLE_ARN || '';
  private readonly queueArn = process.env.AWS_MEDIACONVERT_QUEUE_ARN || '';
  private readonly bucket = process.env.AWS_S3_VIDEO_BUCKET || 'laptopguru-videos-eu';

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
              // Read rotation metadata (iPhone .mov stores orientation as a
              // flag, not in pixels) and physically rotate before encode so
              // output MP4 plays correctly everywhere — Chrome, Android,
              // embedded players — not just iOS Safari.
              VideoSelector: { Rotate: 'AUTO' },
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
                    // MoovPlacement: PROGRESSIVE_DOWNLOAD puts the moov
                    // atom at the start of the file instead of the end.
                    // Browsers can then start playback after reading a few
                    // hundred KB instead of having to buffer the whole MP4
                    // before the first frame shows.
                    Mp4Settings: { MoovPlacement: 'PROGRESSIVE_DOWNLOAD' },
                  },
                  VideoDescription: {
                    CodecSettings: {
                      Codec: 'H_264',
                      H264Settings: {
                        // QVBR level 9 (max) with a 10 Mbps cap and 2-pass
                        // HQ encoding — visibly cleaner on detail-heavy
                        // footage where single-pass leaves blockiness.
                        RateControlMode: 'QVBR',
                        QvbrSettings: { QvbrQualityLevel: 9 },
                        MaxBitrate: 10_000_000,
                        QualityTuningLevel: 'MULTI_PASS_HQ',
                        CodecProfile: 'HIGH',
                        CodecLevel: 'AUTO',
                        // Perceptual quality knobs. The three AQ modes tell
                        // the encoder to spend more bits on regions where
                        // artifacts are most visible (sharp edges, slow
                        // motion, frame-to-frame flicker on static shots)
                        // and fewer on flat/blurry areas — noticeably less
                        // blockiness on MacBook lid textures, logos, skin.
                        AdaptiveQuantization: 'HIGH',
                        SpatialAdaptiveQuantization: 'ENABLED',
                        TemporalAdaptiveQuantization: 'ENABLED',
                        FlickerAdaptiveQuantization: 'ENABLED',
                        // CABAC (arithmetic entropy coding) gives ~10-15%
                        // better compression efficiency than CAVLC. It's
                        // the default for HIGH profile but set explicitly
                        // so future profile changes don't silently regress.
                        EntropyEncoding: 'CABAC',
                        // More reference frames + B-frames = better
                        // compression efficiency at the cost of ~10%
                        // encode time. Decoder support is universal on
                        // anything from 2013+.
                        NumberReferenceFrames: 4,
                        NumberBFramesBetweenReferenceFrames: 3,
                      },
                    },
                    // No fixed Width/Height — preserve source aspect ratio so
                    // vertical (9:16) iPhone videos stay vertical after the
                    // encode. QVBR + MaxBitrate bounds the final file size.
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
