export const STEPS = [
  'Personal Info',
  'Bank Info',
  'Education',
  'Experience',
  'Documents',
  'Review',
];

export const GENDER_OPTIONS = ['Male', 'Female', 'Other'];
export const MARITAL_OPTIONS = ['Single', 'Married'];
export const BLOOD_GROUP_OPTIONS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
export const DESIGNATION_OPTIONS = [
  'Associate Software Engineer',
  'Senior Software Engineer',
  'Tech Lead',
  'QA Analyst',
  'QA Engineer',
  'QA Automation Engineer',
  'QA Lead',
  'Manager',
  'HR',
  'HR Manager',
  'HR Intern',
  'HR Executive',
];
export const BANK_OPTIONS = [
  'State Bank of India',
  'HDFC Bank',
  'ICICI Bank',
  'Axis Bank',
  'Kotak Mahindra Bank',
  'IDFC First Bank',
  'Canara Bank',
  'Federal Bank',
  'Union Bank',
  'Others',
];
export const QUALIFICATION_OPTIONS = [
  '10th (SSC)',
  'Intermediate (12th)',
  'Diploma',
  'B.Tech / BE',
  'B.Sc',
  'BCA',
  'B.Com',
  'M.Tech / ME',
  'M.Sc',
  'MCA',
  'M.Com',
  'MBA',
  'PhD',
  'Other',
];

export const DOCUMENT_GROUPS = [
  {
    label: 'Education Certificates',
    options: ['10th Certificate', 'Intermediate / 12th Certificate', 'Degree Certificate', 'Post-Graduation Certificate'],
  },
  {
    label: 'Identity Documents',
    options: ['Aadhaar Card', 'PAN Card', 'Passport', 'Passport-size Photo'],
  },
  {
    label: 'Current Company',
    options: ['Signed Offer Letter'],
  },
  {
    label: 'Previous Experience / Internship',
    options: ['Previous Offer Letter', 'Previous Appointment Letter', 'Previous Relieving Letter'],
  },
  {
    label: 'Last 3 Months Payslips',
    options: ['Payslip Month 1', 'Payslip Month 2', 'Payslip Month 3'],
  },
];

export const EMPTY_PERSONAL = {
  employeeId: '',
  firstName: '',
  middleName: '',
  lastName: '',
  gender: '',
  maritalStatus: '',
  dob: '',
  phone: '',
  email: '',
  aadhaar: '',
  pan: '',
  bloodGroup: '',
  department: '',
  designation: '',
  joiningDate: '',
  houseNo: '',
  street: '',
  city: '',
  district: '',
  state: '',
  country: '',
  pincode: '',
  workExperience: '0',
};

export const EMPTY_BANK = {
  customerId: '',
  bankName: '',
  manualBank: '',
  accountHolder: '',
  accountNumber: '',
  ifsc: '',
  branch: '',
  uan: '',
  pf: '',
};

export const EMPTY_EDUCATION = {
  qualification: '',
  customQualification: '',
  university: '',
  year: '',
  percentage: '',
  specialization: '',
};

export const EMPTY_EXPERIENCE = {
  company: '',
  designation: '',
  fromDate: '',
  toDate: '',
  reason: '',
  description: '',
};

function unwrap(payload) {
  if (typeof payload === 'string') throw new Error('Employee profile response was not valid.');
  return payload?.data || payload?.result || payload?.response || payload?.payload || payload || {};
}

function text(value, fallback = '') {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : fallback;
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return fallback;
}

function collection(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.agreements)) return value.agreements;
  if (Array.isArray(value?.data?.agreements)) return value.data.agreements;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.records)) return value.records;
  if (Array.isArray(value?.result)) return value.result;
  return [];
}

export function dateOnly(value) {
  if (!value) return '';
  const direct = String(value).split('T')[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(direct)) return direct;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
}

export function toIsoDate(value) {
  const parsed = dateOnly(value);
  return parsed ? `${parsed}T00:00:00` : '';
}

export function formatDisplayDate(value) {
  const parsed = dateOnly(value);
  if (!parsed) return '-';
  const [year, month, day] = parsed.split('-');
  return `${day}/${month}/${year}`;
}

function resolveEmployeeId(data) {
  return text(
    data?.employeeId ||
      data?.employee_Id ||
      data?.id ||
      data?.personalInfo?.employeeId ||
      data?.personalInfo?.employee_Id ||
      data?.personalInfo?.id
  );
}

