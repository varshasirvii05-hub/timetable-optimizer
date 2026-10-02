// server.js - Express API + static hosting. Run: npm install && npm start
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { DAYS, generateTimetable } = require('./scheduler');

const app = express();
const DATA_FILE = path.join(__dirname, 'data.json');
const SAMPLE = {
  courses: [
    { name: 'Data Structures', inst: 'Dr. Rao', group: 'CSE-A', n: 55 },
    { name: 'Database Systems', inst: 'Dr. Sharma', group: 'CSE-B', n: 50 },
    { name: 'Operating Systems', inst: 'Dr. Kumar', group: 'CSE-A', n: 55 },
    { name: 'Computer Networks', inst: 'Dr. Priya', group: 'CSE-C', n: 45 },
    { name: 'Mathematics', inst: 'Dr. Rao', group: 'CSE-C', n: 45 },
    { name: 'Python Programming', inst: 'Dr. Mehta', group: 'CSE-B', n: 50 }
  ],
  rooms: [
    { name: 'Room 101', cap: 60 }, { name: 'Room 102', cap: 55 },
    { name: 'Room 103', cap: 50 }, { name: 'Lab 201', cap: 60 }
  ],
  periods: 4,
  blocked: [{ name: 'Dr. Rao', day: 0 }] // day: 0=Mon ... 4=Fri
};

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public'))); // put timetable-optimizer.html here as index.html

/* Validate and normalise the request body; returns {error} or {data} */
function parse(body) {
  if (!body || !Array.isArray(body.courses) || !Array.isArray(body.rooms)) return { error: 'courses and rooms must be arrays' };
  const courses = body.courses.map(c => ({ name: String(c.name || '').trim(), inst: String(c.inst || '').trim(), group: String(c.group || '').trim(), n: Number(c.n) }));
  const rooms = body.rooms.map(r => ({ name: String(r.name || '').trim(), cap: Number(r.cap) }));
  if (!courses.length) return { error: 'Add at least one course' };
  if (!rooms.length) return { error: 'Add at least one room' };
  if (courses.some(c => !c.name || !(c.n > 0))) return { error: 'Every course needs a name and a positive student count' };
  if (rooms.some(r => !r.name || !(r.cap > 0))) return { error: 'Every room needs a name and a positive capacity' };
  const periods = Math.max(1, Math.min(8, parseInt(body.periods, 10) || 4));
  const blocked = (Array.isArray(body.blocked) ? body.blocked : [])
    .map(b => ({ name: String(b.name || '').trim(), day: typeof b.day === 'string' ? DAYS.indexOf(b.day.slice(0, 3)) : Number(b.day) }))
    .filter(b => b.name && b.day >= 0 && b.day <= 4);
  return { data: { courses, rooms, periods, blocked } };
}

// POST /api/generate  -> runs the algorithms and returns the timetable, graph, stats and conflicts
app.post('/api/generate', (req, res) => {
  const { data, error } = parse(req.body);
  if (error) return res.status(400).json({ error });
  res.json(generateTimetable(data));
});

// GET /api/data -> saved input (or the sample); PUT /api/data -> save input
app.get('/api/data', (req, res) => {
  try { res.json(JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))); }
  catch { res.json(SAMPLE); }
});
app.put('/api/data', (req, res) => {
  const { data, error } = parse(req.body);
  if (error) return res.status(400).json({ error });
  fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2), err => err ? res.status(500).json({ error: 'Could not save data' }) : res.json({ saved: true }));
});

app.get('/api/sample', (req, res) => res.json(SAMPLE));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Timetable API running at http://localhost:${PORT}`));
