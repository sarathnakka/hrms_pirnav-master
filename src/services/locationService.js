import * as Location from 'expo-location';
import { Alert } from 'react-native';

export async function getCurrentLocation() {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permission Denied',
        'Location permission is required to mark attendance. Please enable location access in settings.'
      );
      return { success: false, message: 'Location permission denied' };
    }

    const locationData = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });

    if (!locationData || !locationData.coords) {
      Alert.alert('Location Error', 'Unable to acquire GPS coordinates. Please try again.');
      return { success: false, message: 'Unable to get location' };
    }

    const { latitude, longitude, accuracy } = locationData.coords;

    // Check accuracy threshold (>200 meters warning)
    if (accuracy && accuracy > 200) {
      Alert.alert(
        'Low Location Accuracy',
        `GPS accuracy is too low (${Math.round(accuracy)}m). Please move to an open area with better GPS signal.`
      );
      return { success: false, message: 'Location accuracy too low', accuracy };
    }

    return {
      success: true,
      location: {
        latitude,
        longitude,
        accuracy: accuracy ? Math.round(accuracy) : 10,
      },
    };
  } catch (error) {
    Alert.alert('Location Error', error.message || 'Failed to acquire location.');
    return { success: false, message: error.message };
  }
}
