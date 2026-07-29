import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import DashboardScreen from '../../features/dashboard/DashboardScreen';
import MyAttendanceScreen from '../../features/attendance/MyAttendanceScreen';
import EmployeeLeavesScreen from '../../features/leave/EmployeeLeavesScreen';
import ProfileScreen from '../../features/profile/ProfileScreen';
import AppHeader from '../../shared/components/AppHeader';
import FloatingTabBar from '../../shared/components/FloatingTabBar';
import { colors } from '../../theme';
import { ROUTES } from './routeNames';

const Tab = createBottomTabNavigator();

export default function AppTabNavigator() {
  return (
    <Tab.Navigator
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={({ navigation, route }) => ({
        header: () => <AppHeader navigation={navigation} title={route.name === ROUTES.MY_ATTENDANCE ? 'My Attendance' : route.name === ROUTES.EMPLOYEE_LEAVES ? 'Employee Leaves' : route.name} />,
        sceneStyle: { backgroundColor: colors.navigation.screenBackground },
      })}
    >
      <Tab.Screen
        name={ROUTES.DASHBOARD}
        component={DashboardScreen}
        options={{
          title: 'Dashboard',
          tabBarLabel: 'Dashboard',
          tabBarAccessibilityLabel: 'Dashboard tab',
        }}
      />
      <Tab.Screen
        name={ROUTES.MY_ATTENDANCE}
        component={MyAttendanceScreen}
        options={{
          title: 'My Attendance',
          tabBarLabel: 'Attendance',
          tabBarAccessibilityLabel: 'My Attendance tab',
        }}
      />
      <Tab.Screen
        name={ROUTES.EMPLOYEE_LEAVES}
        component={EmployeeLeavesScreen}
        options={{
          title: 'Employee Leaves',
          tabBarLabel: 'Leaves',
          tabBarAccessibilityLabel: 'Employee Leaves tab',
        }}
      />
      <Tab.Screen
        name={ROUTES.PROFILE}
        component={ProfileScreen}
        options={{
          title: 'Profile',
          tabBarLabel: 'Profile',
          tabBarAccessibilityLabel: 'Profile tab',
        }}
      />
    </Tab.Navigator>
  );
}