export function normalizeEmployeeProfile(payload) {
  const root = unwrap(payload);
  const personal =
    root.personalInfo ||
    root.personalInformation ||
    root.employeePersonalInfo ||
    root.personal ||
    {};
  const bank =
    root.bankDetails ||
    root.bankInfo ||
    root.employeeBankDetails ||
    root.bank ||
    {};
  const education = collection(root.education || root.educations || root.educationDetails || root.employeeEducation);
  const experience = collection(root.experience || root.experiences || root.experienceDetails || root.employeeExperience);
  const documents = collection(root.documents || root.employeeDocuments || root.uploadedDocuments);
  const employeeId = resolveEmployeeId(root);

  return {
    raw: root,
    employeeId,
    hasPersonal: Boolean(personal && Object.keys(personal).length),
    hasBank: Boolean(bank && Object.keys(bank).length),
    hasEducation: education.length > 0,
    hasExperience: experience.length > 0,
    personal: {
      ...EMPTY_PERSONAL,
      employeeId,
      firstName: text(personal.firstName),
      middleName: text(personal.middleName),
      lastName: text(personal.lastName),
      gender: text(personal.gender),
      maritalStatus: text(personal.marital_Status || personal.maritalStatus),
      dob: dateOnly(personal.dateOfBirth || personal.dob),
      phone: text(personal.phoneNumber || personal.phone),
      email: text(personal.email),
      aadhaar: text(personal.aadhaarNumber),
      pan: text(personal.panNumber).toUpperCase(),
      bloodGroup: text(personal.bloodGroup),
      department: text(personal.department),
      designation: text(personal.designation),
      joiningDate: dateOnly(personal.joiningDate || personal.dateOfJoining),
      houseNo: text(personal.houseNo),
      street: text(personal.street),
      city: text(personal.city),
      district: text(personal.district),
      state: text(personal.state),
      country: text(personal.country || 'India'),
      pincode: text(personal.pincode),
      workExperience: text(personal.workExperience, '0'),
    },
    bank: {
      ...EMPTY_BANK,
      customerId: text(bank.customer_Id || bank.customerId),
      bankName: text(bank.bank_Name || bank.bankName),
      accountHolder: text(bank.account_Holder_Name || bank.accountHolderName),
      accountNumber: text(bank.account_Number || bank.accountNumber),
      ifsc: text(bank.ifsC_Code || bank.ifscCode).toUpperCase(),
      branch: text(bank.branch_Name || bank.branchName),
      uan: text(bank.uaN_Number || bank.uanNumber),
      pf: text(bank.pF_Account_Number || bank.pfAccountNumber),
    },
    education: education.map((item) => ({
      qualification: text(item.Degree || item.degree || item.qualification),
      customQualification: '',
      university: text(item.UniversityBoard || item.universityBoard || item.university),
      year: text(item.YearOfPassing || item.yearOfPassing || item.year),
      percentage: text(item.PercentageCGPA || item.percentageCGPA || item.percentage),
      specialization: text(item.Specialization || item.specialization),
    })),
    experience: experience.map((item) => ({
      company: text(item.CompanyName || item.companyName || item.company),
      designation: text(item.Designation || item.designation),
      fromDate: dateOnly(item.FromDate || item.fromDate),
      toDate: dateOnly(item.ToDate || item.toDate),
      reason: text(item.ReasonForLeaving || item.reasonForLeaving || item.reason),
      description: text(item.Description || item.description),
    })),
    documents: documents.map(normalizeDocument),
  };
}

export function normalizeDepartments(payload) {
  return collection(unwrap(payload))
    .map((item) => text(item.departmentName || item.department_Name || item.name || item.title))
    .filter(Boolean);
}

export function buildPersonalPayload(form) {
  return {
    employee_Id: form.employeeId.trim().toUpperCase(),
    firstName: form.firstName.trim(),
    middleName: form.middleName.trim(),
    lastName: form.lastName.trim(),
    dateOfBirth: toIsoDate(form.dob),
    phoneNumber: form.phone.trim(),
    email: form.email.trim().toLowerCase(),
    aadhaarNumber: form.aadhaar.trim(),
    panNumber: form.pan.trim().toUpperCase(),
    bloodGroup: form.bloodGroup,
    marital_Status: form.maritalStatus,
    department: form.department,
    designation: form.designation,
    gender: form.gender,
    location: 'India',
    houseNo: form.houseNo.trim(),
    street: form.street.trim(),
    city: form.city.trim(),
    district: form.district.trim(),
    state: form.state.trim(),
    country: form.country.trim(),
    pincode: form.pincode.trim(),
    workExperience: String(form.workExperience || '0'),
    joiningDate: toIsoDate(form.joiningDate),
  };
}

