// 导入所需模块
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

// 创建Express应用
const app = express();
const server = http.createServer(app);

// 设置静态文件目录
app.use(express.static(path.join(__dirname, 'public')));

// 创建Socket.io服务器
const io = socketIo(server);

// 存储在线用户
const users = {};

// 处理Socket.io连接
io.on('connection', (socket) => {
  console.log(`用户已连接: ${socket.id}`);
  
  // 处理用户加入
  socket.on('join', (username) => {
    console.log(`${username} 加入了聊天`);
    users[socket.id] = username;
    
    // 广播用户列表更新
    io.emit('userList', Object.values(users));
  });
  
  // 处理呼叫请求
  socket.on('call', (data) => {
    console.log(`${users[socket.id]} 呼叫 ${data.target}`);
    
    // 查找目标用户的socket id
    const targetId = Object.keys(users).find(id => users[id] === data.target);
    
    if (targetId) {
      // 向目标用户发送呼叫请求
      io.to(targetId).emit('incomingCall', {
        caller: users[socket.id],
        callerId: socket.id
      });
    }
  });
  
  // 处理呼叫应答
  socket.on('callResponse', (data) => {
    console.log(`${users[socket.id]} ${data.accepted ? '接受' : '拒绝'}了来自 ${data.caller} 的呼叫`);
    
    // 向呼叫者发送应答结果
    io.to(data.callerId).emit('callAnswered', {
      accepted: data.accepted,
      target: users[socket.id]
    });
  });
  
  // 处理WebRTC信令 - 发送offer
  socket.on('offer', (data) => {
    console.log(`收到来自 ${users[socket.id]} 的offer`, data.target);
    // 查找目标用户的socket id
    const targetId = Object.keys(users).find(id => users[id] === data.target);
    if (targetId) {
      io.to(targetId).emit('offer', {
        offer: data.offer,
        caller: users[socket.id]
      });
    }
  });
  
  // 处理WebRTC信令 - 发送answer
  socket.on('answer', (data) => {
    console.log(`收到来自 ${users[socket.id]} 的answer`);
    const targetId = Object.keys(users).find(id => users[id] === data.target);
    if (targetId) {
      io.to(targetId).emit('answer', {
        answer: data.answer,
        answerer: socket.id
      });
    }
  });
  
  // 处理ICE候选
  socket.on('iceCandidate', (data) => {
    console.log(`收到来自 ${users[socket.id]} 的ICE候选`);
    const targetId = Object.keys(users).find(id => users[id] === data.target);
    if (targetId) {
      io.to(data.target).emit('iceCandidate', {
        candidate: data.candidate,
        sender: socket.id
      });
    }
  });
  
  // 处理媒体状态变化
  socket.on('mediaStateChange', (data) => {
    console.log(`${users[socket.id]} ${data.enabled ? '开启' : '关闭'}了${data.mediaType === 'video' ? '视频' : '音频'}`);
    const targetId = Object.keys(users).find(id => users[id] === data.target);
    if (targetId) {
      io.to(targetId).emit('mediaStateChange', {
        sender: users[socket.id],
        mediaType: data.mediaType,
        enabled: data.enabled
      });
    }
  });
  
  // 处理通话结束
  socket.on('endCall', (data) => {
    console.log(`${users[socket.id]} 结束了通话`);
    const targetId = Object.keys(users).find(id => users[id] === data.target);
    if (targetId) {
      io.to(targetId).emit('callEnded', {
        caller: users[socket.id]
      });
    }
  });
  
  // 处理断开连接
  socket.on('disconnect', () => {
    console.log(`用户断开连接: ${users[socket.id]}`);
    delete users[socket.id];
    
    // 广播用户列表更新
    io.emit('userList', Object.values(users));
  });
});

// 设置服务器端口
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`服务器运行在 http://0.0.0.0:${PORT}`);
});