import os
import asyncio
import logging
import httpx
from typing import Optional

logger = logging.getLogger(__name__)

WHISPER_SERVER_URL = os.getenv(
    'WHISPER_SERVER_URL',
    'http://172.17.0.1:8082/inference'
)


class Transcriber:
    """音频转录器，调用宿主机 whisper.cpp HTTP 服务"""

    def __init__(self, model_size: str = 'base'):
        self.model_size = model_size
        self.last_detected_language = None

    async def transcribe(self, audio_path: str, language: Optional[str] = None) -> str:
        if not os.path.exists(audio_path):
            raise Exception(f'音频文件不存在: {audio_path}')

        file_size_mb = os.path.getsize(audio_path) / 1024 / 1024
        logger.info(f'开始转录（via whisper-server）: {audio_path}，文件大小: {file_size_mb:.1f}MB')

        data = {'temperature': '0', 'response_format': 'json'}
        if language:
            data['language'] = language

        # connect/write 有超时保护，read 不限时（长视频可能需要几十分钟）
        timeout = httpx.Timeout(connect=30.0, write=600.0, read=None, pool=30.0)

        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                with open(audio_path, 'rb') as f:
                    resp = await client.post(
                        WHISPER_SERVER_URL,
                        files={'file': (os.path.basename(audio_path), f)},
                        data=data,
                    )
                resp.raise_for_status()
                result = resp.json()
        except httpx.ConnectError as e:
            logger.error(f'whisper-server 连接失败（服务未启动？）: {e}')
            raise Exception(f'无法连接转录服务，请检查 whisper-server 是否运行: {e}')
        except httpx.WriteTimeout as e:
            logger.error(f'whisper-server 上传音频超时（文件过大？{file_size_mb:.1f}MB）: {e}')
            raise Exception(f'上传音频文件超时: {e}')
        except httpx.HTTPStatusError as e:
            logger.error(f'whisper-server 返回错误状态: {e.response.status_code}, body: {e.response.text[:200]}')
            raise Exception(f'转录服务返回错误 {e.response.status_code}: {e.response.text[:200]}')
        except Exception as e:
            logger.error(f'whisper-server 调用失败 [{type(e).__name__}]: {e}')
            raise Exception(f'转录失败 [{type(e).__name__}]: {e}')

        raw_text = result.get('text', '').strip()
        logger.info(f'转录完成，字符数: {len(raw_text)}')

        detected_language = language or 'zh'
        self.last_detected_language = detected_language

        lines = [
            '# Video Transcription',
            '',
            f'**Detected Language:** {detected_language}',
            '**Language Probability:** 1.00',
            '',
            '## Transcription Content',
            '',
            raw_text,
            '',
        ]
        return '\n'.join(lines)

    def _format_time(self, seconds: float) -> str:
        hours   = int(seconds // 3600)
        minutes = int((seconds % 3600) // 60)
        secs    = int(seconds % 60)
        return f'{hours:02d}:{minutes:02d}:{secs:02d}' if hours else f'{minutes:02d}:{secs:02d}'

    def get_supported_languages(self) -> list:
        return ['zh', 'en', 'ja', 'ko', 'es', 'fr', 'de', 'it', 'pt', 'ru',
                'ar', 'hi', 'th', 'vi', 'tr', 'pl', 'nl', 'sv', 'da', 'no']

    def get_detected_language(self, transcript_text: Optional[str] = None) -> Optional[str]:
        if self.last_detected_language:
            return self.last_detected_language
        if transcript_text and '**Detected Language:**' in transcript_text:
            for line in transcript_text.split('\n'):
                if '**Detected Language:**' in line:
                    return line.split(':')[-1].strip()
        return None
