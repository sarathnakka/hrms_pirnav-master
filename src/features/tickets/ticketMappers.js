const normalizeSpace = (value = '') => String(value || '').replace(/\s+/g, ' ').trim();

const titleCaseWord = (word) =>
  String(word || '')
    .toLowerCase()
    .replace(/^\w/, (char) => char.toUpperCase());

export const TICKET_CATEGORY_OPTIONS = [
  'HR',
  'IT Support',
  'Payroll',
  'Admin',
  'General Queries',
];

export const TICKET_PRIORITY_OPTIONS = [
  'Low',
  'Medium',
  'High',
  'Critical',
];

export const EMPLOYEE_TICKET_STATUS_OPTIONS = [
  'In Progress',
  'On Hold',
  'Completed',
];

export const TICKET_FORM_LIMITS = {
  title: 120,
  description: 1500,
  category: 60,
  priority: 20,
};

export function extractTicketDetail(payload) {
  return (
    payload?.data?.data ??
    payload?.data?.ticket ??
    payload?.data?.record ??
    payload?.data ??
    payload?.ticket ??
    payload?.record ??
    payload?.result ??
    payload ??
    {}
  );
}

export function extractTicketCollection(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.tickets)) return payload.tickets;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.records)) return payload.records;
  if (Array.isArray(payload?.result)) return payload.result;
  if (Array.isArray(payload?.data?.tickets)) return payload.data.tickets;
  if (Array.isArray(payload?.data?.items)) return payload.data.items;
  if (Array.isArray(payload?.data?.records)) return payload.data.records;

  const firstArray = Object.values(payload || {}).find(Array.isArray);
  return Array.isArray(firstArray) ? firstArray : [];
}

export function normalizeTicketPriority(value) {
  const normalized = normalizeSpace(value).toLowerCase();

  if (!normalized) return 'Medium';
  if (normalized.includes('critical')) return 'Critical';
  if (normalized.includes('high')) return 'High';
  if (normalized.includes('low')) return 'Low';
  if (normalized.includes('medium')) return 'Medium';

  return titleCaseWord(normalized);
}

export function normalizeTicketStatus(value) {
  const normalized = normalizeSpace(value).toLowerCase().replace(/[-_]/g, ' ');
  const compact = normalized.replace(/\s+/g, '');

  if (!normalized) return 'Open';
  if (compact === 'open' || compact === 'todo' || compact === 'new') return 'Open';
  if (compact === 'assigned') return 'Assigned';
  if (compact === 'inprogress' || normalized.includes('progress')) return 'In Progress';
  if (compact === 'onhold' || normalized.includes('hold')) return 'On Hold';
  if (
    compact === 'completed' ||
    compact === 'complete' ||
    compact === 'done' ||
    compact === 'resolved'
  ) {
    return 'Completed';
  }
  if (compact === 'closed' || compact === 'close') return 'Closed';
  if (compact === 'pending' || normalized.includes('waiting')) return 'Pending';
  if (compact === 'rejected' || compact === 'declined' || compact === 'cancelled') return 'Rejected';

  return titleCaseWord(normalized);
}

export function normalizeTicketCategory(value) {
  const normalized = normalizeSpace(value);
  if (!normalized) return 'General Queries';

  const matchedCategory = TICKET_CATEGORY_OPTIONS.find(
    (option) => option.toLowerCase() === normalized.toLowerCase()
  );

  return matchedCategory || normalized;
}

export function getTicketStatusLabel(status) {
  return normalizeTicketStatus(status);
}

export function getTicketPriorityLabel(priority) {
  return normalizeTicketPriority(priority);
}

export function getTicketStatusOptions() {
  return [...EMPLOYEE_TICKET_STATUS_OPTIONS];
}

export function getTicketCategoryOptions() {
  return [...TICKET_CATEGORY_OPTIONS];
}

export function normalizeTicketId(ticket = {}) {
  return (
    ticket.ticketId ??
    ticket.ticketID ??
    ticket.ticket_Id ??
    ticket.id ??
    ticket.Id ??
    ticket.ticketNo ??
    ticket.ticketNumber ??
    ticket.referenceNo ??
    ''
  );
}

function extractArray(ticket = {}, keys = []) {
  const match = keys.map((key) => ticket?.[key]).find(Array.isArray);
  return Array.isArray(match) ? match : [];
}

