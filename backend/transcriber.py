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

        logger.info(f'开始转录（via whisper-server）: {audio_path}')

        data = {'temperature': '0', 'response_format': 'json'}
        if language:
            data['language'] = language

        try:
            async with httpx.AsyncClient(timeout=300.0) as client:
                with open(audio_path, 'rb') as f:
                    resp = await client.post(
                        WHISPER_SERVER_URL,
                        files={'file': (os.path.basename(audio_path), f)},
                        data=data,
                    )
                resp.raise_for_status()
                result = resp.json()
        except Exception as e:
            logger.error(f'whisper-server 调用失败: {e}')
            raise Exception(f'转录失败: {e}')

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
