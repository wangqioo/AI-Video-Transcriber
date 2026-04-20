from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
import os
import tempfile
import asyncio
import logging
from pathlib import Path
from typing import Optional
import aiofiles
import uuid
import json
import re
import openai

from video_processor import VideoProcessor
from transcriber import Transcriber
from summarizer import Summarizer
from translator import Translator

from database import Base, engine, SessionLocal
from models import User, History as HistoryModel
import auth as auth_module
from sqlalchemy.orm import Session

# Create database tables
Base.metadata.create_all(bind=engine)


# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="AI视频转录器", version="1.0.0")

# CORS中间件配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 获取项目根目录
PROJECT_ROOT = Path(__file__).parent.parent

# 挂载静态文件
app.mount("/static", StaticFiles(directory=str(PROJECT_ROOT / "static")), name="static")

# 创建临时目录
TEMP_DIR = PROJECT_ROOT / "temp"
TEMP_DIR.mkdir(exist_ok=True)

# 初始化处理器
video_processor = VideoProcessor()
transcriber = Transcriber()
summarizer = Summarizer()
translator = Translator()


def _get_user_from_request(authorization: str = None) -> Optional[dict]:
    """Extract user info from Authorization: Bearer <token> header."""
    if not authorization or not authorization.startswith('Bearer '):
        return None
    return auth_module.decode_token(authorization[7:])



# 存储任务状态 - 使用文件持久化
import json
import threading

TASKS_FILE = TEMP_DIR / "tasks.json"
tasks_lock = threading.Lock()

