// PM2 process definition — alternative to Docker for a traditional VPS
// deployment. Requires `npm run build` first. Usage: pm2 start ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'carla-creation',
      script: 'dist/main.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
      },
      // better-sqlite3 holds a single file handle; running more than one
      // instance against the same DB file is unsafe, so this app is
      // single-instance by design (no cluster mode).
      max_memory_restart: '300M',
      kill_timeout: 10000,
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      time: true,
    },
  ],
};
