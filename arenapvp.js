// --- ARENA PVP LOGIC ---
const { useState, useEffect, useRef } = window.React;
const { motion, AnimatePresence } = window.Motion;

window.ArenaPVP = function ArenaPVP({ baseLevel, mmr, setMmr, onExit }) {
  const Shared = window.Shared; // Подтягиваем иконки и звуки из index.html

  // Состояния матча
  const [players, setPlayers] = useState([]);
  const [cards, setCards] = useState([]);
  const [activeTurn, setActiveTurn] = useState(0);
  const [matchState, setMatchState] = useState('starting'); // playing, player_lost, ended
  const [processing, setProcessing] = useState(false);
  const [resultModal, setResultModal] = useState(null); // { type: 'win' | 'lose', mmrChange: +1 | -1 }

  // Инициализация матча
  useEffect(() => {
    Shared.SoundFX.start();
    
    // Функция для получения случайного имени врага из базы
    const getRandomBotName = () => {
      if (Shared.cardsDatabase && Shared.cardsDatabase.length > 0) {
        const enemies = Shared.cardsDatabase.filter(c => c.type === 'Enemy');
        if (enemies.length > 0) {
          return enemies[Math.floor(Math.random() * enemies.length)].name;
        }
      }
      return 'Неизвестный Бот';
    };

    // Генерируем 6 игроков (игрок всегда индекс 0)
    const newPlayers = [
      { id: 0, isPlayer: true, name: 'ТЫ', power: baseLevel, alive: true }
    ];
    for (let i = 1; i < 6; i++) {
      // Сила ботов 70% - 130% от игрока
      const botPower = Math.floor(baseLevel * (0.7 + Math.random() * 0.6)) || 1;
      newPlayers.push({ id: i, isPlayer: false, name: getRandomBotName(), power: botPower, alive: true });
    }
    setPlayers(newPlayers);

    // Генерируем 5 центральных карт (используем средний уровень)
    const newCards = Array(5).fill(null).map((_, idx) => ({
      ...Shared.generateCard(baseLevel, 1),
      stackIndex: idx // Привязываем позицию
    }));
    setCards(newCards);
    setMatchState('playing');
  }, [baseLevel]);

  // Логика хода Ботов
  useEffect(() => {
    if (matchState !== 'playing' || processing || players.length === 0) return;

    const currentPlayer = players[activeTurn];
    
    // Если игрок мертв, передаем ход дальше
    if (!currentPlayer.alive) {
      nextTurn();
      return;
    }

    // Если это Бот, он делает ход
    if (!currentPlayer.isPlayer) {
      const timer = setTimeout(() => {
        // Бот выбирает случайную неперевернутую карту
        const availableCards = cards.filter(c => !c.revealed);
        if (availableCards.length > 0) {
          const pick = availableCards[Math.floor(Math.random() * availableCards.length)];
          handleCardPick(pick.stackIndex, activeTurn);
        }
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [activeTurn, matchState, processing, players, cards]);

  const handleCardPick = (cardIndex, playerIndex) => {
    if (processing || matchState !== 'playing') return;
    
    // Блокируем клики игрока не в свой ход
    if (players[playerIndex].isPlayer && activeTurn !== 0) return;

    setProcessing(true);
    Shared.SoundFX.flip();

    // 1. Открываем карту
    setCards(prev => {
      const next = [...prev];
      next[cardIndex].revealed = true;
      return next;
    });

    // 2. Ждем анимацию и резолвим
    setTimeout(() => {
      const card = cards[cardIndex];
      let newPower = players[playerIndex].power;
      let isDead = false;

      if (card.type === 'Enemy') {
        if (newPower >= card.value) {
          newPower += Math.floor(card.value / 2) + 1;
          Shared.SoundFX.click();
        } else {
          isDead = true;
          Shared.SoundFX.gameOver();
        }
      } else if (card.type === 'Loot' || card.type === 'Reroll') {
        newPower += (card.type === 'Reroll' ? 1 : card.value);
        Shared.SoundFX.popup();
      }

      // 3. Обновляем статус игрока
      setPlayers(prev => {
        const next = [...prev];
        next[playerIndex].power = newPower;
        if (isDead) next[playerIndex].alive = false;
        return next;
      });

      // 4. Заменяем карту на новую
      setCards(prev => {
        const next = [...prev];
        next[cardIndex] = { ...Shared.generateCard(newPower, 1), stackIndex: cardIndex };
        return next;
      });

      // 5. Проверяем победу/поражение
      checkWinConditions(playerIndex, isDead);

    }, 800); // Время на просмотр карты
  };

  const checkWinConditions = (playerIndex, isDead) => {
    setPlayers(prevPlayers => {
      const alivePlayers = prevPlayers.filter(p => p.alive);
      const isMainPlayerDead = prevPlayers[0] && !prevPlayers[0].alive;

      // Если игрок только что умер
      if (playerIndex === 0 && isDead && matchState !== 'player_lost') {
        setMatchState('player_lost');
        setMmr(prev => prev - 1);
        setResultModal({ type: 'lose', mmrChange: -1 });
      }

      // Если остался 1 победитель
      if (alivePlayers.length <= 1) {
        setMatchState('ended');
        // Если этот победитель - Игрок
        if (alivePlayers[0] && alivePlayers[0].isPlayer) {
          setMmr(prev => prev + 1);
          setResultModal({ type: 'win', mmrChange: '+1' });
        } else if (!isMainPlayerDead && playerIndex === 0) {
           // На случай, если все умерли одновременно (редко)
           setMmr(prev => prev + 1);
           setResultModal({ type: 'win', mmrChange: '+1' });
        }
      } else {
        // Если матч продолжается, передаем ход
        setTimeout(nextTurn, 200);
      }
      return prevPlayers;
    });
  };

  const nextTurn = () => {
    setActiveTurn(prev => {
      let next = (prev + 1) % 6;
      // Защита от зацикливания
      let loops = 0;
      setPlayers(currentPlayers => {
        while (!currentPlayers[next].alive && loops < 6) {
          next = (next + 1) % 6;
          loops++;
        }
        return currentPlayers;
      });
      setProcessing(false);
      return next;
    });
  };

  // Позиции для овала (расширили отступы для ПК версии)
  const getPlayerPosition = (index) => {
    const pos = {
      0: 'top-0 left-2 md:left-[10%]', // Игрок
      1: 'top-0 right-2 md:right-[10%]', // Бот 1
      2: 'top-[50%] right-0 md:right-0 -translate-y-1/2', // Бот 2
      3: 'bottom-0 right-2 md:right-[10%]', // Бот 3
      4: 'bottom-0 left-2 md:left-[10%]', // Бот 4
      5: 'top-[50%] left-0 md:left-0 -translate-y-1/2', // Бот 5
    };
    return pos[index];
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center w-full max-w-6xl mx-auto">
      <h1 className="text-3xl md:text-5xl font-black text-white mb-8 uppercase tracking-widest drop-shadow-md">Арена PVP</h1>
      
      {/* Игровое Поле (увеличили высоту для ПК) */}
      <div className="relative w-full h-[500px] md:h-[750px] flex items-center justify-center mb-8">
        
        {/* Игроки (6 ячеек по кругу) */}
        {players.map((player, idx) => {
          const isActive = activeTurn === idx && matchState === 'playing';
          return (
            <div key={idx} className={`absolute ${getPlayerPosition(idx)} flex flex-col items-center justify-center p-2 md:p-6 rounded-3xl border-[4px] md:border-[8px] w-20 h-24 md:w-48 md:h-56 transition-all duration-300 z-20 ${
              isActive ? 'scale-110 border-blue-500 shadow-[0_0_30px_rgba(59,130,246,0.6)] bg-blue-50' : 'border-slate-300 shadow-xl'
            } ${player.isPlayer ? (isActive ? '' : 'bg-white') : 'bg-slate-100'} ${!player.alive ? 'opacity-40 grayscale scale-95' : ''}`}>
              
              {player.alive ? (
                <>
                  <div className={`w-8 h-8 md:w-20 md:h-20 rounded-full flex items-center justify-center mb-1 md:mb-3 border-2 md:border-4 ${player.isPlayer ? 'bg-green-100 border-green-200' : 'bg-slate-200 border-slate-300'}`}>
                    {player.isPlayer ? <Shared.User className="w-5 h-5 md:w-12 md:h-12 text-green-500"/> : <span className="font-black text-slate-400 md:text-3xl">?</span>}
                  </div>
                  <div className="text-[9px] md:text-sm uppercase font-black text-slate-400 tracking-wider mb-0.5 md:mb-2 text-center w-full px-1 line-clamp-2 leading-tight">
                    {player.name}
                  </div>
                  <span className={`font-black text-xl md:text-6xl leading-none ${player.isPlayer ? 'text-green-500' : 'text-slate-600'}`}>{player.power}</span>
                </>
              ) : (
                <Shared.Skull className="w-10 h-10 md:w-24 md:h-24 text-slate-400 opacity-60" />
              )}
            </div>
          );
        })}

        {/* Центральные карты (5 штук крестом) */}
        <div className="grid grid-cols-3 grid-rows-3 gap-2 md:gap-6 w-48 md:w-[450px] h-64 md:h-[550px] z-10">
          {cards.map((card, idx) => {
            const positions = [
              'col-start-2 row-start-1', // Верх
              'col-start-1 row-start-2', // Лево
              'col-start-2 row-start-2', // Центр
              'col-start-3 row-start-2', // Право
              'col-start-2 row-start-3'  // Низ
            ];
            
            return (
              <div key={`${idx}-${card.id}`} className={`relative w-full h-full perspective-1000 ${positions[idx]}`}>
                 {/* Анимация карты */}
                 <motion.div 
                   className={`w-full h-full relative preserve-3d cursor-pointer ${activeTurn === 0 && matchState === 'playing' ? 'hover:scale-105' : ''}`}
                   animate={{ rotateY: card.revealed ? 180 : 0 }} 
                   transition={{ duration: 0.4 }}
                   onClick={() => handleCardPick(idx, 0)}
                 >
                    {/* Рубашка */}
                    <div className={`absolute top-0 left-0 w-full h-full backface-hidden rounded-xl md:rounded-[2rem] border-[3px] md:border-[6px] flex flex-col items-center justify-center overflow-hidden ${Shared.GRADE_BACK_BG[card.grade]} ${Shared.GRADE_BACK_BORDER[card.grade]}`}>
                      <div className={`font-black text-3xl md:text-7xl drop-shadow-md z-10 ${Shared.GRADE_QUESTION_COLOR[card.grade]}`}>?</div>
                    </div>
                    {/* Лицо */}
                    <div className={`absolute top-0 left-0 w-full h-full backface-hidden rounded-xl md:rounded-[2rem] border-[3px] md:border-[6px] flex flex-col items-center justify-center overflow-hidden ${Shared.GRADE_COLORS[card.grade]} ${Shared.GRADE_BG[card.grade]}`} style={{ transform: 'rotateY(180deg)' }}>
                       {card.type === 'Reroll' ? (
                         <Shared.RefreshCw className="w-8 h-8 md:w-20 md:h-20 text-blue-500 mb-1 md:mb-3" />
                       ) : (
                         <Shared.GameIcon tileIndex={card.tileIndex} size={window.innerWidth < 768 ? 32 : 80} className="mb-1 md:mb-3" />
                       )}
                       <div className={`text-xl md:text-5xl font-black ${card.type === 'Enemy' ? 'text-3d-enemy' : card.type === 'Loot' ? 'text-3d-loot' : 'text-3d-reroll'}`}>{card.type === 'Reroll' ? '+1' : card.value}</div>
                    </div>
                 </motion.div>
              </div>
            );
          })}
        </div>
      </div>

      <button onClick={onExit} className="btn-casual px-8 py-3 md:px-12 md:py-5 bg-slate-500 border-b-[6px] border-slate-700 text-white rounded-2xl md:rounded-3xl font-black uppercase text-sm md:text-xl z-30 shadow-lg mt-4 md:mt-10">
        Сбежать с Арены
      </button>

      {/* Окно Результатов (Убрана кнопка "Смотреть дальше") */}
      <AnimatePresence>
        {resultModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
            <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} className="bg-white p-8 md:p-12 rounded-[2.5rem] border-[8px] border-slate-200 max-w-sm md:max-w-md w-full text-center shadow-2xl relative">
              <div className={`w-24 h-24 md:w-32 md:h-32 rounded-full flex items-center justify-center mx-auto mb-6 md:mb-8 border-4 md:border-8 ${resultModal.type === 'win' ? 'bg-green-100 border-green-200' : 'bg-red-100 border-red-200'}`}>
                 {resultModal.type === 'win' ? <Shared.User className="w-12 h-12 md:w-16 md:h-16 text-green-500" /> : <Shared.Skull className="w-12 h-12 md:w-16 md:h-16 text-red-500" />}
              </div>
              <h2 className="text-4xl md:text-5xl font-black text-slate-800 mb-2 uppercase">{resultModal.type === 'win' ? 'ПОБЕДА!' : 'ПОРАЖЕНИЕ'}</h2>
              
              <div className={`mt-8 mb-10 p-6 md:p-8 rounded-3xl border-b-4 md:border-b-[6px] flex flex-col items-center ${resultModal.type === 'win' ? 'bg-purple-50 border-purple-200' : 'bg-slate-100 border-slate-300'}`}>
                 <div className="text-slate-500 font-black uppercase mb-2 md:text-lg">MMR РЕЙТИНГ</div>
                 <div className={`text-5xl md:text-7xl font-black ${resultModal.type === 'win' ? 'text-purple-500' : 'text-red-500'}`}>{resultModal.mmrChange > 0 ? `+${resultModal.mmrChange}` : resultModal.mmrChange}</div>
              </div>

              <div className="flex flex-col gap-3">
                 <button onClick={onExit} className="btn-casual w-full py-5 md:py-6 bg-gradient-to-b from-blue-400 to-blue-500 border-b-[8px] border-blue-600 text-white rounded-full font-black text-lg md:text-2xl uppercase tracking-widest hover:from-blue-300 hover:to-blue-400 shadow-lg">
                   Выйти в Меню
                 </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </motion.div>
  );
};
