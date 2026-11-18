(() => {
  const STARTING_BALANCE = 2500;
  const STORAGE_KEY = 'diamondRoyaleBalanceV2';
  const LEGACY_STORAGE_KEY = 'diamondRoyaleBalance';
  const symbols = [
    { glyph: '◆', name: 'Diamant', payout: 10, weight: 1 },
    { glyph: '♛', name: 'Kroon', payout: 5, weight: 2 },
    { glyph: '♥', name: 'Hart', payout: 3, weight: 3 },
    { glyph: '♦', name: 'Ruit', payout: 2, weight: 4 },
    { glyph: '★', name: 'Ster', payout: 1.5, weight: 5 },
    { glyph: '♠', name: 'Schoppen', payout: 0, weight: 5 }
  ];
  const suits = ['♠', '♥', '♦', '♣'];
  const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  let balance = readBalance();
  let round = null;
  let blackjackRound = null;
  let rouletteBusy = false;
  let rouletteSpinId = 0;
  let selectedRouletteNumber = 0;
  let soundEnabled = false;
  let audioContext;

  const $ = (selector) => document.querySelector(selector);
  const balanceLabel = $('#top-balance');
  const format = (value) => Math.floor(value).toLocaleString('nl-NL');
  function readBalance() {
    try {
      let storedValue = localStorage.getItem(STORAGE_KEY);
      if (storedValue === null) {
        storedValue = localStorage.getItem(LEGACY_STORAGE_KEY);
        if (storedValue === '0') return STARTING_BALANCE;
      }
      if (storedValue === null || storedValue === '') return STARTING_BALANCE;
      const stored = Number(storedValue);
      return Number.isFinite(stored) && stored >= 0 ? stored : STARTING_BALANCE;
    } catch { return STARTING_BALANCE; }
  }
  function updateBalance() {
    balanceLabel.textContent = format(balance);
    try { localStorage.setItem(STORAGE_KEY, String(balance)); } catch { /* Storage may be disabled. */ }
    updateButtons();
  }
  function updateButtons() {
    const spin = $('#spin-button');
    const deal = $('#deal-button');
    const draw = $('#draw-button');
    const blackjackDeal = $('#blackjack-deal');
    const blackjackHit = $('#blackjack-hit');
    const blackjackStand = $('#blackjack-stand');
    const rouletteSpin = $('#roulette-spin');
    if (spin) spin.disabled = spin.dataset.busy === 'true' || balance < readBet('slot-bet');
    if (deal) deal.disabled = Boolean(round) || balance < readBet('poker-bet');
    if (draw) draw.disabled = !round || round.phase !== 'hold';
    if (blackjackDeal) blackjackDeal.disabled = Boolean(blackjackRound && blackjackRound.active) || balance < readBet('blackjack-bet');
    if (blackjackHit) blackjackHit.disabled = !blackjackRound || !blackjackRound.active;
    if (blackjackStand) blackjackStand.disabled = !blackjackRound || !blackjackRound.active;
    if (rouletteSpin) rouletteSpin.disabled = rouletteBusy || balance < readBet('roulette-bet');
  }
  function readBet(id) {
    const input = document.getElementById(id);
    const value = Number(input.value);
    return Number.isFinite(value) ? Math.floor(Math.max(10, Math.min(500, value))) : 50;
  }
  function normalizeBet(input) {
    input.value = readBet(input.id);
    if (input.id === 'slot-bet') $('#spin-bet-label').textContent = input.value;
    updateButtons();
  }

  document.querySelectorAll('.bet-input').forEach((input) => {
    input.addEventListener('input', () => {
      if (input.id === 'slot-bet') $('#spin-bet-label').textContent = readBet(input.id);
      updateButtons();
    });
    input.addEventListener('change', () => normalizeBet(input));
  });
  document.querySelectorAll('.step-button').forEach((button) => {
    button.addEventListener('click', () => {
      const input = document.getElementById(button.dataset.betFor);
      input.value = Math.max(10, Math.min(500, readBet(input.id) + Number(button.dataset.step) * 10));
      normalizeBet(input);
    });
  });

  document.querySelectorAll('.game-tab').forEach((tab) => {
    tab.addEventListener('click', () => selectGame(tab));
  });
  function selectGame(selectedTab) {
    document.querySelectorAll('.game-tab').forEach((tab) => {
      const selected = tab === selectedTab;
      tab.classList.toggle('active', selected);
      tab.setAttribute('aria-selected', String(selected));
      const panel = document.getElementById(tab.getAttribute('aria-controls'));
      panel.classList.toggle('active', selected);
      panel.hidden = !selected;
    });
  }

  $('#spin-button').addEventListener('click', spin);
  async function spin() {
    const button = $('#spin-button');
    const bet = readBet('slot-bet');
    if (balance < bet || button.dataset.busy === 'true') return;
    button.dataset.busy = 'true';
    balance -= bet;
    updateBalance();
    button.disabled = true;
    const reels = [0, 1, 2].map((index) => document.querySelector(`#reel-${index}`));
    reels.forEach((reel) => {
      reel.classList.remove('win');
      reel.classList.add('spinning');
    });
    $('#slot-message').className = 'slot-message';
    $('#slot-message').innerHTML = '<span class="message-gem">✧</span><span>De rollen draaien...</span>';
    sound(220, .08);
    const result = [];
    for (let index = 0; index < reels.length; index += 1) {
      await wait(480 + index * 300);
      const symbol = weightedSymbol();
      result.push(symbol);
      reels[index].querySelector('.reel-symbol').textContent = symbol.glyph;
      reels[index].classList.remove('spinning');
      sound(370 + index * 90, .1);
    }
    const win = result.every((symbol) => symbol === result[0]) ? Math.floor(bet * result[0].payout) : 0;
    const message = $('#slot-message');
    if (win > 0) {
      balance += win;
      reels.forEach((reel) => reel.classList.add('win'));
      message.classList.add('win-message');
      message.innerHTML = `<span class="message-gem">✦</span><span>${result[0].name}! Je wint ${format(win)} chips.</span>`;
      sound(660, .24);
    } else {
      message.classList.add('lose-message');
      message.innerHTML = '<span class="message-gem">✧</span><span>Bijna! Zin in nog een draai?</span>';
    }
    button.dataset.busy = 'false';
    button.disabled = false;
    updateBalance();
  }
  function weightedSymbol() {
    const total = symbols.reduce((sum, symbol) => sum + symbol.weight, 0);
    let pick = Math.random() * total;
    for (const symbol of symbols) {
      pick -= symbol.weight;
      if (pick < 0) return symbol;
    }
    return symbols[symbols.length - 1];
  }

  $('#deal-button').addEventListener('click', dealCards);
  $('#draw-button').addEventListener('click', drawCards);
  function newDeck() {
    const deck = [];
    suits.forEach((suit) => {
      ranks.forEach((rank, index) => deck.push({ suit, rank, value: index + 2 }));
    });
    for (let i = deck.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
  }
  function dealCards() {
    const bet = readBet('poker-bet');
    if (balance < bet || round) return;
    balance -= bet;
    round = { bet, deck: newDeck(), cards: [], phase: 'hold' };
    round.cards = round.deck.splice(0, 5).map((card) => ({ ...card, held: false }));
    $('#poker-status').textContent = 'Welke kaarten houd je vast?';
    $('#hold-instruction').textContent = 'KLIK OP EEN KAART OM DEZE VAST TE HOUDEN';
    $('#deal-button').disabled = true;
    $('#draw-button').disabled = false;
    updateBalance();
    renderCards();
    sound(420, .13);
  }
  function renderCards() {
    const row = $('#card-row');
    row.textContent = '';
    round.cards.forEach((card, index) => {
      const element = document.createElement('button');
      const isRed = card.suit === '♥' || card.suit === '♦';
      element.className = `playing-card${isRed ? ' red' : ''}${card.held ? ' held' : ''} deal-in`;
      element.type = 'button';
      element.setAttribute('aria-label', `${card.rank} ${suitName(card.suit)}${card.held ? ', vastgehouden' : ''}`);
      element.setAttribute('aria-pressed', String(card.held));
      element.style.animationDelay = `${index * 65}ms`;
      element.innerHTML = `<span class="card-corner">${card.rank}<br>${card.suit}</span><span>${card.suit}</span><span class="card-corner bottom">${card.rank}<br>${card.suit}</span>`;
      element.disabled = round.phase !== 'hold';
      element.addEventListener('click', () => {
        if (!round || round.phase !== 'hold') return;
        card.held = !card.held;
        element.classList.toggle('held', card.held);
        element.setAttribute('aria-pressed', String(card.held));
        element.setAttribute('aria-label', `${card.rank} ${suitName(card.suit)}${card.held ? ', vastgehouden' : ''}`);
      });
      row.append(element);
    });
  }
  function drawCards() {
    if (!round || round.phase !== 'hold') return;
    round.phase = 'result';
    round.cards = round.cards.map((card) => card.held ? card : { ...round.deck.pop(), held: false });
    renderCards();
    const result = pokerResult(round.cards);
    const payout = Math.floor(round.bet * result.multiplier);
    if (payout) balance += payout;
    const status = $('#poker-status');
    if (payout) {
      status.textContent = `${result.name}! Je wint ${format(payout)} chips.`;
      status.style.color = '#f0d9a1';
      sound(680, .25);
    } else {
      status.textContent = 'Geen prijs deze keer. Nog een ronde?';
      status.style.color = '';
    }
    $('#hold-instruction').textContent = `HAND: ${result.name.toUpperCase()} · VOLGENDE RONDE?`;
    round = null;
    $('#deal-button').disabled = false;
    $('#draw-button').disabled = true;
    updateBalance();
  }
  function pokerResult(cards) {
    const counts = new Map();
    cards.forEach((card) => counts.set(card.value, (counts.get(card.value) || 0) + 1));
    const groups = [...counts.values()].sort((a, b) => b - a);
    const values = cards.map((card) => card.value).sort((a, b) => a - b);
    const flush = cards.every((card) => card.suit === cards[0].suit);
    const unique = [...new Set(values)];
    const straight = (unique.length === 5 && unique[4] - unique[0] === 4) || unique.join(',') === '2,3,4,5,14';
    const royal = straight && unique[0] === 10 && unique[4] === 14;
    if (flush && royal) return { name: 'Royal flush', multiplier: 250 };
    if (flush && straight) return { name: 'Straight flush', multiplier: 50 };
    if (groups[0] === 4) return { name: 'Four of a kind', multiplier: 25 };
    if (groups[0] === 3 && groups[1] === 2) return { name: 'Full house', multiplier: 9 };
    if (flush) return { name: 'Flush', multiplier: 6 };
    if (straight) return { name: 'Straight', multiplier: 4 };
    if (groups[0] === 3) return { name: 'Drilling', multiplier: 3 };
    if (groups[0] === 2 && groups[1] === 2) return { name: 'Twee paar', multiplier: 2 };
    if (groups[0] === 2 && [...counts].some(([value, count]) => count === 2 && value >= 11)) return { name: 'Paar boeren of hoger', multiplier: 1 };
    return { name: 'Geen winnende hand', multiplier: 0 };
  }
  function suitName(suit) { return ({ '♠': 'schoppen', '♥': 'harten', '♦': 'ruiten', '♣': 'klaveren' })[suit]; }

  const blackjackRedSuits = new Set(['♥', '♦']);
  $('#blackjack-deal').addEventListener('click', dealBlackjack);
  $('#blackjack-hit').addEventListener('click', hitBlackjack);
  $('#blackjack-stand').addEventListener('click', standBlackjack);

  function dealBlackjack() {
    const bet = readBet('blackjack-bet');
    if (balance < bet || (blackjackRound && blackjackRound.active)) return;
    balance -= bet;
    const deck = newDeck();
    blackjackRound = {
      bet,
      deck,
      player: [deck.pop(), deck.pop()],
      dealer: [deck.pop(), deck.pop()],
      active: true
    };
    $('#blackjack-status').textContent = 'Neem een kaart of blijf staan.';
    updateBalance();
    renderBlackjack();
    sound(420, .13);

    const playerNatural = blackjackTotal(blackjackRound.player) === 21;
    const dealerNatural = blackjackTotal(blackjackRound.dealer) === 21;
    if (playerNatural || dealerNatural) {
      if (playerNatural && dealerNatural) finishBlackjack('Gelijkspel — je inzet is terug.', bet * 2);
      else if (playerNatural) finishBlackjack('Blackjack! Je wint.', Math.floor(bet * 2.5));
      else finishBlackjack('De dealer heeft blackjack. Volgende ronde?', 0);
    }
  }

  function hitBlackjack() {
    if (!blackjackRound || !blackjackRound.active) return;
    blackjackRound.player.push(blackjackRound.deck.pop());
    const total = blackjackTotal(blackjackRound.player);
    if (total > 21) finishBlackjack(`Je hebt ${total}. Bust — de dealer wint.`, 0);
    else {
      $('#blackjack-status').textContent = total === 21 ? '21! De dealer speelt nu.' : 'Neem nog een kaart of blijf staan.';
      renderBlackjack();
      if (total === 21) standBlackjack();
    }
    sound(500, .1);
  }

  function standBlackjack() {
    if (!blackjackRound || !blackjackRound.active) return;
    while (blackjackTotal(blackjackRound.dealer) < 17) blackjackRound.dealer.push(blackjackRound.deck.pop());
    const playerTotal = blackjackTotal(blackjackRound.player);
    const dealerTotal = blackjackTotal(blackjackRound.dealer);
    if (dealerTotal > 21 || playerTotal > dealerTotal) finishBlackjack('Je wint! Goed gespeeld.', blackjackRound.bet * 2);
    else if (playerTotal === dealerTotal) finishBlackjack('Gelijkspel — je inzet is terug.', blackjackRound.bet * 2);
    else finishBlackjack('De dealer wint. Volgende ronde?', 0);
  }

  function finishBlackjack(message, payout) {
    if (!blackjackRound || !blackjackRound.active) return;
    blackjackRound.active = false;
    balance += payout;
    $('#blackjack-status').textContent = `${message}${payout ? ` +${format(payout)} chips` : ''}`;
    renderBlackjack();
    updateBalance();
    if (payout) sound(680, .22);
  }

  function blackjackTotal(cards) {
    let total = 0;
    let aces = 0;
    cards.forEach((card) => {
      if (card.value === 14) {
        total += 11;
        aces += 1;
      } else {
        total += Math.min(card.value, 10);
      }
    });
    while (total > 21 && aces > 0) {
      total -= 10;
      aces -= 1;
    }
    return total;
  }

  function renderBlackjack() {
    const active = blackjackRound && blackjackRound.active;
    const dealerCards = $('#dealer-cards');
    const playerCards = $('#player-cards');
    dealerCards.textContent = '';
    playerCards.textContent = '';
    if (!blackjackRound) {
      $('#dealer-total').textContent = '';
      $('#player-total').textContent = '';
      return;
    }
    blackjackRound.dealer.forEach((card, index) => {
      const hidden = active && index === 1;
      dealerCards.append(createBlackjackCard(card, hidden));
    });
    blackjackRound.player.forEach((card) => playerCards.append(createBlackjackCard(card, false)));
    $('#dealer-total').textContent = active ? '· · ·' : blackjackTotal(blackjackRound.dealer);
    $('#player-total').textContent = blackjackTotal(blackjackRound.player);
  }

  function createBlackjackCard(card, hidden) {
    const element = document.createElement('span');
    if (hidden) {
      element.className = 'playing-card card-back';
      element.setAttribute('aria-label', 'Gesloten kaart');
      element.textContent = '◇';
      return element;
    }
    const isRed = blackjackRedSuits.has(card.suit);
    element.className = `playing-card${isRed ? ' red' : ''}`;
    element.setAttribute('aria-label', `${card.rank} ${suitName(card.suit)}`);
    element.innerHTML = `<span class="card-corner">${card.rank}<br>${card.suit}</span><span>${card.suit}</span><span class="card-corner bottom">${card.rank}<br>${card.suit}</span>`;
    return element;
  }

  const rouletteReds = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
  const rouletteGrid = $('#roulette-grid');
  for (let number = 1; number <= 36; number += 1) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `roulette-number ${rouletteReds.has(number) ? 'red' : 'black'}`;
    button.dataset.rouletteNumber = number;
    button.setAttribute('aria-label', `Nummer ${number}, ${rouletteReds.has(number) ? 'rood' : 'zwart'}`);
    button.textContent = number;
    rouletteGrid.append(button);
  }
  document.querySelectorAll('[data-roulette-number]').forEach((button) => {
    button.addEventListener('click', () => {
      selectedRouletteNumber = Number(button.dataset.rouletteNumber);
      $('#roulette-choice').value = 'number';
      document.querySelectorAll('[data-roulette-number]').forEach((numberButton) => {
        numberButton.classList.toggle('selected', numberButton === button);
      });
    });
  });
  $('#roulette-spin').addEventListener('click', spinRoulette);

  function spinRoulette() {
    const bet = readBet('roulette-bet');
    if (rouletteBusy || balance < bet) return;
    rouletteBusy = true;
    const spinId = ++rouletteSpinId;
    balance -= bet;
    updateBalance();
    const button = $('#roulette-spin');
    $('.roulette-wheel').classList.add('spinning');
    button.textContent = 'HET WIEL DRAAIT…';
    const result = Math.floor(Math.random() * 37);
    const choice = $('#roulette-choice').value;
    let multiplier = 0;
    if (choice === 'number' && result === selectedRouletteNumber) multiplier = 36;
    else if (choice === 'red' && rouletteReds.has(result)) multiplier = 2;
    else if (choice === 'black' && result !== 0 && !rouletteReds.has(result)) multiplier = 2;
    else if (choice === 'even' && result !== 0 && result % 2 === 0) multiplier = 2;
    else if (choice === 'odd' && result % 2 === 1) multiplier = 2;
    else if (choice === 'low' && result >= 1 && result <= 18) multiplier = 2;
    else if (choice === 'high' && result >= 19) multiplier = 2;

    window.setTimeout(() => {
      if (spinId !== rouletteSpinId) return;
      $('.roulette-wheel').classList.remove('spinning');
      const resultButton = document.querySelector(`[data-roulette-number="${result}"]`);
      document.querySelectorAll('[data-roulette-number]').forEach((numberButton) => {
        numberButton.classList.toggle('result', numberButton === resultButton);
      });
      const color = result === 0 ? 'groen' : rouletteReds.has(result) ? 'rood' : 'zwart';
      if (multiplier) {
        const payout = bet * multiplier;
        balance += payout;
        $('#roulette-status').textContent = `${result} ${color} — raak! Je wint ${format(payout)} chips.`;
      } else {
        $('#roulette-status').textContent = `${result} ${color} — deze keer geen prijs.`;
      }
      rouletteBusy = false;
      button.textContent = 'DRAAI HET WIEL ↻';
      updateBalance();
      if (multiplier) sound(660, .24);
    }, 700);
  }

  $('#reset-balance').addEventListener('click', () => {
    balance = STARTING_BALANCE;
    round = null;
    blackjackRound = null;
    rouletteBusy = false;
    rouletteSpinId += 1;
    $('.roulette-wheel').classList.remove('spinning');
    $('#roulette-spin').textContent = 'DRAAI HET WIEL ↻';
    document.querySelectorAll('[data-roulette-number]').forEach((button) => {
      button.classList.remove('selected', 'result');
    });
    $('#card-row').textContent = '';
    renderBlackjack();
    $('#poker-status').textContent = 'Zet je inzet en deel je kaarten.';
    $('#hold-instruction').textContent = 'KLIK OP EEN KAART OM DEZE VAST TE HOUDEN';
    $('#poker-status').style.color = '';
    $('#blackjack-status').textContent = 'Kies je inzet en deel kaarten.';
    $('#roulette-status').textContent = 'Kies een inzet en draai het wiel.';
    $('#slot-message').className = 'slot-message';
    $('#slot-message').innerHTML = '<span class="message-gem">✧</span><span>Klaar voor een beetje glans?</span>';
    updateBalance();
  });
  $('#sound-toggle').addEventListener('click', (event) => {
    soundEnabled = !soundEnabled;
    event.currentTarget.classList.toggle('sound-on', soundEnabled);
    event.currentTarget.setAttribute('aria-label', soundEnabled ? 'Geluid uitzetten' : 'Geluid aanzetten');
    event.currentTarget.title = soundEnabled ? 'Geluid uitzetten' : 'Geluid aanzetten';
    if (soundEnabled) sound(540, .12);
  });
  function sound(frequency, duration) {
    if (!soundEnabled) return;
    try {
      if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(.055, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(.001, audioContext.currentTime + duration);
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start();
      oscillator.stop(audioContext.currentTime + duration);
    } catch { /* Sound is optional when browser audio is unavailable. */ }
  }
  const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
  updateBalance();
})();
