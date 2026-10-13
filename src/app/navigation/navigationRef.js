import { createNavigationContainerRef } from '@react-navigation/native';

import { ROUTES } from './routeNames';

export const navigationRef = createNavigationContainerRef();

export function navigateToTeamsFromNotification(refreshKey) {
  if (!navigationRef.isReady()) {
    return false;
  }

  navigationRef.navigate(ROUTES.APP_DRAWER, {
    screen: ROUTES.MAIN_TABS,
    params: {
      screen: ROUTES.TEAMS_FLOW,
      params: {
        screen: ROUTES.TEAMS,
        params: {
          notificationRefreshKey: refreshKey,
        },
      },
    },
  });

  return true;
}