def load_tasks():
    """加载任务状态"""
    try:
        if TASKS_FILE.exists():
            with open(TASKS_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
    except:
        pass
    return {}

def save_tasks(tasks_data):
    """保存任务状态，清理 48h 前已完成/出错的旧任务（最多保留 200 条）"""
    import time as _time
    try:
        cutoff = _time.time() - 48 * 3600
        pruned = {}
        for tid, task in tasks_data.items():
            status = task.get("status", "")
            ts = task.get("created_at", cutoff + 1)
            if status in ("processing", "queued") or ts >= cutoff:
                pruned[tid] = task
        if len(pruned) > 200:
            keep = sorted(pruned, key=lambda t: pruned[t].get("created_at", 0), reverse=True)[:200]
            pruned = {k: pruned[k] for k in keep}
        with tasks_lock:
            with open(TASKS_FILE, "w", encoding="utf-8") as f:
                json.dump(pruned, f, ensure_ascii=False, indent=2)
    except Exception as e:
        logger.error(f"保存任务状态失败: {e}")

async def _simulate_progress(task_id: str, start: float, end: float, interval: float = 10.0):
    """Slowly advance progress from start toward end while a long operation runs.
    Uses exponential decay: each tick closes 4% of the remaining gap, so it
    decelerates and never actually reaches `end`.  Cancel this task when the
    real operation finishes."""
    current = float(start)
    while True:
        await asyncio.sleep(interval)
        if task_id not in tasks or tasks[task_id].get("status") != "processing":
            break
        # only advance if nobody else has already pushed the value higher
        server_val = float(tasks[task_id].get("progress", current))
        current = max(current, server_val)
        if current >= end - 0.5:
            break
        remaining = end - current
        inc = max(remaining * 0.05, 0.2)   # 5% of gap, minimum 0.2
        current = min(current + inc, end - 0.5)
        tasks[task_id]["progress"] = round(current, 1)
        save_tasks(tasks)
        await broadcast_task_update(task_id, tasks[task_id])


async def broadcast_task_update(task_id: str, task_data: dict):
    """向所有连接的SSE客户端广播任务状态更新"""
    # 始终在 payload 中包含 task_id，方便前端多任务场景区分
    task_data = {**task_data, "task_id": task_id}
    logger.info(f"广播任务更新: {task_id}, 状态: {task_data.get('status')}, 连接数: {len(sse_connections.get(task_id, []))}")
    if task_id in sse_connections:
        connections_to_remove = []
        for queue in sse_connections[task_id]:
            try:
                await queue.put(json.dumps(task_data, ensure_ascii=False))
                logger.debug(f"消息已发送到队列: {task_id}")
            except Exception as e:
                logger.warning(f"发送消息到队列失败: {e}")
                connections_to_remove.append(queue)
        
        # 移除断开的连接
        for queue in connections_to_remove:
            sse_connections[task_id].remove(queue)
        
        # 如果没有连接了，清理该任务的连接列表
        if not sse_connections[task_id]:
            del sse_connections[task_id]

# 启动时加载任务状态
tasks = load_tasks()
# 存储正在处理的URL，防止重复处理
processing_urls = set()
# 存储活跃的任务对象，用于控制和取消
active_tasks = {}
# 存储SSE连接，用于实时推送状态更新
sse_connections = {}

# ── 任务队列 ───────────────────────────────────────────────────────────────────
_task_queue: asyncio.Queue = None        # 全局任务队列（启动时初始化）
_queue_list: list = []                   # 等待中的 task_id 列表（有序）
_task_params: dict = {}                  # task_id -> (url, summary_language, api_key, model_base_url, model_id)


async def _queue_worker():
    """单线程 worker：依次处理队列中的视频任务。"""
    logger.info("任务队列 worker 已启动")
    while True:
        task_id = await _task_queue.get()
        # 从等待列表中移除，并更新剩余任务的队列位置
        if task_id in _queue_list:
            _queue_list.remove(task_id)
        # 通知剩余等待任务更新位置
        for i, tid in enumerate(_queue_list):
            if tid in tasks and tasks[tid].get("status") == "queued":
                pos = i + 1
                msg = f"排队中，前方还有 {i} 个任务…" if i > 0 else "即将开始处理…"
                tasks[tid].update({"queue_position": pos, "message": msg})
                save_tasks(tasks)
                await broadcast_task_update(tid, tasks[tid])
        # 取出参数并执行
        params = _task_params.pop(task_id, None)
        if params and task_id in tasks:
            try:
                await process_video_task(task_id, *params)
            except Exception as e:
                logger.error(f"Worker 处理任务 {task_id} 出错: {e}")
        _task_queue.task_done()


@app.on_event("startup")
async def startup_event():
    global _task_queue
    _task_queue = asyncio.Queue()
    asyncio.create_task(_queue_worker())

def _sanitize_title_for_filename(title: str) -> str:
    """将视频标题清洗为安全的文件名片段。"""
    if not title:
        return "untitled"
    # 仅保留字母数字、下划线、连字符与空格
    safe = re.sub(r"[^\w\-\s]", "", title)
    # 压缩空白并转为下划线
    safe = re.sub(r"\s+", "_", safe).strip("._-")
    # 最长限制，避免过长文件名问题
    return safe[:80] or "untitled"

@app.get("/")
async def read_root():
    """返回前端页面"""
    return FileResponse(str(PROJECT_ROOT / "static" / "index.html"))

@app.post("/api/models")
async def list_models(
    base_url: str = Form(default=""),
    api_key:  str = Form(default=""),
):
    """Proxy: fetch model list from any OpenAI-compatible API."""
    effective_key = api_key or os.getenv("OPENAI_API_KEY", "")
    effective_url = base_url.rstrip("/") or os.getenv("OPENAI_BASE_URL") or None

    if not effective_key:
        raise HTTPException(status_code=400, detail="API key is required")

    try:
        client = openai.OpenAI(api_key=effective_key, base_url=effective_url)
        resp   = await asyncio.to_thread(client.models.list)
        models = [{"id": m.id, "name": getattr(m, "name", m.id)} for m in resp.data]
        # Sort by id for readability
        models.sort(key=lambda x: x["id"])
        return {"data": models}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/process-video")
async def process_video(
    url: str = Form(...),
    summary_language: str = Form(default="zh"),
    api_key:       str = Form(default=""),
    model_base_url: str = Form(default=""),
    model_id:      str = Form(default=""),
):
    """
    处理视频链接，返回任务ID
    """
    try:
        # 检查是否已经在处理相同的URL
        if url in processing_urls:
            # 查找现有任务
            for tid, task in tasks.items():
                if task.get("url") == url:
                    return {"task_id": tid, "message": "该视频正在处理中，请等待..."}
            
        # 生成唯一任务ID
        task_id = str(uuid.uuid4())
        
        # 标记URL为正在处理
        processing_urls.add(url)
        
        # 将任务加入队列
        _queue_list.append(task_id)
        _task_params[task_id] = (url, summary_language, api_key, model_base_url, model_id)
        queue_pos = len(_queue_list)

        # 初始化任务状态
        import time as _t
        tasks[task_id] = {
            "status": "queued",
            "progress": 0,
            "queue_position": queue_pos,
            "message": f"排队中，当前第 {queue_pos} 位…" if queue_pos > 1 else "即将开始处理…",
            "script": None,
            "summary": None,
            "error": None,
            "url": url,
            "created_at": _t.time()
        }
        save_tasks(tasks)
        _task_queue.put_nowait(task_id)

        return {"task_id": task_id, "message": "任务已加入队列", "queue_position": queue_pos}
        
    except Exception as e:
        logger.error(f"处理视频时出错: {str(e)}")
        raise HTTPException(status_code=500, detail=f"处理失败: {str(e)}")

async def process_video_task(
    task_id: str,
    url: str,
    summary_language: str,
    api_key: str = "",
    model_base_url: str = "",
    model_id: str = "",
):
    """
    异步处理视频任务
    """
    try:
        # ── 阶段一：优先尝试获取平台字幕（快速路径） ──────────────────────
        tasks[task_id].update({
            "status": "processing",
            "progress": 10,
            "message": "正在检测视频字幕..."
        })
        save_tasks(tasks)
        await broadcast_task_update(task_id, tasks[task_id])
        await asyncio.sleep(0.1)

        # 如果前端传入了 API 凭据，创建专用 Summarizer（线程安全，覆盖全局实例）
        if api_key:
            effective_url = model_base_url.rstrip("/") or None
            request_summarizer = Summarizer(
                api_key=api_key,
                base_url=effective_url,
                model=model_id or None,
            )
            logger.info(f"使用前端提供的 API Key，base_url={effective_url}, model={model_id or 'default'}")
        else:
            request_summarizer = summarizer  # 全局实例（使用环境变量）

        subtitle_text, sub_title, sub_lang = await video_processor.fetch_subtitles(url, TEMP_DIR)

        if subtitle_text:
            # ── 快速路径：有字幕，跳过音频下载和 Whisper ──────────────────
            video_title = sub_title
            raw_script = subtitle_text
            # 把语言写入 transcriber，保持下游逻辑一致
            transcriber.last_detected_language = sub_lang

            tasks[task_id].update({
                "progress": 40,
                "message": f"字幕获取成功（{sub_lang}），正在处理文本..."
            })
            save_tasks(tasks)
            await broadcast_task_update(task_id, tasks[task_id])
        else:
            # ── 慢速路径：无字幕，下载音频 → Whisper 转录 ─────────────────
            tasks[task_id].update({
                "progress": 15,
                "message": "未找到字幕，正在下载视频音频..."
            })
            save_tasks(tasks)
            await broadcast_task_update(task_id, tasks[task_id])

            audio_path, video_title = await video_processor.download_and_convert(url, TEMP_DIR)

            tasks[task_id].update({
                "progress": 35,
                "message": "音频下载完成，准备转录..."
            })
            save_tasks(tasks)
            await broadcast_task_update(task_id, tasks[task_id])

            tasks[task_id].update({
                "progress": 40,
                "message": "正在转录音频（Whisper）..."
            })
            save_tasks(tasks)
            await broadcast_task_update(task_id, tasks[task_id])

            _t1 = asyncio.create_task(_simulate_progress(task_id, 40, 53, interval=12))
            try:
                raw_script = await transcriber.transcribe(audio_path)
            finally:
                _t1.cancel()
                try: await _t1
                except asyncio.CancelledError: pass

        # 将Whisper原始转录保存为Markdown文件，供下载/归档
        try:
            short_id = task_id.replace("-", "")[:6]
            safe_title = _sanitize_title_for_filename(video_title)
            raw_md_filename = f"raw_{safe_title}_{short_id}.md"
            raw_md_path = TEMP_DIR / raw_md_filename
            with open(raw_md_path, "w", encoding="utf-8") as f:
                content_raw = (raw_script or "") + f"\n\nsource: {url}\n"
                f.write(content_raw)

            # 记录原始转录文件路径（仅保存文件名，实际路径位于TEMP_DIR）
            tasks[task_id].update({
                "raw_script_file": raw_md_filename
            })
            save_tasks(tasks)
            await broadcast_task_update(task_id, tasks[task_id])
        except Exception as e:
            logger.error(f"保存原始转录Markdown失败: {e}")
        
        # 更新状态：优化转录文本
        tasks[task_id].update({
            "progress": 55,
            "message": "正在优化转录文本..."
        })
        save_tasks(tasks)
        await broadcast_task_update(task_id, tasks[task_id])
        
        # 优化转录文本：修正错别字，按含义分段
        _t2 = asyncio.create_task(_simulate_progress(task_id, 55, 76, interval=8))
        try:
            script = await request_summarizer.optimize_transcript(raw_script)
        finally:
            _t2.cancel()
            try: await _t2
            except asyncio.CancelledError: pass
        
        # 为转录文本添加标题，并在结尾添加来源链接
        script_with_title = f"# {video_title}\n\n{script}\n\nsource: {url}\n"
        
        # 检查是否需要翻译
        detected_language = transcriber.get_detected_language(raw_script)
        logger.info(f"检测到的语言: {detected_language}, 摘要语言: {summary_language}")
        
        translation_content = None
        translation_filename = None
        translation_path = None
        
        if detected_language and translator.should_translate(detected_language, summary_language):
            logger.info(f"需要翻译: {detected_language} -> {summary_language}")
            # 更新状态：生成翻译
            tasks[task_id].update({
                "progress": 70,
                "message": "正在生成翻译..."
            })
            save_tasks(tasks)
            await broadcast_task_update(task_id, tasks[task_id])
            
            # 翻译转录文本
            _t3 = asyncio.create_task(_simulate_progress(task_id, 70, 78, interval=8))
            try:
                translation_content = await translator.translate_text(script, summary_language, detected_language)
            finally:
                _t3.cancel()
                try: await _t3
                except asyncio.CancelledError: pass
            translation_with_title = f"# {video_title}\n\n{translation_content}\n\nsource: {url}\n"
            
            # 保存翻译到文件
            translation_filename = f"translation_{safe_title}_{short_id}.md"
            translation_path = TEMP_DIR / translation_filename
            async with aiofiles.open(translation_path, "w", encoding="utf-8") as f:
                await f.write(translation_with_title)
        else:
            logger.info(f"不需要翻译: detected_language={detected_language}, summary_language={summary_language}, should_translate={translator.should_translate(detected_language, summary_language) if detected_language else 'N/A'}")
        
        # 更新状态：生成摘要
        tasks[task_id].update({
            "progress": 80,
            "message": "正在生成摘要..."
        })
        save_tasks(tasks)
        await broadcast_task_update(task_id, tasks[task_id])
        
        # 生成摘要
        _t4 = asyncio.create_task(_simulate_progress(task_id, 80, 97, interval=8))
        try:
            summary = await request_summarizer.summarize(script, summary_language, video_title)
        finally:
            _t4.cancel()
            try: await _t4
            except asyncio.CancelledError: pass
        summary_with_source = summary + f"\n\nsource: {url}\n"
        
        # 保存优化后的转录文本到文件
        script_filename = f"transcript_{task_id}.md"
        script_path = TEMP_DIR / script_filename
        async with aiofiles.open(script_path, "w", encoding="utf-8") as f:
            await f.write(script_with_title)
        
        # 重命名为新规则：transcript_标题_短ID.md
        new_script_filename = f"transcript_{safe_title}_{short_id}.md"
        new_script_path = TEMP_DIR / new_script_filename
        try:
            if script_path.exists():
                script_path.rename(new_script_path)
                script_path = new_script_path
        except Exception as _:
            # 如重命名失败，继续使用原路径
            pass

        # 保存摘要到文件（summary_标题_短ID.md）
        summary_filename = f"summary_{safe_title}_{short_id}.md"
        summary_path = TEMP_DIR / summary_filename
        async with aiofiles.open(summary_path, "w", encoding="utf-8") as f:
            await f.write(summary_with_source)
        
        # 更新状态：完成
        task_result = {
            "status": "completed",
            "progress": 100,
            "message": "处理完成！",
            "video_title": video_title,
            "raw_script": raw_script or "",
            "script": script_with_title,
            "summary": summary_with_source,
            "script_path": str(script_path),
            "summary_path": str(summary_path),
            "short_id": short_id,
            "safe_title": safe_title,
            "detected_language": detected_language,
            "summary_language": summary_language
        }
        
        # 如果有翻译，添加翻译信息
        if translation_content and translation_path:
            task_result.update({
                "translation": translation_with_title,
                "translation_path": str(translation_path),
                "translation_filename": translation_filename
            })
        
        tasks[task_id].update(task_result)
        save_tasks(tasks)
        logger.info(f"任务完成，准备广播最终状态: {task_id}")
        await broadcast_task_update(task_id, tasks[task_id])
        logger.info(f"最终状态已广播: {task_id}")
        
        # 从处理列表中移除URL
        processing_urls.discard(url)
        
        # 从活跃任务列表中移除
        if task_id in active_tasks:
            del active_tasks[task_id]
        
        # 不要立即删除临时文件！保留给用户下载
        # 文件会在一定时间后自动清理或用户手动清理
            
    except Exception as e:
        logger.error(f"任务 {task_id} 处理失败: {str(e)}")
        # 从处理列表中移除URL
        processing_urls.discard(url)
        
        # 从活跃任务列表中移除
        if task_id in active_tasks:
            del active_tasks[task_id]
            
        tasks[task_id].update({
            "status": "error",
            "error": str(e),
            "message": f"处理失败: {str(e)}"
        })
        save_tasks(tasks)
        await broadcast_task_update(task_id, tasks[task_id])

@app.get("/api/task-status/{task_id}")
async def get_task_status(task_id: str):
    """
    获取任务状态
    """
    if task_id not in tasks:
        raise HTTPException(status_code=404, detail="任务不存在")
    
    return tasks[task_id]

@app.get("/api/task-stream/{task_id}")
async def task_stream(task_id: str):
    """
    SSE实时任务状态流
    """
    if task_id not in tasks:
        raise HTTPException(status_code=404, detail="任务不存在")
    
    async def event_generator():
        # 创建任务专用的队列
        queue = asyncio.Queue()
        
        # 将队列添加到连接列表
        if task_id not in sse_connections:
            sse_connections[task_id] = []
        sse_connections[task_id].append(queue)
        
        try:
            # 立即发送当前状态
            current_task = tasks.get(task_id, {})
            yield f"data: {json.dumps(current_task, ensure_ascii=False)}\n\n"
            
            # 持续监听状态更新
            while True:
                try:
                    # 等待状态更新，超时时间30秒发送心跳
                    data = await asyncio.wait_for(queue.get(), timeout=30.0)
                    yield f"data: {data}\n\n"
                    
                    # 如果任务完成或失败，结束流
                    task_data = json.loads(data)
                    if task_data.get("status") in ["completed", "error"]:
                        break
                        
                except asyncio.TimeoutError:
                    # 发送心跳保持连接
                    yield f"data: {json.dumps({'type': 'heartbeat'}, ensure_ascii=False)}\n\n"
                    
        except asyncio.CancelledError:
            logger.info(f"SSE连接被取消: {task_id}")
        except Exception as e:
            logger.error(f"SSE流异常: {e}")
        finally:
            # 清理连接
            if task_id in sse_connections and queue in sse_connections[task_id]:
                sse_connections[task_id].remove(queue)
                if not sse_connections[task_id]:
                    del sse_connections[task_id]
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET",
            "Access-Control-Allow-Headers": "Cache-Control"
        }
    )

