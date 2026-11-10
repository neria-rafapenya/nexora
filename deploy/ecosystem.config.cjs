module.exports = {
  apps: [
    {
      name: "horekia",
      cwd: "/var/www/horekia",
      script: "nexora-api/src/server.mjs",
      node_args: "--env-file=/var/www/horekia/.env",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "600M",
      kill_timeout: 10000,
      time: true,
    },
  ],
};
