import { SetMetadata } from '@nestjs/common';

export const PUBLIC_LANDING_ENDPOINT = 'public-landing-endpoint';

/**
 * Marks a route as a public landing endpoint. `JwtAuthGuard` will skip auth
 * for routes decorated with this. `PublicLandingGuard` will validate the
 * visit → landing → video → company ownership chain and attach
 * `req.publicContext` for the controller to consume.
 */
export const PublicLandingEndpoint = () => SetMetadata(PUBLIC_LANDING_ENDPOINT, true);
