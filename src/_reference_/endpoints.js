import { BASE_URL, SERVER_URL } from "./config";
 
const normalizePath = (path) =>
  String(path)
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/{2,}/g, "/");

const isUnsafeLocalPath = (value) => {
  const normalizedValue = String(value || "").trim();

  if (!normalizedValue) {
    return false;
  }

  if (/^file:/i.test(normalizedValue)) {
    return true;
  }

  if (/^[a-zA-Z]:[\\/]/.test(normalizedValue)) {
    return true;
  }

  if (/^\\\\/.test(normalizedValue)) {
    return true;
  }

  return false;
};
export const API = {
  // ================= AUTH =================
  AUTH: {
    ADMIN_LOGIN: "/Admin/login",
    USER_LOGIN: "/user/login",
    REGISTER: "/user/register",
    ADMIN: {
      FORGOT_PASSWORD: "/Admin/forgot-password",
      VERIFY_OTP: "/Admin/verify-otp",
      RESET_PASSWORD: "/Admin/reset-password",
      CHANGE_PASSWORD: "/Admin/change-password",
    },
    USER: {
      FORGOT_PASSWORD: "/User/forgot-password",
      VERIFY_OTP: "/User/verify-otp",
      RESET_PASSWORD: "/User/reset-password",
      CHANGE_PASSWORD: "/User/change-password",
    },
  },
 
  // ================= DASHBOARD =================
  DASHBOARD: {
    ADMIN: "/dashboard",
    USER: "/user-dashboard",
  },
 
  // ================= ATTENDANCE =================
  ATTENDANCE: {
    CHECKIN: "/Attendance/checkin",
    CHECKOUT: "/Attendance/checkout",
 
    START_BREAK: "/Attendance/start-break",
    END_BREAK: "/Attendance/end-break",
 
    WEEKLY: "/Attendance/weekly",
    PREVIOUS_WEEK: "/Attendance/previous-week",
    CURRENT_MONTH: "/Attendance/current-month",
    PREVIOUS_MONTH: "/Attendance/previous-month",
    MONTH: "/Attendance/month",
    MONTHLY: "/Attendance/monthly",
    TODAY: "/Attendance/today",
    UPDATE: "/Attendance/admin/update-attendance",
    DOWNLOAD_MONTHLY: "/Attendance/admin/download-monthly",
    DOWNLOAD_WEEKLY: "/Attendance/admin/download-weekly",
    DOWNLOAD_DAILY: "/Attendance/admin/download-daily",
    STATS_TODAY: "/Attendance/stats/today",
    STATS_YEAR: "/Attendance/stats/year",
    USER_DASHBOARD_OVERVIEW: "/Attendance/dashboard-attendance",
    ADMIN_DASHBOARD_OVERVIEW: "/Attendance/admin-dashboard-overview",
    RUN_ABSENT: "/Attendance/run/absent-check",
    RUN_MISSING: "/Attendance/run/missing-checkout",
    UPLOAD_MONTHLY: "/Attendance/admin/upload-monthly",
 
    WORKING_HOURS: (employeeId) =>
      `/Attendance/working-hours/${employeeId}`,
  },
 
  // ================= ADMIN NOTIFICATIONS =================
  ADMIN_NOTIFICATION: {
    LIST: "/admin-notifications",
    COUNT: "/admin-notifications/count",
    READ: (id) => `/admin-notifications/read/${id}`,
    READ_ALL: "/admin-notifications/read-all",
  },
 
  // ================= USER NOTIFICATIONS =================
  USER_NOTIFICATION: {
    LIST: "/user-notifications",
    READ: (id) => `/user-notifications/${id}/read`,
    MARK_ALL: "/user-notifications/mark-all",
  },
 
  // ================= ASSETS =================
  ASSETS: {
    LIST: "/Assets",
    CREATE: "/Assets",
    GET_BY_ID: (id) => `/Assets/${id}`,
    UPDATE: (id) => `/Assets/${id}`,
    DELETE: (id) => `/Assets/${id}`,
  },
 
  // ================= BRANCHES =================
  BRANCHES: {
    LIST: "/Branches",
    CREATE: "/Branches",
    UPDATE: (id) => `/Branches/${id}`,
    DELETE: (id) => `/Branches/${id}`,
  },
 
  // ================= CLIENTS =================
  CLIENTS: {
    LIST: "/Clients",
    CREATE: "/Clients",
    GET_BY_NAME: (name) => `/Clients/by-name/${name}`,
    PROJECTS: (id) => `/Clients/${id}/projects`,
    UPDATE: (name) => `/Clients/${name}`,
    DELETE: (name) => `/Clients/${name}`,
  },
 
  // ================= DEPARTMENTS =================
  DEPARTMENTS: {
    LIST: "/Departments",
    CREATE: "/Departments",
    GET_BY_ID: (id) => `/Departments/${id}`,
    UPDATE: (id) => `/Departments/${id}`,
    DELETE: (id) => `/Departments/${id}`,
  },
 
  // ================= EMPLOYEES =================
  EMPLOYEES: {
    LIST: "/Employees",
    CREATE: "/Employees",
    UPDATE: (id) => `/Employees/${id}`,
    DELETE: (id) => `/Employees/${id}`,
    DOWNLOAD_FULL_MASTER: "/Employees/download-full-master",
    DOWNLOAD_EMPLOYEE_TEMPLATE: "/Employees/download-employee-template",
    BULK_UPLOAD: "/Employees/bulk-upload",
    UPCOMING_BIRTHDAYS: "/Employees/upcoming-birthdays",
    EXPORT_PROFILE_PDF: (employeeId) =>
      `/Employees/export-profile-pdf/${employeeId}`,
  },
 
  // ================= EMPLOYEE FULL DETAILS =================
  EMPLOYEE_FULL: {
    MY_DETAILS: "/EmployeeFullDetail/my-details",
    UPDATE_MY: "/EmployeeFullDetail/my-details",
    GET_BY_ID: (id) => `/EmployeeFullDetail/${id}`,
  },
 
  // ================= EMPLOYEE PERSONAL =================
  EMPLOYEE_PERSONAL: {
    // Kept lowercase to match the current working backend path used by the app.
    CREATE: "/employeepersonalinfo",
    LIST: "/employeepersonalinfo",
    GET_BY_ID: (id) => `/employeepersonalinfo/${id}`,
    UPDATE: (id) => `/employeepersonalinfo/${id}`,
    DELETE: (id) => `/employeepersonalinfo/${id}`,
  },
 
  // ================= BANK DETAILS =================
  BANK: {
    CREATE: "/EmployeeBankDetails",
    LIST: "/EmployeeBankDetails",
    UPDATE: (id) => `/EmployeeBankDetails/${id}`,
    DELETE: (id) => `/EmployeeBankDetails/${id}`,
  },
 
  // ================= EDUCATION =================
  EDUCATION: {
    CREATE: "/EmployeeEducation",
    GET_BY_ID: (id) => `/EmployeeEducation/${id}`,
    UPDATE: (id) => `/EmployeeEducation/${id}`,
    DELETE: (id) => `/EmployeeEducation/${id}`,
  },
 
  // ================= EXPERIENCE =================
  EXPERIENCE: {
    CREATE: "/EmployeeExperience",
    UPDATE: (id) => `/EmployeeExperience/${id}`,
    DELETE: (id) => `/EmployeeExperience/${id}`,
  },
  //================== EMPLOYEE DOCUMENTS =================
  EMPLOYEE_DOCUMENTS: {
    UPLOAD: "/EmployeeDocuments/upload",
 
    GET_BY_EMPLOYEE: (employeeId) =>
      `/EmployeeDocuments/${employeeId}`,
 
    DELETE: (id) =>
      `/EmployeeDocuments/${id}`,
 
    VIEW: (id) =>
      `/EmployeeDocuments/view/${id}`,
 
    DOWNLOAD: (id) =>
      `/EmployeeDocuments/download/${id}`,
 
    VERIFY: (id) =>
      `/EmployeeDocuments/verify/${id}`,
 
    REJECT: (id) =>
      `/EmployeeDocuments/reject/${id}`,
 
    CHECKLIST: (employeeId) =>
      `/EmployeeDocuments/checklist/${employeeId}`,
  },
  //================== EMPLOYEE AGREEMENTS =================
AGREEMENTS: {
    UPLOAD: "/Agreement/upload",
    SIGN: "/Agreement/sign",
    ADMIN_STATUS: "/Agreement/GetAllAgreements",
    MY_AGREEMENTS: "/Agreement/myagreements",
    VIEW_AGREEMENT: (id) => `/Agreement/view/${id}`,
    VIEW_SIGNED: (id) => `/Agreement/ViewSigned/${id}`,
    DOWNLOAD_SIGNED: (id) => `/Agreement/DownloadSigned/${id}`,
    PENDING: (employeeId) => `/Agreement/Pending/${employeeId}`,
    SIGNED: (employeeId) => `/Agreement/Signed/${employeeId}`,
    DOWNLOAD: (id) => `/Agreement/download/${id}`,
    FILE_PATH: (id) => `/Agreement/filepath/${id}`,
},
  // ================= LEAVE =================
  LEAVE: {
    CREATE: "/EmployeeLeave",
    LIST: "/EmployeeLeave",
    ALL: "/EmployeeLeave/all",
    APPROVE: (id) => `/EmployeeLeave/approve-reject/${id}`,
    BALANCE: "/EmployeeLeave/balance",
    UPDATE_STATUS: (id) => `/EmployeeLeave/update-status/${id}`,
    employeeLeaveDetails: (employeeId) =>
      `/EmployeeLeave/employee-leave-details/${employeeId}`,
    DELETE: (id) => `/EmployeeLeave/${id}`,
    CANCEL: (id) => `/EmployeeLeave/cancel/${id}`,
    APPLY: "/EmployeeLeave/apply",
    MY_LEAVES: "/EmployeeLeave/my-leaves",
  },
 
  // ================= WFH =================
  WFH: {
    APPLY: "/EmployeeLeave/apply-wfh",
    ALL: "/EmployeeLeave/all-wfh",
    MY: "/EmployeeLeave/my-wfh",
    UPDATE_STATUS: (id) => `/EmployeeLeave/update-wfh-status/${id}`,
    CANCEL: (id) => `/EmployeeLeave/cancel-wfh/${id}`,
  },

  // ================= SETTINGS =================
  SETTINGS: {
    EMAIL: "/Settings/email",
    ATTENDANCE: "/Settings/attendance",
    LEAVE: "/Settings/leave",
    COMPANY: "/Settings/company",
    NOTIFICATION: "/Settings/notification",
    GENERAL: "/Settings/general",
    POLICIES: "/Settings/policies",
    POLICY: (type) => `/Settings/policy/${type}`,
    UPDATE_POLICY: "/Settings/policy",
  },
 
  // ================= TEAM =================
  TEAM: {
    LIST: "/Team",
    CREATE: "/Team/create",
    GET_BY_ID: (teamId) => `/Team/${teamId}`,
    UPDATE: "/Team/update",
    DELETE: (teamId) => `/Team/${teamId}`,
    ADD_MEMBERS: "/Team/add-members",
    REMOVE_MEMBER: (teamId, employeeId) =>
      `/Team/${teamId}/member/${employeeId}`,
    UPDATE_REPORTING_DAYS: "/Team/update-reporting-days",
    MEMBER_OVERRIDE: "/Team/member-override",
    AVAILABLEEMPLOYEES: "/Team/available-employees",
    MANAGERS: "/Team/managers",
  },
 
  // ================= HOLIDAYS =================
  HOLIDAYS: {
    LIST: "/Holidays",
    CREATE: "/Holidays",
    UPDATE: (id) => `/Holidays/${id}`,
    DELETE: (id) => `/Holidays/${id}`,
  },
 
  // ================= JOB OPENINGS =================
  JOBS: {
    LIST: "/JobOpenings",
    CREATE: "/JobOpenings",
    UPDATE: (title) => `/JobOpenings/${title}`,
    DELETE: (title) => `/JobOpenings/${title}`,
  },
 
  // ================= PROJECTS =================
  PROJECTS: {
    LIST: "/Projects",
    CREATE: "/Projects",
    GET_BY_ID: (id) => `/Projects/${id}`,
    UPDATE: (id) => `/Projects/${id}`,
    DELETE: (id) => `/Projects/${id}`,
  },

  // ================= TICKETS =================
  TICKETS: {
    LIST: "/Ticket/GetAll",
    CREATE: "/Ticket/Create",
    GET_BY_ID: (id) => `/Ticket/${id}`,
    BY_EMPLOYEE: (employeeId) => `/Ticket/employee/${employeeId}`,
    UPDATE: (id) => `/Ticket/Update/${id}`,
    DELETE: (id) => `/Ticket/${id}`,
    UPDATE_STATUS: (id) => `/Ticket/UpdateStatus/${id}`,
    MY_TICKETS: "/Ticket/MyTickets",
    START_WORK: "/Ticket/start-work",
    STOP_WORK: "/Ticket/stop-work",
    AUTO_ASSIGN: "/Ticket/auto-assign",
    EXPORT: "/Ticket/Export",
    DOWNLOAD_TEMPLATE: "/Ticket/DownloadTemplate",
    BULK_UPLOAD: "/Ticket/BulkUpload",
  },

  // ================= ROLES =================
  ROLES: {
    LIST: "/Roles",
    CREATE: "/Roles",
    UPDATE: (id) => `/Roles/${id}`,
    DELETE: (id) => `/Roles/${id}`,
  },
 
  // ================= ROLE PERMISSION =================
  ROLE_PERMISSION: {
    GET: (roleName) => `/RolePermission/${roleName}`,
    SAVE: "/RolePermission/save",
    MODULES: "/RolePermission/allowed-modules",
    EMPLOYEES: (roleName) => `/RolePermission/employees/${roleName}`,
  },

  // ================= USER PERMISSION =================
  USER_PERMISSION: {
    SAVE: "/UserPermission",
    GET: (employeeId) => `/UserPermission/${employeeId}`,
    ALLOWED: (employeeId) => `/UserPermission/allowed/${employeeId}`,
  },

  // ================= PERMISSION =================
  PERMISSION: {
    GET: "/Permission",
  },
 
  // ================= REPORTS =================
  REPORTS: {
    ALL: "/reports/all",
  },
 
  // ================= PAYSLIP =================
  PAYSLIP: {
    // Kept as PaySlip because that is what the current app/backend uses.
    GENERATE: "/PaySlip/generate",
    GENERATE_ALL: "/PaySlip/generate-all",
    RECENT: "/PaySlip/recent",
    PREVIEW: (id) => `/PaySlip/preview/${id}`,
    DOWNLOAD: (id) => `/PaySlip/download/${id}`,
    DELETE: (id) => `/PaySlip/${id}`,
    SALARY_REGISTER: "/PaySlip/salary-register",
    MY: "/PaySlip/my",
    MANUAL_GENERATE: "/manual-payslip/generate",
  },
 
  // ================= OFFER LETTER =================
  OFFER: {
    // Kept Generate casing to match the current working backend route.
    GENERATE: "/OfferLetter/Generate",
    LIST: "/OfferLetter/all",
    CALCULATE_BREAKUP: (ctc) =>
      `/OfferLetter/salary-structure/${encodeURIComponent(String(ctc))}`,
    PREVIEW: (id) => `/OfferLetter/preview/${id}`,
    SEND: "/OfferLetter/send",
    SEND_STATUS: (id) => `/OfferLetter/${id}/send-status`,
    DOWNLOAD: (id) => `/OfferLetter/download/${id}`,
    DELETE: (id) => `/OfferLetter/${id}`,
  },

  // ================= RELIEVING LETTER =================
  RELIEVING_LETTER: {
    GENERATE: "/RelievingLetter/generate",
    GET_ALL: "/RelievingLetter/all",
    PREVIEW: (id) => `/RelievingLetter/preview/${id}`,
    SEND: "/RelievingLetter/send",
    SEND_STATUS: (id) => `/RelievingLetter/${id}/send-status`,
    DOWNLOAD: (id) => `/RelievingLetter/download/${id}`,
    DELETE: (id) => `/RelievingLetter/${id}`,
  },
 
  // ================= EXPERIENCE LETTER =================
  EXPERIENCE_LETTER: {
    GENERATE: "/ExperienceOfferLetter/generate",
    LIST: "/ExperienceOfferLetter/all",
    DOWNLOAD: (id) => `/ExperienceOfferLetter/download/${id}`,
  },
 
  // ================= SEARCH =================
  SEARCH: {
    MODULE: "/ModuleSearch/search",
  },
 
  // ================= LEAVE BALANCE =================
  LEAVE_BALANCE: {
    GET: (id) => `/LeaveBalance/${id}`,
  },
};
 
