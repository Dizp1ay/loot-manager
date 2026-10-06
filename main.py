import os
import random
import asyncio
from typing import Optional
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
    role = Column(String, default="player")

    penalties = relationship("PenaltyDB", back_populates="user")
    bids = relationship("BidDB", back_populates="user")

class PenaltyDB(Base):
    __tablename__ = "penalties"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    reason = Column(String, nullable=False)
    amount = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("UserDB", back_populates="penalties")

class ItemDB(Base):
    __tablename__ = "items"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    category = Column(String, nullable=False)
    properties = Column(String, nullable=True)
    count = Column(Integer, default=1)
    required_class = Column(String, nullable=True)
    round_id = Column(Integer, ForeignKey("loot_rounds.id"), nullable=True)

class LootRoundDB(Base):
    __tablename__ = "loot_rounds"

    id = Column(Integer, primary_key=True, index=True)
    status = Column(String, default="active")
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

class CreateItemSchema(BaseModel):
    title: str
    category: str
    properties: Optional[str] = None
    count: Optional[int] = 1
    required_class: Optional[str] = "Все"

class BidSchema(BaseModel):
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
    kb = InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(text="🎮 Открыть Лут-Менеджер", web_app=WebAppInfo(url=WEBAPP_URL))]])
    await message.answer("Привет! Нажми на кнопку ниже, чтобы открыть менеджер лута:", reply_markup=kb)

dp.include_router(router)

# ==================== ТАЙМЕР ЗАВЕРШЕНИЯ РАУНДОВ ====================

async def check_and_finish_rounds():
    while True:
        await asyncio.sleep(10)
        db = SessionLocal()
        try:
            now = datetime.utcnow()
            expired_rounds = db.query(LootRoundDB).filter(LootRoundDB.status == "active", LootRoundDB.end_time <= now).all()

            for rnd in expired_rounds:
                rnd.status = "finished"
                items = db.query(ItemDB).filter(ItemDB.round_id == rnd.id).all()
                results_msg = f"<b>🏆 Итоги раунда #{rnd.id}:</b>\n\n"

                for item in items:
                    top_bid = db.query(BidDB).filter(BidDB.item_id == item.id).order_by(BidDB.roll_result.desc()).first()
                    if top_bid:
                        winner = db.query(UserDB).filter(UserDB.id == top_bid.user_id).first()
                        results_msg += f"📦 <b>{item.title}</b> — Победитель: <b>{winner.nickname}</b> (Ролл: {top_bid.roll_result})\n"
                    else:
                        results_msg += f"📦 <b>{item.title}</b> — Никто не подал заявку\n"

                print(results_msg)

            db.commit()
        except Exception as e:
            print(f"Ошибка при завершении раунда: {e}")
        finally:
            db.close()

@asynccontextmanager
async def lifespan(app: FastAPI):
    polling_task = asyncio.create_task(dp.start_polling(bot))
    timer_task = asyncio.create_task(check_and_finish_rounds())
    yield
    polling_task.cancel()
    timer_task.cancel()

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
        db_user = UserDB(tg_id=user_data.tg_id, nickname=user_data.nickname, character_class=user_data.character_class)
        db.add(db_user)
    db.commit()
    db.refresh(db_user)
    res_user = {"id": db_user.id, "nickname": db_user.nickname, "class": db_user.character_class, "role": db_user.role}
    return {"status": "ok", "user": res_user}

