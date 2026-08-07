/**
 * PM2 process definition for the Hostinger VPS.
 *
 *   pm2 start ecosystem.config.js --env production
 *   pm2 save && pm2 startup
 *
 * `.next/standalone/server.js` is produced by `output: "standalone"` in
 * next.config.ts, so no dev dependencies are needed at runtime.
 */
module.exports = {
  apps: [
    {
      name: "taskforge",
      script: ".next/standalone/server.js",
      cwd: "/var/www/taskforge",
      // `cluster` lets PM2 reload with zero downtime; one worker per core, but
      // capped so a small VPS is not starved of memory.
      exec_mode: "cluster",
      instances: process.env.PM2_INSTANCES || 2,
      max_memory_restart: "512M",
      autorestart: true,
      watch: false,
      time: true,
      merge_logs: true,
      error_file: "/var/log/taskforge/error.log",
      out_file: "/var/log/taskforge/out.log",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
        HOSTNAME: "127.0.0.1",
      },
      env_production: {
        NODE_ENV: "production",
        PORT: 3000,
        HOSTNAME: "127.0.0.1",
      },
    },
  ],
};
