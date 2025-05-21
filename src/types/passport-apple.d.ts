declare module 'passport-apple';

interface AppleStrategyOptions {
  clientID: string;
  teamID: string;
  keyID: string;
  privateKeyString: string;
  callbackURL: string;
  passReqToCallback?: boolean;
}

declare class AppleStrategy {
  constructor(options: AppleStrategyOptions, verify: (accessToken: string, refreshToken: string, profile: any, done: (error: any, user?: any) => void) => void);
}