@app.get("/api/users/{tg_id}")
async def get_user(tg_id: int, db: Session = Depends(get_db)):
    db_user = db.query(UserDB).filter(UserDB.tg_id == tg_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    
    penalties = [{"id": p.id, "reason": p.reason, "amount": p.amount, "created_at": p.created_at.strftime("%Y-%m-%d %H:%M")} for p in db_user.penalties]
    total_penalties = sum(p.amount for p in db_user.penalties)
    
    return {"tg_id": db_user.tg_id, "nickname": db_user.nickname, "character_class": db_user.character_class, "role": db_user.role, "total_penalties": total_penalties, "penalties": penalties}

@app.get("/api/admin/promote/{tg_id}")
async def promote_to_admin(tg_id: int, db: Session = Depends(get_db)):
    user = db.query(UserDB).filter(UserDB.tg_id == tg_id).first()
    if not user:
        user = UserDB(tg_id=tg_id, nickname=f"Admin_{tg_id}", character_class="Администратор", role="admin")
        db.add(user)
        db.commit()
        return {"status": "ok", "message": f"Пользователь с ID {tg_id} был создан и назначен Админом!"}
    
    user.role = "admin"
    db.commit()
    return {"status": "ok", "message": f"Пользователь {user.nickname} теперь Админ!"}

@app.post("/api/penalties/add")
async def add_penalty(data: PenaltyCreateSchema, db: Session = Depends(get_db)):
    db_user = db.query(UserDB).filter(UserDB.tg_id == data.tg_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="Игрок не найден")
    
    penalty = PenaltyDB(user_id=db_user.id, reason=data.reason, amount=data.amount)
    db.add(penalty)
    db.commit()
    return {"status": "ok", "message": f"Штраф {data.amount} выдан игроку {db_user.nickname}"}

# ----------------- РАСПРЕДЕЛЕНИЕ ЛУТА -----------------

@app.post("/api/items/create")
async def create_item(data: CreateItemSchema, db: Session = Depends(get_db)):
    item = ItemDB(**data.dict())
    db.add(item)
    db.commit()
    return {"status": "ok", "item_id": item.id}

@app.post("/api/rounds/start")
async def start_round(db: Session = Depends(get_db)):
    end_time = datetime.utcnow() + timedelta(minutes=3)
    new_round = LootRoundDB(end_time=end_time)
    db.add(new_round)
    db.commit()

    db.query(ItemDB).filter(ItemDB.round_id == None).update({"round_id": new_round.id})
    db.commit()

    return {"status": "ok", "round_id": new_round.id, "end_time": end_time}

@app.post("/api/bids/add")
async def add_bid(data: BidSchema, db: Session = Depends(get_db)):
    user = db.query(UserDB).filter(UserDB.tg_id == data.tg_id).first()
    item = db.query(ItemDB).filter(ItemDB.id == data.item_id).first()

    if not user or not item:
        raise HTTPException(status_code=404, detail="Пользователь или предмет не найден")

    if item.required_class != "Все" and item.required_class != user.character_class:
        raise HTTPException(status_code=400, detail="Предмет не подходит вашему классу!")

    total_penalty = sum(p.amount for p in user.penalties)
    base_roll = random.randint(1, 100)
    final_roll = max(1, base_roll - total_penalty)

    existing_bid = db.query(BidDB).filter(BidDB.round_id == item.round_id, BidDB.user_id == user.id, BidDB.item_id == item.id).first()
    if existing_bid:
        return {"status": "already_exists", "roll": existing_bid.roll_result}

    bid = BidDB(round_id=item.round_id, user_id=user.id, item_id=item.id, roll_result=final_roll)
    db.add(bid)
    db.commit()

    return {"status": "ok", "roll": final_roll}

@app.get("/api/rounds/current")
async def get_current_round(db: Session = Depends(get_db)):
    active_round = db.query(LootRoundDB).filter(LootRoundDB.status == "active").order_by(LootRoundDB.id.desc()).first()
    if not active_round:
        return {"active": False, "items": []}

    items = db.query(ItemDB).filter(ItemDB.round_id == active_round.id).all()
    return {"active": True, "round_id": active_round.id, "end_time": active_round.end_time, "items": items}

# ----------------- РАЗДАЧА СТАТИКИ REACT -----------------

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIST = os.path.join(BASE_DIR, "frontend", "dist")

if os.path.exists(FRONTEND_DIST):
    assets_dir = os.path.join(FRONTEND_DIST, "assets")
    if os.path.exists(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        if full_path.startswith("api"):
            raise HTTPException(status_code=404, detail="API endpoint not found")
        return FileResponse(os.path.join(FRONTEND_DIST, "index.html"))
else:
    @app.get("/")
    async def root():
        return {"status": "ok", "message": "Бэкенд работает. Фронтенд еще не собран."}
