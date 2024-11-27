const myId = getBrowserUUID();
const myIdShort = myId.slice(-5);
const gameState = {
  // Array of ID
  deck: [],
  // Array of ID
  discard: [],
  // id: [x, y, damage]
  inPlay: {},
  // UUID: { hand: [id,id, ...], claimed}
  players: {},
};
let monsterCardIndex = {};
let terrainCardIndex = {};
let allCardIndex = {};

const actionLog = [];

// Get the draggable images, all grid cells, the preview image, and the card areas
const gridCells = document.querySelectorAll('.grid-cell');
const previewImage = document.getElementById('previewImage');
const deckArea = document.getElementById('deckArea');
const discardArea = document.getElementById('discardArea');
const handArea = document.getElementById('handArea');
const claimedArea = document.getElementById('claimedArea');
const deckCount = document.getElementById('deckCount');
const discardCount = document.getElementById('discardCount');
const handCount = document.getElementById('handCount');
const claimedCount = document.getElementById('claimedCount');
const infoArea = document.getElementById('infoArea');

document.addEventListener("DOMContentLoaded", async () => {
  infoArea.value = '';

  monsterCardIndex = await loadCardIndex('monsters', 'm');
  terrainCardIndex = await loadCardIndex('terrain', 't');
  allCardIndex = { ...monsterCardIndex, ...terrainCardIndex };

  loadDeck();
  gameState.players[myId] = {
    hand: [],
    claimed: [],
  };

  setupPubNub();

  setupHotkeys();

  updateCardCount();
});

function getBrowserUUID() {
  let uuid = localStorage.getItem('browserUUID');
  if (!uuid) {
    uuid = crypto.randomUUID();
    localStorage.setItem('browserUUID', uuid);
  }
  return uuid;
}

async function loadCardIndex(deckName, prefix) {
  const response = await fetch(`${deckName}.tsv`);
  const text = await response.text();

  let cardIndex = {};

  // Split the text by lines
  const lines = text.split('\n');

  let id = 0;
  lines.forEach(line => {
    const columns = line.split('\t');
    const name = columns[0];
    if (name === 'Name') return;
    const fixedName = name.replace(/\?/g, '_');
    cardIndex[`${prefix}${id.toString()}`] = `${fixedName.replace(/\s+/g, '-')}.png`;
    id += 1;
  });

  return cardIndex;
}

function loadDeck() {
  gameState.deck = Object.keys(allCardIndex);
}

function setupHotkeys() {
  document.addEventListener('keydown', (event) => {
    if (event.key === 'd' || event.key === 'D') {
      rollDice();
    }
  });
}

function logAction(action, local = true) {
  if (local) {
    const line = `${myIdShort} ${action}`;
    actionLog.push(line);
    infoArea.value += '\n' + line;
  } else {
    infoArea.value += '\n' + action;
  }
  infoArea.scrollTop = infoArea.scrollHeight;
}


function drawCard() {
  const drawnCard = gameState.deck.shift();
  gameState.players[myId].hand.push(drawnCard);
  logAction('drew a card');
  sendGameState();
  updateCardCount();
  createDraggableCard(drawnCard, handArea);
}

function removeCardFromNonDeckState(cardId) {
  const discardIndex = gameState.discard.indexOf(cardId);
  const handIndex = gameState.players[myId].hand.indexOf(cardId);
  const claimedIndex = gameState.players[myId].claimed.indexOf(cardId);
  if (discardIndex !== -1) {
    gameState.discard.splice(discardIndex, 1);
  }
  if (handIndex !== -1) {
    gameState.players[myId].hand.splice(handIndex, 1);
  }
  if (claimedIndex !== -1) {
    gameState.players[myId].claimed.splice(claimedIndex, 1);
  }

  if (typeof gameState.inPlay[cardId] !== 'undefined') {
    delete gameState.inPlay[cardId];
  }
}
/*
function createDraggableCard(cardId, parentElement) {
    const card = document.createElement('img');
    card.src = `img/${allCardIndex[cardId]}`;
    card.draggable = true;
    card.id = cardId;
    card.className = 'draggable';

    card.addEventListener('dragstart', event => {
        event.dataTransfer.setData('text/plain', event.target.id);
    });
    card.addEventListener('mouseenter', event => {
        previewImage.src = event.target.src;
    });
    card.addEventListener('mouseleave', () => {
        previewImage.src = '';
    });
    card.addEventListener('click', event => {
        event.preventDefault();
        const card = event.target;
        if (typeof gameState.inPlay[card.id] !== 'undefined') {
            gameState.inPlay[card.id][2] += 1;
        }
    });
    card.addEventListener('contextmenu', event => {
        event.preventDefault();
        const card = event.target;
        if (typeof gameState.inPlay[card.id] !== 'undefined') {
            gameState.inPlay[card.id][2] -= 1;
        }
    });

    parentElement.appendChild(card);
}
*/