export const API_ENDPOINTS = {
  auth: {
    adminLogin: API.AUTH.ADMIN_LOGIN,
    userLogin: API.AUTH.USER_LOGIN,
    userRegister: API.AUTH.REGISTER,
    adminForgotPassword: API.AUTH.ADMIN.FORGOT_PASSWORD,
    adminVerifyOtp: API.AUTH.ADMIN.VERIFY_OTP,
    adminResetPassword: API.AUTH.ADMIN.RESET_PASSWORD,
    adminChangePassword: API.AUTH.ADMIN.CHANGE_PASSWORD,
    userForgotPassword: API.AUTH.USER.FORGOT_PASSWORD,
    userVerifyOtp: API.AUTH.USER.VERIFY_OTP,
    userResetPassword: API.AUTH.USER.RESET_PASSWORD,
    userChangePassword: API.AUTH.USER.CHANGE_PASSWORD,
    // Backward-compatible aliases used by current screens.
    forgotPassword: API.AUTH.ADMIN.FORGOT_PASSWORD,
    verifyOtp: API.AUTH.ADMIN.VERIFY_OTP,
    resetPassword: API.AUTH.ADMIN.RESET_PASSWORD,
    forgotPasswordByRole: (role = "admin") =>
      String(role).toLowerCase() === "user"
        ? API.AUTH.USER.FORGOT_PASSWORD
        : API.AUTH.ADMIN.FORGOT_PASSWORD,
    verifyOtpByRole: (role = "admin") =>
      String(role).toLowerCase() === "user"
        ? API.AUTH.USER.VERIFY_OTP
        : API.AUTH.ADMIN.VERIFY_OTP,
    resetPasswordByRole: (role = "admin") =>
      String(role).toLowerCase() === "user"
        ? API.AUTH.USER.RESET_PASSWORD
        : API.AUTH.ADMIN.RESET_PASSWORD,
    changePasswordByRole: (role = "admin") =>
      String(role).toLowerCase() === "user"
        ? API.AUTH.USER.CHANGE_PASSWORD
        : API.AUTH.ADMIN.CHANGE_PASSWORD,
  },
  rolePermission: {
    allowedModules: API.ROLE_PERMISSION.MODULES,
    byRoleName: API.ROLE_PERMISSION.GET,
    save: API.ROLE_PERMISSION.SAVE,
    employees: API.ROLE_PERMISSION.EMPLOYEES,
  },
  userPermission: {
    save: API.USER_PERMISSION.SAVE,
    get: API.USER_PERMISSION.GET,
    allowed: API.USER_PERMISSION.ALLOWED,
  },
  permission: {
    get: API.PERMISSION.GET,
  },
  dashboard: API.DASHBOARD.ADMIN,
  userDashboard: API.DASHBOARD.USER,
  departments: {
    list: API.DEPARTMENTS.LIST,
    byId: API.DEPARTMENTS.GET_BY_ID,
  },
  employees: {
    list: API.EMPLOYEES.LIST,
    byId: API.EMPLOYEES.UPDATE,
    downloadFullMaster: API.EMPLOYEES.DOWNLOAD_FULL_MASTER,
    downloadEmployeeTemplate: API.EMPLOYEES.DOWNLOAD_EMPLOYEE_TEMPLATE,
    bulkUpload: API.EMPLOYEES.BULK_UPLOAD,
    upcomingBirthdays: API.EMPLOYEES.UPCOMING_BIRTHDAYS,
    exportProfilePdf: API.EMPLOYEES.EXPORT_PROFILE_PDF,
  },
  employeeFullDetail: {
    byId: API.EMPLOYEE_FULL.GET_BY_ID,
    myDetails: API.EMPLOYEE_FULL.MY_DETAILS,
  },
  employeePersonalInfo: {
    list: API.EMPLOYEE_PERSONAL.LIST,
    byEmployeeId: API.EMPLOYEE_PERSONAL.GET_BY_ID,
  },
  employeeBankDetails: {
    list: API.BANK.LIST,
    byEmployeeId: API.BANK.UPDATE,
  },
  employeeEducation: {
    list: API.EDUCATION.CREATE,
    byEmployeeId: API.EDUCATION.GET_BY_ID,
  },
  employeeExperience: {
    list: API.EXPERIENCE.CREATE,
    byEmployeeId: API.EXPERIENCE.UPDATE,
  },
  employeeDocuments: {
    upload: API.EMPLOYEE_DOCUMENTS.UPLOAD,
    byEmployeeId: API.EMPLOYEE_DOCUMENTS.GET_BY_EMPLOYEE,
    download: API.EMPLOYEE_DOCUMENTS.DOWNLOAD,
    view: API.EMPLOYEE_DOCUMENTS.VIEW,
    delete: API.EMPLOYEE_DOCUMENTS.DELETE,
    verify: API.EMPLOYEE_DOCUMENTS.VERIFY,
    reject: API.EMPLOYEE_DOCUMENTS.REJECT,
    checklist: API.EMPLOYEE_DOCUMENTS.CHECKLIST,
  },
  agreements: {
    upload: API.AGREEMENTS.UPLOAD,
    sign: API.AGREEMENTS.SIGN,

    getAll: API.AGREEMENTS.ADMIN_STATUS,

    myAgreements: API.AGREEMENTS.MY_AGREEMENTS,

    pending: API.AGREEMENTS.PENDING,
    signed: API.AGREEMENTS.SIGNED,

    viewAgreement: API.AGREEMENTS.VIEW_AGREEMENT,
    viewSigned: API.AGREEMENTS.VIEW_SIGNED,
    downloadSigned: API.AGREEMENTS.DOWNLOAD_SIGNED,

    download: API.AGREEMENTS.DOWNLOAD,
    filePath: API.AGREEMENTS.FILE_PATH,
},
  company: {
    // 🔥 ADD THIS (MAIN COMPANY APIs)
    create: "/Company",
    getById: (id) => `/Company/${id}`,
    update: (id) => `/Company/${id}`,
 
    // EXISTING
    branches: {
      list: API.BRANCHES.LIST,
      byId: API.BRANCHES.UPDATE,
    },
    holidays: {
      list: API.HOLIDAYS.LIST,
      byId: API.HOLIDAYS.UPDATE,
    },
    projects: {
      list: API.PROJECTS.LIST,
      byId: API.PROJECTS.UPDATE,
    },
  },
 
  masters: {
    roles: {
      list: API.ROLES.LIST,
      byId: API.ROLES.UPDATE,
    },
    clients: {
      list: API.CLIENTS.LIST,
      byId: API.CLIENTS.UPDATE,
    },
    assets: {
      list: API.ASSETS.LIST,
      byId: API.ASSETS.UPDATE,
    },
  },
  attendance: {
    checkIn: API.ATTENDANCE.CHECKIN,
    checkOut: API.ATTENDANCE.CHECKOUT,
 
    startBreak: API.ATTENDANCE.START_BREAK,
    endBreak: API.ATTENDANCE.END_BREAK,
    weekly: API.ATTENDANCE.WEEKLY,
    previousWeek: API.ATTENDANCE.PREVIOUS_WEEK,
    previousMonth: API.ATTENDANCE.PREVIOUS_MONTH,
    today: API.ATTENDANCE.TODAY,
    monthly: API.ATTENDANCE.MONTHLY,
    adminUpdate: API.ATTENDANCE.UPDATE,
    dashboardAttendance: API.ATTENDANCE.USER_DASHBOARD_OVERVIEW,
    userDashboardOverview: API.ATTENDANCE.USER_DASHBOARD_OVERVIEW,
    adminDashboardOverview: API.ATTENDANCE.ADMIN_DASHBOARD_OVERVIEW,
    month: API.ATTENDANCE.MONTH,
    currentMonth: API.ATTENDANCE.CURRENT_MONTH,
    downloadMonthly: API.ATTENDANCE.DOWNLOAD_MONTHLY,
    downloadWeekly: API.ATTENDANCE.DOWNLOAD_WEEKLY,
    downloadDaily: API.ATTENDANCE.DOWNLOAD_DAILY,
    uploadMonthly: API.ATTENDANCE.UPLOAD_MONTHLY,
 
    workingHours: API.ATTENDANCE.WORKING_HOURS,
  },
  leave: {
    list: API.LEAVE.LIST,
    all: API.LEAVE.ALL,
    balance: API.LEAVE.BALANCE,
    byId: API.LEAVE.DELETE,
    updateStatus: API.LEAVE.UPDATE_STATUS,
    employeeLeaveDetails:
      API.LEAVE.employeeLeaveDetails,
  },
  wfh: {
    apply: API.WFH.APPLY,
    all: API.WFH.ALL,
    my: API.WFH.MY,
    myWfh: API.WFH.MY,
    updateStatus: API.WFH.UPDATE_STATUS,
    cancel: API.WFH.CANCEL,
  },
  settings: {
    email: API.SETTINGS.EMAIL,
    attendance: API.SETTINGS.ATTENDANCE,
    leave: API.SETTINGS.LEAVE,
    company: API.SETTINGS.COMPANY,
    notification: API.SETTINGS.NOTIFICATION,
    general: API.SETTINGS.GENERAL,
    policies: API.SETTINGS.POLICIES,
    policy: API.SETTINGS.POLICY,
    updatePolicy: API.SETTINGS.UPDATE_POLICY,
  },
  team: {
    list: API.TEAM.LIST,
    create: API.TEAM.CREATE,
    byId: API.TEAM.GET_BY_ID,
    update: API.TEAM.UPDATE,
    delete: API.TEAM.DELETE,
    addMembers: API.TEAM.ADD_MEMBERS,
    removeMember: API.TEAM.REMOVE_MEMBER,
    updateReportingDays: API.TEAM.UPDATE_REPORTING_DAYS,
    memberOverride: API.TEAM.MEMBER_OVERRIDE,
    availableEmployees: API.TEAM.AVAILABLEEMPLOYEES,
    managers: API.TEAM.MANAGERS,
    projects: {
      list: API.PROJECTS.LIST,}
 
  },
  tickets: {
    list: API.TICKETS.LIST,
    create: API.TICKETS.CREATE,
    byId: API.TICKETS.GET_BY_ID,
    byEmployee: API.TICKETS.BY_EMPLOYEE,
    update: API.TICKETS.UPDATE,
    delete: API.TICKETS.DELETE,
    updateStatus: API.TICKETS.UPDATE_STATUS,
    startWork: API.TICKETS.START_WORK,
    stopWork: API.TICKETS.STOP_WORK,
    autoAssign: API.TICKETS.AUTO_ASSIGN,
    myTickets: API.TICKETS.MY_TICKETS,
    export: API.TICKETS.EXPORT,
    downloadTemplate: API.TICKETS.DOWNLOAD_TEMPLATE,
    bulkUpload: API.TICKETS.BULK_UPLOAD,
  },
  notifications: {
    admin: API.ADMIN_NOTIFICATION.LIST,
    adminRead: API.ADMIN_NOTIFICATION.READ,
    adminReadAll: API.ADMIN_NOTIFICATION.READ_ALL,
    user: API.USER_NOTIFICATION.LIST,
    userRead: API.USER_NOTIFICATION.READ,
    userReadAll: API.USER_NOTIFICATION.MARK_ALL,
  },
  payroll: {
    employees: API.EMPLOYEES.LIST,
    myPayslips: API.PAYSLIP.MY,
    recent: API.PAYSLIP.RECENT,
    generate: API.PAYSLIP.GENERATE,
    preview: API.PAYSLIP.PREVIEW,
    download: API.PAYSLIP.DOWNLOAD,
    delete: API.PAYSLIP.DELETE,
    manualGenerate: API.PAYSLIP.MANUAL_GENERATE,
    salaryRegister: API.PAYSLIP.SALARY_REGISTER,
  },
  offerLetters: {
    list: "/OfferLetter",
    all: API.OFFER.LIST,
    generate: API.OFFER.GENERATE,
    calculateBreakup: API.OFFER.CALCULATE_BREAKUP,
    preview: API.OFFER.PREVIEW,
    send: API.OFFER.SEND,
    sendStatus: API.OFFER.SEND_STATUS,
    download: API.OFFER.DOWNLOAD,
    delete: API.OFFER.DELETE,
  },
  relievingLetters: {
    generate: API.RELIEVING_LETTER.GENERATE,
    all: API.RELIEVING_LETTER.GET_ALL,
    preview: API.RELIEVING_LETTER.PREVIEW,
    send: API.RELIEVING_LETTER.SEND,
    sendStatus: API.RELIEVING_LETTER.SEND_STATUS,
    download: API.RELIEVING_LETTER.DOWNLOAD,
    delete: API.RELIEVING_LETTER.DELETE,
  },
  RELIEVING_LETTER: API.RELIEVING_LETTER,
  reports: {
    all: API.REPORTS.ALL,
  },
};
 
export const buildApiUrl = (path) =>
  `${BASE_URL}/${normalizePath(path)}`;
 
export const buildServerUrl = (path) =>
  (() => {
    const rawPath = String(path || "").trim();

    if (!rawPath) {
      return "";
    }

    if (/^(https?:|blob:|data:)/i.test(rawPath)) {
      return rawPath;
    }

    if (isUnsafeLocalPath(rawPath)) {
      return "";
    }

    return `${SERVER_URL}/${normalizePath(rawPath)}`;
  })();
