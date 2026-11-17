import { extractCollection } from './teamMappers';

function text(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function valueOf(record, ...keys) {
  if (!record || typeof record !== 'object') return undefined;

  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null && text(value)) return value;
  }

  const aliases = new Set(keys.map((key) => key.toLowerCase().replace(/[^a-z0-9]/g, '')));
  return Object.entries(record).find(([key, value]) => (
    aliases.has(key.toLowerCase().replace(/[^a-z0-9]/g, '')) && text(value)
  ))?.[1];
}

function normalizedStatus(value) {
  return text(value).toLowerCase().replace(/[^a-z]/g, '');
}

export function normalizeSwapStatus(record) {
  const status = normalizedStatus(
    valueOf(record, 'status', 'currentStatus', 'requestStatus', 'statusName')
  );

  if (status === 'rejectedbyemployee') return 'rejectedbyemployee';
  if (status.startsWith('rejectedbyadmin')) return 'rejectedbyadmin';
  if (status.startsWith('rejected')) return 'rejectedbyadmin';
  if (status === 'approved' || status === 'accepted' || status.includes('approved')) {
    return 'approved';
  }
  if (
    status.startsWith('pendingadmin') ||
    status.includes('waitingforadmin') ||
    status.includes('waitingadmin') ||
    status.startsWith('awaitingadmin')
  ) {
    return 'pendingadmin';
  }
  if (
    status.startsWith('pendingemployee') ||
    status === 'pending' ||
    status.includes('waitingforemployee') ||
    status.includes('waitingemployee') ||
    status.startsWith('awaitingemployee') ||
    status.includes('employeeapprovalpending')
  ) {
    return 'pendingemployee';
  }
  return status || 'unknown';
}

export function normalizeChangeStatus(record) {
  const status = normalizedStatus(valueOf(record, 'status', 'requestStatus', 'statusName'));
  if (status.startsWith('approved') || status.startsWith('accepted')) return 'approved';
  if (status.startsWith('rejected')) return 'rejected';
  if (status.startsWith('cancel')) return 'cancelled';
  if (status.startsWith('expired')) return 'expired';
  if (
    status.startsWith('pending') ||
    status.includes('awaiting') ||
    status.includes('review') ||
    status.includes('submitted')
  ) {
    return 'pending';
  }
  return status || 'unknown';
}

export function swapStatusLabel(status) {
  if (status === 'pendingemployee') return 'Waiting for colleague';
  if (status === 'pendingadmin') return 'Awaiting admin';
  if (status === 'approved') return 'Approved';
  if (status === 'rejectedbyemployee') return 'Declined by colleague';
  if (status === 'rejectedbyadmin') return 'Rejected by admin';
  return 'Status unavailable';
}

export function changeStatusLabel(status) {
  if (status === 'pending') return 'Pending';
  if (status === 'approved') return 'Approved';
  if (status === 'rejected') return 'Rejected';
  if (status === 'cancelled') return 'Cancelled';
  if (status === 'expired') return 'Expired';
  return 'Status unavailable';
}

function newestFirst(items) {
  return items.sort((left, right) => {
    const leftTime = new Date(left.createdDate || left.date || 0).getTime() || 0;
    const rightTime = new Date(right.createdDate || right.date || 0).getTime() || 0;
    return rightTime - leftTime;
  });
}

export function normalizeShiftSwaps(payload) {
  const rows = extractCollection(payload, ['items', 'list', 'records', 'rows', 'result', 'value']);
  return newestFirst(rows.map((record) => {
    const status = normalizeSwapStatus(record);
    return {
      id: valueOf(record, 'swapId', 'shiftSwapId', 'requestId', 'id'),
      fromEmployeeId: text(valueOf(record, 'fromEmployeeId', 'requesterEmployeeId', 'senderEmployeeId')),
      fromEmployeeName: text(valueOf(record, 'fromEmployeeName', 'requesterName', 'senderName')),
      toEmployeeId: text(valueOf(record, 'toEmployeeId', 'recipientEmployeeId', 'targetEmployeeId')),
      toEmployeeName: text(valueOf(record, 'toEmployeeName', 'recipientName', 'targetEmployeeName')),
      date: valueOf(record, 'shiftDate', 'requestedDate', 'swapDate', 'date'),
      currentShiftId: valueOf(record, 'shiftId', 'fromShiftId', 'currentShiftId'),
      currentShiftName: text(valueOf(record, 'shiftName', 'fromShiftName', 'currentShiftName')),
      requestedShiftId: valueOf(record, 'toShiftId', 'targetShiftId', 'requestedShiftId'),
      requestedShiftName: text(valueOf(record, 'toShiftName', 'targetShiftName', 'requestedShiftName')),
      reason: text(valueOf(record, 'reason', 'remarks', 'comments')),
      remarks: text(valueOf(record, 'rejectionRemarks', 'rejectionReason', 'adminRemarks', 'remarks')),
      status,
      statusLabel: swapStatusLabel(status),
      createdDate: valueOf(record, 'createdDate', 'createdAt', 'createdOn'),
      raw: record,
    };
  }).filter((request) => request.id !== undefined && request.id !== null));
}

export function normalizeShiftChanges(payload, shifts = []) {
  const rows = extractCollection(payload, ['items', 'list', 'records', 'rows', 'result', 'value']);
  const shiftNames = new Map(shifts.map((shift) => [String(shift.id), shift.name]));

  return newestFirst(rows.map((record) => {
    const status = normalizeChangeStatus(record);
    const currentShiftId = valueOf(record, 'currentShiftId', 'fromShiftId');
    const requestedShiftId = valueOf(record, 'requestedShiftId', 'newShiftId', 'targetShiftId');
    return {
      id: valueOf(record, 'shiftChangeRequestId', 'requestId', 'id'),
      employeeId: text(valueOf(record, 'employeeCode', 'employeeId', 'employee_Id', 'empId')),
      currentShiftId,
      currentShiftName: text(valueOf(record, 'currentShiftName', 'fromShiftName')) || shiftNames.get(String(currentShiftId)) || '',
      requestedShiftId,
      requestedShiftName: text(valueOf(record, 'requestedShiftName', 'toShiftName', 'targetShiftName')) || shiftNames.get(String(requestedShiftId)) || '',
      effectiveFrom: valueOf(record, 'effectiveFrom', 'fromDate', 'startDate'),
      effectiveTo: valueOf(record, 'effectiveTo', 'toDate', 'endDate'),
      isPermanent: Boolean(record?.isPermanent ?? record?.permanent),
      reason: text(valueOf(record, 'reason')),
      remarks: text(valueOf(record, 'rejectionRemarks', 'rejectionReason', 'adminRemarks', 'remarks')),
      status,
      statusLabel: changeStatusLabel(status),
      createdDate: valueOf(record, 'createdDate', 'createdAt', 'requestedDate'),
      raw: record,
    };
  }).filter((request) => request.id !== undefined && request.id !== null));
}

export function sameEmployeeId(left, right) {
  const leftId = text(left);
  const rightId = text(right);
  const invalidValues = new Set(['', '-', '--', 'null', 'undefined']);

  if (invalidValues.has(leftId.toLowerCase()) || invalidValues.has(rightId.toLowerCase())) {
    return false;
  }

  return leftId.toLowerCase() === rightId.toLowerCase();
}