@app.get("/api/download/{filename}")
async def download_file(filename: str):
    """
    直接从temp目录下载文件（简化方案）
    """
    try:
        # 检查文件扩展名安全性
        if not filename.endswith('.md'):
            raise HTTPException(status_code=400, detail="仅支持下载.md文件")
        
        # 检查文件名格式（防止路径遍历攻击）
        if '..' in filename or '/' in filename or '\\' in filename:
            raise HTTPException(status_code=400, detail="文件名格式无效")
            
        file_path = TEMP_DIR / filename
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="文件不存在")
            
        return FileResponse(
            file_path,
            filename=filename,
            media_type="text/markdown"
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"下载文件失败: {e}")
        raise HTTPException(status_code=500, detail=f"下载失败: {str(e)}")


@app.delete("/api/task/{task_id}")
async def delete_task(task_id: str):
    """
    取消并删除任务
    """
    if task_id not in tasks:
        raise HTTPException(status_code=404, detail="任务不存在")
    
    # 如果任务还在运行，先取消它
    if task_id in active_tasks:
        task = active_tasks[task_id]
        if not task.done():
            task.cancel()
            logger.info(f"任务 {task_id} 已被取消")
        del active_tasks[task_id]

    # 如果任务还在队列中，移除之
    if task_id in _queue_list:
        _queue_list.remove(task_id)
    _task_params.pop(task_id, None)

    # 从处理URL列表中移除
    task_url = tasks[task_id].get("url")
    if task_url:
        processing_urls.discard(task_url)
    
    # 删除任务记录
    del tasks[task_id]
    save_tasks(tasks)
    return {"message": "任务已取消并删除"}

