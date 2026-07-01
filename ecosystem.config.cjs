module.exports = {
  apps: [
    {
      name: "daifaxitong",
      cwd: __dirname,
      script: "server/dist/server.js",
      interpreter: "node",
      instances: 1,
      exec_mode: "fork",
      watch: false,
      max_memory_restart: "512M",
      error_file: "server/logs/error.log",
      out_file: "server/logs/out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      env: {
        NODE_ENV: "production",
        PORT: "4006",
        DATABASE_PATH: "server/data/daifa.sqlite"
      },
      env_production: {
        NODE_ENV: "production",
        PORT: "4006",
        DATABASE_PATH: "server/data/daifa.sqlite"
      }
    }
  ]
};
