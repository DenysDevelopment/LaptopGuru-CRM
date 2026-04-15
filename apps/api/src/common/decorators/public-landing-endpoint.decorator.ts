import { SetMetadata } from '@nestjs/common';

export const PUBLIC_LANDING_ENDPOINT_KEY = 'publicLandingEndpoint';
export const PublicLandingEndpoint = () => SetMetadata(PUBLIC_LANDING_ENDPOINT_KEY, true);