function createDraggableCard(cardId, parentElement) {
  // Create main container div
  const cardContainer = document.createElement('div');
  cardContainer.className = 'draggable-card';
  cardContainer.draggable = true;
  cardContainer.id = cardId;

  // Create img element
  const cardImg = document.createElement('img');
  cardImg.src = `img/${allCardIndex[cardId]}`;
  cardImg.draggable = false;  // Prevent direct dragging of img
  cardImg.className = 'draggable';

  // Create overlay for number
  const overlayNumber = document.createElement('div');
  overlayNumber.className = 'overlay-number';
  overlayNumber.textContent = '0'; // Initial number

  // Append img and overlay to container
  cardContainer.appendChild(cardImg);
  cardContainer.appendChild(overlayNumber);

  // Add event listeners to container instead of img
  cardContainer.addEventListener('dragstart', event => {
    event.dataTransfer.setData('text/plain', cardId);
  });

  cardContainer.addEventListener('mouseenter', () => {
    previewImage.src = cardImg.src;
  });

  cardContainer.addEventListener('mouseleave', () => {
    previewImage.src = '';
  });

  cardContainer.addEventListener('click', event => {
    event.preventDefault();
    if (typeof gameState.inPlay[cardId] !== 'undefined') {
      gameState.inPlay[cardId][2] += 1;
      overlayNumber.textContent = gameState.inPlay[cardId][2];
      logAction(`added a damage to ${allCardIndex[cardId]}`);
      sendGameState();
    }
  });

  cardContainer.addEventListener('contextmenu', event => {
    event.preventDefault();
    if (typeof gameState.inPlay[cardId] !== 'undefined') {
      gameState.inPlay[cardId][2] -= 1;
      overlayNumber.textContent = gameState.inPlay[cardId][2];
      logAction(`removed a damage from ${allCardIndex[cardId]}`);
      sendGameState();
    }
  });

  cardContainer.setDamageText = dmg => {
    overlayNumber.textContent = dmg;
  };

  parentElement.appendChild(cardContainer);

  return cardContainer;
}




// Function to check if a cell is empty
function isCellEmpty(cell) {
  return cell.querySelector('.draggable') === null;
}

// Function to update card area counts
function updateCardCount() {
  deckCount.textContent = gameState.deck.length;
  discardCount.textContent = gameState.discard.length;
  handCount.textContent = gameState.players[myId].hand.length;
  claimedCount.textContent = gameState.players[myId].claimed.length;
}

// Add drag and drop event listeners for the grid cells
gridCells.forEach(cell => {
  cell.addEventListener('dragover', event => {
    if (isCellEmpty(cell)) {
      event.preventDefault(); // Allow drop if cell is empty
      cell.classList.add('drag-over');
    }
  });

  cell.addEventListener('dragleave', () => {
    cell.classList.remove('drag-over');
  });

  cell.addEventListener('drop', event => {
    event.preventDefault();
    if (isCellEmpty(cell)) {
      const imageId = event.dataTransfer.getData('text/plain');
      const previousDamage = gameState.inPlay[imageId]?.[2] ?? 0;
      const draggedImage = document.getElementById(imageId);
      cell.appendChild(draggedImage);
      removeCardFromNonDeckState(imageId);
      const coords = cell.id.split(',');
      gameState.inPlay[imageId] = [coords[0], coords[1], previousDamage];
      draggedImage.setDamageText(previousDamage);
      sendGameState();
      updateCardCount();
    }
    cell.classList.remove('drag-over');
  });

  // Mouse enter event to show the larger preview in the sidebar
  /*
  cell.addEventListener('mouseenter', () => {
      const cellImage = cell.querySelector('.draggable');
      if (cellImage) {
          previewImage.src = cellImage.src; // Set preview image source to the cell's image
      }
  });

  // Mouse leave event to hide the preview in the sidebar
  cell.addEventListener('mouseleave', () => {
      previewImage.src = ''; // Clear preview when not hovering over an image cell
  });
  */
});


