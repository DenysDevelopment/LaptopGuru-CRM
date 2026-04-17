import type { PublicContext } from '../guards/public-landing.guard';

declare global {
  namespace Express {
    interface Request {
      publicContext?: PublicContext;
    }
  }
}

export {};
