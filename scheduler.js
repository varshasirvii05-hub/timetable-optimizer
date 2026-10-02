// scheduler.js - core algorithms (pure functions, no I/O)
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

/* GRAPH COLORING (step 1): vertices = classes, edge = cannot share a time slot */
function buildConflictGraph(courses) {
  const adj = courses.map(() => new Set());
  const edges = [];
  for (let i = 0; i < courses.length; i++) {
    for (let j = i + 1; j < courses.length; j++) {
      const why = [];
      if (courses[i].inst && courses[i].inst === courses[j].inst) why.push('instructor');
      if (courses[i].group && courses[i].group === courses[j].group) why.push('student group');
      if (why.length) { adj[i].add(j); adj[j].add(i); edges.push({ a: i, b: j, why: why.join(' + ') }); }
    }
  }
  return { adj, edges };
}

/* GRAPH COLORING (step 2) + GREEDY: Welsh-Powell order, smallest color not used by a neighbour */
function greedyGraphColoring(graph) {
  const n = graph.adj.length;
  const color = Array(n).fill(-1);
  const order = [...Array(n).keys()].sort((a, b) => graph.adj[b].size - graph.adj[a].size);
  const steps = [];
  for (const v of order) {
    const used = new Set([...graph.adj[v]].map(u => color[u]).filter(c => c >= 0));
    let c = 0;
    while (used.has(c)) c++;
    color[v] = c;
    steps.push({ course: v, color: c, degree: graph.adj[v].size });
  }
  return { color, steps, count: n ? Math.max(...color) + 1 : 0 };
}

/* SCHEDULING: map each color class to a weekly (day, period) slot, honouring availability */
function scheduleColors(courses, color, count, periods, blocked) {
  const order = [];
  for (let p = 0; p < periods; p++) for (let d = 0; d < 5; d++) order.push({ d, p });
  const taken = new Set();
  const slotOf = [];
  const problems = [];
  for (let k = 0; k < count; k++) {
    const members = color.map((c, i) => (c === k ? i : -1)).filter(i => i >= 0);
    const idx = order.findIndex((o, n) =>
      !taken.has(n) &&
      members.every(i => !blocked.some(b => (b.name === courses[i].inst || b.name === courses[i].group) && b.day === o.d)));
    if (idx < 0) { slotOf[k] = null; problems.push(`Time slot ${k + 1}: no free weekly period respects availability`); }
    else { taken.add(idx); slotOf[k] = order[idx]; }
  }
  return { slotOf, problems };
}

/* GREEDY ALGORITHM: per slot, largest class first, take the first free room that fits (rooms sorted by capacity) */
function allocateRoomsGreedy(courses, color, count, rooms) {
  const sorted = [...rooms].sort((a, b) => a.cap - b.cap);
  const room = Array(courses.length).fill(null);
  const problems = [];
  for (let k = 0; k < count; k++) {
    const busy = new Set();
    const members = courses.map((_, i) => i).filter(i => color[i] === k).sort((a, b) => courses[b].n - courses[a].n);
    for (const i of members) {
      const r = sorted.find(r => !busy.has(r.name) && r.cap >= courses[i].n);
      if (r) { busy.add(r.name); room[i] = r; }
      else problems.push(`${courses[i].name} (${courses[i].n} students): no free room with enough capacity in slot ${k + 1}`);
    }
  }
  return { room, problems };
}

function calculateRoomUtilization(color, room, count) {
  const perSlot = Array.from({ length: count }, (_, k) => room.filter((r, i) => r && color[i] === k).length);
  const needed = perSlot.length ? Math.max(...perSlot) : 0;
  const placed = room.filter(Boolean).length;
  const perRoom = {};
  room.forEach(r => { if (r) perRoom[r.name] = (perRoom[r.name] || 0) + 1; });
  return { needed, percent: needed && count ? Math.round((100 * placed) / (needed * count)) : 0, perRoom };
}

/* Independent re-check of the finished timetable */
function validateConflicts(courses, A) {
  const out = { instructor: [], student: [], room: [], capacity: [], unplaced: [] };
  courses.forEach((c, i) => {
    if (!A[i].slot) { out.unplaced.push(`${c.name} has no time slot`); return; }
    if (!A[i].room) out.capacity.push(`${c.name}: no room with capacity >= ${c.n}`);
    else if (A[i].room.cap < c.n) out.capacity.push(`${c.name}: room too small`);
  });
  for (let i = 0; i < courses.length; i++) {
    for (let j = i + 1; j < courses.length; j++) {
      const a = A[i], b = A[j];
      if (!a.slot || !b.slot || a.slot.d !== b.slot.d || a.slot.p !== b.slot.p) continue;
      if (courses[i].inst === courses[j].inst) out.instructor.push(`${courses[i].inst}: ${courses[i].name} and ${courses[j].name}`);
      if (courses[i].group === courses[j].group) out.student.push(`${courses[i].group}: ${courses[i].name} and ${courses[j].name}`);
      if (a.room && b.room && a.room.name === b.room.name) out.room.push(`${a.room.name}: ${courses[i].name} and ${courses[j].name}`);
    }
  }
  return out;
}

/* Full pipeline: Input -> graph -> coloring -> scheduling -> rooms -> validation */
function generateTimetable({ courses, rooms, periods = 4, blocked = [] }) {
  const graph = buildConflictGraph(courses);
  const col = greedyGraphColoring(graph);
  const sch = scheduleColors(courses, col.color, col.count, periods, blocked);
  const alloc = allocateRoomsGreedy(courses, col.color, col.count, rooms);
  const A = courses.map((c, i) => ({ slot: sch.slotOf[col.color[i]], room: alloc.room[i], color: col.color[i] }));
  const conflicts = validateConflicts(courses, A);
  const util = calculateRoomUtilization(col.color, alloc.room, col.count);
  const problems = [...sch.problems, ...alloc.problems];
  const valid = problems.length === 0 && Object.values(conflicts).every(a => a.length === 0);

  const timetable = courses
    .map((c, i) => A[i].slot && {
      day: DAYS[A[i].slot.d], period: A[i].slot.p + 1, time: `${9 + A[i].slot.p}:00-${10 + A[i].slot.p}:00`,
      course: c.name, instructor: c.inst, group: c.group, students: c.n,
      room: A[i].room ? A[i].room.name : null, timeSlot: A[i].color + 1,
      _d: A[i].slot.d, _p: A[i].slot.p })
    .filter(Boolean)
    .sort((x, y) => x._d - y._d || x._p - y._p)
    .map(({ _d, _p, ...rest }) => rest);

  return {
    valid, problems, conflicts, timetable,
    graph: { nodes: courses.map((c, i) => ({ id: i, name: c.name, color: col.color[i] + 1 })), edges: graph.edges },
    coloringSteps: col.steps,
    stats: {
      totalClasses: courses.length, timeSlotsUsed: col.count, classroomsRequired: util.needed,
      roomUtilizationPercent: util.percent, roomUsage: util.perRoom,
      instructorConflicts: conflicts.instructor.length, studentConflicts: conflicts.student.length, roomConflicts: conflicts.room.length
    }
  };
}

module.exports = { DAYS, buildConflictGraph, greedyGraphColoring, scheduleColors, allocateRoomsGreedy, calculateRoomUtilization, validateConflicts, generateTimetable };
