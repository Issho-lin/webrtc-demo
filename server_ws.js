// 导入所需模块
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
// const url = require('url');

// 创建Express应用
const app = express();
const server = http.createServer(app);

// 设置静态文件目录
app.use(express.static(path.join(__dirname, 'public')));

// 创建WebSocket服务器
const wss = new WebSocket.Server({ server });

// 存储在线用户
const users = {};
// 存储WebSocket连接
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
          
        case 'call':
          // 处理呼叫请求
          console.log(`${users[clientId]} 呼叫 ${data.target}`);
          
          // 查找目标用户的ID
          const targetId = Object.keys(users).find(id => users[id] === data.target);
          
          if (targetId) {
            // 向目标用户发送呼叫请求
            sendTo(targetId, 'incomingCall', {
              caller: users[clientId],
              callerId: clientId
            });
          }
          break;
          
        case 'callResponse':
          // 处理呼叫应答
          console.log(`${users[clientId]} ${data.accepted ? '接受' : '拒绝'}了来自 ${data.caller} 的呼叫`);
          
          // 向呼叫者发送应答结果
          sendTo(data.callerId, 'callAnswered', {
            accepted: data.accepted,
            target: users[clientId]
          });
          break;
          
        case 'offer':
          // 处理WebRTC信令 - 发送offer
          console.log(`收到来自 ${users[clientId]} 的offer`);
          const offerTargetId = Object.keys(users).find(id => users[id] === data.target);
          if (offerTargetId) {
            sendTo(offerTargetId, 'offer', {
              offer: data.offer,
              caller: users[clientId]
            });
          }
          break;
          
        case 'answer':
          // 处理WebRTC信令 - 发送answer
          console.log(`收到来自 ${users[clientId]} 的answer`);
          const answerTargetId = Object.keys(users).find(id => users[id] === data.target);
          if (answerTargetId) {
            sendTo(answerTargetId, 'answer', {
              answer: data.answer,
              answerer: clientId
            });
          }
          break;
          
        case 'iceCandidate':
          // 处理ICE候选
          console.log(`收到来自 ${users[clientId]} 的ICE候选`);
          const iceTargetId = Object.keys(users).find(id => users[id] === data.target);
          if (iceTargetId) {
            sendTo(iceTargetId, 'iceCandidate', {
              candidate: data.candidate,
              sender: clientId
            });
          }
          break;
          
        case 'mediaStateChange':
          // 处理媒体状态变化
          console.log(`${users[clientId]} ${data.enabled ? '开启' : '关闭'}了${data.mediaType === 'video' ? '视频' : '音频'}`);
          const mediaTargetId = Object.keys(users).find(id => users[id] === data.target);
          if (mediaTargetId) {
            sendTo(mediaTargetId, 'mediaStateChange', {
              sender: users[clientId],
              mediaType: data.mediaType,
              enabled: data.enabled
            });
          }
          break;
          
        case 'endCall':
          // 处理通话结束
          console.log(`${users[clientId]} 结束了通话`);
          const endCallTargetId = Object.keys(users).find(id => users[id] === data.target);
          if (endCallTargetId) {
            sendTo(endCallTargetId, 'callEnded', {
              caller: users[clientId]
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