import { apiClient } from '../../services/apiClient';

function toResult(promise, fallbackMessage) {
  return promise
    .then((data) => ({ success: true, data }))
    .catch((error) => ({
      success: false,
      message: error.message || fallbackMessage,
      status: error.status,
      data: error.data,
    }));
}

export async function loginUser(email, password) {
  const payload = {
    email: email.trim(),
    password,
  };

  const result = await toResult(
    apiClient.post('/api/User/login', payload, { skipAuth: true }),
    'Invalid credentials or server error.'
  );

  if (!result.success) return result;

  const data = result.data;
  const token =
    data?.token ||
    data?.jwt ||
    data?.accessToken ||
    data?.jwtToken ||
    data?.result?.token ||
    data?.data?.token ||
    (typeof data === 'string' ? data : null);

  return {
    success: Boolean(token),
    token,
    data,
    message: token ? undefined : 'Login succeeded, but no access token was returned.',
  };
}

export async function getRoles() {
  const result = await toResult(apiClient.get('/api/Roles', { skipAuth: true }), 'Failed to fetch roles.');
  if (!result.success) return result;

  const data = result.data;
  let rolesList = [];
  if (Array.isArray(data)) {
    rolesList = data;
  } else if (Array.isArray(data?.data)) {
    rolesList = data.data;
  } else if (Array.isArray(data?.result)) {
    rolesList = data.result;
  }

  return {
    success: true,
    data: rolesList,
    raw: data,
  };
}

export async function registerUser(firstName, lastName, email, password, confirmPassword, role = '') {
  const payload = {
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    email: email.trim(),
    password,
    confirmPassword,
  };

  if (role) {
    payload.role = typeof role === 'object' ? (role.name || role.roleName || role.id) : role;
    if (typeof role === 'object' && role.id) {
      payload.roleId = role.id;
    }
  }

  return toResult(
    apiClient.post('/api/User/register', payload, { skipAuth: true }),
    'Registration failed. Please try again.'
  );
}

export async function forgotPassword(email) {
  const result = await toResult(
    apiClient.post('/api/User/forgot-password', { email: email.trim() }, { skipAuth: true }),
    'Failed to request password reset. Please try again.'
  );

  return {
    ...result,
    message: result.success
      ? result.data?.message || 'OTP has been sent to your email address.'
      : result.message,
  };
}

export async function verifyOtp(email, otp) {
  const result = await toResult(
    apiClient.post('/api/User/verify-otp', {
      email: email.trim(),
      otp: otp.trim(),
    }, { skipAuth: true }),
    'Invalid or expired OTP. Please try again.'
  );

  return {
    ...result,
    message: result.success
      ? result.data?.message || 'OTP verified successfully.'
      : result.message,
  };
}

export async function resetPassword(password, confirmPassword, email = '') {
  const payload = { password, confirmPassword };
  if (email) {
    payload.email = email.trim();
  }

  const result = await toResult(
    apiClient.post('/api/User/reset-password', payload, { skipAuth: true }),
    'Failed to reset password. Please try again.'
  );

  return {
    ...result,
    message: result.success
      ? result.data?.message || 'Password has been reset successfully.'
      : result.message,
  };
}