export function normalizeEmployeeOption(employee = {}) {
  const id =
    employee.employeeId ??
    employee.EmployeeId ??
    employee.employee_Id ??
    employee.employee_id ??
    employee.id ??
    employee.Id ??
    '';

  const firstName = normalizeSpace(employee.firstName || employee.FirstName);
  const lastName = normalizeSpace(employee.lastName || employee.LastName);
  const name =
    normalizeSpace(
      employee.name ||
      employee.Name ||
      employee.employeeName ||
      employee.EmployeeName ||
      employee.fullName ||
      employee.FullName ||
      `${firstName} ${lastName}`
    ) ||
    'Employee';

  const normalizedId = String(id || '').trim();

  return {
    id: normalizedId,
    name,
    label: `${name}${normalizedId ? ` (${normalizedId})` : ''}`,
  };
}

export function normalizeEmployeeOptions(payload) {
  return extractTicketCollection(payload)
    .map(normalizeEmployeeOption)
    .filter((employee) => employee.id || employee.name)
    .sort((left, right) => left.label.localeCompare(right.label));
}

export function normalizeTicketRecord(ticket = {}) {
  const rawTicketId = normalizeTicketId(ticket);
  const ticketNumber =
    ticket.ticketNumber ??
    ticket.TicketNumber ??
    ticket.ticketNo ??
    ticket.TicketNo ??
    ticket.ticketCode ??
    ticket.TicketCode ??
    ticket.referenceNo ??
    ticket.ReferenceNo ??
    '';
  const title =
    ticket.title ??
    ticket.Title ??
    ticket.ticketTitle ??
    ticket.subject ??
    ticket.Subject ??
    '';
  const description =
    ticket.description ??
    ticket.Description ??
    ticket.ticketDescription ??
    ticket.details ??
    ticket.Details ??
    '';

  const createdBy =
    ticket.createdBy ??
    ticket.CreatedBy ??
    ticket.createdByName ??
    ticket.requestedBy ??
    ticket.requestedByName ??
    ticket.employeeName ??
    ticket.EmployeeName ??
    '';

  const createdById =
    ticket.createdById ??
    ticket.CreatedById ??
    ticket.requestedById ??
    ticket.employeeId ??
    ticket.EmployeeId ??
    '';

  const assignedTo =
    ticket.assignedTo ??
    ticket.AssignedTo ??
    ticket.assignedToName ??
    ticket.assignee ??
    ticket.Assignee ??
    ticket.assignedEmployee ??
    ticket.assignedEmployeeName ??
    '';

  const assignedToId =
    ticket.assignedToId ??
    ticket.AssignedToId ??
    ticket.assigneeId ??
    ticket.AssigneeId ??
    ticket.assignedEmployeeId ??
    ticket.assignedEmployee_Id ??
    '';

  const assignedByName =
    ticket.assignedByName ??
    ticket.AssignedByName ??
    ticket.assignedByEmployee ??
    ticket.AssignedByEmployee ??
    ticket.createdByName ??
    ticket.CreatedByName ??
    '';

  const createdDate =
    ticket.createdAt ??
    ticket.CreatedAt ??
    ticket.createdDate ??
    ticket.CreatedDate ??
    ticket.submittedAt ??
    ticket.SubmittedAt ??
    '';

  const updatedDate =
    ticket.updatedAt ??
    ticket.UpdatedAt ??
    ticket.updatedDate ??
    ticket.UpdatedDate ??
    ticket.modifiedAt ??
    ticket.ModifiedAt ??
    '';

  const dueDate =
    ticket.dueDate ??
    ticket.DueDate ??
    ticket.ticketDueDate ??
    ticket.dueOn ??
    ticket.DueOn ??
    '';

  const assignedDate =
    ticket.assignedDate ??
    ticket.AssignedDate ??
    ticket.assignedAt ??
    ticket.AssignedAt ??
    ticket.assignedOn ??
    ticket.AssignedOn ??
    '';

  const startedDate =
    ticket.startedDate ??
    ticket.StartedDate ??
    ticket.startedAt ??
    ticket.StartedAt ??
    ticket.workStartedAt ??
    ticket.WorkStartedAt ??
    '';

  const completedDate =
    ticket.completedDate ??
    ticket.CompletedDate ??
    ticket.completedAt ??
    ticket.CompletedAt ??
    ticket.workCompletedAt ??
    ticket.WorkCompletedAt ??
    '';

  const stoppedDate =
    ticket.stoppedDate ??
    ticket.StoppedDate ??
    ticket.stoppedAt ??
    ticket.StoppedAt ??
    ticket.workStoppedAt ??
    ticket.WorkStoppedAt ??
    ticket.stopWorkAt ??
    ticket.StopWorkAt ??
    '';

  const notes =
    ticket.notes ??
    ticket.Notes ??
    ticket.remark ??
    ticket.Remark ??
    '';

  return {
    raw: ticket,
    id: ticket.id ?? ticket.Id ?? rawTicketId,
    ticketId: String(rawTicketId || '').trim(),
    ticketNumber: normalizeSpace(ticketNumber),
    projectId: ticket.projectId ?? ticket.ProjectId ?? ticket.projectID ?? 0,
    projectName: normalizeSpace(ticket.projectName ?? ticket.ProjectName ?? ''),
    technology: ticket.technology ?? ticket.Technology ?? '',
    module: normalizeSpace(ticket.module ?? ticket.Module ?? ''),
    startDate: ticket.startDate ?? ticket.StartDate ?? '',
    estimatedHours: ticket.estimatedHours ?? ticket.EstimatedHours ?? null,
    actualHours: ticket.actualHours ?? ticket.ActualHours ?? null,
    remainingHours: ticket.remainingHours ?? ticket.RemainingHours ?? null,
    deadline: ticket.deadline ?? ticket.Deadline ?? '',
    slaStatus: normalizeSpace(ticket.slaStatus ?? ticket.SlaStatus ?? ticket.SLAStatus ?? ''),
    title: normalizeSpace(title),
    description: normalizeSpace(description),
    category: normalizeTicketCategory(ticket.category ?? ticket.Category ?? ticket.ticketCategory ?? ticket.type ?? ticket.Type),
    priority: normalizeTicketPriority(ticket.priority ?? ticket.Priority ?? ticket.ticketPriority ?? ticket.severity ?? ticket.Severity),
    status: normalizeTicketStatus(ticket.status ?? ticket.Status ?? ticket.ticketStatus ?? ticket.state ?? ticket.State),
    createdBy: normalizeSpace(createdBy),
    createdById: normalizeSpace(createdById),
    assignedBy: normalizeSpace(ticket.assignedBy ?? ticket.AssignedBy ?? ticket.assignedByName ?? ticket.assignedByEmployee ?? createdBy),
    assignedByName: normalizeSpace(assignedByName),
    assignedTo: normalizeSpace(assignedTo),
    assignedToName: normalizeSpace(ticket.assignedToName ?? ticket.AssignedToName ?? assignedTo),
    assignedToId: normalizeSpace(assignedToId),
    createdDate,
    updatedDate,
    openedDate: ticket.openedDate ?? ticket.OpenedDate ?? '',
    dueDate,
    assignedDate,
    startedDate,
    stoppedDate,
    completedDate,
    workStarted: Boolean(ticket.workStarted ?? ticket.WorkStarted ?? ticket.isWorkStarted ?? ticket.IsWorkStarted ?? ticket.hasStartedWork ?? ticket.HasStartedWork ?? startedDate),
    workActive: Boolean(ticket.workActive ?? ticket.WorkActive ?? ticket.isWorkActive ?? ticket.IsWorkActive ?? ticket.isWorking ?? ticket.IsWorking ?? false),
    spentHours: ticket.spentHours ?? ticket.SpentHours ?? ticket.timeSpent ?? ticket.TimeSpent ?? ticket.actualHours ?? ticket.ActualHours ?? ticket.workHours ?? ticket.WorkHours ?? '',
    notes: normalizeSpace(notes),
    comments: extractArray(ticket, ['comments', 'Comments', 'ticketComments', 'TicketComments']),
    remarks: extractArray(ticket, ['remarks', 'Remarks']),
    attachments: extractArray(ticket, ['attachments', 'Attachments', 'ticketAttachments', 'TicketAttachments', 'files', 'Files']),
    timeline: extractArray(ticket, ['timeline', 'Timeline', 'history', 'History', 'statusTimeline', 'StatusTimeline']),
    rawStatus: ticket.status ?? ticket.Status ?? ticket.ticketStatus ?? '',
  };
}

