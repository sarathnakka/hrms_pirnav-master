const rawBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;

if (!rawBaseUrl) {
  throw new Error(
    'EXPO_PUBLIC_API_BASE_URL is missing. Add it to the project .env file.'
  );
}

export const environment = {
  apiBaseUrl: rawBaseUrl.replace(/\/+$/, ''),
};
