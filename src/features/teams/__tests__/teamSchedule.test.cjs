const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const babel = require('@babel/core');

function loadModule(filename, dependencies = {}) {
  const source = fs.readFileSync(filename, 'utf8');
  const code = babel.transformSync(source, {
    filename,
    presets: ['babel-preset-expo'],
  }).code;
  const module = { exports: {} };
  const localRequire = (request) => dependencies[request] || require(request);
  const factory = vm.runInNewContext(`(function(require, module, exports) { ${code}\n})`);
  factory(localRequire, module, module.exports);
  return module.exports;
}

const featureDir = path.resolve(__dirname, '..');
const mappers = loadModule(path.join(featureDir, 'teamMappers.jsx'));
const dateUtils = loadModule(path.join(featureDir, 'teamDateUtils.js'), {
  './teamMappers': mappers,
});

test('preserves explicit effective WFO and WFH days when custom reporting is false', () => {
  const team = mappers.normalizeMyTeam({
    teamId: 13,
    reportingDays: ['Tue', 'Wed', 'Fri'],
    weeklyOffDays: ['Saturday', 'Sunday'],
    members: [{
      employeeId: 'P310',
      name: 'Test Employee',
      customReportingDays: false,
      customWeeklyOffDays: false,
      overrideWeeklyOffDays: [],
      overrideWfoDays: ['Tue', 'Wed', 'Fri'],
      overrideWfhDays: ['Mon', 'Thu'],
    }],
  });

  assert.deepEqual(Array.from(team.members[0].wfoDays), ['Tue', 'Wed', 'Fri']);
  assert.deepEqual(Array.from(team.members[0].wfhDays), ['Mon', 'Thu']);

  const weekStart = new Date(2026, 10, 16);
  assert.deepEqual(
    Array.from(dateUtils.scheduleDays(team.members[0].wfoDays, weekStart), ({ day, date }) => [day, date.getDate()]),
    [['Tue', 17], ['Wed', 18], ['Fri', 20]]
  );
  assert.deepEqual(
    Array.from(dateUtils.scheduleDays(team.members[0].wfhDays, weekStart), ({ day, date }) => [day, date.getDate()]),
    [['Mon', 16], ['Thu', 19]]
  );
});

test('normalizes full day names and excludes weekly-off and overlapping days', () => {
  const member = mappers.normalizeMember({
    employeeId: 'P380',
    overrideWfoDays: ['Monday', 'Tuesday', 'Saturday'],
    overrideWfhDays: ['Tuesday', 'Thursday', 'Sunday'],
  }, {
    reportingDays: ['Tue', 'Wed', 'Fri'],
    weeklyOffDays: ['Saturday', 'Sunday'],
  });

  assert.deepEqual(Array.from(member.wfoDays), ['Mon', 'Tue']);
  assert.deepEqual(Array.from(member.wfhDays), ['Thu']);
});

test('distinguishes explicit empty schedules from missing schedules', () => {
  const fallback = {
    reportingDays: ['Tue', 'Wed', 'Fri'],
    weeklyOffDays: ['Sat', 'Sun'],
  };
  const explicitEmpty = mappers.normalizeMember({
    employeeId: 'P1',
    overrideWfoDays: [],
    overrideWfhDays: [],
  }, fallback);
  const missing = mappers.normalizeMember({ employeeId: 'P2' }, fallback);

  assert.deepEqual(Array.from(explicitEmpty.wfoDays), []);
  assert.deepEqual(Array.from(explicitEmpty.wfhDays), []);
  assert.deepEqual(Array.from(missing.wfoDays), ['Tue', 'Wed', 'Fri']);
  assert.deepEqual(Array.from(missing.wfhDays), []);
});

test('keeps different member schedules independent and supports acronym-cased fields', () => {
  const team = mappers.normalizeMyTeam({
    teamId: 13,
    reportingDays: ['Tue', 'Wed', 'Fri'],
    members: [
      { employeeId: 'P1', overrideWfoDays: ['Tue'], overrideWfhDays: ['Mon'] },
      {
        employeeId: 'P2',
        customReportingDays: true,
        overrideWFODays: ['Wed', 'Fri'],
        overrideWFHDays: ['Thu'],
      },
    ],
  });

  assert.deepEqual(Array.from(team.members[0].wfoDays), ['Tue']);
  assert.deepEqual(Array.from(team.members[0].wfhDays), ['Mon']);
  assert.deepEqual(Array.from(team.members[1].wfoDays), ['Wed', 'Fri']);
  assert.deepEqual(Array.from(team.members[1].wfhDays), ['Thu']);
});

test('maps schedule dates correctly across a month boundary', () => {
  const schedule = dateUtils.scheduleDays(['Mon', 'Wed', 'Sun'], new Date(2026, 10, 30));
  assert.deepEqual(
    Array.from(schedule, ({ day, date }) => [day, date.getFullYear(), date.getMonth() + 1, date.getDate()]),
    [['Mon', 2026, 11, 30], ['Wed', 2026, 12, 2], ['Sun', 2026, 12, 6]]
  );
});
