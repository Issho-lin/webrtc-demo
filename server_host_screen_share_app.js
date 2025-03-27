const express = require('express');
const path = require('path');
const http = require('http');
const HostScreenShareServer = require('./server_host_screen_share');

// 创建Express应用
const app = express();

// 配置静态文件服务
app.use(express.static(path.join(__dirname, 'public')));

// 创建HTTP服务器
const server = http.createServer(app);

// 创建WebSocket服务器
new HostScreenShareServer(server);

// 设置端口
const PORT = process.env.PORT || 3000;

// 启动服务器
server.listen(PORT, () => {
  console.log(`服务器运行在 http://localhost:${PORT}`);
});