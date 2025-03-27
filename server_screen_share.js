// 导入所需模块
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

// 创建Express应用
const app = express();
const server = http.createServer(app);

// 设置静态文件目录
app.use(express.static(path.join(__dirname, 'public')));

// 创建WebSocket服务器
const wss = new WebSocket.Server({ server });

// 存储在线用户和连接
const users = {};
const connections = {};

// 生成唯一ID
function generateId() {
  return Math.random().toString(36).substr(2, 9);
}

// 广播消息给所有客户端
function broadcast(type, data) {
  const message = JSON.stringify({ type, data });
  Object.values(connections).forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// 发送消息给特定客户端
function sendTo(clientId, type, data) {
  const message = JSON.stringify({ type, data });
  const client = connections[clientId];
  if (client && client.readyState === WebSocket.OPEN) {
    client.send(message);
  }
}

// 处理WebSocket连接
wss.on('connection', (ws) => {
  // 为新连接分配ID
  const clientId = generateId();
  connections[clientId] = ws;
  
  console.log(`用户已连接: ${clientId}`);
  
  // 处理消息
  ws.on('message', (message) => {
    try {
      const { type, data } = JSON.parse(message);
      
      switch (type) {
        case 'join':
          // 处理用户加入
          console.log(`${data.username} 加入了聊天`);
          users[clientId] = data.username;
          
          // 广播用户列表更新
          broadcast('userList', Object.values(users));
          break;
          
        case 'requestScreenShare':
          // 处理屏幕共享请求
          console.log(`${users[clientId]} 请求与 ${data.target} 共享屏幕`);
          const targetId = Object.keys(users).find(id => users[id] === data.target);
          
          if (targetId) {
            sendTo(targetId, 'incomingScreenShare', {
              from: users[clientId],
              fromId: clientId
            });
          }
          break;
          
        case 'screenShareResponse':
          // 处理屏幕共享响应
          console.log(`${users[clientId]} ${data.accepted ? '接受' : '拒绝'}了来自 ${data.from} 的屏幕共享请求`);
          sendTo(data.fromId, 'screenShareAnswered', {
            accepted: data.accepted,
            target: users[clientId]
          });
          break;
          
        case 'offer':
          // 处理WebRTC offer
          console.log(`收到来自 ${users[clientId]} 的屏幕共享offer`);
          const offerTargetId = Object.keys(users).find(id => users[id] === data.target);
          if (offerTargetId) {
            sendTo(offerTargetId, 'offer', {
              offer: data.offer,
              from: users[clientId]
            });
          }
          break;
          
        case 'answer':
          // 处理WebRTC answer
          console.log(`收到来自 ${users[clientId]} 的answer`);
          const answerTargetId = Object.keys(users).find(id => users[id] === data.target);
          if (answerTargetId) {
            sendTo(answerTargetId, 'answer', {
              answer: data.answer,
              from: users[clientId]
            });
          }
          break;
          
        case 'iceCandidate':
          // 处理ICE候选
          const iceTargetId = Object.keys(users).find(id => users[id] === data.target);
          if (iceTargetId) {
            sendTo(iceTargetId, 'iceCandidate', {
              candidate: data.candidate,
              from: users[clientId]
            });
          }
          break;
          
        case 'stopScreenShare':
          // 处理停止屏幕共享
          console.log(`${users[clientId]} 停止了屏幕共享`);
          const stopTargetId = Object.keys(users).find(id => users[id] === data.target);
          if (stopTargetId) {
            sendTo(stopTargetId, 'screenShareStopped', {
              from: users[clientId]
            });
          }
          break;
      }
    } catch (error) {
      console.error('处理消息时出错:', error);
    }
  });
  
  // 处理断开连接
  ws.on('close', () => {
    console.log(`用户断开连接: ${users[clientId] || clientId}`);
    delete users[clientId];
    delete connections[clientId];
    
    // 广播用户列表更新
    broadcast('userList', Object.values(users));
  });
});

// 设置服务器端口
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`服务器运行在 http://0.0.0.0:${PORT}`);
});