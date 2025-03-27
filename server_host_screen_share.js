const WebSocket = require('ws');

class HostScreenShareServer {
  constructor(server) {
    this.wss = new WebSocket.Server({ server });
    this.users = new Map(); // 存储用户WebSocket连接
    this.currentHost = null; // 当前主持人

    this.wss.on('connection', this.handleConnection.bind(this));
  }

  // 处理新的WebSocket连接
  handleConnection(ws) {
    ws.on('message', (message) => this.handleMessage(ws, message));
    ws.on('close', () => this.handleClose(ws));
  }

  // 处理接收到的消息
  handleMessage(ws, message) {
    try {
      const { type, data } = JSON.parse(message);
      switch (type) {
        case 'join':
          this.handleJoin(ws, data);
          break;
        case 'becomeHost':
          this.handleBecomeHost(ws, data);
          break;
        case 'leaveHost':
          this.handleLeaveHost(ws, data);
          break;
        case 'hostScreenShare':
          this.handleHostScreenShare(ws, data);
          break;
        case 'answer':
          this.handleAnswer(ws, data);
          break;
        case 'iceCandidate':
          this.handleIceCandidate(ws, data);
          break;
        case 'stopScreenShare':
          this.handleStopScreenShare(ws);
          break;
      }
    } catch (error) {
      console.error('处理消息时出错:', error);
    }
  }

  // 处理用户加入
  handleJoin(ws, data) {
    const { username } = data;
    this.users.set(ws, { username });

    // 广播用户列表更新
    this.broadcastUserList();

    // 发送当前主持人状态
    ws.send(JSON.stringify({
      type: 'hostUpdate',
      data: { host: this.currentHost }
    }));
  }

  // 处理成为主持人请求
  handleBecomeHost(ws, data) {
    const { username } = data;
    if (!this.currentHost) {
      this.currentHost = username;
      this.broadcastHostUpdate();
    }
  }

  // 处理退出主持人请求
  handleLeaveHost(ws, data) {
    const { username } = data;
    if (this.currentHost === username) {
      this.currentHost = null;
      this.broadcastHostUpdate();
    }
  }

  // 处理主持人屏幕共享
  handleHostScreenShare(ws, data) {
    const { offers } = data;
    const sender = this.users.get(ws);
    if (sender && sender.username === this.currentHost) {
      // 向其他所有用户广播offer
      let offerIndex = 0;
      this.users.forEach((user, userWs) => {
        if (userWs !== ws && offerIndex < offers.length) {
          userWs.send(JSON.stringify({
            type: 'offer',
            data: {
              from: sender.username,
              offer: offers[offerIndex++]
            }
          }));
        }
      });
    }
  }

  // 处理Answer
  handleAnswer(ws, data) {
    const { target, answer } = data;
    const sender = this.users.get(ws);
    if (sender) {
      this.users.forEach((user, userWs) => {
        if (user.username === target) {
          userWs.send(JSON.stringify({
            type: 'answer',
            data: {
              from: sender.username,
              answer
            }
          }));
        }
      });
    }
  }

  // 处理ICE候选
  handleIceCandidate(ws, data) {
    const { target, candidate } = data;
    const sender = this.users.get(ws);
    if (sender) {
      this.users.forEach((user, userWs) => {
        if (user.username === target) {
          userWs.send(JSON.stringify({
            type: 'iceCandidate',
            data: {
              from: sender.username,
              candidate
            }
          }));
        }
      });
    }
  }

  // 处理停止屏幕共享
  handleStopScreenShare(ws) {
    const sender = this.users.get(ws);
    if (sender && sender.username === this.currentHost) {
      this.users.forEach((user, userWs) => {
        if (userWs !== ws) {
          userWs.send(JSON.stringify({
            type: 'screenShareStopped',
            data: {}
          }));
        }
      });
    }
  }

  // 处理连接关闭
  handleClose(ws) {
    const user = this.users.get(ws);
    if (user) {
      if (user.username === this.currentHost) {
        this.currentHost = null;
        this.broadcastHostUpdate();
      }
      this.users.delete(ws);
      this.broadcastUserList();
    }
  }

  // 广播用户列表
  broadcastUserList() {
    const userList = Array.from(this.users.values()).map(user => user.username);
    this.broadcast({
      type: 'userList',
      data: userList
    });
  }

  // 广播主持人更新
  broadcastHostUpdate() {
    this.broadcast({
      type: 'hostUpdate',
      data: { host: this.currentHost }
    });
  }

  // 广播消息给所有用户
  broadcast(message) {
    this.wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(message));
      }
    });
  }
}

module.exports = HostScreenShareServer;