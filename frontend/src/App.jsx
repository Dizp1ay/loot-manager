import React, { useState, useEffect } from 'react';

const CLASSES = ["Воин", "Жрец", "Маг", "Чернокнижник", "Разбойник", "Лучник"];

export default function App() {
  const [activeTab, setActiveTab] = useState('loot'); // 'loot', 'profile', 'admin'
  const [tgUser, setTgUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [currentRound, setCurrentRound] = useState(null);
  const [myBids, setMyBids] = useState({});

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();
      const user = tg.initDataUnsafe?.user || { id: 12345678, first_name: "Тест" };
      setTgUser(user);
      fetchUserProfile(user.id);
      fetchCurrentRound();
    }
  }, []);

  const fetchUserProfile = async (tgId) => {
    const res = await fetch(`/api/users/${tgId}`);
    if (res.ok) setProfile(await res.json());
  };

  const fetchCurrentRound = async () => {
    const res = await fetch(`/api/rounds/current`);
    if (res.ok) setCurrentRound(await res.json());
  };

  const handleWantItem = async (itemId) => {
    const res = await fetch('/api/bids/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tg_id: tgUser.id, item_id: itemId })
    });
    
    const data = await res.json();
    if (res.ok) {
      alert(`Заявка принята! Ваш итоговый ролл: ${data.roll}`);
      setMyBids(prev => ({ ...prev, [itemId]: data.roll }));
    } else {
      alert(data.detail || "Ошибка при подаче заявки");
    }
  };

  return (
    <div style={{ padding: '15px', color: '#fff', backgroundColor: '#18222d', minHeight: '100vh', fontFamily: 'sans-serif' }}>
      
      {/* Навигация */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <button onClick={() => setActiveTab('loot')} style={tabStyle(activeTab === 'loot')}>🎲 Аукцион</button>
        <button onClick={() => setActiveTab('profile')} style={tabStyle(activeTab === 'profile')}>🛡️ Профиль</button>
        {profile?.role === 'admin' && (
          <button onClick={() => setActiveTab('admin')} style={tabStyle(activeTab === 'admin')}>⚙️ Админка</button>
        )}
      </div>

      {/* Вкладка 1: Активный розыгрыш */}
      {activeTab === 'loot' && (
        <div>
          <h3>📦 Текущий распределяемый лут</h3>
          {!currentRound?.active ? (
            <p style={{ color: '#aaa' }}>Сейчас нет активных раундов розыгрыша.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              {currentRound.items.map((item) => (
                <div key={item.id} style={{ backgroundColor: '#232e3c', padding: '15px', borderRadius: '10px' }}>
                  <h4>{item.title} ({item.category})</h4>
                  {item.properties && <p style={{ color: '#e5c07b', fontSize: '14px' }}>✨ {item.properties}</p>}
                  <p style={{ fontSize: '12px', color: '#aaa' }}>Класс: {item.required_class}</p>

                  <button 
                    onClick={() => handleWantItem(item.id)}
                    disabled={!!myBids[item.id]}
                    style={{
                      width: '100%',
                      padding: '10px',
                      backgroundColor: myBids[item.id] ? '#4CAF50' : '#2481cc',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '6px',
                      fontWeight: 'bold',
                      marginTop: '10px'
                    }}
                  >
                    {myBids[item.id] ? `Заявка подана (Выпало: ${myBids[item.id]})` : '🖐️ ХОЧУ'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Вкладка 2: Профиль (Ваш существующий код) */}
      {activeTab === 'profile' && profile && (
        <div>
          <h2>🛡️ Игрок: {profile.nickname}</h2>
          <p>Класс: <b>{profile.character_class}</b></p>
          <p>Штрафные очки: <b style={{ color: 'red' }}>-{profile.total_penalties}</b></p>
        </div>
      )}
    </div>
  );
}

const tabStyle = (active) => ({
  flex: 1,
  padding: '10px',
  borderRadius: '8px',
  border: 'none',
  backgroundColor: active ? '#2481cc' : '#2b394a',
  color: '#fff',
  fontWeight: 'bold'
});
