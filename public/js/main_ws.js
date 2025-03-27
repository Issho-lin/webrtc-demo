// 全局变量
let ws; // WebSocket连接
let localStream; // 本地媒体流
let peerConnection; // WebRTC对等连接
let username; // 当前用户名
let selectedUser; // 选中的用户
let isCallInitiator = false; // 是否为呼叫发起者
let virtualVideoCanvas; // 虚拟视频Canvas
let virtualVideoContext; // 虚拟视频Canvas上下文
let virtualVideoStream; // 虚拟视频流
let animationFrameId; // 动画帧ID
let callerId; // 呼叫者ID

// WebRTC配置
const configuration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" }, // Google的公共STUN服务器
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

// DOM元素
const loginContainer = document.getElementById("loginContainer");
const chatContainer = document.getElementById("chatContainer");
const usernameInput = document.getElementById("username");
const joinButton = document.getElementById("joinBtn");
const userList = document.getElementById("userList");
const callButton = document.getElementById("callBtn");
const hangupButton = document.getElementById("hangupBtn");
const toggleVideoButton = document.getElementById("toggleVideoBtn");
const toggleAudioButton = document.getElementById("toggleAudioBtn");
const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const remoteVideoLabel = document.getElementById("remoteVideoLabel");
const callStatus = document.getElementById("callStatus");
const callDialog = document.getElementById("callDialog");
const callerName = document.getElementById("callerName");
const acceptCallButton = document.getElementById("acceptCallBtn");
const rejectCallButton = document.getElementById("rejectCallBtn");

// 初始化函数
async function init() {
  // 设置事件监听器
  joinButton.addEventListener("click", join);
  callButton.addEventListener("click", call);
  hangupButton.addEventListener("click", hangup);
  toggleVideoButton.addEventListener("click", toggleVideo);
  toggleAudioButton.addEventListener("click", toggleAudio);
  acceptCallButton.addEventListener("click", acceptCall);
  rejectCallButton.addEventListener("click", rejectCall);

  // 按Enter键加入
  usernameInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") join();
  });
}

// 创建虚拟视频流
function createVirtualVideo() {
  // 创建Canvas元素
  virtualVideoCanvas = document.createElement("canvas");
  virtualVideoCanvas.width = 640;
  virtualVideoCanvas.height = 480;
  virtualVideoContext = virtualVideoCanvas.getContext("2d");

  // 获取虚拟视频流
  virtualVideoStream = virtualVideoCanvas.captureStream(30); // 30fps

  // 开始动画循环
  animateVirtualVideo();

  return virtualVideoStream;
}

// 动画循环函数
function animateVirtualVideo() {
  // 清空画布
  virtualVideoContext.fillStyle = "#000000";
  virtualVideoContext.fillRect(
    0,
    0,
    virtualVideoCanvas.width,
    virtualVideoCanvas.height
  );

  // 绘制用户名
  virtualVideoContext.fillStyle = "#FFFFFF";
  virtualVideoContext.font = "24px Arial";
  virtualVideoContext.textAlign = "center";
  virtualVideoContext.fillText(
    username || "未登录",
    virtualVideoCanvas.width / 2,
    virtualVideoCanvas.height / 2 - 12
  );

  // 绘制时间
  const now = new Date();
  const timeString = now.toLocaleTimeString();
  virtualVideoContext.font = "20px Arial";
  virtualVideoContext.fillText(
    timeString,
    virtualVideoCanvas.width / 2,
    virtualVideoCanvas.height / 2 + 20
  );

  // 继续动画循环
  animationFrameId = requestAnimationFrame(animateVirtualVideo);
}

// 加入聊天
async function join() {
  // 验证用户名
  if (!usernameInput.value.trim()) {
    alert("请输入用户名");
    return;
  }

  username = usernameInput.value.trim();

  try {
    // 创建虚拟视频流
    const videoStream = createVirtualVideo();

    // 获取音频流（如果有麦克风）
    let audioStream;
    try {
      audioStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
    } catch (audioError) {
      console.warn("无法访问麦克风:", audioError);
      // 创建静音的音频轨道
      const audioContext = new AudioContext();
      const oscillator = audioContext.createOscillator();
      const dst = oscillator.connect(
        audioContext.createMediaStreamDestination()
      );
      oscillator.start();
      audioStream = dst.stream;
    }

    // 合并视频和音频流
    const videoTrack = videoStream.getVideoTracks()[0];
    const audioTrack = audioStream.getAudioTracks()[0];
    localStream = new MediaStream([videoTrack, audioTrack]);

    // 显示本地视频
    localVideo.srcObject = localStream;

    // 连接到WebSocket服务器
    await connectWebSocket();

    // 发送加入消息
    sendMessage("join", { username });

    // 切换界面
    loginContainer.classList.add("hidden");
    chatContainer.classList.remove("hidden");

    // 更新状态
    updateCallStatus("已连接，选择一个用户开始通话");
  } catch (error) {
    console.error("创建媒体流失败:", error);
    alert(`创建媒体流失败: ${error.message}`);
  }
}

