// server.js — bridges the C program output to the browser
// Run: node server.js
// Requires: npm install express cors

const express    = require('express');
const cors       = require('cors');
const { exec }   = require('child_process');
const path       = require('path');
const fs         = require('fs');

const app  = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// Run C simulation and return JSON
app.get('/simulate', (req, res) => {
  const frames = parseInt(req.query.frames) || 4;
  const errProb= parseInt(req.query.error)  || 30;

  const cmd = `./protocol ${frames} ${errProb}`;
  exec(cmd, { cwd: path.join(__dirname, '../backend') }, (err, stdout, stderr) => {
    if (err) {
      return res.status(500).json({ error: 'Simulation failed', detail: stderr });
    }
    const jsonPath = path.join(__dirname, '../backend/output.json');
    fs.readFile(jsonPath, 'utf8', (readErr, data) => {
      if (readErr) return res.status(500).json({ error: 'Cannot read output' });
      try {
        res.json(JSON.parse(data));
      } catch (e) {
        res.status(500).json({ error: 'Invalid JSON output' });
      }
    });
  });
});

// Serve the log file
app.get('/log', (req, res) => {
  const logPath = path.join(__dirname, '../backend/output.txt');
  res.sendFile(logPath);
});

app.listen(PORT, () => {
  console.log(`Server running → http://localhost:${PORT}`);
  console.log('Make sure protocol.c is compiled: gcc -o backend/protocol backend/protocol.c');
});