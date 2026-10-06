import React, { useState, useEffect } from 'react';

const CLASSES = ["Воин", "Жрец", "Маг", "Чернокнижник", "Разбойник", "Лучник"];

export default function App() {
  const [activeTab, setActiveTab] = useState('loot'); // 'loot' или 'profile'
  const [tgUser, setTgUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  // Форма регистрации
  const [nickname, setNickname] = useState('');
  const [selectedClass, setSelectedClass] = useState('');

  // Состояние лута
  const [lootItems, setLootItems] = useState([]);
  
  // Создание нового лута (РЛ)
  const [newItemName, setNewItemName] = useState('');
  const [newItemClass, setNewItemClass] = useState('Все');
  const [newItemDuration, setNewItemDuration] = useState(180);

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();
      const user = tg.initDataUnsafe?.user;
      if (user) {
        setTgUser(user);
        fetchUserProfile(user.id);
      } else {
        const testUser = { id: 12345678, first_name: "Тестовый Игрок" };
        setTgUser(testUser);
        fetchUserProfile(testUser.id);
      }
    } else {
      setLoading(false);
    }
  }, []);

  // Периодическое обновление списка лута и обратный отсчет
  useEffect(() => {
    fetchLoot();
    const interval = setInterval(() => {
      fetchLoot();
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const fetchUserProfile = async (tgId) => {
    try {
      const res = await fetch(`/api/users/${tgId}`);
      if (res.ok) {
        const data = await res.json();
        setProfile(data);
      }
    } catch (err) {
      console.error("Ошибка загрузки профиля:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchLoot = async () => {
    try {
      const res = await fetch('/api/loot');
      if (res.ok) {
        const data = await res.json();
        setLootItems(data);
      }
    } catch (err) {
      console.error("Ошибка загрузки лута:", err);
    }
  };

  const handleRegister = async () => {
    if (!nickname || !selectedClass) {
      alert("Укажите никнейм и выберите класс!");
      return;
    }
    try {
      const res = await fetch('/api/users/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tg_id: tgUser.id,
          nickname: nickname,
          character_class: selectedClass
        })
      });
      if (res.ok) {
        fetchUserProfile(tgUser.id);
      } else {
        alert("Ошибка при сохранении!");
      }
    } catch (err) {
      alert("Ошибка сети!");
    }
  };

  const handleRoll = async (itemId) => {
    if (!profile) {
      alert("Сначала зарегистрируйте персонажа!");
      return;
    }
    try {
      const res = await fetch('/api/loot/roll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tg_id: tgUser.id, item_id: itemId })
      });
      const data = await res.json();
      if (res.ok) {
        alert(`🎯 Ваш чистый бросок: ${data.raw_roll}\n⚠️ Штраф: -${data.penalty_applied}\n🏆 Итоговый результат: ${data.final_roll}`);
        fetchLoot();
      } else {
        alert(data.detail || "Ошибка при выполнении броска!");
      }
    } catch (err) {
      alert("Ошибка соединения с сервером!");
    }
  };

  const handleCreateLoot = async () => {
    if (!newItemName) {
      alert("Введите название предмета!");
      return;
    }
    try {
      const res = await fetch('/api/loot/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newItemName,
          req_class: newItemClass,
          duration_seconds: parseInt(newItemDuration)
        })
      });
      if (res.ok) {
        setNewItemName('');
        fetchLoot();
      }
    } catch (err) {
      alert("Не удалось добавить предмет");
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  if (loading) {
    return <div style={{ color: '#fff', padding: '20px', textAlign: 'center' }}>Загрузка...</div>;
  }

  // Экран первичной регистрации
  if (!profile) {
    return (
      <div style={{ padding: '20px', color: '#fff', fontFamily: 'sans-serif', backgroundColor: '#18222d', minHeight: '100vh' }}>
        <h2>🎮 Регистрация персонажа</h2>
        <div style={{ marginBottom: '15px' }}>
          <label>Игровой никнейм:</label>
          <input 
            type="text" 
            value={nickname} 
            onChange={(e) => setNickname(e.target.value)}
            placeholder="Например: Arthas"
            style={{ width: '100%', padding: '10px', marginTop: '5px', borderRadius: '8px', border: 'none', boxSizing: 'border-box' }}
          />
        </div>
        <div style={{ marginBottom: '15px' }}>
          <label>Класс персонажа:</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '10px' }}>
            {CLASSES.map((cls) => (
              <button
                key={cls}
                onClick={() => setSelectedClass(cls)}
                style={{
                  padding: '12px',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: selectedClass === cls ? '#2481cc' : '#2b394a',
                  color: '#fff',
                  fontWeight: 'bold',
                  cursor: 'pointer'
                }}
              >
                {cls}
              </button>
            ))}
          </div>
        </div>
        <button 
          onClick={handleRegister}
          style={{ width: '100%', padding: '14px', backgroundColor: '#2481cc', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '16px', fontWeight: 'bold' }}
        >
          Сохранить профиль
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: '15px', color: '#fff', fontFamily: 'sans-serif', backgroundColor: '#18222d', minHeight: '100vh' }}>
      {/* Навигация */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <button 
          onClick={() => setActiveTab('loot')} 
          style={{ flex: 1, padding: '12px', borderRadius: '8px', border: 'none', backgroundColor: activeTab === 'loot' ? '#2481cc' : '#232e3c', color: '#fff', fontWeight: 'bold' }}
        >
          🗡️ Добыча
        </button>
        <button 
          onClick={() => setActiveTab('profile')} 
          style={{ flex: 1, padding: '12px', borderRadius: '8px', border: 'none', backgroundColor: activeTab === 'profile' ? '#2481cc' : '#232e3c', color: '#fff', fontWeight: 'bold' }}
        >
          🛡️ Профиль
        </button>
      </div>

      {/* ВКЛАДКА: ДОБЫЧА И АУКЦИОН */}
      {activeTab === 'loot' && (
        <div>
          {/* Создание предмета (для тестов / Админа) */}
          <div style={{ backgroundColor: '#232e3c', padding: '12px', borderRadius: '10px', marginBottom: '20px' }}>
            <h4 style={{ margin: '0 0 10px 0' }}>➕ Выставить предмет на розыгрыш</h4>
            <input 
              type="text" 
              placeholder="Название предмета" 
              value={newItemName} 
              onChange={(e) => setNewItemName(e.target.value)}
              style={{ width: '100%', padding: '8px', borderRadius: '6px', border: 'none', marginBottom: '8px', boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
              <select 
                value={newItemClass} 
                onChange={(e) => setNewItemClass(e.target.value)}
                style={{ flex: 1, padding: '8px', borderRadius: '6px', border: 'none' }}
              >
                <option value="Все">Для всех классов</option>
                {CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select 
                value={newItemDuration} 
                onChange={(e) => setNewItemDuration(e.target.value)}
                style={{ flex: 1, padding: '8px', borderRadius: '6px', border: 'none' }}
              >
                <option value={60}>1 минута</option>
                <option value={180}>3 минуты</option>
                <option value={300}>5 минут</option>
              </select>
            </div>
            <button 
              onClick={handleCreateLoot}
              style={{ width: '100%', padding: '10px', backgroundColor: '#55aa55', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold' }}
            >
              Начать раунд
            </button>
          </div>

          <h3>📦 Доступная добыча</h3>
          {lootItems.length === 0 ? (
            <p style={{ color: '#aaa' }}>Активных предметов пока нет.</p>
          ) : (
            lootItems.map((item) => {
              const userRequest = item.requests.find(r => r.user_id === tgUser.id);
              const isExpired = !item.is_active;

              return (
                <div key={item.id} style={{ backgroundColor: '#232e3c', padding: '15px', borderRadius: '12px', marginBottom: '15px', border: item.is_active ? '1px solid #2481cc' : '1px solid #444' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ margin: 0, color: '#ffd700' }}>{item.name}</h3>
                    <span style={{ backgroundColor: isExpired ? '#ff5555' : '#2481cc', padding: '4px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold' }}>
                      {isExpired ? 'Завершен' : `⏳ ${formatTime(item.time_left)}`}
                    </span>
                  </div>

                  <p style={{ margin: '8px 0', fontSize: '13px', color: '#aaa' }}>
                    Класс: <b>{item.req_class}</b>
                  </p>

                  {/* Кнопка действия */}
                  {!isExpired && (
                    <button
                      onClick={() => handleRoll(item.id)}
                      disabled={!!userRequest}
                      style={{
                        width: '100%',
                        padding: '12px',
                        marginTop: '10px',
                        borderRadius: '8px',
                        border: 'none',
                        backgroundColor: userRequest ? '#445566' : '#2481cc',
                        color: '#fff',
                        fontWeight: 'bold',
                        cursor: userRequest ? 'default' : 'pointer'
                      }}
                    >
                      {userRequest ? `Ваш результат: ${userRequest.final_roll} (Бросок: ${userRequest.raw_roll})` : '🎲 Бросить кубик (Roll)'}
                    </button>
                  )}

                  {/* Таблица претендентов */}
                  <div style={{ marginTop: '15px', borderTop: '1px solid #334455', paddingTop: '10px' }}>
                    <small style={{ color: '#aaa' }}>Участники ({item.requests.length}):</small>
                    {item.requests.length === 0 ? (
                      <div style={{ color: '#777', fontSize: '12px', marginTop: '5px' }}>Заявок пока нет</div>
                    ) : (
                      item.requests.map((req, idx) => (
                        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: '13px', borderBottom: '1px solid #2c3a4e' }}>
                          <span>
                            {idx === 0 && isExpired ? '🏆 ' : ''}
                            <b>{req.nickname}</b> <small style={{ color: '#aaa' }}>({req.character_class})</small>
                          </span>
                          <span style={{ color: idx === 0 ? '#55ff55' : '#fff', fontWeight: 'bold' }}>
                            {req.final_roll} <small style={{ color: '#888', fontWeight: 'normal' }}>({req.raw_roll})</small>
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ВКЛАДКА: ПРОФИЛЬ */}
      {activeTab === 'profile' && (
        <div>
          <h2>🛡️ Профиль игрока</h2>
          <div style={{ backgroundColor: '#232e3c', padding: '15px', borderRadius: '10px', marginBottom: '20px' }}>
            <p><b>Никнейм:</b> {profile.nickname}</p>
            <p><b>Класс:</b> {profile.character_class}</p>
            <p><b>Общий штраф:</b> <span style={{ color: profile.total_penalties > 0 ? '#ff5555' : '#55ff55' }}>-{profile.total_penalties} очков к роллу</span></p>
          </div>

          <h3>⚠️ История штрафов</h3>
          {profile.penalties.length === 0 ? (
            <p style={{ color: '#aaa' }}>Штрафов нет. Вы отличный рейдер!</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {profile.penalties.map((p) => (
                <div key={p.id} style={{ backgroundColor: '#2b394a', padding: '12px', borderRadius: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <b>{p.reason}</b>
                    <span style={{ color: '#ff5555' }}>-{p.amount} DKP</span>
                  </div>
                  <small style={{ color: '#aaa' }}>{p.created_at}</small>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