// 连接WebSocket服务器
function connectWebSocket() {
  return new Promise((resolve) => {
    // 获取当前URL的协议和主机部分
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}`;

    // 创建WebSocket连接
    ws = new WebSocket(wsUrl);

    // 连接打开时的处理
    ws.onopen = () => {
      console.log("WebSocket连接已建立");
      resolve();
    };

    // 接收消息的处理
    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        handleMessage(message.type, message.data);
      } catch (error) {
        console.error("解析消息失败:", error);
      }
    };

    // 连接关闭时的处理
    ws.onclose = () => {
      console.log("WebSocket连接已关闭");
      // 尝试重新连接
      setTimeout(connectWebSocket, 3000);
    };

    // 连接错误时的处理
    ws.onerror = (error) => {
      console.error("WebSocket错误:", error);
    };
  });
}

// 发送消息到服务器
function sendMessage(type, data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type, data }));
  } else {
    console.warn("WebSocket未连接，无法发送消息");
  }
}

// 处理接收到的消息
function handleMessage(type, data) {
  switch (type) {
    case "userList":
      // 过滤掉自己
      console.log("用户列表:", data);
      const filteredUsers = data.filter((user) => user !== username);
      updateUserList(filteredUsers);
      break;

    case "incomingCall":
      // 显示呼叫对话框
      callerName.textContent = data.caller;
      callDialog.classList.remove("hidden");

      // 保存呼叫者信息
      selectedUser = data.caller;
      callerId = data.callerId;
      break;

    case "callAnswered":
      if (data.accepted) {
        // 如果对方接受了呼叫，创建对等连接
        updateCallStatus(`与 ${data.target} 建立连接中...`);
        hangupButton.disabled = false;

        // 重置之前的连接状态
        if (peerConnection) {
          peerConnection.close();
          peerConnection = null;
        }

        createPeerConnection();

        // 作为呼叫发起者，创建并发送offer
        isCallInitiator = true;
        peerConnection
          .createOffer()
          .then((offer) => peerConnection.setLocalDescription(offer))
          .then(() => {
            sendMessage("offer", {
              target: selectedUser,
              offer: peerConnection.localDescription,
            });
          })
          .catch((error) => {
            console.error("创建offer失败:", error);
            updateCallStatus("创建连接失败，请重试");
            resetCallState();
          });
      } else {
        // 如果对方拒绝了呼叫
        updateCallStatus(`${data.target} 拒绝了通话`);
        resetCallState();
      }
      break;

    case "offer":
      // 如果不是呼叫发起者，接收到offer后创建对等连接
      if (!isCallInitiator) {
        createPeerConnection();

        // 设置远程描述并创建answer
        peerConnection
          .setRemoteDescription(new RTCSessionDescription(data.offer))
          .then(() => peerConnection.createAnswer())
          .then((answer) => peerConnection.setLocalDescription(answer))
          .then(() => {
            sendMessage("answer", {
              target: data.caller,
              answer: peerConnection.localDescription,
            });
          })
          .catch((error) => console.error("处理offer失败:", error));
      }
      break;

    case "answer":
      // 设置远程描述
      peerConnection
        .setRemoteDescription(new RTCSessionDescription(data.answer))
        .catch((error) => console.error("设置远程描述失败:", error));
      break;

    case "iceCandidate":
      // 添加ICE候选
      const candidate = new RTCIceCandidate(data.candidate);
      peerConnection
        .addIceCandidate(candidate)
        .catch((error) => console.error("添加ICE候选失败:", error));
      break;

    case "callEnded":
      updateCallStatus("对方结束了通话");
      hangup();
      break;

    case "mediaStateChange":
      // 处理媒体状态变化
      updateCallStatus(
        `${data.sender} ${data.enabled ? "开启" : "关闭"}了${
          data.mediaType === "video" ? "视频" : "音频"
        }`
      );
      break;
  }
}

// 更新用户列表
function updateUserList(users) {
  userList.innerHTML = "";

  if (users.length === 0) {
    const li = document.createElement("li");
    li.textContent = "没有其他在线用户";
    li.style.cursor = "default";
    userList.appendChild(li);
    callButton.disabled = true;
    return;
  }

  users.forEach((user) => {
    const li = document.createElement("li");
    li.textContent = user;
    li.addEventListener("click", () => {
      // 移除之前选中的用户
      document.querySelectorAll("#userList li").forEach((item) => {
        item.classList.remove("selected");
      });

      // 选中当前用户
      li.classList.add("selected");
      selectedUser = user;
      callButton.disabled = false;
      updateCallStatus(`准备与 ${selectedUser} 通话`);
    });
    userList.appendChild(li);
  });
}

// 创建WebRTC对等连接
function createPeerConnection() {
  // 创建新的RTCPeerConnection
  peerConnection = new RTCPeerConnection(configuration);

  // 添加本地媒体流轨道
  localStream.getTracks().forEach((track) => {
    peerConnection.addTrack(track, localStream);
  });

  // 处理ICE候选
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      // 发送ICE候选到对方
      sendMessage("iceCandidate", {
        target: selectedUser,
        candidate: event.candidate,
      });
    }
  };

  // 处理连接状态变化
  peerConnection.onconnectionstatechange = (event) => {
    switch (peerConnection.connectionState) {
      case "connected":
        updateCallStatus(`已与 ${selectedUser} 建立连接`);
        hangupButton.disabled = false;
        break;
      case "disconnected":
      case "failed":
        updateCallStatus("连接断开");
        hangup();
        break;
    }
  };

  // 处理远程媒体流
  peerConnection.ontrack = (event) => {
    if (event.streams && event.streams[0]) {
      console.log("收到远程媒体流:", event.streams[0]);
      remoteVideo.srcObject = event.streams[0];
      remoteVideoLabel.textContent = selectedUser;
    }
  };
}

// 发起呼叫
function call() {
  if (!selectedUser) return;

  updateCallStatus(`正在呼叫 ${selectedUser}...`);
  callButton.disabled = true;

  // 发送呼叫请求
  sendMessage("call", {
    target: selectedUser,
  });
}

// 接受呼叫
function acceptCall() {
  callDialog.classList.add("hidden");
  updateCallStatus(`接受来自 ${selectedUser} 的通话...`);
  hangupButton.disabled = false;

  // 发送接受呼叫的响应
  sendMessage("callResponse", {
    accepted: true,
    caller: selectedUser,
    callerId: callerId,
  });
}

// 拒绝呼叫
function rejectCall() {
  callDialog.classList.add("hidden");

  // 发送拒绝呼叫的响应
  sendMessage("callResponse", {
    accepted: false,
    caller: selectedUser,
    callerId: callerId,
  });

  selectedUser = null;
  callerId = null;
}

// 结束通话
function hangup() {
  if (selectedUser && peerConnection) {
    // 发送结束通话消息
    sendMessage("endCall", {
      target: selectedUser,
    });
  }

  resetCallState();
}

// 重置通话状态
function resetCallState() {
  // 关闭对等连接
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }

  // 重置UI
  remoteVideo.srcObject = null;
  remoteVideoLabel.textContent = "对方";
  callButton.disabled = selectedUser ? false : true;
  hangupButton.disabled = true;
  isCallInitiator = false;

  updateCallStatus(
    selectedUser ? `准备与 ${selectedUser} 通话` : "选择一个用户开始通话"
  );
}

// 切换视频
function toggleVideo() {
  const videoTrack = localStream.getVideoTracks()[0];
  if (videoTrack) {
    if (!videoTrack.enabled) {
      // 重新开始动画
      animateVirtualVideo();
    } else {
      // 停止动画
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
      // 清空画布
      virtualVideoContext.fillStyle = "#000000";
      virtualVideoContext.fillRect(
        0,
        0,
        virtualVideoCanvas.width,
        virtualVideoCanvas.height
      );
    }
    videoTrack.enabled = !videoTrack.enabled;
    toggleVideoButton.textContent = videoTrack.enabled
      ? "关闭视频"
      : "开启视频";

    // 通知对方视频状态变化
    if (
      selectedUser &&
      peerConnection &&
      peerConnection.connectionState === "connected"
    ) {
      sendMessage("mediaStateChange", {
        target: selectedUser,
        mediaType: "video",
        enabled: videoTrack.enabled,
      });
    }
  }
}

// 切换音频
function toggleAudio() {
  const audioTrack = localStream.getAudioTracks()[0];
  if (audioTrack) {
    audioTrack.enabled = !audioTrack.enabled;
    toggleAudioButton.textContent = audioTrack.enabled
      ? "关闭音频"
      : "开启音频";

    // 通知对方音频状态变化
    if (
      selectedUser &&
      peerConnection &&
      peerConnection.connectionState === "connected"
    ) {
      sendMessage("mediaStateChange", {
        target: selectedUser,
        mediaType: "audio",
        enabled: audioTrack.enabled,
      });
    }
  }
}

// 更新通话状态显示
function updateCallStatus(message) {
  callStatus.textContent = message;
}

// 页面加载完成后初始化
window.addEventListener("DOMContentLoaded", init);
