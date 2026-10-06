import React, { useState, useEffect } from 'react';

const CLASSES = [
  "Воин", "Жрец", "Чернокнижник", "Маг", 
  "Разбойник", "Лучник"
];

export default function App() {
  const [activeTab, setActiveTab] = useState('auction'); // auction, profile, admin
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Данные профиля
  const [nickname, setNickname] = useState('');
  const [characterClass, setCharacterClass] = useState(CLASSES[0]);
  const [isEditingProfile, setIsEditingProfile] = useState(false);

  // Админка
  const [itemTitle, setItemTitle] = useState('');
  const [itemCategory, setItemCategory] = useState('Оружие');
  const [itemClass, setItemClass] = useState('Все');

  const [penaltyTgId, setPenaltyTgId] = useState('');
  const [penaltyReason, setPenaltyReason] = useState('');
  const [penaltyAmount, setPenaltyAmount] = useState(10);

  // Аукцион и Таймер
  const [currentRound, setCurrentRound] = useState(null);
  const [userBids, setUserBids] = useState({});
  const [timeLeft, setTimeLeft] = useState(0);

  const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user;
  const tgId = tgUser?.id || 360086878;

  const fetchUserData = async () => {
    try {
      const res = await fetch(`/api/users/${tgId}`);
      if (res.ok) {
        const data = await res.json();
        setUser(data);
        setNickname(data.nickname);
        if (CLASSES.includes(data.character_class)) {
          setCharacterClass(data.character_class);
        }
      } else {
        setIsEditingProfile(true);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchCurrentRound = async () => {
    try {
      const res = await fetch(`/api/rounds/current?tg_id=${tgId}`);
      if (res.ok) {
        const data = await res.json();
        setCurrentRound(data);
        if (data.user_bids) {
          setUserBids(data.user_bids);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchUserData();
    fetchCurrentRound();
    const interval = setInterval(fetchCurrentRound, 5000); // авто-обновление каждые 5 сек
    return () => clearInterval(interval);
  }, []);

  // Таймер обратного отсчета
  useEffect(() => {
    if (!currentRound?.active || !currentRound?.end_time) {
      setTimeLeft(0);
      return;
    }

    const updateTimer = () => {
      const end = new Date(currentRound.end_time + "Z").getTime();
      const now = new Date().getTime();
      const diff = Math.max(0, Math.floor((end - now) / 1000));
      setTimeLeft(diff);
      if (diff === 0) fetchCurrentRound();
    };

    updateTimer();
    const timerId = setInterval(updateTimer, 1000);
    return () => clearInterval(timerId);
  }, [currentRound]);

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    const res = await fetch('/api/users/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tg_id: tgId, nickname: nickname || `Player_${tgId}`, character_class: characterClass })
    });
    if (res.ok) {
      alert("Профиль успешно обновлен!");
      setIsEditingProfile(false);
      fetchUserData();
    }
  };

  const handleCreateItem = async (e) => {
    e.preventDefault();
    if (!itemTitle) return alert("Введите название предмета");

    const res = await fetch('/api/items/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: itemTitle, category: itemCategory, required_class: itemClass, count: 1 })
    });

    if (res.ok) {
      alert("Предмет добавлен в список!");
      setItemTitle('');
    }
  };

  const handleStartRound = async () => {
    const res = await fetch('/api/rounds/start', { method: 'POST' });
    if (res.ok) {
      alert("Раунд распределения лута запущен!");
      fetchCurrentRound();
    }
  };

  const handleAddPenalty = async (e) => {
    e.preventDefault();
    const res = await fetch('/api/penalties/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tg_id: parseInt(penaltyTgId), reason: penaltyReason, amount: parseInt(penaltyAmount) })
    });

    if (res.ok) {
      alert("Штраф выдан!");
      setPenaltyTgId('');
      setPenaltyReason('');
    } else {
      alert("Игрок не найден");
    }
  };

  const handleBid = async (itemId) => {
    const res = await fetch('/api/bids/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tg_id: tgId, item_id: itemId })
    });
    const data = await res.json();
    if (res.ok || data.status === 'already_exists') {
      setUserBids(prev => ({ ...prev, [itemId]: data.roll }));
    } else {
      alert(data.detail || "Ошибка при попытке ролла");
    }
  };

  if (loading) {
    return <div style={{ color: '#fff', padding: 20, textAlign: 'center' }}>Загрузка...</div>;
  }

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', color: '#fff', fontFamily: 'sans-serif', padding: 12 }}>
      {/* Навигация */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <button onClick={() => setActiveTab('auction')} style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: 'none', background: activeTab === 'auction' ? '#1677ff' : '#22272e', color: '#fff' }}>
          🎲 Аукцион
        </button>
        <button onClick={() => setActiveTab('profile')} style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: 'none', background: activeTab === 'profile' ? '#1677ff' : '#22272e', color: '#fff' }}>
          🛡 Профиль
        </button>
        {user?.role === 'admin' && (
          <button onClick={() => setActiveTab('admin')} style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: 'none', background: activeTab === 'admin' ? '#1677ff' : '#22272e', color: '#fff' }}>
            ⚙️ Админка
          </button>
        )}
      </div>

      {/* Вкладка Профиль */}
      {activeTab === 'profile' && (
        <div style={{ background: '#1c2128', padding: 16, borderRadius: 12 }}>
          {!isEditingProfile && user ? (
            <div>
              <h3>🛡 Игрок: {user.nickname}</h3>
              <p>Класс: <b>{user.character_class}</b></p>
              <p>Штрафные очки: <b style={{ color: '#ff4d4f' }}>-{user.total_penalties || 0}</b></p>
              <button onClick={() => setIsEditingProfile(true)} style={{ width: '100%', padding: 10, marginTop: 10, background: '#30363d', border: 'none', color: '#fff', borderRadius: 6 }}>
                ✏️ Изменить ник/класс
              </button>
            </div>
          ) : (
            <form onSubmit={handleSaveProfile} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <h3>Редактирование профиля</h3>
              <label>
                Игровой Никнейм:
                <input type="text" value={nickname} onChange={(e) => setNickname(e.target.value)} required style={{ width: '100%', padding: 8, marginTop: 4, borderRadius: 6, background: '#2d333b', border: '1px solid #444c56', color: '#fff' }} />
              </label>
              <label>
                Игровой Класс:
                <select value={characterClass} onChange={(e) => setCharacterClass(e.target.value)} style={{ width: '100%', padding: 8, marginTop: 4, borderRadius: 6, background: '#2d333b', border: '1px solid #444c56', color: '#fff' }}>
                  {CLASSES.map(cls => <option key={cls} value={cls}>{cls}</option>)}
                </select>
              </label>
              <button type="submit" style={{ padding: 10, background: '#238636', border: 'none', color: '#fff', borderRadius: 6, fontWeight: 'bold' }}>
                Сохранить
              </button>
            </form>
          )}
        </div>
      )}

      {/* Вкладка Аукцион */}
      {activeTab === 'auction' && (
        <div>
          {!currentRound?.active ? (
            <div style={{ background: '#1c2128', padding: 20, borderRadius: 12, textAlign: 'center' }}>
              <h3>Сейчас нет активного раунда лута</h3>
              <p style={{ color: '#8b949e' }}>Ожидайте запуска от администратора.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#1c2128', padding: 12, borderRadius: 8 }}>
                <h3>📦 Раунд #{currentRound.round_id}</h3>
                <span style={{ background: '#388bfd33', color: '#58a6ff', padding: '4px 8px', borderRadius: 6, fontWeight: 'bold' }}>
                  ⏳ {formatTime(timeLeft)}
                </span>
              </div>

              {currentRound.items?.map(item => {
                const hasRolled = userBids[item.id] !== undefined;
                return (
                  <div key={item.id} style={{ background: '#1c2128', padding: 12, borderRadius: 8, border: '1px solid #30363d' }}>
                    <h4>{item.title} ({item.category})</h4>
                    <p style={{ fontSize: 13, color: '#8b949e' }}>Класс: {item.required_class}</p>
                    
                    {hasRolled ? (
                      <div style={{ background: '#23863633', border: '1px solid #238636', color: '#3fb950', textAlign: 'center', padding: 8, borderRadius: 6, marginTop: 8, fontWeight: 'bold' }}>
                        ✅ Заявка подана! Ваш ролл: {userBids[item.id]}
                      </div>
                    ) : (
                      <button onClick={() => handleBid(item.id)} style={{ width: '100%', padding: 8, background: '#1f6feb', border: 'none', color: '#fff', borderRadius: 6, marginTop: 8, fontWeight: 'bold' }}>
                        🎲 Подать заявку (Ролл)
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Вкладка Админка */}
      {activeTab === 'admin' && user?.role === 'admin' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <form onSubmit={handleCreateItem} style={{ background: '#1c2128', padding: 16, borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <h3>➕ Добавить предмет лута</h3>
            <input type="text" placeholder="Название предмета" value={itemTitle} onChange={(e) => setItemTitle(e.target.value)} style={{ padding: 8, borderRadius: 6, background: '#2d333b', border: '1px solid #444c56', color: '#fff' }} />
            <select value={itemCategory} onChange={(e) => setItemCategory(e.target.value)} style={{ padding: 8, borderRadius: 6, background: '#2d333b', border: '1px solid #444c56', color: '#fff' }}>
              <option value="Оружие">Оружие</option>
              <option value="Броня">Броня</option>
              <option value="Аксессуар">Аксессуар</option>
            </select>
            <select value={itemClass} onChange={(e) => setItemClass(e.target.value)} style={{ padding: 8, borderRadius: 6, background: '#2d333b', border: '1px solid #444c56', color: '#fff' }}>
              <option value="Все">Для всех классов</option>
              {CLASSES.map(cls => <option key={cls} value={cls}>{cls}</option>)}
            </select>
            <button type="submit" style={{ padding: 10, background: '#238636', border: 'none', color: '#fff', borderRadius: 6 }}>
              Добавить в пул
            </button>
          </form>

          <div style={{ background: '#1c2128', padding: 16, borderRadius: 12 }}>
            <h3>🚀 Начать раунд распределения</h3>
            <button onClick={handleStartRound} style={{ width: '100%', padding: 12, background: '#8957e5', border: 'none', color: '#fff', borderRadius: 6, fontWeight: 'bold' }}>
              Запустить аукцион (на 3 минуты)
            </button>
          </div>

          <form onSubmit={handleAddPenalty} style={{ background: '#1c2128', padding: 16, borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <h3>⚠️ Выдать штраф игроку</h3>
            <input type="number" placeholder="Telegram ID игрока" value={penaltyTgId} onChange={(e) => setPenaltyTgId(e.target.value)} style={{ padding: 8, borderRadius: 6, background: '#2d333b', border: '1px solid #444c56', color: '#fff' }} />
            <input type="text" placeholder="Причина (например, опоздание)" value={penaltyReason} onChange={(e) => setPenaltyReason(e.target.value)} style={{ padding: 8, borderRadius: 6, background: '#2d333b', border: '1px solid #444c56', color: '#fff' }} />
            <input type="number" placeholder="Количество штрафных очков" value={penaltyAmount} onChange={(e) => setPenaltyAmount(e.target.value)} style={{ padding: 8, borderRadius: 6, background: '#2d333b', border: '1px solid #444c56', color: '#fff' }} />
            <button type="submit" style={{ padding: 10, background: '#da3633', border: 'none', color: '#fff', borderRadius: 6 }}>
              Выдать штраф
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
