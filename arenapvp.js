// --- ARENA PVP LOGIC ---
const { useState, useEffect, useRef } = window.React;
const { motion, AnimatePresence } = window.Motion;

window.ArenaPVP = function ArenaPVP({ baseLevel, mmr, setMmr, onExit }) {
  const Shared = window.Shared; 

  const [players, setPlayers] = useState([]);
  const [cards, setCards] = useState([]);
  const [activeTurn, setActiveTurn] = useState(0);
  const [matchState, setMatchState] = useState('starting');
  const [processing, setProcessing] = useState(false);
  const [resultModal, setResultModal] = useState(null); 

  useEffect(() => {
    Shared.SoundFX.start();
    
    const getRandomBotName = () => {
      if (Shared.cardsDatabase && Shared.cardsDatabase.length > 0) {
        const enemies = Shared.cardsDatabase.filter(c => c.type === 'Enemy');
        if (enemies.length > 0) {
          return enemies[Math.floor(Math.random() * enemies.length)].name;
        }
      }
      return 'Неизвестный Бот';
    };

    const newPlayers = [
      { id: 0, isPlayer: true, name: 'ТЫ', power: baseLevel, alive: true }
    ];
    for (let i = 1; i < 6; i++) {
      const botPower = Math.floor(baseLevel * (0.7 + Math.random() * 0.6)) || 1;
      newPlayers.push({ id: i, isPlayer: false, name: getRandomBotName(), power: botPower, alive: true });
    }
    setPlayers(newPlayers);

    const newCards = Array(5).fill(null).map((_, idx) => ({
      ...Shared.generateCard(baseLevel, 1),
      stackIndex: idx 
    }));
    setCards(newCards);
    setMatchState('playing');
  }, [baseLevel]);

  useEffect(() => {
    if (matchState !== 'playing' || processing || players.length === 0) return;
    const currentPlayer = players[activeTurn];
    
    if (!currentPlayer.alive) {
      nextTurn();
      return;
    }

    if (!currentPlayer.isPlayer) {
      const timer = setTimeout(() => {
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
    if (players[playerIndex].isPlayer && activeTurn !== 0) return;

    setProcessing(true);
    Shared.SoundFX.flip();

    setCards(prev => {
      const next = [...prev];
      next[cardIndex].revealed = true;
      return next;
    });

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

      setPlayers(prev => {
        const next = [...prev];
        next[playerIndex].power = newPower;
        if (isDead) next[playerIndex].alive = false;
        return next;
      });

      setCards(prev => {
        const next = [...prev];
        next[cardIndex] = { ...Shared.generateCard(newPower, 1), stackIndex: cardIndex };
        return next;
      });

      checkWinConditions(playerIndex, isDead);
    }, 800); 
  };

  const checkWinConditions = (playerIndex, isDead) => {
    setPlayers(prevPlayers => {
      const alivePlayers = prevPlayers.filter(p => p.alive);
      const isMainPlayerDead = prevPlayers[0] && !prevPlayers[0].alive;

      if (playerIndex === 0 && isDead && matchState !== 'player_lost') {
        setMatchState('player_lost');
        setMmr(prev => prev - 1);
        setResultModal({ type: 'lose', mmrChange: -1 });
      }

      if (alivePlayers.length <= 1) {
        setMatchState('ended');
        if (alivePlayers[0] && alivePlayers[0].isPlayer) {
          setMmr(prev => prev + 1);
          setResultModal({ type: 'win', mmrChange: '+1' });
        } else if (!isMainPlayerDead && playerIndex === 0) {
           setMmr(prev => prev + 1);
           setResultModal({ type: 'win', mmrChange: '+1' });
        }
      } else {
        setTimeout(nextTurn, 200);
      }
      return prevPlayers;
    });
  };

  const nextTurn = () => {
    setActiveTurn(prev => {
      let next = (prev + 1) % 6;
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

  // НОВЫЕ ПОЗИЦИИ: ТЫ и Бот 1 стоят по бокам от нижней карты, остальные 4 в ряд внизу
  const getPlayerPosition = (index) => {
    const pos = {
      0: 'top-[310px] sm:top-[330px] left-4 sm:left-6 md:top-0 md:left-[8%] lg:left-[10%] translate-y-0', 
      1: 'top-[310px] sm:top-[330px] right-4 sm:right-6 md:top-0 md:right-[8%] lg:right-[10%] translate-y-0', 
      2: 'bottom-2 right-1 sm:right-2 md:top-[50%] md:bottom-auto md:right-1 lg:right-0 translate-y-0 md:-translate-y-1/2', 
      3: 'bottom-2 right-[26.5%] md:bottom-0 md:right-[8%] lg:right-[10%] translate-y-0', 
      4: 'bottom-2 left-[26.5%] md:bottom-0 md:left-[8%] lg:left-[10%] translate-y-0', 
      5: 'bottom-2 left-1 sm:left-2 md:top-[50%] md:bottom-auto md:left-1 lg:left-0 translate-y-0 md:-translate-y-1/2', 
    };
    return pos[index];
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center w-full max-w-6xl mx-auto relative z-10">
      <h1 className="text-3xl lg:text-5xl font-black text-white mb-2 lg:mb-8 uppercase tracking-widest drop-shadow-md hidden lg:block">Арена PVP</h1>
      
      {/* ИГРОВОЕ ПОЛЕ: увеличил высоту для вертикалки (h-[620px]), чтобы все 4 бота влезли снизу без нахлеста */}
      <div className="relative w-full h-[620px] md:h-[380px] lg:h-[720px] flex items-center justify-center mb-6 md:mb-4 mt-4 md:-mt-8 lg:mt-0">
        
        {players.map((player, idx) => {
          const isActive = activeTurn === idx && matchState === 'playing';
          return (
            <div key={idx} className={`absolute ${getPlayerPosition(idx)} flex flex-col items-center justify-center p-1.5 sm:p-2 md:p-1 lg:p-6 rounded-[1.25rem] md:rounded-2xl lg:rounded-3xl border-[3px] md:border-[4px] lg:border-[8px] w-[74px] h-[90px] sm:w-[80px] sm:h-[95px] md:w-[85px] md:h-[105px] lg:w-48 lg:h-56 transition-all duration-300 z-20 ${
              isActive ? 'scale-110 border-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.6)] bg-blue-50' : 'border-slate-300 shadow-xl'
            } ${player.isPlayer ? (isActive ? '' : 'bg-white') : 'bg-slate-100'} ${!player.alive ? 'opacity-40 grayscale scale-95' : ''}`}>
              
              {player.alive ? (
                <>
                  <div className={`w-8 h-8 sm:w-10 sm:h-10 md:w-10 md:h-10 lg:w-20 lg:h-20 rounded-full flex items-center justify-center mb-1 md:mb-1.5 lg:mb-3 border-[2px] md:border-[3px] lg:border-4 flex-shrink-0 ${player.isPlayer ? 'bg-green-100 border-green-200' : 'bg-slate-200 border-slate-300'}`}>
                    {player.isPlayer ? <Shared.User className="w-5 h-5 md:w-6 md:h-6 lg:w-12 lg:h-12 text-green-500"/> : <span className="font-black text-slate-400 text-[14px] md:text-sm lg:text-3xl">?</span>}
                  </div>
                  <div className="text-[7.5px] sm:text-[8px] md:text-[9px] lg:text-sm uppercase font-black text-slate-400 tracking-wider mb-1 text-center w-full px-0.5 leading-tight break-words">
                    {player.name}
                  </div>
                  <span className={`font-black text-base sm:text-lg md:text-xl lg:text-6xl leading-none ${player.isPlayer ? 'text-green-500' : 'text-slate-600'}`}>{player.power}</span>
                </>
              ) : (
                <Shared.Skull className="w-10 h-10 md:w-12 md:h-12 lg:w-24 lg:h-24 text-slate-400 opacity-60" />
              )}
            </div>
          );
        })}

        {/* ЦЕНТРАЛЬНЫЕ КАРТЫ: Сетка стала узкой и высокой (280x410), и поднята вверх (mb-[140px]) для освобождения низа */}
        <div className="grid grid-cols-3 grid-rows-3 gap-2 lg:gap-6 w-[280px] h-[410px] sm:w-[300px] sm:h-[430px] md:w-[270px] md:h-[340px] lg:w-[470px] lg:h-[640px] z-10 mb-[140px] md:mb-0">
          {cards.map((card, idx) => {
            const positions = [
              'col-start-2 row-start-1',
              'col-start-1 row-start-2',
              'col-start-2 row-start-2',
              'col-start-3 row-start-2',
              'col-start-2 row-start-3'
            ];
            
            return (
              <div key={`${idx}-${card.id}`} className={`relative w-full h-full perspective-1000 ${positions[idx]}`}>
                 <motion.div 
                   className={`w-full h-full relative preserve-3d cursor-pointer ${activeTurn === 0 && matchState === 'playing' ? 'hover:scale-105' : ''}`}
                   animate={{ rotateY: card.revealed ? 180 : 0 }} 
                   transition={{ duration: 0.4 }}
                   onClick={() => handleCardPick(idx, 0)}
                 >
                    {/* УБРАН overflow-hidden */}
                    <div className={`absolute top-0 left-0 w-full h-full backface-hidden rounded-xl md:rounded-2xl lg:rounded-[2rem] border-[3px] lg:border-[6px] flex flex-col items-center justify-center ${Shared.GRADE_BACK_BG[card.grade]} ${Shared.GRADE_BACK_BORDER[card.grade]}`} style={{ transform: 'translateZ(1px)', WebkitTransform: 'translateZ(1px)' }}>
                      <div className={`font-black text-5xl md:text-4xl lg:text-7xl drop-shadow-md z-10 ${Shared.GRADE_QUESTION_COLOR[card.grade]}`}>?</div>
                    </div>
                    
                    {/* УБРАН overflow-hidden */}
                    <div className={`absolute top-0 left-0 w-full h-full backface-hidden rounded-xl md:rounded-2xl lg:rounded-[2rem] border-[3px] lg:border-[6px] flex flex-col items-center justify-center ${Shared.GRADE_COLORS[card.grade]} ${Shared.GRADE_BG[card.grade]} p-1.5 md:p-1 lg:p-2`} style={{ transform: 'rotateY(180deg) translateZ(1px)', WebkitTransform: 'rotateY(180deg) translateZ(1px)' }}>
                       {card.type === 'Reroll' ? (
                         <Shared.RefreshCw className="w-9 h-9 md:w-8 md:h-8 lg:w-20 lg:h-20 text-blue-500 mb-1.5 md:mb-1 lg:mb-3" />
                       ) : (
                         <Shared.GameIcon tileIndex={card.tileIndex} size={window.innerWidth >= 1024 ? 80 : window.innerWidth >= 768 ? 40 : 54} className="mb-1.5 md:mb-1 lg:mb-3" />
                       )}
                       <div className={`text-3xl sm:text-4xl md:text-[14px] lg:text-5xl font-black drop-shadow-sm lg:drop-shadow-md leading-none ${card.type === 'Enemy' ? 'text-orange-600' : card.type === 'Loot' ? 'text-lime-600' : 'text-blue-600'}`}>
                         {card.type === 'Reroll' ? '+1' : card.value}
                       </div>
                       <div className={`text-[10px] sm:text-[11px] md:text-[8px] lg:text-[12px] font-black uppercase mt-1 md:mt-1 lg:mt-2 ${Shared.GRADE_TEXT[card.grade]} opacity-90 leading-tight text-center px-0.5 break-words`}>
                         {card.name}
                       </div>
                    </div>
                 </motion.div>
              </div>
            );
          })}
        </div>
      </div>

      <AnimatePresence>
        {resultModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
            <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} className="bg-white p-8 md:p-8 lg:p-12 rounded-[2rem] lg:rounded-[2.5rem] border-[6px] lg:border-[8px] border-slate-200 max-w-sm md:max-w-sm lg:max-w-md w-full text-center shadow-2xl relative">
              <div className={`w-20 h-20 md:w-20 md:h-20 lg:w-32 lg:h-32 rounded-full flex items-center justify-center mx-auto mb-5 md:mb-6 lg:mb-8 border-[4px] md:border-4 lg:border-8 ${resultModal.type === 'win' ? 'bg-green-100 border-green-200' : 'bg-red-100 border-red-200'}`}>
                 {resultModal.type === 'win' ? <Shared.User className="w-10 h-10 md:w-10 md:h-10 lg:w-16 lg:h-16 text-green-500" /> : <Shared.Skull className="w-10 h-10 md:w-10 md:h-10 lg:w-16 lg:h-16 text-red-500" />}
              </div>
              <h2 className="text-3xl md:text-4xl lg:text-5xl font-black text-slate-800 mb-2 uppercase">{resultModal.type === 'win' ? 'ПОБЕДА!' : 'ПОРАЖЕНИЕ'}</h2>
              
              <div className={`mt-6 mb-8 md:mt-6 md:mb-8 lg:mt-8 lg:mb-10 p-5 md:p-6 lg:p-8 rounded-3xl lg:rounded-3xl border-b-[5px] md:border-b-[5px] lg:border-b-[6px] flex flex-col items-center ${resultModal.type === 'win' ? 'bg-purple-50 border-purple-200' : 'bg-slate-100 border-slate-300'}`}>
                 <div className="text-slate-500 font-black uppercase mb-2 md:mb-2 text-[12px] md:text-sm lg:text-lg">MMR РЕЙТИНГ</div>
                 <div className={`text-5xl md:text-6xl lg:text-7xl font-black ${resultModal.type === 'win' ? 'text-purple-500' : 'text-red-500'}`}>{resultModal.mmrChange > 0 ? `+${resultModal.mmrChange}` : resultModal.mmrChange}</div>
              </div>

              <div className="flex flex-col gap-3">
                 <button onClick={onExit} className="btn-casual w-full py-4 md:py-5 lg:py-6 bg-gradient-to-b from-blue-400 to-blue-500 border-b-[6px] md:border-b-[6px] lg:border-b-[8px] border-blue-600 text-white rounded-full font-black text-lg md:text-xl lg:text-2xl uppercase tracking-widest hover:from-blue-300 hover:to-blue-400 shadow-lg">
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
