const DAY_ALIASES = {
  monday: 'Mon',
  mon: 'Mon',
  tuesday: 'Tue',
  tue: 'Tue',
  tues: 'Tue',
  wednesday: 'Wed',
  wed: 'Wed',
  thursday: 'Thu',
  thu: 'Thu',
  thur: 'Thu',
  thurs: 'Thu',
  friday: 'Fri',
  fri: 'Fri',
  saturday: 'Sat',
  sat: 'Sat',
  sunday: 'Sun',
  sun: 'Sun',
};

const DAY_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function primitive(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'string') return value.trim();
  return '';
}

function display(value, fallback = '-') {
  const direct = primitive(value);
  if (direct) return direct;

  if (isPlainObject(value)) {
    return (
      display(value.name, '') ||
      display(value.fullName, '') ||
      display(value.title, '') ||
      display(value.label, '') ||
      display(value.value, '') ||
      fallback
    );
  }

  return fallback;
}

function resolveId(...values) {
  const value = values.find((item) => {
    if (item === null || item === undefined) return false;
    if (typeof item === 'string') return item.trim() !== '';
    return true;
  });

  return value === undefined ? null : value;
}

function parseCount(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, value);
    const parsed = Number(String(value).replace(/[^\d.-]/g, ''));
    if (Number.isFinite(parsed)) return Math.max(0, parsed);
  }

  return 0;
}

function dayFromValue(value) {
  if (isPlainObject(value)) {
    return dayFromValue(
      value.day ||
        value.name ||
        value.label ||
        value.reportingDay ||
        value.weekDay ||
        value.value
    );
  }

  const text = primitive(value).toLowerCase();
  if (!text) return '';
  return DAY_ALIASES[text] || '';
}

export function normalizeReportingDays(value) {
  let values = [];

  if (Array.isArray(value)) {
    values = value;
  } else if (typeof value === 'string') {
    values = value.split(/[,/|;]+|\s+-\s+/).flatMap((part) => part.trim().split(/\s+/));
  } else if (isPlainObject(value)) {
    values = Object.entries(value)
      .filter(([, isActive]) => Boolean(isActive))
      .map(([day]) => day);
  }

  const unique = new Set();
  values.forEach((item) => {
    const day = dayFromValue(item);
    if (day) unique.add(day);
  });

  return DAY_ORDER.filter((day) => unique.has(day));
}

function extractCollection(payload, keys) {
  if (Array.isArray(payload)) return payload;
  if (typeof payload === 'string') {
    throw new Error('Unable to load teams.');
  }
  if (!isPlainObject(payload)) return [];

  for (const key of keys) {
    if (Array.isArray(payload[key])) return payload[key];
  }

  if (isPlainObject(payload.data)) {
    for (const key of keys) {
      if (Array.isArray(payload.data[key])) return payload.data[key];
    }
  }

  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.result)) return payload.result;
  const firstArray = Object.values(payload).find(Array.isArray);
  if (Array.isArray(firstArray)) return firstArray;

  return [];
}

export function extractTeamCollection(payload) {
  return extractCollection(payload, ['data', 'result', 'items', 'records', 'teams']);
}

function extractTeamObject(payload) {
  if (Array.isArray(payload)) return payload[0] || null;
  if (typeof payload === 'string') throw new Error('Unable to load team details.');
  if (!isPlainObject(payload)) return null;
  if (isPlainObject(payload.data?.team)) return payload.data.team;
  if (isPlainObject(payload.data?.result)) return payload.data.result;
  if (isPlainObject(payload.data)) return payload.data;
  if (isPlainObject(payload.result)) return payload.result;
  if (isPlainObject(payload.team)) return payload.team;
  return payload;
}

function memberName(member) {
  const joined = `${primitive(member?.firstName)} ${primitive(member?.lastName)}`.trim();
  return (
    display(member?.employeeName, '') ||
    display(member?.name, '') ||
    display(member?.fullName, '') ||
    display(member?.userName, '') ||
    joined ||
    '-'
  );
}

