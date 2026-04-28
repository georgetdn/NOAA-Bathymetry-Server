module.exports = {
  apps: [{
    name: 'y219',
    cwd: '/var/www/y219.com/Y219', // repo root
    script: 'server.js',           // entry is at the root
    env: {
      NODE_ENV: 'production',
      PORT: 5000
    },
    watch: false,
    autorestart: true,
    max_memory_restart: '300M'
  }]
}