export function buildBankPayload(form, employeeId) {
  return {
    employee_Id: employeeId,
    customer_Id: form.customerId.trim(),
    bank_Name: (form.bankName === 'Others' ? form.manualBank : form.bankName).trim(),
    account_Holder_Name: form.accountHolder.trim(),
    account_Number: form.accountNumber.trim(),
    ifsC_Code: form.ifsc.trim().toUpperCase(),
    branch_Name: form.branch.trim(),
    uaN_Number: form.uan.trim(),
    pF_Account_Number: form.pf.trim(),
  };
}

export function educationPayload(list, employeeId) {
  return list
    .filter((item) => Object.values(item).some((value) => text(value)))
    .map((item) => ({
      Employee_Id: String(employeeId),
      Degree: (item.qualification === 'Other' ? item.customQualification : item.qualification).trim(),
      UniversityBoard: item.university.trim(),
      YearOfPassing: parseInt(item.year, 10),
      PercentageCGPA: item.percentage.trim(),
      Specialization: item.specialization.trim(),
    }));
}

export function experienceYears(fromDate, toDate) {
  const from = dateOnly(fromDate);
  const to = dateOnly(toDate);
  if (!from || !to) return 0;
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  if (end < start) return 0;
  const years = (end.getTime() - start.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  return Math.round(years * 10) / 10;
}

export function experiencePayload(list, employeeId) {
  return list
    .filter((item) => Object.values(item).some((value) => text(value)))
    .map((item) => ({
      Employee_Id: String(employeeId),
      CompanyName: item.company.trim(),
      Designation: item.designation.trim(),
      FromDate: toIsoDate(item.fromDate),
      ToDate: toIsoDate(item.toDate),
      Years: experienceYears(item.fromDate, item.toDate),
      ReasonForLeaving: item.reason.trim(),
      Description: item.description.trim(),
    }));
}

export function formatFileSize(size) {
  const value = Number(size);
  if (!Number.isFinite(value) || value <= 0) return '-';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${Math.round((value / (1024 * 1024)) * 10) / 10} MB`;
}

export function formatFileSizeMB(size) {
  const value = Number(size);
  if (!Number.isFinite(value) || value <= 0) return '-';
  return `${Math.round(value * 100) / 100} MB`;
}

export function normalizeDocument(item = {}) {
  const id = item.id || item.documentId || item.employeeDocumentId || item.document_Id;
  return {
    id: id ? String(id) : '',
    documentType: text(item.documentType || item.DocumentType || item.type || item.name, 'Document'),
    category: text(item.category || item.Category),
    fileName: text(item.fileName || item.FileName || item.originalFileName || item.name, 'Document'),
    fileType: text(item.fileType || item.FileType),
    fileSizeMB: Number(item.fileSizeMB || item.FileSizeMB || item.file_Size_MB || 0) || 0,
    size: Number(item.size || item.fileSize || item.FileSize || 0),
    uploadedAt: text(item.uploadedAt || item.createdAt || item.uploadedDate || item.UploadedDate),
    uploadedDate: text(item.uploadedDate || item.UploadedDate || item.uploadedAt || item.createdAt),
    verificationStatus: text(item.verificationStatus || item.VerificationStatus || item.status, 'Pending'),
  };
}

export function normalizeDocuments(payload) {
  return collection(unwrap(payload)).map(normalizeDocument).filter((item) => item.id);
}

function booleanValue(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  const normalized = text(value).toLowerCase();
  return ['true', '1', 'yes', 'uploaded'].includes(normalized);
}

export function normalizeChecklistItem(item = {}) {
  return {
    documentType: text(item.documentType || item.DocumentType),
    uploaded: booleanValue(item.uploaded ?? item.Uploaded),
    status: text(item.status || item.Status),
  };
}

export function normalizeDocumentChecklist(payload) {
  return collection(unwrap(payload))
    .map(normalizeChecklistItem)
    .filter((item) => item.documentType);
}

export function normalizeAgreements(payload) {
  return collection(unwrap(payload)).map((item) => {
    const agreementId = item.agreementId || item.AgreementId || item.agreement_Id || item.Agreement_Id || item.id || item.Id;
    const employeeAgreementId =
      item.employeeAgreementId ||
      item.EmployeeAgreementId ||
      item.employeeAgreement_Id ||
      item.EmployeeAgreement_Id ||
      item.employeeAgreementID ||
      item.EmployeeAgreementID ||
      '';
    const pendingEmployeeAgreementId =
      item.pendingEmployeeAgreementId ||
      item.PendingEmployeeAgreementId ||
      item.pendingEmployeeAgreementID ||
      item.PendingEmployeeAgreementID ||
      '';
    const signedEmployeeAgreementId =
      item.signedEmployeeAgreementId ||
      item.SignedEmployeeAgreementId ||
      item.signedEmployeeAgreementID ||
      item.SignedEmployeeAgreementID ||
      '';
    const lifecycleId =
      employeeAgreementId ||
      pendingEmployeeAgreementId ||
      signedEmployeeAgreementId ||
      agreementId ||
      item.documentId ||
      item.DocumentId ||
      item.id ||
      item.Id;

    return {
      raw: item,
      id: String(lifecycleId || ''),
      agreementId: String(agreementId || ''),
      employeeAgreementId: String(employeeAgreementId || ''),
      pendingEmployeeAgreementId: String(pendingEmployeeAgreementId || ''),
      signedEmployeeAgreementId: String(signedEmployeeAgreementId || ''),
      documentId: text(item.documentId || item.DocumentId || item.document_Id || item.Document_Id),
      agreementType: text(item.agreementType || item.AgreementType || item.type),
      agreementName: text(item.agreementName || item.AgreementName || item.name || item.Name, 'Agreement'),
      agreementCode: text(item.agreementCode || item.AgreementCode || item.code || item.Code),
      employeeId: text(item.employeeId || item.EmployeeId || item.employee_Id),
      status: text(item.status || item.Status, 'Pending'),
      description: text(item.description || item.Description),
    };
  }).filter((item) => item.id || item.agreementId);
}

function agreementMatchKeys(item = {}) {
  return [
    item.agreementId,
    item.agreementCode,
    item.employeeAgreementId,
    item.pendingEmployeeAgreementId,
    item.signedEmployeeAgreementId,
    item.documentId,
  ]
    .map((value) => text(value).toLowerCase())
    .filter(Boolean);
}

function agreementRecordsMatch(left = {}, right = {}) {
  const leftKeys = agreementMatchKeys(left);
  const rightKeys = new Set(agreementMatchKeys(right));
  return leftKeys.some((key) => rightKeys.has(key));
}

export function isAgreementSignedStatus(status) {
  const normalized = text(status).toLowerCase();
  return Boolean(normalized && !normalized.includes('unsigned') && normalized.includes('signed'));
}

export function mergeAgreementsWithLifecycle(templates = [], pending = [], signed = []) {
  return templates.map((template) => {
    const signedRecord = signed.find((item) => agreementRecordsMatch(template, item));
    const pendingRecord = pending.find((item) => agreementRecordsMatch(template, item));
    const lifecycle = signedRecord || pendingRecord || {};
    const status = signedRecord
      ? 'Signed'
      : pendingRecord
        ? 'Pending'
        : text(template.status, 'Pending');

    return {
      ...template,
      ...lifecycle,
      id: template.agreementId || lifecycle.id || template.id || lifecycle.agreementId || template.agreementCode,
      agreementId: template.agreementId || lifecycle.agreementId || '',
      employeeAgreementId: lifecycle.employeeAgreementId || template.employeeAgreementId || '',
      pendingEmployeeAgreementId: lifecycle.pendingEmployeeAgreementId || template.pendingEmployeeAgreementId || '',
      signedEmployeeAgreementId: lifecycle.signedEmployeeAgreementId || template.signedEmployeeAgreementId || '',
      documentId: lifecycle.documentId || template.documentId || '',
      agreementName: template.agreementName || lifecycle.agreementName || 'Agreement',
      agreementCode: template.agreementCode || lifecycle.agreementCode || '',
      agreementType: template.agreementType || lifecycle.agreementType || '',
      description: template.description || lifecycle.description || '',
      status,
    };
  });
}

export function maskLastFour(value) {
  const raw = text(value);
  if (raw.length <= 4) return raw ? '****' : '-';
  return `${'*'.repeat(Math.max(raw.length - 4, 4))}${raw.slice(-4)}`;
}

export function maskPan(value) {
  const raw = text(value).toUpperCase();
  if (raw.length < 5) return raw || '-';
  return `${raw.slice(0, 2)}***${raw.slice(-2)}`;
}
