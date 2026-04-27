# 开发文档

## 项目结构

```
AI-Video-Transcriber/
├── backend/
│   ├── main.py          # FastAPI 主服务，路由、队列、SSE
│   ├── transcriber.py   # yt-dlp 下载 + Whisper/FunASR 转录
│   ├── auth.py          # JWT 认证（python-jose + bcrypt）
│   ├── models.py        # SQLAlchemy 模型（User, History）
│   └── database.py      # SQLite 数据库初始化
├── static/
│   ├── index.html       # 主页
│   ├── history.html     # 历史记录页
│   └── app.js           # 前端逻辑（纯 JS，无框架）
├── data/                # 运行时数据（app.db, tasks.json）
└── requirements.txt
```

## 技术栈

| 层 | 技术 |
|---|---|
| 后端框架 | FastAPI + uvicorn |
| 数据库 | SQLite + SQLAlchemy 2.0 |
| 认证 | JWT (python-jose) + passlib[bcrypt] |
| 转录 | FunASR / Whisper（本地 OpenAI 兼容 API） |
| 视频下载 | yt-dlp |
| 前端 | 原生 JS + marked.js（无框架） |
| 实时通信 | SSE (Server-Sent Events) |

## 部署方式（Docker 热更新）

> 不推荐每次重新 build 镜像，直接用 docker cp 热替换文件。

```bash
# 更新后端文件
docker cp backend/main.py <container_name>:/app/backend/main.py

# 更新前端文件
docker cp static/app.js <container_name>:/app/static/app.js
docker cp static/index.html <container_name>:/app/static/index.html

# 重启容器生效
docker restart <container_name>
```

## 依赖版本注意

```
# bcrypt 必须固定在 4.0 以下，passlib 1.7.4 与 bcrypt 4+ 不兼容
bcrypt>=3.2.0,<4.0.0
passlib[bcrypt]>=1.7.4

# httpx timeout 设为 7200s（2小时），支持长视频转录
httpx>=0.25.0
```

## 任务队列设计

- 使用 asyncio.Queue 实现单 worker 串行处理
- 新任务提交后进入 queued 状态，通过 SSE 实时推送队列位置
- 任务状态持久化到 data/tasks.json（保留最近 200 条，自动清理 48h 前的记录）

## 认证设计

- JWT token，有效期 30 天，存储在浏览器 localStorage（key: vt2_token）
- token 失效时前端自动清除并恢复游客状态
- 未登录用户历史记录存储在 localStorage（key: vt2_history，最多 15 条）

## localStorage 键说明

| 键 | 说明 |
|---|---|
| vt2_token | JWT 登录 token |
| vt2_username | 当前用户名 |
| vt2_history | 本地历史记录（最多 15 条） |
| vt2_active_tasks | 进行中任务 ID 数组（刷新页面恢复用） |
| vt2_last_result | 最后一次转录结果（刷新页面恢复用） |
| vt2_settings | 用户设置 |
| vt2_theme | 主题（dark/light） |

## 已知问题

- **BiliBili 412 错误**：B 站需要真实浏览器 cookie，yt-dlp 无法自动获取，需用户手动提供 cookie 文件
- **超长视频**：FunASR 本身对超长音频可能有内存/超时限制