// Add drag-and-drop listeners for the card areas
[deckArea].forEach(area => {
  area.addEventListener('dragover', event => {
    event.preventDefault();
  });

  area.addEventListener('drop', event => {
    const imageId = event.dataTransfer.getData('text/plain');
    const draggedImage = document.getElementById(imageId);

    if (draggedImage) {
      const cardId = draggedImage.id;
      removeCardFromNonDeckState(cardId);
      gameState.deck.unshift(cardId);
      logAction(`moved ${allCardIndex[cardId]} to deck`);
      sendGameState();
      draggedImage.remove();
      updateCardCount();
    }
  });
});
[discardArea].forEach(area => {
  area.addEventListener('dragover', event => {
    event.preventDefault();
  });

  area.addEventListener('drop', event => {
    const imageId = event.dataTransfer.getData('text/plain');
    const draggedImage = document.getElementById(imageId);

    if (draggedImage) {
      const cardId = draggedImage.id;
      removeCardFromNonDeckState(cardId);
      gameState.discard.push(cardId);
      logAction(`moved ${allCardIndex[cardId]} to discard`);
      sendGameState();
      area.appendChild(draggedImage);
      updateCardCount();
    }
  });
});
[handArea].forEach(area => {
  area.addEventListener('dragover', event => {
    event.preventDefault();
  });

  area.addEventListener('drop', event => {
    const imageId = event.dataTransfer.getData('text/plain');
    const draggedImage = document.getElementById(imageId);

    if (draggedImage) {
      const cardId = draggedImage.id;
      removeCardFromNonDeckState(cardId);
      gameState.players[myId].hand.push(cardId);
      logAction(`moved ${allCardIndex[cardId]} to hand`);
      sendGameState();
      area.appendChild(draggedImage);
      updateCardCount();
    }
  });
});
[claimedArea].forEach(area => {
  area.addEventListener('dragover', event => {
    event.preventDefault();
  });

  area.addEventListener('drop', event => {
    const imageId = event.dataTransfer.getData('text/plain');
    const draggedImage = document.getElementById(imageId);

    if (draggedImage) {
      const cardId = draggedImage.id;
      removeCardFromNonDeckState(cardId);
      gameState.players[myId].claimed.push(cardId);
      logAction(`moved ${allCardIndex[cardId]} to claimed`);
      sendGameState();
      area.appendChild(draggedImage);
      updateCardCount();
    }
  });
});



function rollDice() {
  const diceRoll = Math.floor(Math.random() * 6) + 1;
  logAction(`rolled a ${diceRoll}`);
  sendGameState();
}

function resetGame(useTerrain = true) {
  let userConfirmed = false;
  if (useTerrain) {
    userConfirmed = confirm("This will move all cards back into the deck, add terrain cards (if missing) and shuffle it.\n\nProceed?");
  } else {
    userConfirmed = confirm("This will move all cards back into the deck, remove any terrain cards, and shuffle it.\n\nProceed?");
  }

  if (userConfirmed) {
    gameState.deck = [];
    gameState.discard = [];
    gameState.inPlay = {};
    for (const playerId in gameState.players) {
      gameState.players[playerId].hand = [];
      gameState.players[playerId].claimed = [];
    }

    if (useTerrain) {
      allCardIndex = { ...monsterCardIndex, ...terrainCardIndex };
    } else {
      allCardIndex = { ...monsterCardIndex };
    }
    loadDeck();
    clearPlayerVisuals()
    clearBoardVisuals();
    updateCardCount();
    if (useTerrain) {
      logAction('reset the game with terrain');
    } else {
      logAction('reset the game without terrain');
    }

    shuffleDeck(); // This resets the game state
  }
}

function clearPlayerVisuals() {
  discardImages = discardArea.querySelectorAll('.draggable-card');
  discardImages.forEach(img => {
    img.remove();
  });
  handImages = handArea.querySelectorAll('.draggable-card');
  handImages.forEach(img => {
    img.remove();
  });
  claimedImages = claimedArea.querySelectorAll('.draggable-card');
  claimedImages.forEach(img => {
    img.remove();
  });
}

function reloadDeck() {
  const userConfirmed = confirm("This will remove all cards from the discard, hand, claimed, and in play, and move them to the deck.\n\nProceed?");

  if (userConfirmed) {
    gameState.deck = [];
    gameState.discard = [];
    gameState.inPlay = {};
    for (const playerId in gameState.players) {
      gameState.players[playerId].hand = [];
      gameState.players[playerId].claimed = [];
    }

    clearPlayerVisuals()
    clearBoardVisuals();
    loadDeck();
    updateCardCount();
    logAction('re-loaded the deck');

    sendGameState();
  }
}

function rebuildPlayerVisuals() {
  for (const cardId of gameState.discard) {
    createDraggableCard(cardId, discardArea);
  }
  for (const cardId of gameState.players[myId].hand) {
    createDraggableCard(cardId, handArea);
  }
  for (const cardId of gameState.players[myId].claimed) {
    createDraggableCard(cardId, claimedArea);
  }
}

function clearBoardVisuals() {
  gridCells.forEach(cell => {
    boardImages = cell.querySelectorAll('.draggable-card');
    boardImages.forEach(img => {
      img.remove();
    });
  });
}

function rebuildBoardVisuals() {
  Object.keys(gameState.inPlay).forEach(cardId => {
    const cardData = gameState.inPlay[cardId];
    const coords = `${cardData[0]},${cardData[1]}`;
    const cell = document.getElementById(coords);
    const card = createDraggableCard(cardId, cell);
    card.setDamageText(gameState.inPlay[cardId][2]);
  });
}

function shuffleDeck() {
  shuffleArray(gameState.deck);
  logAction('shuffled the deck');
  sendGameState();
}

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    // Generate a random index between 0 and i
    const j = Math.floor(Math.random() * (i + 1));

    // Swap elements at indices i and j
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}
