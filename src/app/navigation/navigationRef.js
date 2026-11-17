import { createNavigationContainerRef } from '@react-navigation/native';

import { ROUTES } from './routeNames';

export const navigationRef = createNavigationContainerRef();

function getActiveRouteNames(state) {
  const names = [];
  let currentState = state;

  while (currentState?.routes?.length) {
    const activeIndex = Number.isInteger(currentState.index) ? currentState.index : 0;
    const activeRoute = currentState.routes[activeIndex];
    if (!activeRoute) break;

    names.push(activeRoute.name);
    currentState = activeRoute.state;
  }

  return names;
}

export function isAuthenticatedNavigationReady() {
  if (!navigationRef.isReady()) {
    return false;
  }

  const rootState = navigationRef.getRootState();
  return rootState?.routeNames?.includes(ROUTES.APP_DRAWER) === true;
}

export function isTeamsNotificationDestinationFocused() {
  if (!isAuthenticatedNavigationReady()) {
    return false;
  }

  const activeRouteNames = getActiveRouteNames(navigationRef.getRootState());
  return (
    activeRouteNames.includes(ROUTES.APP_DRAWER) &&
    activeRouteNames.includes(ROUTES.MAIN_TABS) &&
    activeRouteNames.includes(ROUTES.TEAMS_FLOW) &&
    activeRouteNames.includes(ROUTES.TEAMS)
  );
}

export function navigateToTeamsFromNotification(refreshKey) {
  if (!isAuthenticatedNavigationReady()) {
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
