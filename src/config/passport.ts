require('module-alias/register');
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { User, UserDocument } from '@models/User';
import { getSecrets } from '@utils/getSecrets';
import { getConfig } from '@config/config';
import logger from '@utils/logger';

interface VerifyCallback {
  (error: any, user?: UserDocument | false): void;
}

export async function configurePassport(app: any) {
  try {
    logger.info('Начало настройки Passport');
    let secrets: Record<string, string> | null = null;
    try {
      secrets = await getSecrets();
    } catch (err: any) {
      logger.error('Ошибка загрузки секретов:', { error: err.message, stack: err.stack });
      logger.warn('Secrets not loaded, OAuth disabled');
      return;
    }

    if (!secrets) {
      logger.warn('Secrets not loaded (null), OAuth disabled');
      return;
    }
    logger.info('Secrets loaded successfully', { 
      keys: Object.keys(secrets),
      googleClientId: secrets.GOOGLE_CLIENT_ID ? 'set' : 'missing',
      googleClientSecret: secrets.GOOGLE_CLIENT_SECRET ? 'set' : 'missing'
    });

    const cfg = await getConfig();
    const googleClientId = secrets.GOOGLE_CLIENT_ID;
    const googleClientSecret = secrets.GOOGLE_CLIENT_SECRET;

    // Google OAuth
    if (googleClientId && googleClientSecret) {
      logger.info('Google OAuth config', {
        clientID: googleClientId ? 'set' : 'missing',
        clientSecret: googleClientSecret ? 'set' : 'missing',
        callbackURL: `${cfg.apiUrl || 'https://api.contentstar.app'}/api/auth/google/callback`,
      });

      passport.use(
        new GoogleStrategy(
          {
            clientID: googleClientId,
            clientSecret: googleClientSecret,
            callbackURL: `${cfg.apiUrl || 'https://api.contentstar.app'}/api/auth/google/callback`,
          },
          async (accessToken: string, refreshToken: string, profile: any, done: VerifyCallback) => {
            try {
              logger.info('Google OAuth: профиль получен', { profileId: profile.id });
              let user = await User.findOne({ googleId: profile.id }) as UserDocument | null;
              if (!user) {
                user = await User.findOne({ email: profile.emails?.[0]?.value }) as UserDocument | null;
                if (user) {
                  user.googleId = profile.id;
                  await user.save();
                } else {
                  user = await User.create({
                    email: profile.emails?.[0]?.value || `google-${profile.id}@contentstar.app`,
                    name: profile.displayName || 'Google User',
                    googleId: profile.id,
                    roles: ['user'],
                    emailVerified: true,
                    isActive: true,
                  });
                }
              }
              logger.info(`Google OAuth: пользователь аутентифицирован ${user.email}`);
              return done(null, user);
            } catch (err: any) {
              logger.error('Ошибка Google OAuth:', { error: err.message, stack: err.stack });
              return done(err, false);
            }
          }
        )
      );
      logger.info('Google Strategy registered successfully');
    } else {
      logger.warn('Google OAuth отключён: отсутствуют GOOGLE_CLIENT_ID или GOOGLE_CLIENT_SECRET');
    }

    // Apple Sign In отключён
    logger.info('Apple Sign In отключён');

    passport.serializeUser((user: any, done: (err: any, id?: string) => void) => {
      logger.info('Сериализация пользователя', { userId: user._id });
      done(null, user._id);
    });

    passport.deserializeUser(async (id: string, done: (err: any, user?: UserDocument | null) => void) => {
      try {
        logger.info('Десериализация пользователя', { userId: id });
        const user = await User.findById(id) as UserDocument | null;
        done(null, user);
      } catch (err: any) {
        logger.error('Ошибка десериализации:', { error: err.message, stack: err.stack });
        done(err, null);
      }
    });

    app.use(passport.initialize());
  } catch (err: any) {
    logger.error('Ошибка настройки Passport:', { error: err.message, stack: err.stack });
  }
}