export function normalizeTicketDetail(payload) {
  return normalizeTicketRecord(extractTicketDetail(payload));
}

export function normalizeTickets(payload) {
  return extractTicketCollection(payload)
    .map(normalizeTicketRecord)
    .filter((ticket) => ticket.ticketId);
}

export function getTicketSearchText(ticket = {}) {
  return [
    ticket.ticketId,
    ticket.title,
    ticket.createdBy,
    ticket.assignedBy,
    ticket.assignedTo,
    ticket.assignedToId,
    ticket.category,
    ticket.priority,
    ticket.status,
    ticket.notes,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export function formatTicketDate(value) {
  if (!value) return '--';

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return String(value);
  }

  return parsed.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function formatTicketDateTime(value) {
  if (!value) return '--';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '--';
  return `${formatTicketDate(value)}, ${parsed.toLocaleTimeString('en-GB', {
    hour: 'numeric', minute: '2-digit', hour12: true,
  }).replace(/\b(am|pm)\b/i, (period) => period.toUpperCase())}`;
}

export function getTicketSortScore(ticket = {}) {
  const parsed = new Date(ticket.updatedDate || ticket.createdDate);
  if (!Number.isNaN(parsed.getTime())) return parsed.getTime();
  const numericId = Number(String(ticket.ticketId || '').replace(/[^\d]/g, ''));
  return Number.isFinite(numericId) ? numericId : 0;
}

export function canEditTicket(status) {
  return ['Open', 'Pending'].includes(normalizeTicketStatus(status));
}

export function canDeleteTicket(status) {
  return normalizeTicketStatus(status) === 'Open';
}

export function canUpdateTicketStatus() {
  return true;
}

export function isTicketCompleted(ticket) {
  return normalizeTicketStatus(ticket?.status) === 'Completed';
}

export function isTicketAssigned(ticket) {
  return normalizeTicketStatus(ticket?.status) === 'Assigned';
}

export function isTicketWorkActive(ticket) {
  if (!ticket || isTicketCompleted(ticket) || ticket.stoppedDate || ticket.completedDate) {
    return false;
  }

  return Boolean(
    ticket.workActive ||
      ticket.workStarted ||
      ticket.startedDate ||
      ['In Progress', 'On Hold'].includes(normalizeTicketStatus(ticket.status))
  );
}

export function getEmployeeStatusOptions(ticket) {
  const currentStatus = normalizeTicketStatus(ticket?.status);
  const options = getTicketStatusOptions();

  if (currentStatus && !options.includes(currentStatus)) {
    return [currentStatus, ...options];
  }

  return options;
}

export function buildTicketUpdatePayload(formData = {}, currentTicket = {}) {
  const title = normalizeSpace(formData.title);
  const description = normalizeSpace(formData.description);
  const category = normalizeTicketCategory(formData.category);
  const priority = normalizeTicketPriority(formData.priority);
  const dueDate = normalizeSpace(formData.dueDate);
  const notes = normalizeSpace(formData.notes);
  const status = normalizeTicketStatus(currentTicket.status || formData.status);
  const assignedToEmployeeId = normalizeSpace(formData.assignedToEmployeeId || currentTicket.assignedToId);
  const assignedToEmployee = normalizeSpace(formData.assignedToEmployee || currentTicket.assignedTo);

  return {
    projectId: currentTicket.projectId || 0,
    title,
    ticketTitle: title,
    description,
    ticketDescription: description,
    technology: currentTicket.technology || '',
    priority,
    ticketPriority: priority,
    category,
    ticketCategory: category,
    assignedTo: assignedToEmployeeId || assignedToEmployee,
    assignedToEmployee,
    assignedToEmployeeId,
    assignee: assignedToEmployee,
    assigneeId: assignedToEmployeeId,
    startDate: currentTicket.startDate || null,
    dueDate: dueDate || null,
    ticketDueDate: dueDate || null,
    estimatedHours: currentTicket.estimatedHours || null,
    notes,
    remarks: notes,
    remark: notes,
    status,
    ticketStatus: status,
  };
}
