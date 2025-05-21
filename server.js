require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const PLAYERS_FILE = path.join(__dirname, 'data', 'players.json');
app.use(express.static('public'));

app.get('/api/players', (req, res) => {
  const data = fs.readFileSync(PLAYERS_FILE);
  res.json(JSON.parse(data));
});

app.listen(PORT, () => {
  console.log(`Server läuft auf http://localhost:${PORT}`);
});
