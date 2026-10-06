import os
import random
import asyncio
from typing import List, Optional
from datetime import datetime, timedelta
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

BOT_TOKEN = os.getenv("BOT_TOKEN", "8752920626:AAFTkqldcmMOS1VhyI7ttaMLR2D3nmQkPc0")
WEBAPP_URL = os.getenv("WEBAPP_URL", "https://loot-manager-bot.onrender.com")

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
    bids = relationship("BidDB", back_populates="user")

class ItemDB(Base):
    __tablename__ = "items"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    category = Column(String, nullable=False)  # "Экипировка", "Материалы", "Гербы"
    properties = Column(String, nullable=True) # например: "Четырехкратный взрыв, Удача III"
    count = Column(Integer, default=1)
    required_class = Column(String, nullable=True) # Ограничение по классу ("Маг", "Все")
    round_id = Column(Integer, ForeignKey("loot_rounds.id"), nullable=True)

class LootRoundDB(Base):
    __tablename__ = "loot_rounds"

    id = Column(Integer, primary_key=True, index=True)
    status = Column(String, default="active") # "active" или "finished"
    created_at = Column(DateTime, default=datetime.utcnow)
    end_time = Column(DateTime, nullable=False)

class BidDB(Base):
    __tablename__ = "bids"

    id = Column(Integer, primary_key=True, index=True)
    round_id = Column(Integer, ForeignKey("loot_rounds.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    item_id = Column(Integer, ForeignKey("items.id"), nullable=False)
    roll_result = Column(Integer, nullable=True)

    user = relationship("UserDB", back_populates="bids")

# Автоматическое создание всех таблиц при запуске
Base.metadata.create_all(bind=engine)

# ==================== PYDANTIC СХЕМЫ ====================

class UserCreateSchema(BaseModel):
    tg_id: int
    nickname: str
    character_class: str

class PenaltyCreateSchema(BaseModel):
    tg_id: int
    reason: str
    amount: int

class LootCreateSchema(BaseModel):
    name: str
    item_type: str = "Экипировка"
    req_class: str = "Все"
    duration_seconds: int = 180

class LootRollSchema(BaseModel):
    tg_id: int
    item_id: int

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

# ----------------- ПОЛЬЗОВАТЕЛИ И ШТРАФЫ -----------------

@app.post("/api/users/register")
async def register_user(user_data: UserCreateSchema, db: Session = Depends(get_db)):
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
    return {"status": "ok", "user": {"id": db_user.id, "nickname": db_user.nickname, "class": db_user.character_class, "role": db_user.role}}

@app.get("/api/users/{tg_id}")
async def get_user(tg_id: int, db: Session = Depends(get_db)):
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

@app.post("/api/penalties/add")
async def add_penalty(data: PenaltyCreateSchema, db: Session = Depends(get_db)):
    db_user = db.query(UserDB).filter(UserDB.tg_id == data.tg_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="Игрок не найден")
    
    penalty = PenaltyDB(user_id=db_user.id, reason=data.reason, amount=data.amount)
    db.add(penalty)
    db.commit()
    return {"status": "ok", "message": f"Штраф {data.amount} выдан игроку {db_user.nickname}"}

# ----------------- РАСПРЕДЕЛЕНИЕ ЛУТА (РОЛЛЫ) -----------------

@app.get("/api/loot")
async def get_loot_list(db: Session = Depends(get_db)):
    """Получение всех предметов лута и текущих заявок участников"""
    items = db.query(LootItemDB).order_by(LootItemDB.created_at.desc()).all()
    now = datetime.utcnow()
    
    result = []
    for item in items:
        expires_at = item.created_at + timedelta(seconds=item.duration_seconds)
        time_left = int((expires_at - now).total_seconds())
        is_active = time_left > 0

        # Формируем список участников с подсчитанными баллами ролла
        requests_data = []
        for req in item.requests:
            requests_data.append({
                "user_id": req.user.tg_id,
                "nickname": req.user.nickname,
                "character_class": req.user.character_class,
                "raw_roll": req.raw_roll,
                "final_roll": req.final_roll
            })
        
        # Сортируем участников по итоговым очкам (по убыванию)
        requests_data.sort(key=lambda x: x["final_roll"], reverse=True)

        result.append({
            "id": item.id,
            "name": item.name,
            "item_type": item.item_type,
            "req_class": item.req_class,
            "time_left": max(0, time_left),
            "is_active": is_active,
            "requests": requests_data
        })
    return result

@app.post("/api/loot/create")
async def create_loot_item(data: LootCreateSchema, db: Session = Depends(get_db)):
    """Создание предмета для розыгрыша (РЛ / Офицер)"""
    item = LootItemDB(
        name=data.name,
        item_type=data.item_type,
        req_class=data.req_class,
        duration_seconds=data.duration_seconds
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return {"status": "ok", "item_id": item.id}

@app.post("/api/loot/roll")
async def roll_loot_item(data: LootRollSchema, db: Session = Depends(get_db)):
    """Бросок кубика игроком на конкретный предмет"""
    db_user = db.query(UserDB).filter(UserDB.tg_id == data.tg_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
        
    item = db.query(LootItemDB).filter(LootItemDB.id == data.item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Предмет не найден")

    # Проверка таймера
    expires_at = item.created_at + timedelta(seconds=item.duration_seconds)
    if datetime.utcnow() > expires_at:
        raise HTTPException(status_code=400, detail="Время розыгрыша этого предмета истекло")

    # Проверка на повторный бросок
    existing_req = db.query(LootRequestDB).filter(
        LootRequestDB.item_id == item.id,
        LootRequestDB.user_id == db_user.id
    ).first()
    if existing_req:
        raise HTTPException(status_code=400, detail="Вы уже сделали бросок на этот предмет")

    # Генерация ролла 1-100 и вычет штрафных очков
    raw_roll = random.randint(1, 100)
    total_penalties = sum(p.amount for p in db_user.penalties)
    final_roll = max(1, raw_roll - total_penalties)

    loot_request = LootRequestDB(
        item_id=item.id,
        user_id=db_user.id,
        raw_roll=raw_roll,
        final_roll=final_roll
    )
    db.add(loot_request)
    db.commit()

    return {
        "status": "ok",
        "raw_roll": raw_roll,
        "penalty_applied": total_penalties,
        "final_roll": final_roll
    }

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

import random
from datetime import timedelta

# Схемы данных
class CreateItemSchema(BaseModel):
    title: str
    category: str
    properties: Optional[str] = None
    count: Optional[int] = 1
    required_class: Optional[str] = "Все"

class BidSchema(BaseModel):
    tg_id: int
    item_id: int

# 1. Добавление предмета админом
@app.post("/api/items/create")
async def create_item(data: CreateItemSchema, db: Session = Depends(get_db)):
    item = ItemDB(**data.dict())
    db.add(item)
    db.commit()
    return {"status": "ok", "item_id": item.id}

# 2. Запуск раунда распределения на 3 минуты
@app.post("/api/rounds/start")
async def start_round(db: Session = Depends(get_db)):
    end_time = datetime.utcnow() + timedelta(minutes=3)
    new_round = LootRoundDB(end_time=end_time)
    db.add(new_round)
    db.commit()

    # Привязываем все незадействованные предметы к новому раунду
    db.query(ItemDB).filter(ItemDB.round_id == None).update({"round_id": new_round.id})
    db.commit()

    return {"status": "ok", "round_id": new_round.id, "end_time": end_time}

# 3. Подача заявки игроком ("Кнопка ХОЧУ")
@app.post("/api/bids/add")
async def add_bid(data: BidSchema, db: Session = Depends(get_db)):
    user = db.query(UserDB).filter(UserDB.tg_id == data.tg_id).first()
    item = db.query(ItemDB).filter(ItemDB.id == data.item_id).first()

    if not user or not item:
        raise HTTPException(status_code=404, detail="Пользователь или предмет не найден")

    # Проверка на класс
    if item.required_class != "Все" and item.required_class != user.character_class:
        raise HTTPException(status_code=400, detail="Предмет не подходит вашему классу!")

    # Расчет штрафа из имеющихся очков
    total_penalty = sum(p.amount for p in user.penalties)
    
    # Генерация ролла 1-100 с учетом штрафа
    base_roll = random.randint(1, 100)
    final_roll = max(1, base_roll - total_penalty)

    # Проверка дубликатов заявок
    existing_bid = db.query(BidDB).filter(BidDB.round_id == item.round_id, BidDB.user_id == user.id, BidDB.item_id == item.id).first()
    if existing_bid:
        return {"status": "already_exists", "roll": existing_bid.roll_result}

    bid = BidDB(round_id=item.round_id, user_id=user.id, item_id=item.id, roll_result=final_roll)
    db.add(bid)
    db.commit()

    return {"status": "ok", "roll": final_roll}

# 4. Получение списка активных предметов раунда
@app.get("/api/rounds/current")
async def get_current_round(db: Session = Depends(get_db)):
    active_round = db.query(LootRoundDB).filter(LootRoundDB.status == "active").order_by(LootRoundDB.id.desc()).first()
    if not active_round:
        return {"active": False}

    items = db.query(ItemDB).filter(ItemDB.round_id == active_round.id).all()
    return {
        "active": True,
        "round_id": active_round.id,
        "end_time": active_round.end_time,
        "items": items
    }
    
# Быстрый способ сделать себя админом
@app.get("/api/admin/promote/{tg_id}")
async def promote_to_admin(tg_id: int, db: Session = Depends(get_db)):
    user = db.query(UserDB).filter(UserDB.tg_id == tg_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    
    user.role = "admin"
    db.commit()
    return {"status": "ok", "message": f"Пользователь {user.nickname} теперь Админ!"}
