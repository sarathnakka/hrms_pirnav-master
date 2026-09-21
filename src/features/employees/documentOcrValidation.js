const READABLE_TEXT_MIN_CHARS = 20;
const CERTIFICATE_KEYWORDS = {
  '10th': ['SSC', 'SECONDARY SCHOOL CERTIFICATE', 'BOARD OF SECONDARY EDUCATION', '10TH', 'X CLASS'],
  inter: ['INTERMEDIATE', 'HSC', '12TH', 'BOARD OF INTERMEDIATE EDUCATION', 'XII'],
  degree: ['BACHELOR', 'DEGREE', 'UNIVERSITY', 'B.TECH', 'B.SC', 'B.COM', 'PROVISIONAL CERTIFICATE', 'CONVOCATION'],
  pg: ['MASTER', 'POST GRADUATE', 'POSTGRADUATE', 'M.TECH', 'M.SC', 'M.COM', 'M.A.', 'MBA', 'PG CERTIFICATE'],
};
const PAYSLIP_KEYWORDS = [
  'PAYSLIP', 'SALARY SLIP', 'PAY SLIP', 'GROSS PAY', 'GROSS SALARY',
  'NET PAY', 'NET SALARY', 'BASIC SALARY', 'DEDUCTIONS', 'EARNINGS',
  'EMPLOYEE ID', 'EMPLOYEE CODE', 'PAY PERIOD', 'PF', 'PROVIDENT FUND',
  'TDS', 'HRA', 'INCOME TAX',
];
const UNREADABLE_MESSAGE =
  'The document text could not be read clearly. Please upload or capture a clearer copy.';
const VALIDATION_ERROR_MESSAGE =
  "We couldn't validate this document right now. Please try again.";

