const channelName = 'GBJS';
let userList = [];
const userListElement = document.getElementById('userList');
let actionLogNextSendIndex = 0;

function setupPubNub(fake = false) {
  if (fake) {
    pubnub = {
      publish: () => { },
    }
    return void 0;
  }

  try {
    // Update this block with your publish/subscribe keys
    pubnub = new PubNub({
      publishKey: "pub-c-25da488a-1e79-43e7-8d98-903f86aaee37",
      subscribeKey: "sub-c-d28f94ba-d667-45bb-81cb-26ce6ee25a60",
      userId: myId,
    });

    // create a local channel entity
    const channel = pubnub.channel(channelName);
    // create a subscription on the channel
    const subscription = channel.subscription({ receivePresenceEvents: true });

    // Handle user presence events (join, leave)
    pubnub.addListener({
      presence: function (m) {
        switch (m.action) {
          case 'join':
            logAction(`${m.uuid.slice(-5)} network ${m.action}`, false);
            if (m.uuid !== myId) sendGameState();
          case 'state-change':
            if (!userList.includes(m.uuid)) {
              userList.push(m.uuid);

              pubnub.setState({
                state: {
                  uuid: myId,
                  time: Date.now(),
                },
                channels: [channelName],
              });
            }
            break;
          case 'leave':
          case 'timeout':
            if (userList.includes(m.uuid)) {
              userList.splice(userList.indexOf(m.uuid), 1);
            }
            logAction(`${m.uuid.slice(-5)} network ${m.action}`, false);
            gameState.players[uuid].hand.forEach(card => {
              gameState.deck.shift(card);
              logAction(`${m.uuid.slice(-5)} moved a card to the deck`, false);
            });
            gameState.players[uuid].claimed.forEach(card => {
              gameState.deck.shift(card);
              logAction(`${m.uuid.slice(-5)} moved a card to the deck`, false);
            });
            break;
          default:
            break;
        }

        updateUserList();
      }
    });

    // add an onMessage listener to the channel subscription
    subscription.onMessage = (msg) => {
      if (msg.publisher === myId || typeof msg.message === 'undefined') return;

      const m = msg.message;

      const newGameState = m.data;

      switch (m.category) {
        case 'gameState':
          let rebuildPlayerVis = false;
          let rebuildBoardVis = false;
          if (typeof newGameState.players[myId] === 'undefined') {
            newGameState.players[myId] = gameState.players[myId];
          }
          if (newGameState.players[myId].hand != gameState.players[myId].hand || newGameState.players[myId].claimed != gameState.players[myId].claimed) {
            clearPlayerVisuals();
            rebuildPlayerVis = true;
          }
          if (!isInPlayIdentical(newGameState.inPlay)) {
            clearBoardVisuals();
            rebuildBoardVis = true;
          }
          gameState.deck = newGameState.deck;
          gameState.discard = newGameState.discard;
          gameState.inPlay = newGameState.inPlay;
          gameState.players = newGameState.players;
          if (rebuildPlayerVis) rebuildPlayerVisuals();
          if (rebuildBoardVis) rebuildBoardVisuals();
          updateCardCount();
          break;
      }

      for (const log of m.logs) {
        logAction(log, false);
      }

      updateCardCount();
    };
    /*
    window.addEventListener('beforeunload', () => {
        pubnub.disconnect();
    });
    */
    // subscribe to the channel
    subscription.subscribe();

    pubnub.setState({
      state: {
        uuid: myId,
        time: Date.now(),
      },
      channels: [channelName],
    });

  } catch (e) {
    console.log(e);
  }
};

// paste below "publish message" comment
async function publishMessage(message) {
  // With the right payload, you can publish a message, add a reaction to a message,
  // send a push notification, or send a small payload called a signal.
  const publishPayload = {
    channel: channelName,
    message: {
      title: "greeting",
      description: message
    }
  };
  await pubnub.publish(publishPayload);
}

// Function to update the user list
function updateUserList() {
  userListElement.innerHTML = ''; // Clear the current list
  userList.forEach(uuid => {
    const listItem = document.createElement('span');
    listItem.textContent = uuid.slice(-5);  // Display the user's UUID
    if (uuid === myId) listItem.style.backgroundColor = 'greenyellow';
    userListElement.appendChild(listItem);
  });
}

async function sendGameState() {
  let payload = {
    message: {
      category: 'gameState',
      data: gameState,
    }
  };
  await publishStateMessage(payload);
}

async function publishStateMessage(payload) {
  if (actionLog.length > actionLogNextSendIndex) {
    payload.message.logs = actionLog.slice(actionLogNextSendIndex);
    actionLogNextSendIndex = actionLog.length;
  } else {
    payload.message.logs = [];
  }
  payload.channel = channelName;
  await pubnub.publish(payload);
}

function isInPlayIdentical(newInPlay) {
  const inPlay = gameState.inPlay;

  const keys1 = Object.keys(inPlay);
  const keys2 = Object.keys(newInPlay);

  // Check if both objects have the same keys
  if (keys1.length !== keys2.length) {
    return false;
  }

  for (const key of keys1) {
    if (!newInPlay.hasOwnProperty(key)) {
      return false;
    }

    const arr1 = inPlay[key];
    const arr2 = newInPlay[key];

    // Check if both values are arrays of the same length
    if (!Array.isArray(arr1) || !Array.isArray(arr2) || arr1.length !== arr2.length) {
      return false;
    }

    // Check if all elements in the arrays are the same
    for (let i = 0; i < arr1.length; i++) {
      if (arr1[i] !== arr2[i]) {
        return false;
      }
    }
  }

  return true;  // The objects are identical
}
