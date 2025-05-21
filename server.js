require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const app = express();
const PORT = process.env.PORT || 3000;

const PLAYERS_FILE = path.join(__dirname, 'data', 'players.json');

app.use(express.static('public'));

app.get('/api/players', (req, res) => {
  try {
    const data = fs.readFileSync(PLAYERS_FILE);
    res.json(JSON.parse(data));
  } catch (err) {
    res.status(500).json({ error: 'Konnte die Spieldaten nicht lesen.' });
  }
});

// --- Update-Logik ---

async function getTwitchToken() {
  const res = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    body: new URLSearchParams({
      client_id: process.env.TWITCH_CLIENT_ID,
      client_secret: process.env.TWITCH_CLIENT_SECRET,
      grant_type: 'client_credentials',
    }),
  });
  const data = await res.json();
  return data.access_token;
}

async function getTwitchStatuses(players, token) {
  const loginNames = players.map(p => p.twitch).join('&user_login=');
  const url = `https://api.twitch.tv/helix/streams?user_login=${loginNames}`;

  const res = await fetch(url, {
    headers: {
      'Client-ID': process.env.TWITCH_CLIENT_ID,
      'Authorization': `Bearer ${token}`,
    },
  });

  const data = await res.json();
  const onlineUsers = data.data.map(stream => stream.user_login);

  return players.map(player => ({
    ...player,
    status: onlineUsers.includes(player.twitch) ? 'online' : 'offline',
  }));
}

async function getBlizzardToken() {
  const res = await fetch('https://eu.battle.net/oauth/token', {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + Buffer.from(`${process.env.BLIZZARD_CLIENT_ID}:${process.env.BLIZZARD_CLIENT_SECRET}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials',
  });
  const data = await res.json();
  return data.access_token;
}

async function getCharacterLevel(charname, realm, token) {
  const url = `https://eu.api.blizzard.com/profile/wow/character/${realm.toLowerCase()}/${charname.toLowerCase()}?namespace=profile-eu&locale=de_DE`;

  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  console.log(`Abruf für ${charname} auf ${realm}: Status ${res.status}`);

  if (!res.ok) {
    const text = await res.text();
    console.error('Fehler beim Abrufen der Charakterdaten:', text);
    return null;
  }

  const data = await res.json();
  return data.level || null;
}

async function updatePlayers() {
  try {
    const players = JSON.parse(fs.readFileSync(PLAYERS_FILE));
    const twitchToken = await getTwitchToken();
    const blizzardToken = await getBlizzardToken();

    const updated = await Promise.all(players.map(async player => {
      const statusUpdated = await getTwitchStatuses([player], twitchToken);
      const autoLevel = await getCharacterLevel(player.charname, player.realm, blizzardToken);
      return {
        ...statusUpdated[0],
        auto_level: autoLevel ?? player.auto_level,
      };
    }));

    fs.writeFileSync(PLAYERS_FILE, JSON.stringify(updated, null, 2));
    console.log(`[${new Date().toLocaleTimeString()}] Daten aktualisiert.`);
  } catch (err) {
    console.error(`[${new Date().toLocaleTimeString()}] Fehler beim Aktualisieren:`, err);
  }
}

// Starte Update alle 3 Minuten
updatePlayers();
setInterval(updatePlayers, 3 * 60 * 1000);

// --- Server starten ---
app.listen(PORT, () => {
  console.log(`Server läuft auf http://localhost:${PORT}`);
});