export function normalizeMember(member, teamFallback = {}) {
  const employeeId = resolveId(
    member?.employeeId,
    member?.userId,
    member?.employeeCode,
    member?.employee_Id,
    member?.id
  );
  const wfoDays = normalizeReportingDays(
    member?.overrideWfoDays ?? member?.wfoDays ?? member?.reportingDays ?? teamFallback.reportingDays
  );
  const wfhDays = normalizeReportingDays(member?.overrideWfhDays ?? member?.wfhDays);
  const explicitCrossTeam = member?.crossTeam ?? member?.isCrossTeam ?? member?.isCrossMapped;

  return {
    id: employeeId ?? `${memberName(member)}-${teamFallback.id || 'member'}`,
    employeeId: display(employeeId, '-'),
    name: memberName(member),
    role: display(member?.role ?? member?.designation ?? member?.designationName ?? member?.roleName ?? member?.position, 'Employee'),
    projectName: display(member?.overrideProjectName ?? member?.projectName ?? member?.assignedProject, teamFallback.projectName || '-'),
    engagementType: display(member?.engagementType ?? member?.engagement, teamFallback.engagementType || '-'),
    wfoDays,
    wfhDays,
    isCrossTeam: Boolean(explicitCrossTeam || member?.overrideProjectId),
  };
}

function rawMembers(team) {
  const collection =
    team?.members ??
    team?.teamMembers ??
    team?.employees ??
    team?.employeeDetails ??
    team?.assignedEmployees ??
    [];

  return Array.isArray(collection) ? collection : [];
}

function rawEmployeeNames(team) {
  return Array.isArray(team?.employeeNames) ? team.employeeNames : [];
}

export function normalizeTeam(rawTeam = {}, index = 0) {
  const id = resolveId(rawTeam.teamId, rawTeam.id, rawTeam.team_Id, rawTeam.teamID);
  const reportingDays = normalizeReportingDays(
    rawTeam.reportingDays ?? rawTeam.wfoDays ?? rawTeam.officeDays ?? rawTeam.teamReportingDays
  );
  const fallback = {
    id,
    projectName: display(rawTeam.projectName ?? rawTeam.project ?? rawTeam.assignedProject ?? rawTeam.projectTitle),
    engagementType: display(rawTeam.engagementType ?? rawTeam.engagement ?? rawTeam.projectType ?? rawTeam.type),
    reportingDays,
  };
  const members = rawMembers(rawTeam).map((member) => normalizeMember(member, fallback));
  const employeeNames = rawEmployeeNames(rawTeam);
  const memberCount = parseCount(
    rawTeam.membersCount,
    rawTeam.memberCount,
    rawTeam.totalMembers,
    rawTeam.employeeCount,
    members.length || '',
    employeeNames.length || ''
  );
  const team = {
    id,
    key: id !== null && id !== undefined ? String(id) : `team-${index}`,
    teamNumber: display(rawTeam.teamNumber ?? rawTeam.teamNo ?? rawTeam.number ?? rawTeam.teamCode, id ?? index + 1),
    teamName: display(rawTeam.teamName ?? rawTeam.name ?? rawTeam.title, 'Untitled Team'),
    reportingManager: display(
      rawTeam.reportingManager ??
        rawTeam.reportingManagerName ??
        rawTeam.managerName ??
        rawTeam.manager ??
        rawTeam.teamLead ??
        rawTeam.teamLeadName
    ),
    projectName: fallback.projectName,
    engagementType: fallback.engagementType,
    reportingDays,
    members,
    memberCount,
  };

  team.searchText = [
    team.teamNumber,
    team.teamName,
    team.reportingManager,
    team.projectName,
    team.engagementType,
    team.reportingDays.join(' '),
    team.members.map((member) => member.name).join(' '),
    employeeNames.map((item) => display(item, '')).join(' '),
  ]
    .join(' ')
    .toLowerCase();

  return team;
}

export function normalizeTeams(payload) {
  return extractTeamCollection(payload).map(normalizeTeam);
}

export function normalizeTeamDetails(payload, initialTeam = null) {
  const teamObject = extractTeamObject(payload);
  if (!teamObject) return initialTeam;
  const normalized = normalizeTeam(teamObject);

  if (!initialTeam) return normalized;

  return {
    ...initialTeam,
    ...normalized,
    id: normalized.id ?? initialTeam.id,
    key: normalized.key || initialTeam.key,
  };
}
