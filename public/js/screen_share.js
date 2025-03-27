// WebSocket连接
let ws;
// WebRTC连接
let peerConnection;
// 本地屏幕共享流
let localStream;
// 当前用户名
let currentUsername;
// 当前共享目标
let currentShareTarget;

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

    case 'incomingScreenShare':
      showScreenShareNotification(data);
      break;

    case 'screenShareAnswered':
      handleScreenShareResponse(data);
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
      handleScreenShareStopped(data);
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
      li.innerHTML = `
        ${username}
        <button class="share-btn" onclick="requestScreenShare('${username}')">共享屏幕</button>
      `;
      usersList.appendChild(li);
    }
  });
}

// 显示屏幕共享请求通知
function showScreenShareNotification(data) {
  const notifications = document.getElementById('notifications');
  const notification = document.createElement('div');
  notification.className = 'notification';
  notification.innerHTML = `
    <div>${data.from} 请求与您共享屏幕</div>
    <div class="notification-btns">
      <button class="accept-btn" onclick="acceptScreenShare('${data.fromId}')">接受</button>
      <button class="reject-btn" onclick="rejectScreenShare('${data.fromId}')">拒绝</button>
    </div>
  `;
  notifications.appendChild(notification);

  // 10秒后自动移除通知
  setTimeout(() => notification.remove(), 10000);
}

// 请求屏幕共享
async function requestScreenShare(targetUsername) {
  currentShareTarget = targetUsername;
  ws.send(JSON.stringify({
    type: 'requestScreenShare',
    data: { target: targetUsername }
  }));
}

// 接受屏幕共享
async function acceptScreenShare(fromId) {
  ws.send(JSON.stringify({
    type: 'screenShareResponse',
    data: {
      accepted: true,
      fromId: fromId
    }
  }));
  document.getElementById('notifications').innerHTML = '';
}

// 拒绝屏幕共享
function rejectScreenShare(fromId) {
  ws.send(JSON.stringify({
    type: 'screenShareResponse',
    data: {
      accepted: false,
      fromId: fromId
    }
  }));
  document.getElementById('notifications').innerHTML = '';
}

// 处理屏幕共享响应
async function handleScreenShareResponse(data) {
  if (data.accepted) {
    try {
      // 获取屏幕共享流
      localStream = await navigator.mediaDevices.getDisplayMedia({
        video: true
      });

      // 创建WebRTC连接
      createPeerConnection();

      // 添加本地流
      localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
      });

      // 创建并发送offer
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);

      ws.send(JSON.stringify({
        type: 'offer',
        data: {
          target: currentShareTarget,
          offer: offer
        }
      }));

      // 显示停止共享按钮
      document.getElementById('stopShareBtn').classList.remove('hidden');

      // 监听流结束事件
      localStream.getVideoTracks()[0].onended = () => {
        stopScreenShare();
      };
    } catch (error) {
      console.error('获取屏幕共享流失败:', error);
    }
  } else {
    console.log('对方拒绝了屏幕共享请求');
  }
}

// 创建WebRTC连接
function createPeerConnection() {
  peerConnection = new RTCPeerConnection({
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' }
    ]
  });

  // 处理ICE候选
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      ws.send(JSON.stringify({
        type: 'iceCandidate',
        data: {
          target: currentShareTarget,
          candidate: event.candidate
        }
      }));
    }
  };

  // 处理远程流
  peerConnection.ontrack = (event) => {
    const remoteVideo = document.getElementById('remoteScreen');
    if (remoteVideo.srcObject !== event.streams[0]) {
      remoteVideo.srcObject = event.streams[0];
    }
  };
}

// 处理offer
async function handleOffer(data) {
  currentShareTarget = data.from;
  createPeerConnection();

  await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);

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
  await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
}

// 处理ICE候选
function handleIceCandidate(data) {
  if (peerConnection) {
    peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
  }
}

// 停止屏幕共享
function stopScreenShare() {
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }

  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }

  document.getElementById('stopShareBtn').classList.add('hidden');
  document.getElementById('remoteScreen').srcObject = null;

  if (currentShareTarget) {
    ws.send(JSON.stringify({
      type: 'stopScreenShare',
      data: {
        target: currentShareTarget
      }
    }));
    currentShareTarget = null;
  }
}

// 处理对方停止屏幕共享
function handleScreenShareStopped() {
  document.getElementById('remoteScreen').srcObject = null;
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
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

    // 绑定停止共享按钮事件
    document.getElementById('stopShareBtn').addEventListener('click', stopScreenShare);
  });
});