@app.get("/api/tasks/active")
async def get_active_tasks():
    """
    获取当前活跃任务列表（用于调试）
    """
    active_count = len(active_tasks)
    processing_count = len(processing_urls)
    return {
        "active_tasks": active_count,
        "processing_urls": processing_count,
        "task_ids": list(active_tasks.keys())
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)


# ── Serve history page ─────────────────────────────────────────────────────────
@app.get("/history")
async def history_page():
    return FileResponse(str(PROJECT_ROOT / "static" / "history.html"))


# ── Auth endpoints ─────────────────────────────────────────────────────────────
from fastapi import Header as FastAPIHeader

@app.post("/api/auth/register")
async def register(
    username: str = Form(...),
    password: str = Form(...),
):
    if len(username) < 2 or len(username) > 30:
        raise HTTPException(400, "用户名长度须在 2-30 个字符之间")
    if len(password) < 6:
        raise HTTPException(400, "密码至少 6 位")
    db: Session = SessionLocal()
    try:
        existing = db.query(User).filter(User.username == username).first()
        if existing:
            raise HTTPException(400, "用户名已存在")
        user = User(username=username, password_hash=auth_module.hash_password(password))
        db.add(user)
        db.commit()
        db.refresh(user)
        token = auth_module.create_token(user.id, user.username)
        return {"token": token, "username": user.username, "user_id": user.id}
    finally:
        db.close()


