from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from database import Base


class User(Base):
    __tablename__ = 'users'
    id            = Column(Integer, primary_key=True, index=True)
    username      = Column(String(50), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    created_at    = Column(DateTime, default=datetime.utcnow)
    history       = relationship('History', back_populates='user', cascade='all, delete-orphan')


class History(Base):
    __tablename__ = 'history'
    id                = Column(Integer, primary_key=True, index=True)
    user_id           = Column(Integer, ForeignKey('users.id'), nullable=False)
    task_id           = Column(String(50), default='')
    title             = Column(String(500), default='')
    url               = Column(Text, default='')
    raw_script        = Column(Text, default='')
    script            = Column(Text, default='')
    summary           = Column(Text, default='')
    translation       = Column(Text, default='')
    detected_language = Column(String(20), default='')
    summary_language  = Column(String(20), default='')
    safe_title        = Column(String(200), default='')
    short_id          = Column(String(20), default='')
    created_at        = Column(DateTime, default=datetime.utcnow)
    user              = relationship('User', back_populates='history')
