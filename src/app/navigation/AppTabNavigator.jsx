import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';

import DashboardScreen from '../../features/dashboard/DashboardScreen';
import MyAttendanceScreen from '../../features/attendance/MyAttendanceScreen';
import EmployeeLeavesScreen from '../../features/leave/EmployeeLeavesScreen';
import EditEmployeeScreen from '../../features/employees/EditEmployeeScreen';
import MyHolidaysScreen from '../../features/holidays/MyHolidaysScreen';
import PayslipScreen from '../../features/payslip/PayslipScreen';
import ProfileScreen from '../../features/profile/ProfileScreen';
import TeamDetailsScreen from '../../features/teams/TeamDetailsScreen';
import TeamsScreen from '../../features/teams/TeamsScreen';
import AppHeader from '../../shared/components/AppHeader';
import FloatingTabBar from '../../shared/components/FloatingTabBar';
import { colors } from '../../theme';
import { ROUTES } from './routeNames';

const Tab = createBottomTabNavigator();
const TeamsStack = createStackNavigator();

function getTabTitle(routeName) {
  if (routeName === ROUTES.MY_ATTENDANCE) return 'My Attendance';
  if (routeName === ROUTES.EMPLOYEE_LEAVES) return 'Employee Leaves';
  if (routeName === ROUTES.EDIT_EMPLOYEE) return 'Edit Employee';
  if (routeName === ROUTES.MY_HOLIDAYS) return 'My Holidays';
  return routeName;
}

function TeamsFlowNavigator() {
  return (
    <TeamsStack.Navigator>
      <TeamsStack.Screen
        name={ROUTES.TEAMS}
        component={TeamsScreen}
        options={({ navigation }) => ({
          header: () => <AppHeader navigation={navigation} title="Teams" />,
        })}
      />
      <TeamsStack.Screen
        name={ROUTES.TEAM_DETAILS}
        component={TeamDetailsScreen}
        options={({ navigation }) => ({
          header: () => (
            <AppHeader
              navigation={navigation}
              title="Team Details"
              showBackButton
            />
          ),
        })}
      />
    </TeamsStack.Navigator>
  );
}

export default function AppTabNavigator() {
  return (
    <Tab.Navigator
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={({ navigation, route }) => ({
        header: () => <AppHeader navigation={navigation} title={getTabTitle(route.name)} />,
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
      <Tab.Screen
        name={ROUTES.EDIT_EMPLOYEE}
        component={EditEmployeeScreen}
        options={{
          title: 'Edit Employee',
          tabBarLabel: 'Edit Employee',
          tabBarButton: () => null,
        }}
      />
      <Tab.Screen
        name={ROUTES.MY_HOLIDAYS}
        component={MyHolidaysScreen}
        options={{
          title: 'My Holidays',
          tabBarLabel: 'My Holidays',
          tabBarButton: () => null,
        }}
      />
      <Tab.Screen
        name={ROUTES.PAYSLIP}
        component={PayslipScreen}
        options={{
          title: 'Payslip',
          tabBarLabel: 'Payslip',
          tabBarButton: () => null,
        }}
      />
      <Tab.Screen
        name={ROUTES.TEAMS_FLOW}
        component={TeamsFlowNavigator}
        options={{
          title: 'Teams',
          tabBarLabel: 'Teams',
          headerShown: false,
          tabBarButton: () => null,
        }}
      />
    </Tab.Navigator>
  );
}
