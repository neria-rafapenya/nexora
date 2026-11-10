module.exports = {
  apps: [
    {
      name: "horekia",
      cwd: "/var/www/horekia",
      script: "npm",
      args: "start",
      interpreter: "none",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "600M",
      kill_timeout: 10000,
      time: true,
    },
  ],
};
