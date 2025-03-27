# WebSocket版本WebRTC视频通话实现分析

## 功能流程图

```mermaid
sequenceDiagram
    participant 用户A
    participant 客户端A
    participant 服务器
    participant 客户端B
    participant 用户B
    
    %% 用户登录流程
    用户A->>客户端A: 输入用户名并点击加入
    客户端A->>客户端A: 创建虚拟视频流和音频流
    客户端A->>服务器: WebSocket连接
    客户端A->>服务器: 发送join消息(username)
    服务器->>服务器: 记录用户信息
    服务器->>客户端A: 发送userList消息
    服务器->>客户端B: 发送userList消息
    
    %% 呼叫流程
    用户A->>客户端A: 选择用户B并点击呼叫
    客户端A->>服务器: 发送call消息(target)
    服务器->>客户端B: 发送incomingCall消息(caller, callerId)
    客户端B->>用户B: 显示呼叫对话框
    
    %% 接受呼叫流程
    用户B->>客户端B: 点击接受呼叫
    客户端B->>服务器: 发送callResponse消息(accepted=true)
    服务器->>客户端A: 发送callAnswered消息(accepted=true)
    
    %% WebRTC连接建立流程
    客户端A->>客户端A: 创建RTCPeerConnection
    客户端A->>客户端A: 创建Offer
    客户端A->>服务器: 发送offer消息(target, offer)
    服务器->>客户端B: 发送offer消息(offer, caller)
    客户端B->>客户端B: 创建RTCPeerConnection
    客户端B->>客户端B: 设置远程描述并创建Answer
    客户端B->>服务器: 发送answer消息(target, answer)
    服务器->>客户端A: 发送answer消息(answer)
    
    %% ICE候选交换
    客户端A->>服务器: 发送iceCandidate消息(target, candidate)
    服务器->>客户端B: 发送iceCandidate消息(candidate, sender)
    客户端B->>服务器: 发送iceCandidate消息(target, candidate)
    服务器->>客户端A: 发送iceCandidate消息(candidate, sender)
    
    %% 媒体流传输(P2P)
    客户端A-->>客户端B: 直接P2P传输媒体流
    客户端B-->>客户端A: 直接P2P传输媒体流
    
    %% 媒体控制
    用户A->>客户端A: 切换视频/音频状态
    客户端A->>服务器: 发送mediaStateChange消息
    服务器->>客户端B: 发送mediaStateChange消息
    
    %% 结束通话
    用户A->>客户端A: 点击挂断
    客户端A->>服务器: 发送endCall消息(target)
    服务器->>客户端B: 发送callEnded消息(caller)
    客户端B->>客户端B: 重置通话状态
    客户端A->>客户端A: 重置通话状态
```

## 架构图

```mermaid
graph TB
    %% 客户端组件
    subgraph "客户端A"
        A1["用户界面"] --> A2["WebSocket客户端"]
        A1 --> A3["媒体流处理"]
        A1 --> A4["WebRTC连接管理"]
        A2 <--> A4
        A3 --> A4
    end
    
    subgraph "客户端B"
        B1["用户界面"] --> B2["WebSocket客户端"]
        B1 --> B3["媒体流处理"]
        B1 --> B4["WebRTC连接管理"]
        B2 <--> B4
        B3 --> B4
    end
    
    %% 服务器组件
    subgraph "服务器"
        S1["Express服务器"] --> S2["WebSocket服务器"]
        S2 --> S3["用户管理"]
        S2 --> S4["信令处理"]
    end
    
    %% 连接关系
    A2 <--> S2
    B2 <--> S2
    A4 <--"P2P媒体流传输"--> B4
    
    %% 组件说明
    classDef component fill:#f9f,stroke:#333,stroke-width:2px;
    class A1,A2,A3,A4,B1,B2,B3,B4,S1,S2,S3,S4 component;
```

## 系统组件说明

### 客户端组件

1. **用户界面**
   - 登录界面：用户输入用户名并加入
   - 聊天界面：显示在线用户列表、视频区域和控制按钮
   - 呼叫对话框：显示来电信息，提供接受/拒绝选项

2. **WebSocket客户端**
   - 负责与服务器建立WebSocket连接
   - 发送和接收信令消息
   - 处理连接断开和重连

3. **媒体流处理**
   - 创建虚拟视频流（Canvas动画）
   - 获取音频流（麦克风）
   - 管理媒体流的开启/关闭状态

4. **WebRTC连接管理**
   - 创建和管理RTCPeerConnection
   - 处理ICE候选
   - 创建和处理Offer/Answer
   - 管理媒体轨道

### 服务器组件

1. **Express服务器**
   - 提供静态文件服务
   - 处理HTTP请求

2. **WebSocket服务器**
   - 管理WebSocket连接
   - 处理消息的接收和转发

3. **用户管理**
   - 维护在线用户列表
   - 管理用户ID和连接关系

4. **信令处理**
   - 处理各类信令消息（join、call、offer、answer等）
   - 转发信令消息到目标用户

## 信令消息类型

1. **join**: 用户加入聊天
2. **userList**: 在线用户列表更新
3. **call**: 发起呼叫请求
4. **incomingCall**: 收到呼叫请求
5. **callResponse**: 呼叫应答（接受/拒绝）
6. **callAnswered**: 呼叫应答结果
7. **offer**: WebRTC连接offer
8. **answer**: WebRTC连接answer
9. **iceCandidate**: ICE候选信息
10. **mediaStateChange**: 媒体状态变化（视频/音频开关）
11. **endCall**: 结束通话请求
12. **callEnded**: 通话已结束通知

## WebSocket vs Socket.io 实现对比

本项目同时提供了WebSocket和Socket.io两种实现版本，主要区别如下：

1. **API差异**
   - WebSocket版本使用原生WebSocket API（ws模块）
   - Socket.io版本使用Socket.io库提供的API

2. **连接建立**
   - WebSocket版本需要手动处理连接URL构建和重连
   - Socket.io自动处理连接细节和重连

3. **消息格式**
   - WebSocket版本需要手动序列化/反序列化JSON消息
   - Socket.io自动处理消息序列化

4. **事件处理**
   - WebSocket版本使用onmessage统一接收消息，然后根据类型分发
   - Socket.io使用事件名称直接注册处理函数

5. **房间和命名空间**
   - WebSocket版本需要手动实现用户分组
   - Socket.io提供内置的房间和命名空间功能

两种实现在功能上完全等价，但Socket.io版本代码结构更清晰，而WebSocket版本更接近底层实现。