@app.post("/api/auth/login")
async def login(
    username: str = Form(...),
    password: str = Form(...),
):
    db: Session = SessionLocal()
    try:
        user = db.query(User).filter(User.username == username).first()
        if not user or not auth_module.verify_password(password, user.password_hash):
            raise HTTPException(401, "用户名或密码错误")
        token = auth_module.create_token(user.id, user.username)
        return {"token": token, "username": user.username, "user_id": user.id}
    finally:
        db.close()


@app.get("/api/auth/me")
async def get_me(authorization: Optional[str] = FastAPIHeader(default=None)):
    user_data = _get_user_from_request(authorization)
    if not user_data:
        raise HTTPException(401, "未登录或 Token 已过期")
    return {"username": user_data["username"], "user_id": user_data["user_id"]}


# ── History API ────────────────────────────────────────────────────────────────
@app.get("/api/history")
async def get_history(
    authorization: Optional[str] = FastAPIHeader(default=None),
    limit: int = 50,
    offset: int = 0,
):
    user_data = _get_user_from_request(authorization)
    if not user_data:
        raise HTTPException(401, "需要登录")
    db: Session = SessionLocal()
    try:
        items = (
            db.query(HistoryModel)
            .filter(HistoryModel.user_id == user_data["user_id"])
            .order_by(HistoryModel.created_at.desc())
            .offset(offset).limit(limit).all()
        )
        total = db.query(HistoryModel).filter(HistoryModel.user_id == user_data["user_id"]).count()
        return {
            "items": [
                {
                    "id": h.id, "task_id": h.task_id, "title": h.title,
                    "url": h.url, "raw_script": h.raw_script, "script": h.script,
                    "summary": h.summary, "translation": h.translation,
                    "detected_language": h.detected_language, "summary_language": h.summary_language,
                    "safe_title": h.safe_title, "short_id": h.short_id,
                    "date": h.created_at.isoformat() if h.created_at else "",
                }
                for h in items
            ],
            "total": total,
        }
    finally:
        db.close()


