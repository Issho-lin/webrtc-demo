// WebSocket连接
let ws;
// WebRTC连接集合
let peerConnections = new Map();
// 本地屏幕共享流
let localStream;
// 当前用户名
let currentUsername;
// 当前主持人用户名
let currentHost = null;
// 是否是主持人
let isHost = false;

// 初始化WebSocket连接
function connectWebSocket() {
  return new Promise((resolve) => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}`;

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log("WebSocket连接已建立");
      resolve();
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        handleMessage(message.type, message.data);
      } catch (error) {
        console.error("解析消息失败:", error);
      }
    };

    ws.onclose = () => {
      console.log("WebSocket连接已关闭");
      setTimeout(connectWebSocket, 3000);
    };

    ws.onerror = (error) => {
      console.error("WebSocket错误:", error);
    };
  });
}

// 处理接收到的消息
async function handleMessage(type, data) {
  switch (type) {
    case 'userList':
      updateUserList(data);
      break;

    case 'hostUpdate':
      handleHostUpdate(data);
      break;

    case 'offer':
      await handleOffer(data);
      break;

    case 'answer':
      await handleAnswer(data);
      break;

    case 'iceCandidate':
      handleIceCandidate(data);
      break;

    case 'screenShareStopped':
      handleScreenShareStopped();
      break;
  }
}

// 更新用户列表
function updateUserList(users) {
  const usersList = document.getElementById('usersList');
  usersList.innerHTML = '';

  users.forEach(username => {
    if (username !== currentUsername) {
      const li = document.createElement('li');
      li.textContent = username;
      usersList.appendChild(li);
    }
  });
}

// 处理主持人更新
function handleHostUpdate(data) {
  currentHost = data.host;
  const hostInfo = document.getElementById('hostInfo');
  const becomeHostBtn = document.getElementById('becomeHostBtn');
  const leaveHostBtn = document.getElementById('leaveHostBtn');
  const hostControls = document.getElementById('hostControls');

  if (currentHost) {
    hostInfo.textContent = `当前主持人: ${currentHost}`;
    becomeHostBtn.classList.add('hidden');
    
    if (currentHost === currentUsername) {
      isHost = true;
      leaveHostBtn.classList.remove('hidden');
      hostControls.classList.remove('hidden');
    } else {
      isHost = false;
      leaveHostBtn.classList.add('hidden');
      hostControls.classList.add('hidden');
    }
  } else {
    hostInfo.textContent = '当前无主持人';
    becomeHostBtn.classList.remove('hidden');
    leaveHostBtn.classList.add('hidden');
    hostControls.classList.add('hidden');
    isHost = false;
  }
}

// 成为主持人
function becomeHost() {
  ws.send(JSON.stringify({
    type: 'becomeHost',
    data: { username: currentUsername }
  }));
}

// 退出主持人
function leaveHost() {
  stopScreenShare();
  ws.send(JSON.stringify({
    type: 'leaveHost',
    data: { username: currentUsername }
  }));
}

// 开始屏幕共享
async function startScreenShare() {
  try {
    localStream = await navigator.mediaDevices.getDisplayMedia({
      video: true
    });

    createPeerConnections();

    // 添加本地流到所有连接
    localStream.getTracks().forEach(track => {
      peerConnections.forEach(pc => {
        pc.addTrack(track, localStream);
      });
    });

    // 为每个连接创建并发送offer
    const offers = await Promise.all(
      Array.from(peerConnections.values()).map(async (pc) => {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        return offer;
      })
    );

    // 发送offers给所有其他用户
    ws.send(JSON.stringify({
      type: 'hostScreenShare',
      data: {
        offers: offers
      }
    }));

    document.getElementById('startShareBtn').classList.add('hidden');
    document.getElementById('stopShareBtn').classList.remove('hidden');

    // 监听流结束事件
    localStream.getVideoTracks()[0].onended = () => {
      stopScreenShare();
    };
  } catch (error) {
    console.error('获取屏幕共享流失败:', error);
  }
}

// 停止屏幕共享
function stopScreenShare() {
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }

  // 关闭所有WebRTC连接
  peerConnections.forEach(pc => pc.close());
  peerConnections.clear();

  document.getElementById('startShareBtn').classList.remove('hidden');
  document.getElementById('stopShareBtn').classList.add('hidden');

  ws.send(JSON.stringify({
    type: 'stopScreenShare',
    data: {}
  }));
}

// 创建WebRTC连接集合
function createPeerConnections() {
  // 清除现有连接
  peerConnections.forEach(pc => pc.close());
  peerConnections.clear();

  // 为每个其他用户创建新的连接
  document.querySelectorAll('#usersList li').forEach(li => {
    const username = li.textContent.trim();
    if (username !== currentUsername) {
      const pc = createPeerConnection(username);
      peerConnections.set(username, pc);
    }
  });
}

// 创建单个WebRTC连接
function createPeerConnection(targetUsername) {
  const pc = new RTCPeerConnection({
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' }
    ]
  });

  // 处理ICE候选
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      ws.send(JSON.stringify({
        type: 'iceCandidate',
        data: {
          target: targetUsername,
          candidate: event.candidate
        }
      }));
    }
  };

  // 处理远程流
  pc.ontrack = (event) => {
    const remoteVideo = document.getElementById('remoteScreen');
    if (remoteVideo.srcObject !== event.streams[0]) {
      remoteVideo.srcObject = event.streams[0];
    }
  };

  return pc;
}

// 处理offer
async function handleOffer(data) {
  const pc = createPeerConnection(data.from);
  peerConnections.set(data.from, pc);

  await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);

  ws.send(JSON.stringify({
    type: 'answer',
    data: {
      target: data.from,
      answer: answer
    }
  }));
}

// 处理answer
async function handleAnswer(data) {
  const pc = peerConnections.get(data.from);
  if (pc) {
    await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
  }
}

// 处理ICE候选
function handleIceCandidate(data) {
  const pc = peerConnections.get(data.from);
  if (pc) {
    pc.addIceCandidate(new RTCIceCandidate(data.candidate));
  }
}

// 处理屏幕共享停止
function handleScreenShareStopped() {
  document.getElementById('remoteScreen').srcObject = null;
  for (const pc of peerConnections.values()) {
    pc.close();
  }
  peerConnections.clear();
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
  // 连接WebSocket
  connectWebSocket().then(() => {
    // 绑定加入按钮事件
    document.getElementById('joinBtn').addEventListener('click', () => {
      const username = document.getElementById('username').value.trim();
      if (username) {
        currentUsername = username;
        ws.send(JSON.stringify({
          type: 'join',
          data: { username }
        }));
        document.getElementById('username').disabled = true;
        document.getElementById('joinBtn').disabled = true;
      }
    });

    // 绑定成为主持人按钮事件
    document.getElementById('becomeHostBtn').addEventListener('click', becomeHost);

    // 绑定退出主持人按钮事件
    document.getElementById('leaveHostBtn').addEventListener('click', leaveHost);

    // 绑定开始共享按钮事件
    document.getElementById('startShareBtn').addEventListener('click', startScreenShare);

    // 绑定停止共享按钮事件
    document.getElementById('stopShareBtn').addEventListener('click', stopScreenShare);
  });
});