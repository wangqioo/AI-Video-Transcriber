import os
from passlib.context import CryptContext
from jose import JWTError, jwt
from datetime import datetime, timedelta
from typing import Optional

SECRET_KEY = os.getenv('SECRET_KEY', 'ai-video-transcriber-secret-key-2026-sipsip')
ALGORITHM  = 'HS256'
TOKEN_DAYS = 30

pwd_context = CryptContext(schemes=['bcrypt'], deprecated='auto')


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def create_token(user_id: int, username: str) -> str:
    exp = datetime.utcnow() + timedelta(days=TOKEN_DAYS)
    payload = {'sub': str(user_id), 'username': username, 'exp': exp}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> Optional[dict]:
    try:
        p = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return {'user_id': int(p['sub']), 'username': p['username']}
    except Exception:
        return None
