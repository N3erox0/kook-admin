module.exports = {
  apps: [
    {
      name: 'kook-admin-server',
      script: 'dist/main.js',
      cwd: '/opt/kook-admin/server',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
      },
      error_file: '/var/log/kook-admin/error.log',
      out_file: '/var/log/kook-admin/out.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
};
