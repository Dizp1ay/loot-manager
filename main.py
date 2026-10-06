import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from aiogram import Bot, Dispatcher, Router
from aiogram.types import Message, InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo
from aiogram.filters import CommandStart

BOT_TOKEN = "8752920626:AAFTkqldcmMOS1VhyI7ttaMLR2D3nmQkPc0"
WEBAPP_URL = "https://your-cloudflare-tunnel.trycloudflare.com"

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

app = FastAPI(title="Loot Manager", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {"status": "ok", "message": "Сервер работает!"}
