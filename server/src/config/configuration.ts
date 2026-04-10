export default () => ({
  app: {
    port: parseInt(process.env.APP_PORT, 10) || 3000,
    env: process.env.APP_ENV || 'development',
  },
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 3306,
    username: process.env.DB_USERNAME || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_DATABASE || 'kook_admin',
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    password: process.env.REDIS_PASSWORD || '',
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'default_secret',
    expiresIn: process.env.JWT_EXPIRES_IN || '2h',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'default_refresh_secret',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },
  kook: {
    botToken: process.env.KOOK_BOT_TOKEN || '',
    guildId: process.env.KOOK_GUILD_ID || '',
    channelId: process.env.KOOK_CHANNEL_ID || '',
    verifyToken: process.env.KOOK_VERIFY_TOKEN || '',
    clientId: process.env.KOOK_CLIENT_ID || '',
    clientSecret: process.env.KOOK_CLIENT_SECRET || '',
  },
  tencent: {
    secretId: process.env.TENCENT_SECRET_ID || '',
    secretKey: process.env.TENCENT_SECRET_KEY || '',
  },
  cos: {
    bucket: process.env.COS_BUCKET || '',
    region: process.env.COS_REGION || 'ap-guangzhou',
  },
  ocr: {
    region: process.env.OCR_REGION || 'ap-guangzhou',
  },
});