function normalizeInputText(value) {
  return String(value || '').replace(/\u0000/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
}
function getMatches(text, keywords) {
  return keywords.filter((keyword) => text.includes(keyword));
}
function isPassportPhotoType(documentType = '') {
  const normalized = String(documentType || '').toLowerCase();
  return normalized.includes('passport-size photo') || normalized.includes('passport size photo');
}

export function getOcrValidationType(documentType = '') {
  const type = String(documentType).toLowerCase();
  if (type.includes('payslip')) return 'payslip';
  if (type.includes('10th') || type.includes('ssc') || type.includes('secondary')) return '10th';
  if (type.includes('intermediate') || type.includes('12th') || type.includes('hsc') || type.includes('higher secondary')) return 'inter';
  if (type.includes('post-graduation') || type.includes('post graduation') || type.includes('master')) return 'pg';
  if (type.includes('degree') || type.includes('graduation') || type.includes('bachelor')) return 'degree';
  return '';
}

function getEducationMismatch(text, expectedType) {
  const expectedKeywords = CERTIFICATE_KEYWORDS[expectedType] || [];
  const expectedMatches = getMatches(text, expectedKeywords);
  const otherMatches = Object.entries(CERTIFICATE_KEYWORDS)
    .filter(([type]) => type !== expectedType)
    .map(([type, keywords]) => ({ type, matches: getMatches(text, keywords) }))
    .sort((left, right) => right.matches.length - left.matches.length)[0];

  if (
    expectedMatches.length === 0 ||
    (otherMatches?.matches.length >= 2 && otherMatches.matches.length > expectedMatches.length)
  ) {
    return true;
  }

  return false;
}

function hasTenthSpecificKeywords(text) {
  return (
    text.includes('10TH') ||
    text.includes('TENTH') ||
    text.includes('SSC') ||
    text.includes('SECONDARY SCHOOL CERTIFICATE') ||
    text.includes('MATRICULATION') ||
    text.includes('CLASS X') ||
    text.includes('CLASS 10') ||
    text.includes('HIGH SCHOOL') ||
    text.includes('SSLC') ||
    text.includes('XTH')
  );
}

function hasTwelfthSpecificKeywords(text) {
  return (
    text.includes('12TH') ||
    text.includes('TWELFTH') ||
    text.includes('INTERMEDIATE') ||
    text.includes('HIGHER SECONDARY') ||
    text.includes('CLASS XII') ||
    text.includes('CLASS 12') ||
    text.includes('SENIOR SECONDARY') ||
    text.includes('PLUS TWO') ||
    text.includes('+2') ||
    text.includes('HSC') ||
    text.includes('PUC') ||
    text.includes('PRE-UNIVERSITY') ||
    text.includes('XIITH')
  );
}

function hasDegreeSpecificKeywords(text) {
  return (
    text.includes('DEGREE') ||
    text.includes('BACHELOR') ||
    text.includes('B.TECH') ||
    text.includes('BTECH') ||
    text.includes('B.E') ||
    text.includes('B.SC') ||
    text.includes('BSC') ||
    text.includes('B.COM') ||
    text.includes('BCOM') ||
    text.includes('B.A') ||
    text.includes('BBA') ||
    text.includes('BCA') ||
    text.includes('GRADUATION') ||
    text.includes('UNDERGRADUATE') ||
    text.includes('CONVOCATION') ||
    text.includes('PROVISIONAL') ||
    text.includes('CONSOLIDATED')
  );
}

function hasPgSpecificKeywords(text) {
  return (
    text.includes('MASTER') ||
    text.includes('POST GRADUATE') ||
    text.includes('POSTGRADUATE') ||
    text.includes('POST-GRADUATION') ||
    text.includes('M.TECH') ||
    text.includes('MTECH') ||
    text.includes('M.E') ||
    text.includes('M.SC') ||
    text.includes('MSC') ||
    text.includes('M.COM') ||
    text.includes('MCOM') ||
    text.includes('M.A') ||
    text.includes('MBA') ||
    text.includes('MCA') ||
    text.includes('CONVOCATION')
  );
}

export function validateDocumentText(documentType = '', rawText = '') {
  const cleanDocType = String(documentType || '').toLowerCase();
  const upperText = normalizeInputText(rawText);
  const textLength = upperText.replace(/[^A-Z0-9]/g, '').length;

  if (textLength < 12) {
    return { valid: false, status: 'unreadable', reason: UNREADABLE_MESSAGE };
  }

  const panRegex = /[A-Z]{5}[0-9]{4}[A-Z]{1}/;
  const hasPanNumber = panRegex.test(upperText);
  const hasPanKeywords =
    hasPanNumber ||
    upperText.includes('INCOME TAX') ||
    upperText.includes('PERMANENT ACCOUNT') ||
    upperText.includes('INCOMETAX') ||
    upperText.includes('GOVT. OF INDIA') ||
    (upperText.includes('GOVERNMENT OF INDIA') && upperText.includes('INCOME')) ||
    upperText.includes('NSDL') ||
    upperText.includes('UTIITSL');

  const aadhaarRegex = /\b[2-9]\d{3}\s?\d{4}\s?\d{4}\b|XXXX\s?XXXX\s?\d{4}|\b[2-9]\d{11}\b/;
  const hasAadhaarNumber = aadhaarRegex.test(upperText);
  const hasAadhaarKeywords =
    hasAadhaarNumber ||
    upperText.includes('UIDAI') ||
    upperText.includes('UNIQUE IDENTIFICATION') ||
    upperText.includes('AADHAAR') ||
    upperText.includes('AADHAR') ||
    upperText.includes('MERA AADHAAR') ||
    upperText.includes('BHARAT SARKAR') ||
    upperText.includes('ENROLMENT') ||
    upperText.includes('AUTHORITY OF INDIA') ||
    upperText.includes('VID :') ||
    upperText.includes('HELP@UIDAI') ||
    (upperText.includes('GOVERNMENT OF INDIA') &&
      (upperText.includes('DOB') ||
        upperText.includes('YEAR OF BIRTH') ||
        upperText.includes('MALE') ||
        upperText.includes('FEMALE') ||
        upperText.includes('ADDRESS')));

  const passportKeywords =
    upperText.includes('PASSPORT') ||
    upperText.includes('REPUBLIC OF INDIA') ||
    upperText.includes('PASSPORT NO') ||
    upperText.includes('TYPE P');

  const payslipKeywords =
    upperText.includes('PAYSLIP') ||
    upperText.includes('PAY SLIP') ||
    upperText.includes('SALARY') ||
    upperText.includes('BASIC PAY') ||
    upperText.includes('NET SALARY') ||
    upperText.includes('NET PAY') ||
    upperText.includes('GROSS PAY') ||
    upperText.includes('EARNINGS') ||
    upperText.includes('DEDUCTIONS') ||
    upperText.includes('PROVIDENT FUND') ||
    upperText.includes('PAYMENT ADVICE');

  const generalMarksheetKeywords =
    upperText.includes('MARKS') ||
    upperText.includes('MARKSHEET') ||
    upperText.includes('MARK SHEET') ||
    upperText.includes('STATEMENT OF') ||
    upperText.includes('MEMORANDUM') ||
    upperText.includes('GRADE') ||
    upperText.includes('CGPA') ||
    upperText.includes('SGPA') ||
    upperText.includes('PERCENTAGE') ||
    upperText.includes('PASSED') ||
    upperText.includes('PASS') ||
    upperText.includes('BOARD') ||
    upperText.includes('COUNCIL') ||
    upperText.includes('UNIVERSITY') ||
    upperText.includes('INSTITUTE') ||
    upperText.includes('COLLEGE') ||
    upperText.includes('ROLL NO') ||
    upperText.includes('REGISTER') ||
    upperText.includes('REGISTRATION') ||
    upperText.includes('HALL TICKET') ||
    upperText.includes('SEMESTER') ||
    upperText.includes('EXAMINATION') ||
    upperText.includes('PROVISIONAL') ||
    upperText.includes('DEGREE') ||
    upperText.includes('BACHELOR') ||
    upperText.includes('MASTER') ||
    upperText.includes('MAX MARKS') ||
    upperText.includes('SUBJECT') ||
    upperText.includes('CREDITS') ||
    upperText.includes('CONVOCATION');

  const employmentLetterKeywords =
    upperText.includes('OFFER') ||
    upperText.includes('APPOINTMENT') ||
    upperText.includes('RELIEVING') ||
    upperText.includes('EXPERIENCE') ||
    upperText.includes('DESIGNATION') ||
    upperText.includes('EMPLOYMENT') ||
    upperText.includes('SALARY') ||
    upperText.includes('COMPENSATION') ||
    upperText.includes('JOINING') ||
    upperText.includes('TERMS') ||
    upperText.includes('PVT') ||
    upperText.includes('LTD') ||
    upperText.includes('LIMITED') ||
    upperText.includes('HUMAN RESOURCES');

  if (cleanDocType.includes('aadhaar') || cleanDocType.includes('aadhar') || cleanDocType.includes('adhar')) {
    if (hasPanKeywords && !hasAadhaarKeywords) return { valid: false, reason: 'Document mismatch: Uploaded file is a PAN Card.' };
    if (passportKeywords && !hasAadhaarKeywords) return { valid: false, reason: 'Document mismatch: Uploaded file is a Passport.' };
    if (payslipKeywords && !hasAadhaarKeywords) return { valid: false, reason: 'Document mismatch: Uploaded file is a Payslip.' };
    if (generalMarksheetKeywords && !hasAadhaarKeywords) return { valid: false, reason: 'Document mismatch: Uploaded file is an Education Certificate.' };
    if (!hasAadhaarKeywords) return { valid: false, reason: 'Invalid Aadhaar Card: Aadhaar details not detected.' };
    return { valid: true, reason: '' };
  }

  if (cleanDocType.includes('pan card') || cleanDocType === 'pan') {
    if (hasAadhaarKeywords && !hasPanKeywords) return { valid: false, reason: 'Document mismatch: Uploaded file is an Aadhaar Card.' };
    if (passportKeywords && !hasPanKeywords) return { valid: false, reason: 'Document mismatch: Uploaded file is a Passport.' };
    if (payslipKeywords && !hasPanKeywords) return { valid: false, reason: 'Document mismatch: Uploaded file is a Payslip.' };
    if (generalMarksheetKeywords && !hasPanKeywords) return { valid: false, reason: 'Document mismatch: Uploaded file is an Education Certificate.' };
    if (!hasPanKeywords) return { valid: false, reason: 'Invalid PAN Card: PAN number or Tax details not detected.' };
    return { valid: true, reason: '' };
  }

  if (cleanDocType.includes('10th') || cleanDocType.includes('ssc') || cleanDocType.includes('secondary')) {
    const tenthKeywords = hasTenthSpecificKeywords(upperText);

    if (hasPanKeywords && !generalMarksheetKeywords) return { valid: false, reason: 'Document mismatch: Uploaded file is a PAN Card.' };
    if (hasAadhaarKeywords && !generalMarksheetKeywords) return { valid: false, reason: 'Document mismatch: Uploaded file is an Aadhaar Card.' };
    if (passportKeywords && !generalMarksheetKeywords) return { valid: false, reason: 'Document mismatch: Uploaded file is a Passport.' };
    if (payslipKeywords && !generalMarksheetKeywords) return { valid: false, reason: 'Document mismatch: Uploaded file is a Payslip.' };
    if (hasTwelfthSpecificKeywords(upperText) && !tenthKeywords) return { valid: false, reason: 'Document mismatch: Uploaded file is a 12th/Intermediate Certificate.' };
    if ((hasDegreeSpecificKeywords(upperText) || hasPgSpecificKeywords(upperText)) && !tenthKeywords) return { valid: false, reason: 'Document mismatch: Uploaded file is a Degree Certificate.' };
    if (!generalMarksheetKeywords || !tenthKeywords || getEducationMismatch(upperText, '10th')) {
      return { valid: false, reason: 'Invalid 10th Certificate: Marksheet details not detected.' };
    }
    return { valid: true, reason: '' };
  }

  if (cleanDocType.includes('intermediate') || cleanDocType.includes('12th') || cleanDocType.includes('hsc') || cleanDocType.includes('higher secondary')) {
    const twelfthKeywords = hasTwelfthSpecificKeywords(upperText);

    if (hasPanKeywords && !generalMarksheetKeywords) return { valid: false, reason: 'Document mismatch: Uploaded file is a PAN Card.' };
    if (hasAadhaarKeywords && !generalMarksheetKeywords) return { valid: false, reason: 'Document mismatch: Uploaded file is an Aadhaar Card.' };
    if (passportKeywords && !generalMarksheetKeywords) return { valid: false, reason: 'Document mismatch: Uploaded file is a Passport.' };
    if (payslipKeywords && !generalMarksheetKeywords) return { valid: false, reason: 'Document mismatch: Uploaded file is a Payslip.' };
    if (hasTenthSpecificKeywords(upperText) && !twelfthKeywords) return { valid: false, reason: 'Document mismatch: Uploaded file is a 10th Certificate.' };
    if ((hasDegreeSpecificKeywords(upperText) || hasPgSpecificKeywords(upperText)) && !twelfthKeywords) return { valid: false, reason: 'Document mismatch: Uploaded file is a Degree Certificate.' };
    if (!generalMarksheetKeywords || !twelfthKeywords || getEducationMismatch(upperText, 'inter')) {
      return { valid: false, reason: 'Invalid 12th Certificate: Marksheet details not detected.' };
    }
    return { valid: true, reason: '' };
  }

  if (!cleanDocType.includes('post graduation') && !cleanDocType.includes('post-graduation') &&
      (cleanDocType.includes('degree') || cleanDocType.includes('graduation') || cleanDocType.includes('bachelor'))) {
    const degreeKeywords = hasDegreeSpecificKeywords(upperText);

    if (hasPanKeywords && !generalMarksheetKeywords) return { valid: false, reason: 'Document mismatch: Uploaded file is a PAN Card.' };
    if (hasAadhaarKeywords && !generalMarksheetKeywords) return { valid: false, reason: 'Document mismatch: Uploaded file is an Aadhaar Card.' };
    if (passportKeywords && !generalMarksheetKeywords) return { valid: false, reason: 'Document mismatch: Uploaded file is a Passport.' };
    if (payslipKeywords && !generalMarksheetKeywords) return { valid: false, reason: 'Document mismatch: Uploaded file is a Payslip.' };
    if ((hasTenthSpecificKeywords(upperText) || hasTwelfthSpecificKeywords(upperText)) && !degreeKeywords) return { valid: false, reason: 'Document mismatch: Uploaded file is an Education Certificate.' };
    if (hasPgSpecificKeywords(upperText) && !degreeKeywords) return { valid: false, reason: 'Document mismatch: Uploaded file is a Post-Graduation Certificate.' };
    if (!generalMarksheetKeywords || !degreeKeywords || getEducationMismatch(upperText, 'degree')) {
      return { valid: false, reason: 'Invalid Degree Certificate: Degree details not detected.' };
    }
    return { valid: true, reason: '' };
  }

  if (cleanDocType.includes('post-graduation') || cleanDocType.includes('post graduation') || cleanDocType.includes('master')) {
    const pgKeywords = hasPgSpecificKeywords(upperText);

    if (hasPanKeywords && !generalMarksheetKeywords) return { valid: false, reason: 'Document mismatch: Uploaded file is a PAN Card.' };
    if (hasAadhaarKeywords && !generalMarksheetKeywords) return { valid: false, reason: 'Document mismatch: Uploaded file is an Aadhaar Card.' };
    if (passportKeywords && !generalMarksheetKeywords) return { valid: false, reason: 'Document mismatch: Uploaded file is a Passport.' };
    if (payslipKeywords && !generalMarksheetKeywords) return { valid: false, reason: 'Document mismatch: Uploaded file is a Payslip.' };
    if ((hasTenthSpecificKeywords(upperText) || hasTwelfthSpecificKeywords(upperText) || hasDegreeSpecificKeywords(upperText)) && !pgKeywords) return { valid: false, reason: 'Document mismatch: Uploaded file is another Education Certificate.' };
    if (!generalMarksheetKeywords || !pgKeywords || getEducationMismatch(upperText, 'pg')) {
      return { valid: false, reason: "Invalid PG Certificate: Master's details not detected." };
    }
    return { valid: true, reason: '' };
  }

  if (cleanDocType.includes('passport') && !cleanDocType.includes('photo')) {
    if (hasPanKeywords && !passportKeywords) return { valid: false, reason: 'Document mismatch: Uploaded file is a PAN Card.' };
    if (hasAadhaarKeywords && !passportKeywords) return { valid: false, reason: 'Document mismatch: Uploaded file is an Aadhaar Card.' };
    if (generalMarksheetKeywords && !passportKeywords) return { valid: false, reason: 'Document mismatch: Uploaded file is an Education Certificate.' };
    if (!passportKeywords) return { valid: false, reason: 'Invalid Passport: Passport details not detected.' };
    return { valid: true, reason: '' };
  }

  if (cleanDocType.includes('payslip')) {
    const matches = getMatches(upperText, PAYSLIP_KEYWORDS);
    if (hasPanKeywords && !payslipKeywords) return { valid: false, reason: 'Document mismatch: Uploaded file is a PAN Card.' };
    if (hasAadhaarKeywords && !payslipKeywords) return { valid: false, reason: 'Document mismatch: Uploaded file is an Aadhaar Card.' };
    if (generalMarksheetKeywords && !payslipKeywords) return { valid: false, reason: 'Document mismatch: Uploaded file is an Education Certificate.' };
    if (!payslipKeywords || matches.length < 3) return { valid: false, reason: 'Invalid Payslip: Salary/Payslip details not detected.' };
    return { valid: true, reason: '' };
  }

  if (cleanDocType.includes('letter') || cleanDocType.includes('offer') || cleanDocType.includes('appointment') || cleanDocType.includes('relieving')) {
    if (hasPanKeywords && !employmentLetterKeywords) return { valid: false, reason: 'Document mismatch: Uploaded file is a PAN Card.' };
    if (hasAadhaarKeywords && !employmentLetterKeywords) return { valid: false, reason: 'Document mismatch: Uploaded file is an Aadhaar Card.' };
    if (!employmentLetterKeywords) return { valid: false, reason: 'Invalid Document: Employment letter details not detected.' };
    const expectedTerm = cleanDocType.includes('relieving') ? 'RELIEVING'
      : cleanDocType.includes('appointment') ? 'APPOINTMENT' : 'OFFER';
    if (!upperText.includes(expectedTerm) &&
        !(expectedTerm === 'RELIEVING' && upperText.includes('EXPERIENCE CERTIFICATE'))) {
      return { valid: false, reason: `Invalid Document: ${expectedTerm.toLowerCase()} letter details not detected.` };
    }
    return { valid: true, reason: '' };
  }

  return {
    valid: false,
    status: 'error',
    reason: 'Document validation configuration is unavailable for this document type.',
  };
}

function toValidationResult(validation, documentType, engine = '') {
  if (validation.valid) {
    return {
      status: 'valid',
      title: `Valid ${documentType}`,
      message: '',
      engine,
    };
  }

  if (validation.status === 'error') {
    return {
      status: 'error',
      title: 'Unable to Validate Document',
      message: validation.reason || VALIDATION_ERROR_MESSAGE,
      engine,
    };
  }

  if (validation.status === 'unreadable') {
    return {
      status: 'unreadable',
      title: 'Unable to Read Document',
      message: validation.reason || UNREADABLE_MESSAGE,
      engine,
    };
  }

  return {
    status: 'invalid',
    title: `Invalid ${documentType}`,
    message:
      validation.reason ||
      `This file does not appear to be a valid ${documentType}. Please select the correct document.`,
    engine,
  };
}

export async function validateEmployeeDocument({ file, documentType, analyze }) {
  const normalizedDocumentType = String(documentType || '').trim();
  if (!file || !normalizedDocumentType || typeof analyze !== 'function') {
    return { status: 'error', title: 'Unable to Validate Document', message: VALIDATION_ERROR_MESSAGE };
  }

  const analysis = await analyze(file, normalizedDocumentType);
  if (analysis.status === 'invalid') {
    return {
      status: 'invalid',
      title: `Invalid ${normalizedDocumentType}`,
      message: analysis.message || `This file is not a valid ${normalizedDocumentType}.`,
    };
  }
  if (analysis.status !== 'ok') {
    const status = analysis.status === 'unreadable' ? 'unreadable' : 'error';
    return {
      status,
      title: status === 'unreadable' ? 'Unable to Read Document' : 'Unable to Validate Document',
      message: analysis.message || (status === 'unreadable' ? UNREADABLE_MESSAGE : VALIDATION_ERROR_MESSAGE),
    };
  }

  if (isPassportPhotoType(normalizedDocumentType)) {
    if (analysis.faceCount === 1 && analysis.faceRatio >= 0.04) {
      return { status: 'valid', title: `Valid ${normalizedDocumentType}`, message: '' };
    }
    return {
      status: 'invalid',
      title: `Invalid ${normalizedDocumentType}`,
      message: analysis.faceCount > 1
        ? 'Please choose a photo containing only one person.'
        : 'No clear human face was detected. Please capture a clear passport-size photo.',
    };
  }

  const text = String(analysis.text || '');
  if (normalizeInputText(text).replace(/[^A-Z0-9]/g, '').length < READABLE_TEXT_MIN_CHARS) {
    return { status: 'unreadable', title: 'Unable to Read Document', message: UNREADABLE_MESSAGE };
  }

  return toValidationResult(validateDocumentText(normalizedDocumentType, text), normalizedDocumentType, analysis.engine);
}