@app.get("/api/history/by-url")
async def get_history_by_url(
    url: str,
    authorization: Optional[str] = FastAPIHeader(default=None),
):
    """Check if a URL already exists in this user's history."""
    user_data = _get_user_from_request(authorization)
    if not user_data:
        raise HTTPException(401, "需要登录")
    db: Session = SessionLocal()
    try:
        h = (
            db.query(HistoryModel)
            .filter(HistoryModel.user_id == user_data["user_id"], HistoryModel.url == url)
            .order_by(HistoryModel.created_at.desc())
            .first()
        )
        if not h:
            return {"found": False}
        return {
            "found": True,
            "item": {
                "id": h.id, "task_id": h.task_id, "title": h.title,
                "url": h.url, "raw_script": h.raw_script, "script": h.script,
                "summary": h.summary, "translation": h.translation,
                "detected_language": h.detected_language,
                "summary_language": h.summary_language,
                "safe_title": h.safe_title, "short_id": h.short_id,
                "date": h.created_at.isoformat() if h.created_at else "",
            }
        }
    finally:
        db.close()


@app.post("/api/history")
async def save_history_entry(
    task_id:           str = Form(default=""),
    title:             str = Form(default=""),
    url:               str = Form(default=""),
    raw_script:        str = Form(default=""),
    script:            str = Form(default=""),
    summary:           str = Form(default=""),
    translation:       str = Form(default=""),
    detected_language: str = Form(default=""),
    summary_language:  str = Form(default=""),
    safe_title:        str = Form(default=""),
    short_id:          str = Form(default=""),
    authorization: Optional[str] = FastAPIHeader(default=None),
):
    user_data = _get_user_from_request(authorization)
    if not user_data:
        raise HTTPException(401, "需要登录")
    db: Session = SessionLocal()
    try:
        existing = None
        if task_id:
            existing = db.query(HistoryModel).filter(
                HistoryModel.user_id == user_data["user_id"],
                HistoryModel.task_id == task_id,
            ).first()
        if existing:
            existing.title = title; existing.raw_script = raw_script
            existing.script = script; existing.summary = summary
            existing.translation = translation; existing.detected_language = detected_language
            existing.summary_language = summary_language; existing.safe_title = safe_title
            existing.short_id = short_id; existing.url = url
            db.commit()
            return {"id": existing.id, "created": False}
        else:
            h = HistoryModel(
                user_id=user_data["user_id"], task_id=task_id, title=title, url=url,
                raw_script=raw_script, script=script, summary=summary,
                translation=translation, detected_language=detected_language,
                summary_language=summary_language, safe_title=safe_title, short_id=short_id,
            )
            db.add(h); db.commit(); db.refresh(h)
            return {"id": h.id, "created": True}
    finally:
        db.close()


@app.delete("/api/history/{history_id}")
async def delete_history_entry(
    history_id: int,
    authorization: Optional[str] = FastAPIHeader(default=None),
):
    user_data = _get_user_from_request(authorization)
    if not user_data:
        raise HTTPException(401, "需要登录")
    db: Session = SessionLocal()
    try:
        h = db.query(HistoryModel).filter(
            HistoryModel.id == history_id,
            HistoryModel.user_id == user_data["user_id"],
        ).first()
        if not h:
            raise HTTPException(404, "记录不存在")
        db.delete(h); db.commit()
        return {"message": "已删除"}
    finally:
        db.close()
