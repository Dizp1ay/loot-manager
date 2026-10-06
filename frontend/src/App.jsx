import React, { useState, useEffect } from 'react';

const CLASSES = ["Воин", "Жрец", "Маг", "Чернокнижник", "Разбойник", "Лучник"];

export default function App() {
  const [tgUser, setTgUser] = useState(null);
  const [nickname, setNickname] = useState('');
  const [selectedClass, setSelectedClass] = useState('');
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

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
        // Заглушка для тестирования в обычном браузере
        setTgUser({ id: 12345678, first_name: "Тестовый Игрок" });
        fetchUserProfile(12345678);
      }
    } else {
      setLoading(false);
    }
  }, []);

  const fetchUserProfile = async (tgId) => {
    try {
      const res = await fetch(`/api/users/${tgId}`);
      if (res.ok) {
        const data = await res.json();
        setProfile(data);
      }
    } catch (err) {
      console.error("Ошибка при загрузке профиля:", err);
    } finally {
      setLoading(false);
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

  if (loading) {
    return <div style={{ color: '#fff', padding: '20px', textAlign: 'center' }}>Загрузка...</div>;
  }

  // Если профиль уже создан в БД — показываем сводку и штрафы
  if (profile) {
    return (
      <div style={{ padding: '20px', color: '#fff', fontFamily: 'sans-serif', backgroundColor: '#18222d', minHeight: '100vh' }}>
        <h2>🛡️ Профиль игрока</h2>
        <div style={{ backgroundColor: '#232e3c', padding: '15px', borderRadius: '10px', marginBottom: '20px' }}>
          <p><b>Никнейм:</b> {profile.nickname}</p>
          <p><b>Класс:</b> {profile.character_class}</p>
          <p><b>Общий штраф:</b> <span style={{ color: profile.total_penalties > 0 ? '#ff5555' : '#55ff55' }}>{profile.total_penalties} очков</span></p>
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
    );
  }

  // Экран первичной регистрации
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
        style={{
          width: '100%',
          padding: '14px',
          backgroundColor: '#2481cc',
          color: '#fff',
          border: 'none',
          borderRadius: '8px',
          fontSize: '16px',
          fontWeight: 'bold',
          marginTop: '10px'
        }}
      >
        Сохранить профиль
      </button>
    </div>
  );
}
