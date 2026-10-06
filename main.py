import os
import asyncio
from typing import List, Optional
from datetime import datetime
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel

from sqlalchemy import create_engine, Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import declarative_base, sessionmaker, Session, relationship

from aiogram import Bot, Dispatcher, Router
from aiogram.types import Message, InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo
from aiogram.filters import CommandStart

# ==================== НАСТРОЙКИ И ИНИЦИАЛИЗАЦИЯ ====================

BOT_TOKEN = "8752920626:AAFTkqldcmMOS1VhyI7ttaMLR2D3nmQkPc0"
WEBAPP_URL = "https://loot-manager-bot.onrender.com"  # Ваша ссылка с Render

# Настройка SQLite БД
DATABASE_URL = "sqlite:///./loot.db"
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# ==================== МОДЕЛИ БАЗЫ ДАННЫХ ====================

class UserDB(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    tg_id = Column(Integer, unique=True, index=True, nullable=False)
    nickname = Column(String, nullable=False)
    character_class = Column(String, nullable=False)
    role = Column(String, default="player")  # "player" или "admin"
    penalties = relationship("PenaltyDB", back_populates="user")

class PenaltyDB(Base):
    __tablename__ = "penalties"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    reason = Column(String, nullable=False)
    amount = Column(Integer, nullable=False)  # Размер штрафа (например, DKP или золотые)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    user = relationship("UserDB", back_populates="penalties")

Base.metadata.create_all(bind=engine)

# ==================== PYDANTIC СХЕМЫ (для запросов) ====================

class UserCreateSchema(BaseModel):
    tg_id: int
    nickname: str
    character_class: str

class PenaltyCreateSchema(BaseModel):
    tg_id: int
    reason: str
    amount: int

# Зависимость для получения сессии БД
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# ==================== TELEGRAM BOT ====================

bot = Bot(token=BOT_TOKEN)
dp = Dispatcher()
router = Router()

@router.message(CommandStart())
async def start_cmd(message: Message):
    kb = InlineKeyboardMarkup(
        inline_keyboard=[[
            InlineKeyboardButton(
                text="🎮 Открыть Лут-Менеджер", 
                web_app=WebAppInfo(url=WEBAPP_URL)
            )
        ]]
    )
    await message.answer("Привет! Нажми на кнопку ниже, чтобы открыть менеджер лута:", reply_markup=kb)

dp.include_router(router)

@asynccontextmanager
async def lifespan(app: FastAPI):
    polling_task = asyncio.create_task(dp.start_polling(bot))
    yield
    polling_task.cancel()

# ==================== FASTAPI APP ====================

app = FastAPI(title="Loot Manager API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ----------------- API ЭНДПОИНТЫ: ПОЛЬЗОВАТЕЛИ -----------------

@app.post("/api/users/register")
async def register_user(user_data: UserCreateSchema, db: Session = Depends(get_db)):
    """Регистрация или обновление профиля игрока"""
    db_user = db.query(UserDB).filter(UserDB.tg_id == user_data.tg_id).first()
    
    if db_user:
        db_user.nickname = user_data.nickname
        db_user.character_class = user_data.character_class
    else:
        db_user = UserDB(
            tg_id=user_data.tg_id,
            nickname=user_data.nickname,
            character_class=user_data.character_class
        )
        db.add(db_user)
    
    db.commit()
    db.refresh(db_user)
    return {"status": "ok", "user": {"id": db_user.id, "nickname": db_user.nickname, "class": db_user.character_class}}

@app.get("/api/users/{tg_id}")
async def get_user(tg_id: int, db: Session = Depends(get_db)):
    """Получение профиля игрока и его штрафов"""
    db_user = db.query(UserDB).filter(UserDB.tg_id == tg_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    
    penalties = [
        {"id": p.id, "reason": p.reason, "amount": p.amount, "created_at": p.created_at.strftime("%Y-%m-%d %H:%M")}
        for p in db_user.penalties
    ]
    
    total_penalties = sum(p.amount for p in db_user.penalties)
    
    return {
        "tg_id": db_user.tg_id,
        "nickname": db_user.nickname,
        "character_class": db_user.character_class,
        "role": db_user.role,
        "total_penalties": total_penalties,
        "penalties": penalties
    }

# ----------------- API ЭНДПОИНТЫ: ШТРАФЫ -----------------

@app.post("/api/penalties/add")
async def add_penalty(data: PenaltyCreateSchema, db: Session = Depends(get_db)):
    """Выдача штрафа игроку (доступно РЛ/Офицерам)"""
    db_user = db.query(UserDB).filter(UserDB.tg_id == data.tg_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="Игрок с таким Telegram ID не найден")
    
    penalty = PenaltyDB(
        user_id=db_user.id,
        reason=data.reason,
        amount=data.amount
    )
    db.add(penalty)
    db.commit()
    
    return {"status": "ok", "message": f"Штраф {data.amount} очков выдан игроку {db_user.nickname}"}

# ----------------- РАЗДАЧА СТАТИКИ REACT -----------------

dist_path = os.path.join(os.path.dirname(__file__), "frontend", "dist")

if os.path.exists(dist_path):
    app.mount("/assets", StaticFiles(directory=os.path.join(dist_path, "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_react(full_path: str):
        return FileResponse(os.path.join(dist_path, "index.html"))
else:
    @app.get("/")
    async def root():
        return {"status": "ok", "message": "Бэкенд работает. Фронтенд еще не собран."}
