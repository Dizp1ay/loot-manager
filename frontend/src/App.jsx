import React, { useState, useEffect } from 'react';

const CLASSES = ["Воин", "Жрец", "Маг", "Чернокнижник", "Разбойник", "Лучник"];

export default function App() {
  const [nickname, setNickname] = useState('');
  const [selectedClass, setSelectedClass] = useState('');
  const [user, setUser] = useState(null);

  useEffect(() => {
    // Инициализация Telegram WebApp
    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();
      
      const tgUser = tg.initDataUnsafe?.user;
      if (tgUser) {
        setNickname(tgUser.first_name || '');
      }
    }
  }, []);

  const handleSave = () => {
    if (!nickname || !selectedClass) {
      alert('Заполните никнейм и выберите класс!');
      return;
    }
    
    // В будущем здесь будет запрос к нашему бэкенду
    setUser({ nickname, selectedClass });
  };

  if (user) {
    return (
      <div style={{ padding: '20px', color: '#fff', fontFamily: 'sans-serif', backgroundColor: '#18222d', minHeight: '100vh' }}>
        <h2>🛡️ Профиль сохранен</h2>
        <p><b>Никнейм:</b> {user.nickname}</p>
        <p><b>Класс:</b> {user.selectedClass}</p>
        <p style={{ color: '#aaa', marginTop: '20px' }}>Ожидайте запуска рейда администратором...</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px', color: '#fff', fontFamily: 'sans-serif', backgroundColor: '#18222d', minHeight: '100vh' }}>
      <h2>🎮 Регистрация в Лут-Менеджере</h2>
      <div style={{ marginBottom: '15px' }}>
        <label>Ваш игровой никнейм:</label>
        <input 
          type="text" 
          value={nickname} 
          onChange={(e) => setNickname(e.target.value)}
          style={{ width: '100%', padding: '10px', marginTop: '5px', borderRadius: '8px', border: 'none', boxSizing: 'border-box' }}
        />
      </div>

      <div style={{ marginBottom: '15px' }}>
        <label>Выберите класс:</label>
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
        onClick={handleSave}
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
